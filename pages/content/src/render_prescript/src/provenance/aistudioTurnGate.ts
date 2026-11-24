/**
 * AI Studio turn provenance gate.
 *
 * AI Studio re-renders historical assistant turns on startup, on virtualized scroll, and during
 * SPA navigation. The renderer used to treat every complete function-call card as auto-runnable,
 * which replayed old tool calls (and auto-inserted/submitted their results) even after "Disable
 * All". This module keeps a narrow, host-specific record of which model turn belongs to a real
 * submission made in this document, and exposes that provenance to the renderer and automation
 * service.
 *
 * Evidence is structural and positive:
 *  - a submission cycle starts only on a trusted user send/regenerate (or an explicit adapter
 *    submission), before the page adds the new user turn;
 *  - the submitted user turn must be new (identity absent from the pre-send baseline);
 *  - an eligible model turn must be new, follow that exact user turn in document order, and carry
 *    a page-owned stable identity. Anything else (initial DOM, late load, remount, navigation,
 *    reload) fails closed.
 *
 * Cards stay fully viewable and manually runnable; only automatic effects are gated.
 */

import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('AistudioTurnGate');

const AISTUDIO_HOST = 'aistudio.google.com';
const TURN_SELECTOR = '[data-turn-role]';
const TURN_ID_ANCESTOR_SELECTOR = 'ms-prompt-chunk, ms-chat-turn, ms-turn, [data-turn-id], [data-message-id], [data-response-id]';
const COMPOSER_SELECTOR = '.prompt-box-container, ms-prompt-box, .prompt-input-wrapper, .input-area-container';
const SEND_CONTROL_SELECTOR = [
  'ms-run-button button',
  'button[type="submit"]',
  'button[aria-label="Run" i]',
  'button[aria-label="Send" i]',
  'button[aria-label="Submit" i]',
  'button.send-button',
].join(', ');
const REGENERATE_CONTROL_SELECTOR = [
  'button[aria-label*="Regenerat" i]',
  'button[aria-label*="Retry" i]',
  'button[aria-label*="重新生成" i]',
].join(', ');

const USER_ROLES = new Set(['user', 'human']);
const MODEL_ROLES = new Set(['model', 'assistant', 'bot']);
// A first-send transition is only the new-chat route becoming a named chat. Named -> named and
// any unrelated URL change must invalidate the old cycle before old DOM is unmounted.
const NEW_CHAT_ROUTES = new Set(['/', '/app', '/app/', '/app/prompts/new', '/app/prompts/new_chat', '/app/prompts/new-chat', '/prompts/new', '/prompts/new_chat', '/prompts/new-chat']);
const isNamedChatRoute = (path: string): boolean =>
  /^\/(?:app\/)?prompts\/[^/]+$/.test(path) && !NEW_CHAT_ROUTES.has(path);
// Bounds an armed-but-never-submitted cycle. This is not positive evidence; it only prevents a
// session from staying armed indefinitely when no matching user turn ever appears.
const BIND_TIMEOUT_MS = 15000;

export interface AistudioProvenance {
  v: 1;
  host: 'aistudio';
  /** Page-load identity; prevents a result emitted before a reload from passing after it. */
  session: string;
  /** One per submission cycle in this document. */
  epoch: number;
  /** Origin + pathname at submission time (migrated across first-send URL transitions). */
  conversation: string;
  /** Stable page-owned identity of the model turn containing the call. */
  turnId: string;
  /** Stable page-owned identity of the user turn this reply answers. */
  userTurnId: string;
}

interface SubmissionCycle {
  epoch: number;
  origin: 'user' | 'extension' | 'regenerate';
  startedAt: number;
  conversation: string;
  conversationAliases: Set<string>;
  /** Transient, page-local evidence of what was actually submitted. Never persisted. */
  submittedDraft: string | null;
  submittedComposer: HTMLElement | null;
  expiresAt: number;
  firstSendMigrated: boolean;
  baselineTurnIds: Set<string>;
  baselineUserTurnIds: Set<string>;
  baselineTail: HTMLElement | null;
  submittedUserTurnId: string | null;
  submittedUserTurnElement: HTMLElement | null;
  allowedTurnIds: Set<string>;
  regenerate: boolean;
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';

export const isAistudioHost = (): boolean => {
  if (!isBrowser()) return false;
  const host = location.hostname.toLowerCase();
  return host === AISTUDIO_HOST || host.endsWith(`.${AISTUDIO_HOST}`);
};

const sessionId = `aistudio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const historicalTurnIds = new Set<string>();
const historicalUserTurnIds = new Set<string>();
const seenTurnIds = new Set<string>();
const seenUserTurnIds = new Set<string>();
let initialized = false;
let cycle: SubmissionCycle | null = null;
let nextEpoch = 1;
let urlPollTimer: number | null = null;

/**
 * One actual tool invocation started from a card (automatic or deliberate manual Run).
 *
 * The DOM card id is not an identity: AI Studio remounts/virtualizes cards and may re-render the
 * same logical call with a changed observation token. A logical invocation is therefore keyed by
 * the page turn identity that owns the card plus the model's call id. The invocation id is carried
 * on every completion for that invocation so a redisplayed/duplicated completion cannot be
 * inserted or submitted twice.
 */
interface InvocationRecord {
  invocationId: string;
  logicalKey: string;
  provenance: AistudioProvenance;
  conversationAliases: Set<string>;
  createdAt: number;
  delivered: boolean;
  cancelled: boolean;
}

/** Automatic dispatch reservations: one automatic click per logical call in this turn. */
interface AutoClaim {
  invocationId: string;
  logicalKey: string;
  createdAt: number;
}

const invocationRecords = new Map<string, InvocationRecord>();
const autoClaims = new Map<string, AutoClaim>();
const loggedAutoClaimSkips = new Set<string>();
let nextInvocation = 1;

// Long enough for a pending observation continuation to return; bounded so a forgotten card does
// not keep authority for the rest of the page lifetime.
const INVOCATION_TTL_MS = 30 * 60 * 1000;

const logicalInvocationKey = (provenance: AistudioProvenance, callId: string | null | undefined): string =>
  `${provenance.session}|${provenance.userTurnId}|${provenance.turnId}|${callId ?? ''}`;

const pruneInvocationRecords = (): void => {
  const cutoff = Date.now() - INVOCATION_TTL_MS;
  for (const [id, record] of invocationRecords) {
    if (record.createdAt < cutoff) invocationRecords.delete(id);
  }
  for (const [key, claim] of autoClaims) {
    if (claim.createdAt < cutoff) autoClaims.delete(key);
  }
};

const clearInvocationRecords = (): void => {
  invocationRecords.clear();
  autoClaims.clear();
  loggedAutoClaimSkips.clear();
};

const currentConversation = (): string =>
  isBrowser() ? `${location.origin}${location.pathname}` : '';

const allTurns = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(TURN_SELECTOR));

/** Draft text actually present in the AI Studio composer at submission time, plus its editor. */
const findComposerEditor = (): HTMLElement | null => {
  for (const editor of Array.from(document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]'))) {
    if (editor.closest('#mcp-button-wrapper, #mcp-popover-container')) continue;
    if (!editor.closest(COMPOSER_SELECTOR)) continue;
    return editor;
  }
  return null;
};

const readSubmittedComposer = (): { draft: string; element: HTMLElement } | null => {
  for (const editor of Array.from(document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]'))) {
    if (editor.closest('#mcp-button-wrapper, #mcp-popover-container')) continue;
    if (!editor.closest(COMPOSER_SELECTOR)) continue;
    const draft = (
      editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT'
        ? (editor as HTMLTextAreaElement).value
        : (editor.textContent ?? '')
    ).trim();
    if (draft) return { draft, element: editor };
  }
  return null;
};

const normalizeDraftText = (text: string): string => text.replace(/\r\n?/g, '\n').trim();

/** Strong per-send evidence: the new user turn must carry the text that was in the composer. */
const draftMatchesTurn = (draft: string | null, turn: HTMLElement | null): boolean => {
  if (!draft || !turn) return false;
  const submitted = normalizeDraftText(draft);
  const textChunks = Array.from(turn.querySelectorAll('ms-text-chunk'));
  const rendered = textChunks.length
    ? textChunks.map(chunk => chunk.textContent ?? '').join('\n')
    : turn.textContent ?? '';
  return !!submitted && normalizeDraftText(rendered) === submitted;
};

const turnRole = (turn: Element | null): string =>
  (turn?.getAttribute('data-turn-role') ?? '').trim().toLowerCase();

const isUserTurn = (turn: Element | null): turn is HTMLElement => !!turn && USER_ROLES.has(turnRole(turn));
const isModelTurn = (turn: Element | null): turn is HTMLElement => !!turn && MODEL_ROLES.has(turnRole(turn));

const readIdAttributes = (element: Element): string | null => {
  for (const attr of ['data-turn-id', 'data-message-id', 'data-response-id']) {
    const value = element.getAttribute(attr)?.trim();
    if (value) return `${attr}:${value}`;
  }
  const id = element.id?.trim();
  return id ? `id:${id}` : null;
};

/**
 * Stable identity owned by AI Studio (not by our renderer and not by node arrival time), so a
 * remounted historical turn keeps the identity it had before the send.
 */
const stableTurnId = (turn: HTMLElement | null): string | null => {
  if (!turn) return null;
  const own = readIdAttributes(turn);
  if (own) return own;

  let node: Element | null = turn.parentElement;
  for (let depth = 0; node && depth < 8 && node !== document.body; depth++, node = node.parentElement) {
    if (!node.matches(TURN_ID_ANCESTOR_SELECTOR)) continue;
    const id = readIdAttributes(node);
    if (id) return id;
  }
  return null;
};

const findTurnById = (id: string): HTMLElement | null =>
  allTurns().find(turn => stableTurnId(turn) === id) ?? null;

const findPrecedingUserTurn = (modelTurn: HTMLElement): HTMLElement | null => {
  let candidate: HTMLElement | null = null;
  for (const turn of allTurns()) {
    if (!isUserTurn(turn)) continue;
    const relation = turn.compareDocumentPosition(modelTurn);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) candidate = turn;
    else break;
  }
  return candidate;
};

const getModelTurn = (element: Element | null): HTMLElement | null => {
  const turn = element?.closest<HTMLElement>(TURN_SELECTOR) ?? null;
  return isModelTurn(turn) ? turn : null;
};

const snapshotHistorical = (): void => {
  for (const turn of allTurns()) {
    const id = stableTurnId(turn);
    if (!id) continue;
    seenTurnIds.add(id);
    if (isUserTurn(turn)) {
      historicalUserTurnIds.add(id);
      seenUserTurnIds.add(id);
    } else {
      historicalTurnIds.add(id);
    }
  }
};

const trackSeenTurns = (): void => {
  for (const turn of allTurns()) {
    const id = stableTurnId(turn);
    if (!id) continue;
    seenTurnIds.add(id);
    if (isUserTurn(turn)) seenUserTurnIds.add(id);
  }
};

const pathFromConversation = (conversation: string): string => {
  try {
    return new URL(conversation).pathname;
  } catch {
    return conversation;
  }
};

const migrateOrCancelOnNavigation = (): void => {
  const activeCycle = cycle;
  if (!activeCycle) return;
  const current = currentConversation();
  if (current === activeCycle.conversation) return;

  // Only the real first-send route (new chat -> its assigned named chat) may migrate, once, and
  // only with the same submitted user turn. Every other URL change invalidates the old effects,
  // including named -> named navigation while the old DOM is still attached.
  const previousPath = pathFromConversation(activeCycle.conversation);
  const nextPath = isBrowser() ? location.pathname : '';
  const isVerifiableFirstSend =
    !activeCycle.firstSendMigrated &&
    NEW_CHAT_ROUTES.has(previousPath) &&
    isNamedChatRoute(nextPath);

  const boundUserStillAttached = !!(
    activeCycle.submittedUserTurnId &&
    (activeCycle.submittedUserTurnElement?.isConnected || !!findTurnById(activeCycle.submittedUserTurnId))
  );
  const matchingSubmittedTurn = allTurns().some(turn => {
    if (!isUserTurn(turn)) return false;
    const id = stableTurnId(turn);
    return !!id
      && !activeCycle.baselineUserTurnIds.has(id)
      && !historicalUserTurnIds.has(id)
      && draftMatchesTurn(activeCycle.submittedDraft, turn);
  });

  if (isVerifiableFirstSend && (boundUserStillAttached || matchingSubmittedTurn)) {
    activeCycle.conversationAliases.add(activeCycle.conversation);
    activeCycle.conversation = current;
    activeCycle.conversationAliases.add(current);
    activeCycle.firstSendMigrated = true;
    for (const record of invocationRecords.values()) {
      record.conversationAliases.add(activeCycle.conversation);
      record.conversationAliases.add(current);
    }
    logger.debug(`AI Studio submission cycle moved with first-send URL transition to ${current}`);
  } else {
    logger.debug('AI Studio navigation invalidated the submission cycle');
    cycle = null;
    clearInvocationRecords();
  }
};

const refreshSubmissionCycle = (): void => {
  if (!cycle) return;
  migrateOrCancelOnNavigation();
  if (!cycle) return;

  trackSeenTurns();

  if (!cycle.submittedUserTurnId) {
    if (!cycle.regenerate) {
      // An unbound cycle must not stay armed forever.
      if (Date.now() > cycle.expiresAt) {
        logger.debug(`AI Studio submission cycle ${cycle.epoch} expired before a matching user turn`);
        cycle = null;
        return;
      }
      // Bind only the user turn whose text matches the composer draft captured at send time.
      // Archived turns loaded after the send do not match, and an ambiguous match fails closed.
      const matchingUserTurns = allTurns().filter(turn => {
        if (!isUserTurn(turn)) return false;
        const tail = cycle!.baselineTail;
        if (tail) {
          const anchor = tail.isConnected ? tail : findTurnById(stableTurnId(tail) ?? '');
          if (!anchor || !(anchor.compareDocumentPosition(turn) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
        }
        const id = stableTurnId(turn);
        return !!id
          && !cycle!.baselineUserTurnIds.has(id)
          && !historicalUserTurnIds.has(id)
          && draftMatchesTurn(cycle!.submittedDraft, turn);
      });
      if (matchingUserTurns.length > 1) {
        logger.debug(`AI Studio submission cycle ${cycle.epoch} has ambiguous submitted user turns; failing closed`);
        cycle = null;
        return;
      }
      const submitted = matchingUserTurns[0] ?? null;
      const id = stableTurnId(submitted);
      if (id) {
        cycle.submittedUserTurnId = id;
        cycle.submittedUserTurnElement = submitted;
        logger.debug(`AI Studio submission cycle ${cycle.epoch} bound to verified user turn ${id}`);
      }
    } else {
      // Regenerate has no new user turn; the reply still answers the user turn that precedes it.
      const modelTurns = allTurns().filter(isModelTurn);
      const lastModelTurn = modelTurns[modelTurns.length - 1] ?? null;
      const userTurn = lastModelTurn ? findPrecedingUserTurn(lastModelTurn) : null;
      const id = stableTurnId(userTurn);
      if (id) {
        cycle.submittedUserTurnId = id;
        cycle.submittedUserTurnElement = userTurn;
      }
    }
  }

  if (!cycle.submittedUserTurnId) return;

  if (!cycle.submittedUserTurnElement?.isConnected) {
    cycle.submittedUserTurnElement = findTurnById(cycle.submittedUserTurnId);
  }

  for (const modelTurn of allTurns()) {
    if (!isModelTurn(modelTurn)) continue;
    const id = stableTurnId(modelTurn);
    if (!id) continue;
    if (historicalTurnIds.has(id) || cycle.baselineTurnIds.has(id)) continue;
    if (cycle.allowedTurnIds.has(id)) continue;

    const userTurn = findPrecedingUserTurn(modelTurn);
    const userTurnId = stableTurnId(userTurn);
    if (!userTurnId || userTurnId !== cycle.submittedUserTurnId) continue;

    // The model turn must be after the bound user turn in document order. This rejects delayed
    // historical replies that load above the current prompt while a response is streaming.
    if (cycle.submittedUserTurnElement && cycle.submittedUserTurnElement.isConnected) {
      const relation = cycle.submittedUserTurnElement.compareDocumentPosition(modelTurn);
      if (!(relation & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    }

    cycle.allowedTurnIds.add(id);
    logger.debug(`AI Studio submission cycle ${cycle.epoch} admitted model turn ${id}`);
  }
};

const beginSubmissionCycle = (
  origin: SubmissionCycle['origin'],
  explicitDraft?: string,
): void => {
  if (!isAistudioHost()) return;
  migrateOrCancelOnNavigation();
  trackSeenTurns();

  // A trusted user send/regenerate starts new work and explicitly cancels old work. An extension
  // send is the delivery of an already-authorized in-flight result: keep those operations valid so
  // later results from the same batch may still arrive, and keep automatic-dispatch reservations
  // so a remount of the old turn cannot re-dispatch while the send is in progress.
  if (origin !== 'extension') {
    clearInvocationRecords();
  }
  pruneInvocationRecords();

  const now = Date.now();
  // A trusted Enter and the app's own send click can describe the same send. Keep the first
  // snapshot instead of replacing the baseline after the user turn was already inserted.
  if (
    cycle &&
    origin !== 'regenerate' &&
    cycle.origin !== 'regenerate' &&
    !cycle.submittedUserTurnId &&
    now - cycle.startedAt < 800
  ) {
    return;
  }

  // Private, transient evidence from the composer at the moment of the real send. A regenerate
  // has no new draft; it is handled from the regenerated turn's own preceding user turn.
  const composer = origin === 'regenerate' ? null : readSubmittedComposer();
  const draft = origin === 'regenerate'
    ? null
    : (explicitDraft?.trim() || composer?.draft || '');
  if (origin !== 'regenerate' && !draft) {
    logger.debug('AI Studio send ignored: composer has no submitted content');
    return;
  }

  const baselineTurnIds = new Set(seenTurnIds);
  const baselineUserTurnIds = new Set(seenUserTurnIds);
  for (const turn of allTurns()) {
    const id = stableTurnId(turn);
    if (!id) continue;
    baselineTurnIds.add(id);
    if (isUserTurn(turn)) baselineUserTurnIds.add(id);
  }

  cycle = {
    epoch: nextEpoch++,
    origin,
    startedAt: now,
    conversation: currentConversation(),
    conversationAliases: new Set([currentConversation()]),
    submittedDraft: draft,
    submittedComposer: composer?.element ?? null,
    expiresAt: now + BIND_TIMEOUT_MS,
    firstSendMigrated: false,
    baselineTurnIds,
    baselineUserTurnIds,
    baselineTail: allTurns().at(-1) ?? null,
    submittedUserTurnId: null,
    submittedUserTurnElement: null,
    allowedTurnIds: new Set(),
    regenerate: origin === 'regenerate',
  };
  logger.debug(`AI Studio submission cycle ${cycle.epoch} started (${origin})`);
};

const isInsideComposer = (target: Element | null): boolean => {
  if (!target) return false;
  if (target.closest('#mcp-button-wrapper, #mcp-popover-container')) return false;
  const composer = target.closest(COMPOSER_SELECTOR);
  if (!composer) return false;
  return !!target.closest('textarea, [contenteditable="true"]');
};

const isRegenerateControl = (target: Element | null): boolean =>
  !!target?.closest(REGENERATE_CONTROL_SELECTOR);

const isSendControl = (target: Element | null): boolean => {
  const control = target?.closest<HTMLElement>(SEND_CONTROL_SELECTOR);
  if (!control) return false;
  if (control.closest('#mcp-button-wrapper, #mcp-popover-container')) return false;
  if (!control.closest(COMPOSER_SELECTOR)) return false;
  const vocabulary = [
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    control.getAttribute('data-test-id'),
    control.getAttribute('data-testid'),
    control.className,
    control.textContent,
  ].filter(Boolean).join(' ');
  if (/(?:^|[\s_-])(?:stop|pause|mic|microphone|attach|upload)(?:[\s_-]|$)|停止|中止|暂停/i.test(vocabulary)) {
    return false;
  }
  if ((control as HTMLButtonElement).disabled || control.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  return true;
};

/** Current non-empty composer draft and its editor, for a deferred send to pin its scope. */
export const getAistudioComposerSnapshot = (): { draft: string; element: HTMLElement } | null =>
  readSubmittedComposer();

/** Active composer editor even when the draft is empty (a chip-captured result has not flushed yet). */
export const getAistudioComposerElement = (): HTMLElement | null => findComposerEditor();

/** True when the real AI Studio send control is present, scoped to the composer, and enabled. */
export const isAistudioSendControlReady = (): boolean => {
  if (!isAistudioHost()) return false;
  return Array.from(document.querySelectorAll<HTMLElement>(SEND_CONTROL_SELECTOR)).some(control =>
    isSendControl(control),
  );
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (!event.isTrusted) return;
  // AI Studio sends on plain Enter; Shift+Enter is a newline, other modifiers are not send
  // shortcuts. Ignore them so an unrelated action cannot arm a submission cycle.
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.keyCode === 229
  ) return;
  if (!isInsideComposer(event.target as Element | null)) return;
  beginSubmissionCycle('user');
};

const onClick = (event: MouseEvent): void => {
  if (!event.isTrusted) return;
  const target = event.target as Element | null;
  if (isRegenerateControl(target)) {
    beginSubmissionCycle('regenerate');
    return;
  }
  if (isSendControl(target)) beginSubmissionCycle('user');
};

const onNavigation = (): void => {
  if (cycle) {
    migrateOrCancelOnNavigation();
    return;
  }
  if (invocationRecords.size === 0 && autoClaims.size === 0) return;
  const current = currentConversation();
  const stillHere = Array.from(invocationRecords.values()).some(record => record.conversationAliases.has(current));
  if (!stillHere) {
    clearInvocationRecords();
    logger.debug('AI Studio navigation cancelled in-flight delivery authority');
  }
};

let navigationListenersAttached = false;

export const initializeAistudioTurnGate = (): void => {
  if (!isAistudioHost() || initialized) return;
  initialized = true;
  snapshotHistorical();

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);
  if (!navigationListenersAttached) {
    window.addEventListener('popstate', onNavigation);
    window.addEventListener('hashchange', onNavigation);
    navigationListenersAttached = true;
  }
  // pushState cannot be wrapped from an isolated world; a low-frequency poll is only a fallback.
  // Every renderer/effect check also compares the URL synchronously.
  urlPollTimer = window.setInterval(onNavigation, 400);
  logger.debug('AI Studio turn gate initialized');
};

/** Called by the AI Studio adapter immediately before it clicks send. */
export const beginExtensionSubmission = (): void => beginSubmissionCycle('extension');

/** Outstanding cards and results from this cycle stay cancelled after tools are re-enabled. */
export const cancelAistudioSubmission = (): void => {
  cycle = null;
  clearInvocationRecords();
};

/** Called by the adapter when its submission attempt failed, so no cycle is left armed. */
export const abortExtensionSubmission = (): void => {
  if (cycle?.origin === 'extension' && !cycle.submittedUserTurnId) cycle = null;
};

/**
 * Provenance for a call card inside an eligible model turn, or null when the call is historical,
 * unattached, or not demonstrably part of the current submission.
 */
export const getAistudioProvenance = (element: Element | null): AistudioProvenance | null => {
  if (!isAistudioHost() || !element) return null;
  refreshSubmissionCycle();
  if (!cycle) return null;

  const modelTurn = getModelTurn(element);
  const turnId = stableTurnId(modelTurn);
  if (!turnId || !cycle.allowedTurnIds.has(turnId)) return null;

  const userTurn = findPrecedingUserTurn(modelTurn!);
  const userTurnId = stableTurnId(userTurn);
  if (!userTurnId || userTurnId !== cycle.submittedUserTurnId) return null;

  return {
    v: 1,
    host: 'aistudio',
    session: sessionId,
    epoch: cycle.epoch,
    conversation: cycle.conversation,
    turnId,
    userTurnId,
  };
};

/** Revalidate at every automatic effect boundary (queued click, delayed insert, final send). */
export const isAistudioProvenanceCurrent = (provenance: AistudioProvenance | null | undefined): boolean => {
  if (!isAistudioHost()) return true;
  if (!provenance) return false;
  refreshSubmissionCycle();
  if (!cycle) return false;
  if (provenance.session !== sessionId) return false;
  if (provenance.epoch !== cycle.epoch) return false;
  if (!cycle.conversationAliases.has(provenance.conversation)) return false;
  if (provenance.userTurnId !== cycle.submittedUserTurnId) return false;
  if (!cycle.allowedTurnIds.has(provenance.turnId)) return false;

  const modelTurn = findTurnById(provenance.turnId);
  if (!modelTurn || !modelTurn.isConnected) return false;
  const userTurn = findPrecedingUserTurn(modelTurn);
  return stableTurnId(userTurn) === provenance.userTurnId;
};

/** New unique id for a deliberate manual invocation (Run again, history re-run). */
export const createAistudioInvocationId = (kind: 'manual'): string =>
  `aistudio-${kind}-${sessionId}-${nextInvocation++}`;

/**
 * Reserve the automatic dispatch for one logical call (page turn + call id). Returns the stable
 * invocation id on the first claim, or null when another render/observer path already claimed it.
 * The claim survives a remount/re-render with changed parameters, so one logical automatic call
 * cannot produce two server jobs merely because a DOM card was replaced.
 */
export const claimAistudioAutomaticInvocation = (
  provenance: AistudioProvenance | null | undefined,
  callId: string | null | undefined,
): string | null => {
  if (!isAistudioHost()) return null;
  if (!provenance || !callId) return null;
  if (!isAistudioProvenanceCurrent(provenance)) return null;

  pruneInvocationRecords();
  const key = logicalInvocationKey(provenance, callId);
  if (autoClaims.has(key)) {
    if (!loggedAutoClaimSkips.has(key)) {
      loggedAutoClaimSkips.add(key);
      logger.debug(`AI Studio automatic invocation already claimed for ${callId}; ignoring duplicate render`);
    }
    return null;
  }

  const invocationId = `aistudio-auto-${sessionId}-${nextInvocation++}`;
  autoClaims.set(key, { invocationId, logicalKey: key, createdAt: Date.now() });
  return invocationId;
};

/** Drop a reservation only when the automatic path definitively gave up without dispatching. */
export const releaseAistudioAutomaticInvocation = (invocationId: string | null | undefined): void => {
  if (!invocationId) return;
  for (const [key, claim] of autoClaims) {
    if (claim.invocationId === invocationId) {
      autoClaims.delete(key);
      loggedAutoClaimSkips.delete(key);
      return;
    }
  }
};

/**
 * Register a real invocation before its tool call starts. Only a card that is currently
 * authorized can register; historical/remounted/unrelated cards never gain authority.
 */
export const registerAistudioInvocation = (
  provenance: AistudioProvenance | null | undefined,
  callId: string | null | undefined,
  invocationId: string | null | undefined,
): boolean => {
  if (!isAistudioHost()) return true;
  if (!provenance || !callId || !invocationId) return false;
  if (!isAistudioProvenanceCurrent(provenance)) return false;
  if (invocationRecords.has(invocationId)) return false;

  pruneInvocationRecords();
  invocationRecords.set(invocationId, {
    invocationId,
    logicalKey: logicalInvocationKey(provenance, callId),
    provenance: { ...provenance },
    conversationAliases: new Set([provenance.conversation, currentConversation()]),
    createdAt: Date.now(),
    delivered: false,
    cancelled: false,
  });
  return true;
};

const isInvocationRecordAuthorized = (invocationId: string, provenance?: AistudioProvenance | null): boolean => {
  const record = invocationRecords.get(invocationId);
  if (!record) return false;
  if (record.delivered || record.cancelled) return false;
  if (Date.now() - record.createdAt > INVOCATION_TTL_MS) {
    invocationRecords.delete(invocationId);
    return false;
  }
  if (!record.conversationAliases.has(currentConversation())) return false;
  if (provenance) {
    if (provenance.session !== record.provenance.session) return false;
    if (provenance.userTurnId !== record.provenance.userTurnId) return false;
    if (provenance.turnId !== record.provenance.turnId) return false;
  }
  return true;
};

/**
 * Delivery authorization for a completion. The current provenance remains the fast path. A
 * completion from an invocation started while the previous epoch was current stays authorized
 * across an extension-initiated send in the same conversation, so a late result from the same
 * batch is not discarded. A new user send/navigation/reset/Disable All/setting switch clears it.
 */
export const isAistudioDeliveryAuthorized = (
  provenance: AistudioProvenance | null | undefined,
  invocationId?: string | null,
  callId?: string | null,
): boolean => {
  if (!isAistudioHost()) return true;
  if (isAistudioProvenanceCurrent(provenance)) return true;
  if (!provenance || !invocationId) return false;
  if (!isInvocationRecordAuthorized(invocationId, provenance)) return false;

  const record = invocationRecords.get(invocationId)!;
  if (callId && record.logicalKey !== logicalInvocationKey(record.provenance, callId)) return false;
  return true;
};

/** Mark one logical delivery complete so later duplicate completions cannot insert/submit again. */
export const completeAistudioInvocation = (invocationId: string | null | undefined): void => {
  if (!invocationId) return;
  const record = invocationRecords.get(invocationId);
  if (record) record.delivered = true;
};

/** Cancel all in-flight delivery authority without touching a card the user may still run manually. */
export const cancelAistudioInFlightWork = (): void => {
  for (const record of invocationRecords.values()) record.cancelled = true;
  invocationRecords.clear();
  autoClaims.clear();
  loggedAutoClaimSkips.clear();
};

/**
 * Current automatic-action eligibility. `window.__mcpToolEnablement` is published synchronously
 * by the tool store subscription, so Disable All also stops actions already queued.
 */
export const isAistudioAutomaticActionEnabled = (functionName: string): boolean => {
  if (!isAistudioHost()) return true;

  const state = (window as any).__mcpAutomationState;
  const enabled = (window as any).__mcpToolEnablement as string[] | undefined;
  if (!Array.isArray(enabled)) return false;

  const isMeta = functionName === 'get_tool_schema' || functionName === 'tool_lookup';
  const settingOn = isMeta ? state?.autoDiscovery === true : state?.autoExecute === true;
  if (!settingOn) return false;

  // Discovery is internal, so it needs at least one tool still enabled after Disable All.
  return isMeta ? enabled.length > 0 : enabled.includes(functionName);
};

/** Test-only: jsdom cannot produce an event with isTrusted=true; mirrors the keydown path. */
export const __noteAistudioUserSubmissionForTests = (
  origin: SubmissionCycle['origin'] = 'user',
  draft?: string,
): void => {
  beginSubmissionCycle(origin, draft);
};

/** Test-only state snapshot; never used by production code. */
export const __getAistudioGateStateForTests = () => ({
  initialized,
  cycle: cycle
    ? {
        epoch: cycle.epoch,
        origin: cycle.origin,
        conversation: cycle.conversation,
        conversationAliases: Array.from(cycle.conversationAliases),
        submittedUserTurnId: cycle.submittedUserTurnId,
        allowedTurnIds: Array.from(cycle.allowedTurnIds),
        baselineTurnIds: Array.from(cycle.baselineTurnIds),
      }
    : null,
  historicalTurnIds: Array.from(historicalTurnIds),
  seenTurnIds: Array.from(seenTurnIds),
  invocationRecords: Array.from(invocationRecords.values()).map(record => ({
    invocationId: record.invocationId,
    logicalKey: record.logicalKey,
    delivered: record.delivered,
    cancelled: record.cancelled,
  })),
  autoClaims: Array.from(autoClaims.values()).map(claim => claim.logicalKey),
});

/** Test-only reset; also used when a page test swaps the AI Studio document. */
export const __resetAistudioTurnGateForTests = (): void => {
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('click', onClick, true);
  if (navigationListenersAttached) {
    window.removeEventListener('popstate', onNavigation);
    window.removeEventListener('hashchange', onNavigation);
    navigationListenersAttached = false;
  }
  if (urlPollTimer !== null) {
    window.clearInterval(urlPollTimer);
    urlPollTimer = null;
  }
  initialized = false;
  cycle = null;
  nextEpoch = 1;
  nextInvocation = 1;
  clearInvocationRecords();
  historicalTurnIds.clear();
  historicalUserTurnIds.clear();
  seenTurnIds.clear();
  seenUserTurnIds.clear();
};

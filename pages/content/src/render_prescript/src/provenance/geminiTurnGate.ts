// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

const GEMINI_HOST = 'gemini.google.com';

const SEND_HINT_RE =
  /^(?:send|submit)(?:[ -](?:message|prompt|button))?$|^(?:发送|傳送|送出)(?:消息|訊息|提示)?$|^提交$/i;
const STOP_OR_NON_SEND_RE =
  /stop|pause|停止|中止|暫停|暂停|mic|voice|attach|upload|tools?|model|menu|more/i;

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';

export const isGeminiHost = (): boolean => {
  if (!isBrowser()) return false;
  const host = location.hostname.toLowerCase();
  return host === GEMINI_HOST || host.endsWith(`.${GEMINI_HOST}`);
};

let initialized = false;
let currentPath = '';
let armed = false;
let historicalResponses = new WeakSet<Element>();
let historicalBlocks = new WeakSet<Element>();
let liveStreamingBlocks = new WeakSet<Element>();

const isGeminiNewChatPath = (path: string): boolean => /^(?:\/u\/\d+)?\/app\/?(?:\?.*)?$/i.test(path);
const isGeminiConcreteChatPath = (path: string): boolean => /^(?:\/u\/\d+)?\/app\/[^/?#]+/i.test(path);

const snapshotExistingDomAsHistorical = (): void => {
  if (!isBrowser()) return;
  document.querySelectorAll('model-response').forEach(el => historicalResponses.add(el));
  document.querySelectorAll('pre, code').forEach(el => historicalBlocks.add(el));
};

const syncGeminiUrl = (): void => {
  if (!isBrowser()) return;
  const nextPath = location.pathname + location.search;
  if (nextPath === currentPath) return;

  if (armed && isGeminiNewChatPath(currentPath) && isGeminiConcreteChatPath(nextPath)) {
    currentPath = nextPath;
    return;
  }

  armed = false;
  snapshotExistingDomAsHistorical();
  currentPath = nextPath;
};

const hasSubsequentUserQuery = (target: Element): boolean => {
  const queries = document.querySelectorAll('user-query');
  if (queries.length === 0) return false;
  const last = queries[queries.length - 1];
  return (target.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
};

const isButtonDisabled = (button: HTMLButtonElement): boolean =>
  button.disabled ||
  button.getAttribute('disabled') !== null ||
  button.getAttribute('aria-disabled') === 'true' ||
  button.classList.contains('disabled') ||
  button.classList.contains('mat-mdc-button-disabled');

const STOP_CONTROL_RE = /(?:^|[\s_-])(?:stop|pause)(?:[\s_-]|$)|停止|中止|暫停|暂停/i;

const isElementVisible = (el: HTMLElement): boolean => {
  if (!el.isConnected || el.hidden || el.closest('[hidden]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
};

const hasVisibleGeminiStopControl = (): boolean => {
  if (!isBrowser()) return false;
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) {
    if (!isElementVisible(btn)) continue;
    const vocab = [
      btn.getAttribute('aria-label'),
      btn.getAttribute('title'),
      btn.getAttribute('data-test-id'),
      btn.getAttribute('data-testid'),
      typeof btn.className === 'string' ? btn.className : '',
      btn.textContent,
    ]
      .filter(Boolean)
      .join(' ');
    if (STOP_CONTROL_RE.test(vocab)) return true;
  }
  return false;
};

const looksLikeGeminiSendButton = (button: HTMLButtonElement): boolean => {
  const className = typeof button.className === 'string' ? button.className : '';
  const aria = button.getAttribute('aria-label') ?? '';
  const title = button.getAttribute('title') ?? '';
  const testId = button.getAttribute('data-test-id') ?? button.getAttribute('data-testid') ?? '';
  const vocab = `${aria} ${title} ${testId} ${className}`.trim();
  if (STOP_OR_NON_SEND_RE.test(vocab)) return false;

  return (
    /(?:^|\s)send-button(?:\s|$)/.test(className) ||
    SEND_HINT_RE.test(aria) ||
    SEND_HINT_RE.test(title) ||
    SEND_HINT_RE.test(testId)
  );
};

export const notifyGeminiSubmission = (): void => {
  if (!isGeminiHost()) return;
  syncGeminiUrl();
  snapshotExistingDomAsHistorical();
  armed = true;
};

const onWindowKeydown = (e: KeyboardEvent): void => {
  if (!isGeminiHost()) return;
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target?.closest('.ql-editor, [contenteditable="true"], textarea')) return;
  notifyGeminiSubmission();
};

const onWindowClick = (e: MouseEvent): void => {
  if (!isGeminiHost()) return;
  const target = e.target instanceof Element ? e.target : null;
  const button = target?.closest('button');
  if (!(button instanceof HTMLButtonElement)) return;
  if (isButtonDisabled(button) || !looksLikeGeminiSendButton(button)) return;
  notifyGeminiSubmission();
};

const onWindowNavigate = (): void => {
  if (!isGeminiHost()) return;
  syncGeminiUrl();
};

export const initializeGeminiTurnGate = (): void => {
  if (!isGeminiHost() || initialized) return;
  initialized = true;
  currentPath = location.pathname + location.search;
  armed = false;
  snapshotExistingDomAsHistorical();

  window.addEventListener('keydown', onWindowKeydown, true);
  window.addEventListener('click', onWindowClick, true);
  window.addEventListener('popstate', onWindowNavigate, true);
  window.addEventListener('hashchange', onWindowNavigate, true);
};

export const observeGeminiBlock = (
  block: HTMLElement,
  isComplete: boolean,
  isPreExistingIncomplete: boolean,
): void => {
  if (!isGeminiHost()) return;
  syncGeminiUrl();
  if (!isComplete && !isPreExistingIncomplete && (armed || hasVisibleGeminiStopControl())) {
    const modelResponse = block.closest('model-response');
    if (
      !historicalBlocks.has(block) &&
      !(modelResponse && historicalResponses.has(modelResponse)) &&
      !hasSubsequentUserQuery(modelResponse || block)
    ) {
      liveStreamingBlocks.add(block);
    }
  }
};

export const canGeminiAutoExecute = (element: HTMLElement | null): boolean => {
  if (!isGeminiHost()) return true;
  if (!element) return false;
  syncGeminiUrl();

  const source = (element as any)._mcpSource instanceof HTMLElement ? (element as any)._mcpSource : element;
  const modelResponse = source.closest('model-response') || element.closest('model-response');

  if (hasSubsequentUserQuery(modelResponse || source)) {
    historicalBlocks.add(source);
    if (modelResponse) historicalResponses.add(modelResponse);
    return false;
  }

  if (historicalBlocks.has(source) || (modelResponse && historicalResponses.has(modelResponse))) {
    return false;
  }

  if (armed || liveStreamingBlocks.has(source)) {
    return true;
  }

  historicalBlocks.add(source);
  if (modelResponse) historicalResponses.add(modelResponse);
  return false;
};

export const resetGeminiTurnGateForTests = (): void => {
  currentPath = isBrowser() ? location.pathname + location.search : '';
  armed = false;
  historicalResponses = new WeakSet<Element>();
  historicalBlocks = new WeakSet<Element>();
  liveStreamingBlocks = new WeakSet<Element>();
  if (isGeminiHost()) {
    snapshotExistingDomAsHistorical();
  }
};

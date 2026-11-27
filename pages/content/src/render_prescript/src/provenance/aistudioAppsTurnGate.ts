// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

const AISTUDIO_HOST = 'aistudio.google.com';
const STOP_LABEL_RE = /^(stop|cancel|停止|中止)/i;

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';

/** True on any `aistudio.google.com` page, regardless of Playground vs Build / Apps route. */
export const isAistudioRawHost = (): boolean => {
  if (!isBrowser()) return false;
  const host = location.hostname.toLowerCase();
  return host === AISTUDIO_HOST || host.endsWith(`.${AISTUDIO_HOST}`);
};

const normalizePath = (path: string): string => {
  const clean = path.split(/[?#]/)[0] || '/';
  return clean.replace(/^\/u\/\d+(?=\/)/, '').replace(/\/+$/, '') || '/';
};

export const normalizeAistudioAppsPath = (path: string): string => normalizePath(path);

/** True when `pathname` targets AI Studio Build / Apps (`/app/apps` or `/apps`). */
export const isAistudioAppsRoute = (pathname: string = isBrowser() ? location.pathname : ''): boolean =>
  /^\/(?:app\/)?apps(?:\/|$)/.test(normalizePath(pathname));

/** True when currently running on an AI Studio Build / Apps page. */
export const isAistudioAppsHost = (): boolean => isAistudioRawHost() && isAistudioAppsRoute();

let initialized = false;
let currentPath = '';
let armed = false;
let historicalBlocks = new WeakSet<Element>();
let claimedInTurn = new Set<string>();

const isAppsLandingPath = (path: string): boolean => /^\/(?:app\/)?apps$/i.test(normalizePath(path));
const isAppsConcretePath = (path: string): boolean => /^\/(?:app\/)?apps\/[^/]+/i.test(normalizePath(path));

const snapshotExistingDomAsHistorical = (): void => {
  if (!isBrowser()) return;
  document.querySelectorAll('pre, code, .function-block').forEach(el => historicalBlocks.add(el));
};

const syncAppsUrl = (): void => {
  if (!isBrowser()) return;
  const nextPath = normalizePath(location.pathname);
  if (nextPath === currentPath) return;

  if (armed && isAppsLandingPath(currentPath) && isAppsConcretePath(nextPath)) {
    currentPath = nextPath;
    return;
  }

  armed = false;
  claimedInTurn.clear();
  if (isAistudioAppsRoute(nextPath)) {
    snapshotExistingDomAsHistorical();
  }
  currentPath = nextPath;
};

/** Arm `/app/apps` auto-execution for the upcoming reply and freeze prior cards as historical. */
export const notifyAistudioAppsSubmission = (): void => {
  if (!isAistudioAppsHost()) return;
  syncAppsUrl();
  snapshotExistingDomAsHistorical();
  claimedInTurn.clear();
  armed = true;
};

const onWindowKeydown = (e: KeyboardEvent): void => {
  if (!isAistudioAppsHost()) return;
  if (
    e.key !== 'Enter' ||
    !e.ctrlKey ||
    e.shiftKey ||
    e.altKey ||
    e.metaKey ||
    e.isComposing ||
    e.keyCode === 229
  ) {
    return;
  }
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('.monaco-editor')) return;
  if (
    !target?.closest(
      'ms-code-assistant-chat, ms-applet-generator-form, ms-autocomplete-textarea, [role="textbox"][contenteditable], textarea',
    )
  ) {
    return;
  }
  notifyAistudioAppsSubmission();
};

const onWindowClick = (e: MouseEvent): void => {
  if (!isAistudioAppsHost()) return;
  const target = e.target instanceof Element ? e.target : null;
  const form = target?.closest('ms-code-assistant-chat, ms-applet-generator-form');
  if (!form) return;
  const button = target?.closest(
    'button.send-button, button[aria-label="Send" i], button[aria-label="Build" i], button[aria-label="发送" i], button[aria-label="提交" i], button[type="submit"]',
  );
  if (!(button instanceof HTMLButtonElement)) return;
  if (
    button.disabled ||
    button.getAttribute('aria-disabled') === 'true' ||
    button.classList.contains('disabled') ||
    button.classList.contains('mat-mdc-button-disabled')
  ) {
    return;
  }
  const aria = (button.getAttribute('aria-label') || '').trim();
  const text = (button.textContent || '').trim();
  if (STOP_LABEL_RE.test(aria) || STOP_LABEL_RE.test(text)) return;
  notifyAistudioAppsSubmission();
};

const onWindowNavigate = (): void => {
  if (!isAistudioRawHost()) return;
  syncAppsUrl();
};

/** Initialize the lightweight `/app/apps` turn gate once per document on `aistudio.google.com`. */
export const initializeAistudioAppsTurnGate = (): void => {
  if (!isAistudioRawHost() || initialized) return;
  initialized = true;
  currentPath = normalizePath(location.pathname);
  armed = false;
  claimedInTurn.clear();
  if (isAistudioAppsRoute()) {
    snapshotExistingDomAsHistorical();
  }

  window.addEventListener('keydown', onWindowKeydown, true);
  window.addEventListener('click', onWindowClick, true);
  window.addEventListener('popstate', onWindowNavigate, true);
  window.addEventListener('hashchange', onWindowNavigate, true);
};

/** Allow auto-execution only for cards rendered after an armed submission in the current app session. */
export const canAistudioAppsAutoExecute = (element: HTMLElement | null, functionName?: string): boolean => {
  if (!isAistudioAppsHost()) return true;
  if (!element) return false;
  syncAppsUrl();

  if (functionName) {
    const enabled = (window as any).__mcpToolEnablement as string[] | undefined;
    if (Array.isArray(enabled)) {
      const isMeta = functionName === 'get_tool_schema' || functionName === 'tool_lookup';
      if (isMeta ? enabled.length === 0 : !enabled.includes(functionName)) {
        return false;
      }
    }
  }

  const source = (element as any)._mcpSource instanceof HTMLElement ? (element as any)._mcpSource : element;
  if (historicalBlocks.has(source) || historicalBlocks.has(element)) {
    return false;
  }

  if (armed) {
    return true;
  }

  historicalBlocks.add(source);
  historicalBlocks.add(element);
  return false;
};

/**
 * Reserve automatic execution once per logical `(functionName, callId, contentSignature)` within
 * an armed `/app/apps` turn so duplicate remounts dedupe without blocking other apps or turns.
 */
export const claimAistudioAppsAutoExecution = (
  element: HTMLElement | null,
  functionName: string,
  callId: string,
  contentSignature: string,
): boolean => {
  if (!isAistudioAppsHost()) return true;
  if (!canAistudioAppsAutoExecute(element, functionName)) return false;

  const key = `${functionName}:${callId}:${contentSignature}`;
  if (claimedInTurn.has(key)) return false;
  claimedInTurn.add(key);
  return true;
};

/** Reset `/app/apps` turn gate state between headless DOM test runs. */
export const resetAistudioAppsTurnGateForTests = (): void => {
  currentPath = isBrowser() ? normalizePath(location.pathname) : '';
  armed = false;
  historicalBlocks = new WeakSet<Element>();
  claimedInTurn.clear();
  if (isAistudioAppsHost()) {
    snapshotExistingDomAsHistorical();
  }
};

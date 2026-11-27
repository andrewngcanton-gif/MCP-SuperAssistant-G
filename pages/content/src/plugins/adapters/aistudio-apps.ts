// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ChipAnchors } from '../plugin-types';
import {
  isAistudioAppsRoute,
  normalizeAistudioAppsPath,
  notifyAistudioAppsSubmission,
} from '../../render_prescript/src/provenance/aistudioAppsTurnGate';

export { isAistudioAppsRoute };

export const AISTUDIO_APPS_SEND_BUTTON_SELECTOR =
  'button.send-button, button[aria-label="Send" i], button[aria-label="Build" i], button[aria-label="发送" i], button[aria-label="提交" i], button[type="submit"]';

const STOP_LABEL_RE = /^(stop|cancel|停止|中止)/i;
const APPS_COMPOSER_ROOT_SELECTOR = 'ms-code-assistant-chat, ms-applet-generator-form';

const normalizeAppsDraft = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Locate the `/app/apps` or `/apps/<id>` prompt composer element, excluding right-pane Monaco editors. */
export const findAistudioAppsInput = (): HTMLElement | null => {
  const selectors = [
    'ms-code-assistant-chat .input-container textarea',
    'ms-code-assistant-chat textarea',
    'ms-code-assistant-chat [role="textbox"][contenteditable]',
    'ms-applet-generator-form ms-autocomplete-textarea [role="textbox"][contenteditable]',
    'ms-applet-generator-form .prompt-textarea[contenteditable]',
    'ms-applet-generator-form [role="textbox"][contenteditable]',
    'ms-applet-generator-form textarea',
    'ms-autocomplete-textarea [role="textbox"][contenteditable]',
  ];

  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('.monaco-editor')) continue;
      return el;
    }
  }

  return null;
};

/** Locate the native send/build button inside the `/app/apps` or `/apps/<id>` composer, ignoring stop controls. */
export const findAistudioAppsSendButton = (scope?: ParentNode | null): HTMLButtonElement | null => {
  const root: ParentNode = scope ?? document.querySelector(APPS_COMPOSER_ROOT_SELECTOR) ?? document;
  const selectors = [
    'button.send-button',
    'button[aria-label="Send" i]',
    'button[aria-label="Build" i]',
    'button[aria-label="发送" i]',
    'button[aria-label="提交" i]',
    'button[type="submit"]',
  ];

  for (const selector of selectors) {
    const candidates = root.querySelectorAll<HTMLButtonElement>(selector);
    for (const btn of candidates) {
      const aria = (btn.getAttribute('aria-label') || '').trim();
      const text = (btn.textContent || '').trim();
      if (STOP_LABEL_RE.test(aria) || STOP_LABEL_RE.test(text) || btn.classList.contains('stop-button')) {
        continue;
      }
      return btn;
    }
  }

  return null;
};

/** Return true when any visible stop/cancel button is present in the `/app/apps` or `/apps/<id>` composer. */
export const hasAistudioAppsStopControl = (scope?: ParentNode | null): boolean => {
  const root: ParentNode = scope ?? document.querySelector(APPS_COMPOSER_ROOT_SELECTOR) ?? document;
  for (const btn of root.querySelectorAll<HTMLButtonElement>('button')) {
    if (!btn.isConnected || btn.hidden || btn.closest('[hidden]')) continue;
    const style = window.getComputedStyle(btn);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      continue;
    }
    const aria = (btn.getAttribute('aria-label') || '').trim();
    const text = (btn.textContent || '').trim();
    if (
      STOP_LABEL_RE.test(aria) ||
      STOP_LABEL_RE.test(text) ||
      btn.classList.contains('stop-button') ||
      btn.classList.contains('stop-generating')
    ) {
      return true;
    }
  }
  return false;
};

/** Return true when the `/app/apps` send control is connected, enabled, and not a stop control. */
export const isAistudioAppsSendButtonEnabled = (button: HTMLButtonElement): boolean => {
  return (
    button.isConnected &&
    !button.disabled &&
    button.getAttribute('aria-disabled') !== 'true' &&
    !button.classList.contains('disabled') &&
    !button.classList.contains('mat-mdc-button-disabled') &&
    !STOP_LABEL_RE.test((button.getAttribute('aria-label') || '').trim())
  );
};

/** Return chip-bar anchors and `ctrlEnterOnly` behavior for `/app/apps` and `/apps/<id>`. */
export const getAistudioAppsChipAnchors = (): ChipAnchors | null => {
  const input = findAistudioAppsInput();
  if (!input) return null;

  const composerRoot = input.closest<HTMLElement>(APPS_COMPOSER_ROOT_SELECTOR);
  const inputContainer = input.closest<HTMLElement>('.input-container');
  const sendBtn = composerRoot ? findAistudioAppsSendButton(composerRoot) : null;
  const container =
    inputContainer && (!sendBtn || inputContainer.contains(sendBtn))
      ? inputContainer
      : (composerRoot ?? inputContainer ?? input.closest<HTMLElement>('.prompt-input-wrapper') ?? input.parentElement);

  if (!container) return null;
  return {
    input,
    container,
    submitButtonSelector: AISTUDIO_APPS_SEND_BUTTON_SELECTOR,
    ctrlEnterOnly: true,
  };
};

/** Locate the MCP button insertion point on `/app/apps` landing page (`ms-applet-generator-form .actions-container`). */
export const findAistudioAppsButtonInsertionPoint = (): { container: Element; insertAfter: Element | null } | null => {
  const actionsContainer = document.querySelector('ms-applet-generator-form .actions-container');
  if (!actionsContainer) return null;
  const addMediaMenu = actionsContainer.querySelector(':scope > ms-add-media-menu');
  return {
    container: actionsContainer,
    insertAfter: addMediaMenu ?? null,
  };
};

/** Read normalized plain text from either a native textarea/input or a contenteditable composer. */
export const readAistudioAppsEditableText = (input: HTMLElement): string => {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.value.replace(/\r\n/g, '\n');
  }
  return (input.innerText || input.textContent || '').replace(/\r\n/g, '\n');
};

/** Insert or append text into the `/app/apps` prompt input and notify Angular listeners. */
export const insertTextToAistudioAppsInput = (text: string): boolean => {
  const input = findAistudioAppsInput();
  if (!input) return false;

  const normalizedText = text.replace(/\r\n/g, '\n');

  if (input instanceof HTMLTextAreaElement) {
    const currentText = input.value;
    const formattedText = currentText
      ? (normalizedText.startsWith('\n') ? `${currentText}${normalizedText}` : `${currentText}\n\n${normalizedText}`)
      : normalizedText;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(input, formattedText);
    } else {
      input.value = formattedText;
    }

    const inputEvent =
      typeof InputEvent !== 'undefined'
        ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: normalizedText })
        : new Event('input', { bubbles: true });
    input.dispatchEvent(inputEvent);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  }

  const before = readAistudioAppsEditableText(input);
  const hasExisting = before.trim().length > 0;
  const toInsert = hasExisting
    ? (normalizedText.startsWith('\n') ? normalizedText : `\n\n${normalizedText}`)
    : normalizedText;
  const expected = hasExisting ? `${before}${toInsert}` : normalizedText;

  input.focus();

  let insertedViaExec = false;
  try {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(input);
      if (hasExisting) {
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (typeof document.execCommand === 'function') {
      insertedViaExec = document.execCommand('insertText', false, toInsert);
    }
  } catch {
    insertedViaExec = false;
  }

  if (!insertedViaExec || !readAistudioAppsEditableText(input).includes(normalizedText)) {
    input.textContent = expected;
    const inputEvent =
      typeof InputEvent !== 'undefined'
        ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: toInsert })
        : new Event('input', { bubbles: true });
    input.dispatchEvent(inputEvent);
  }

  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

/** Wait until `/app/apps` finishes streaming (no visible Stop control) before flushing chips. */
export const waitForAistudioAppsIdle = (
  maxWaitTime = 5000,
  canProceed?: () => boolean,
): Promise<boolean> => {
  const input = findAistudioAppsInput();
  if (!input) return Promise.resolve(false);
  if (canProceed && !canProceed()) return Promise.resolve(false);

  const startPath = normalizeAistudioAppsPath(window.location.pathname);
  const initialDraft = normalizeAppsDraft(readAistudioAppsEditableText(input));
  const getScope = (el: HTMLElement): ParentNode =>
    el.closest(APPS_COMPOSER_ROOT_SELECTOR) ?? el.closest('.input-container') ?? document;

  if (!hasAistudioAppsStopControl(getScope(input))) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    let elapsed = 0;
    const checkInterval = 150;

    const intervalId = setInterval(() => {
      elapsed += checkInterval;
      if (canProceed && !canProceed()) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }
      if (normalizeAistudioAppsPath(window.location.pathname) !== startPath) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }
      const curInput = findAistudioAppsInput();
      if (!curInput || normalizeAppsDraft(readAistudioAppsEditableText(curInput)) !== initialDraft) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }
      if (!hasAistudioAppsStopControl(getScope(curInput))) {
        clearInterval(intervalId);
        resolve(true);
        return;
      }
      if (elapsed >= maxWaitTime) {
        clearInterval(intervalId);
        resolve(false);
      }
    }, checkInterval);
  });
};

/** Submit the `/app/apps` composer by waiting for and clicking Send, or falling back to Ctrl+Enter. */
export const submitAistudioAppsInput = (
  maxWaitTime = 5000,
  canProceed?: () => boolean,
): Promise<boolean> => {
  const input = findAistudioAppsInput();
  if (!input) return Promise.resolve(false);
  if (canProceed && !canProceed()) return Promise.resolve(false);

  const startPath = normalizeAistudioAppsPath(window.location.pathname);
  const expectedDraft = normalizeAppsDraft(readAistudioAppsEditableText(input));
  const getScope = (): ParentNode =>
    input.closest(APPS_COMPOSER_ROOT_SELECTOR) ?? input.closest('.input-container') ?? document;

  const isContextIntact = (): boolean => {
    if (canProceed && !canProceed()) return false;
    if (normalizeAistudioAppsPath(window.location.pathname) !== startPath) return false;
    if (!input.isConnected) return false;
    return normalizeAppsDraft(readAistudioAppsEditableText(input)) === expectedDraft;
  };

  const tryClick = (): 'clicked' | 'waiting' | 'aborted' => {
    if (!isContextIntact()) return 'aborted';
    const scope = getScope();
    if (hasAistudioAppsStopControl(scope)) return 'waiting';
    const button = findAistudioAppsSendButton(scope);
    if (button && isAistudioAppsSendButtonEnabled(button)) {
      notifyAistudioAppsSubmission();
      button.click();
      return 'clicked';
    }
    return 'waiting';
  };

  const initial = tryClick();
  if (initial === 'clicked') return Promise.resolve(true);
  if (initial === 'aborted') return Promise.resolve(false);

  return new Promise(resolve => {
    let elapsed = 0;
    const checkInterval = 150;

    const intervalId = setInterval(() => {
      elapsed += checkInterval;
      const result = tryClick();
      if (result === 'clicked') {
        clearInterval(intervalId);
        resolve(true);
        return;
      }
      if (result === 'aborted') {
        clearInterval(intervalId);
        resolve(false);
        return;
      }

      if (elapsed >= maxWaitTime) {
        clearInterval(intervalId);
        if (!isContextIntact()) {
          resolve(false);
          return;
        }
        const scope = getScope();
        if (hasAistudioAppsStopControl(scope)) {
          resolve(false);
          return;
        }
        const existingBtn = findAistudioAppsSendButton(scope);
        if (existingBtn && !isAistudioAppsSendButtonEnabled(existingBtn)) {
          resolve(false);
          return;
        }
        notifyAistudioAppsSubmission();
        input.focus();
        for (const eventType of ['keydown', 'keypress', 'keyup'] as const) {
          input.dispatchEvent(
            new KeyboardEvent(eventType, {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
        resolve(true);
      }
    }, checkInterval);
  });
};

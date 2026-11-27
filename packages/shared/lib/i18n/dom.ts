// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import { subscribeI18n, t } from './core.js';
import type { MessageKey } from './locales/en.js';
import type { TranslationParams } from './types.js';

const TEXT_KEY_ATTR = 'data-mcp-i18n-text';
const TEXT_PARAMS_ATTR = 'data-mcp-i18n-params';
const TITLE_KEY_ATTR = 'data-mcp-i18n-title';
const TITLE_PARAMS_ATTR = 'data-mcp-i18n-title-params';
const ARIA_KEY_ATTR = 'data-mcp-i18n-aria-label';
const ARIA_PARAMS_ATTR = 'data-mcp-i18n-aria-label-params';

function parseParams(raw: string | null): TranslationParams | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TranslationParams;
  } catch {
    return undefined;
  }
}

export function setI18nText(el: Element, key: MessageKey, params?: TranslationParams): void {
  el.setAttribute(TEXT_KEY_ATTR, key);
  if (params) {
    el.setAttribute(TEXT_PARAMS_ATTR, JSON.stringify(params));
  } else {
    el.removeAttribute(TEXT_PARAMS_ATTR);
  }
  el.textContent = t(key, params);
}

export function clearI18nText(el: Element): void {
  el.removeAttribute(TEXT_KEY_ATTR);
  el.removeAttribute(TEXT_PARAMS_ATTR);
}

export function setI18nAttr(
  el: Element,
  attr: 'title' | 'aria-label',
  key: MessageKey,
  params?: TranslationParams,
): void {
  const keyAttr = attr === 'title' ? TITLE_KEY_ATTR : ARIA_KEY_ATTR;
  const paramsAttr = attr === 'title' ? TITLE_PARAMS_ATTR : ARIA_PARAMS_ATTR;
  el.setAttribute(keyAttr, key);
  if (params) {
    el.setAttribute(paramsAttr, JSON.stringify(params));
  } else {
    el.removeAttribute(paramsAttr);
  }
  el.setAttribute(attr, t(key, params));
}

export function refreshI18nDom(root: ParentNode): void {
  root.querySelectorAll(`[${TEXT_KEY_ATTR}]`).forEach(el => {
    const key = el.getAttribute(TEXT_KEY_ATTR) as MessageKey | null;
    if (!key) return;
    el.textContent = t(key, parseParams(el.getAttribute(TEXT_PARAMS_ATTR)));
  });
  root.querySelectorAll(`[${TITLE_KEY_ATTR}]`).forEach(el => {
    const key = el.getAttribute(TITLE_KEY_ATTR) as MessageKey | null;
    if (!key) return;
    el.setAttribute('title', t(key, parseParams(el.getAttribute(TITLE_PARAMS_ATTR))));
  });
  root.querySelectorAll(`[${ARIA_KEY_ATTR}]`).forEach(el => {
    const key = el.getAttribute(ARIA_KEY_ATTR) as MessageKey | null;
    if (!key) return;
    el.setAttribute('aria-label', t(key, parseParams(el.getAttribute(ARIA_PARAMS_ATTR))));
  });
}

const boundRoots = new WeakSet<ParentNode>();

export function bindI18nDomSync(root?: Document | ShadowRoot): () => void {
  const target: ParentNode | undefined = root ?? (typeof document !== 'undefined' ? document : undefined);
  if (!target) return () => {};
  if (boundRoots.has(target)) return () => {};
  boundRoots.add(target);
  return subscribeI18n(() => {
    refreshI18nDom(target);
  });
}

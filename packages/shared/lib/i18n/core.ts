// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import { en, type MessageKey } from './locales/en.js';
import { zhCN } from './locales/zh-CN.js';
import type { I18nSnapshot, LanguagePreference, TranslationParams, UiLocale } from './types.js';

export const UI_LANGUAGE_STORAGE_KEY = 'mcp-ui-language';

const CATALOGS: Record<UiLocale, Record<MessageKey, string>> = {
  en,
  'zh-CN': zhCN,
};

interface ChromeStorageChangeLike {
  newValue?: unknown;
}

interface ChromeStorageAreaLike {
  get?: (keys: string[]) => Promise<Record<string, unknown>> | void;
  set?: (items: Record<string, unknown>) => Promise<void> | void;
}

interface ChromeLike {
  storage?: {
    local?: ChromeStorageAreaLike;
    onChanged?: {
      addListener?: (cb: (changes: Record<string, ChromeStorageChangeLike>, areaName: string) => void) => void;
    };
  };
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  if (value === 'en' || value === 'zh-CN' || value === 'auto') {
    return value;
  }
  return 'auto';
}

function getBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

export function resolveLocale(
  pref: LanguagePreference,
  browserLanguages?: readonly string[] | string,
): UiLocale {
  if (pref === 'en' || pref === 'zh-CN') {
    return pref;
  }
  const candidates =
    typeof browserLanguages === 'string'
      ? [browserLanguages]
      : browserLanguages ?? getBrowserLanguages();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const lower = candidate.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

export function formatMessage(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (fullMatch, token: string) => {
    if (Object.prototype.hasOwnProperty.call(params, token)) {
      const value = params[token];
      return value === undefined || value === null ? '' : String(value);
    }
    return fullMatch;
  });
}

export function translateForLocale(
  locale: UiLocale,
  key: MessageKey,
  params?: TranslationParams,
): string {
  const catalog = CATALOGS[locale] ?? en;
  const template = catalog[key] ?? en[key] ?? key;
  return formatMessage(template, params);
}

let currentPreference: LanguagePreference = 'auto';
let currentLocale: UiLocale = resolveLocale('auto');
let currentSnapshot: I18nSnapshot = { preference: currentPreference, locale: currentLocale };
let initialized = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function updateSnapshot(nextPref: LanguagePreference, nextLocale: UiLocale): void {
  if (currentPreference === nextPref && currentLocale === nextLocale) {
    return;
  }
  currentPreference = nextPref;
  currentLocale = nextLocale;
  currentSnapshot = { preference: nextPref, locale: nextLocale };
  listeners.forEach(listener => {
    try {
      listener();
    } catch {
      /* isolate subscriber errors */
    }
  });
}

function getChromeLike(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

export function ensureI18nInitialized(): void {
  if (initialized) return;
  initialized = true;

  const chromeApi = getChromeLike();
  const localArea = chromeApi?.storage?.local;

  if (localArea && typeof localArea.get === 'function') {
    try {
      const maybePromise = localArea.get([UI_LANGUAGE_STORAGE_KEY]);
      if (maybePromise && typeof (maybePromise as Promise<Record<string, unknown>>).then === 'function') {
        void (maybePromise as Promise<Record<string, unknown>>)
          .then(result => {
            if (!result || !(UI_LANGUAGE_STORAGE_KEY in result)) return;
            const nextPref = normalizeLanguagePreference(result[UI_LANGUAGE_STORAGE_KEY]);
            updateSnapshot(nextPref, resolveLocale(nextPref));
          })
          .catch(() => {
            /* ignore storage read errors in restricted contexts */
          });
      }
    } catch {
      /* ignore synchronous chrome errors */
    }
  }

  const onChanged = chromeApi?.storage?.onChanged;
  if (!storageListenerAttached && onChanged && typeof onChanged.addListener === 'function') {
    storageListenerAttached = true;
    try {
      onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const entry = changes?.[UI_LANGUAGE_STORAGE_KEY];
        if (!entry) return;
        const nextPref = normalizeLanguagePreference(entry.newValue);
        updateSnapshot(nextPref, resolveLocale(nextPref));
      });
    } catch {
      /* ignore listener errors */
    }
  }
}

export function getLocale(): UiLocale {
  ensureI18nInitialized();
  return currentLocale;
}

export function getLanguagePreference(): LanguagePreference {
  ensureI18nInitialized();
  return currentPreference;
}

export function getI18nSnapshot(): I18nSnapshot {
  ensureI18nInitialized();
  return currentSnapshot;
}

export function t(key: MessageKey, params?: TranslationParams): string {
  return translateForLocale(getLocale(), key, params);
}

export async function setLanguagePreference(pref: LanguagePreference): Promise<void> {
  ensureI18nInitialized();
  const normalized = normalizeLanguagePreference(pref);
  updateSnapshot(normalized, resolveLocale(normalized));

  const localArea = getChromeLike()?.storage?.local;
  if (localArea && typeof localArea.set === 'function') {
    try {
      await localArea.set({ [UI_LANGUAGE_STORAGE_KEY]: normalized });
    } catch {
      /* in-memory state already updated */
    }
  }
}

export function subscribeI18n(listener: () => void): () => void {
  ensureI18nInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetI18nForTesting(
  pref: LanguagePreference = 'auto',
  browserLanguages?: readonly string[] | string,
): void {
  initialized = true;
  const normalized = normalizeLanguagePreference(pref);
  const nextLocale = resolveLocale(normalized, browserLanguages);
  currentPreference = normalized;
  currentLocale = nextLocale;
  currentSnapshot = { preference: normalized, locale: nextLocale };
  listeners.clear();
}

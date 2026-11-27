// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  ensureI18nInitialized,
  getI18nSnapshot,
  setLanguagePreference,
  subscribeI18n,
  translateForLocale,
} from './core.js';
import type { MessageKey } from './locales/en.js';
import type { LanguagePreference, TranslationParams, UiLocale } from './types.js';

export interface UseI18nResult {
  locale: UiLocale;
  preference: LanguagePreference;
  t: (key: MessageKey, params?: TranslationParams) => string;
  setLanguage: (pref: LanguagePreference) => void;
}

export function useI18n(): UseI18nResult {
  useEffect(() => {
    ensureI18nInitialized();
  }, []);

  const snapshot = useSyncExternalStore(subscribeI18n, getI18nSnapshot, getI18nSnapshot);

  const translate = useCallback(
    (key: MessageKey, params?: TranslationParams) => translateForLocale(snapshot.locale, key, params),
    [snapshot.locale],
  );

  const setLanguage = useCallback((pref: LanguagePreference) => {
    void setLanguagePreference(pref);
  }, []);

  return {
    locale: snapshot.locale,
    preference: snapshot.preference,
    t: translate,
    setLanguage,
  };
}

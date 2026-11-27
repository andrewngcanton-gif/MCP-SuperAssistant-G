// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

export type UiLocale = 'en' | 'zh-CN';

export type LanguagePreference = 'auto' | UiLocale;

export const SUPPORTED_LOCALES: readonly UiLocale[] = ['en', 'zh-CN'] as const;

export type TranslationParams = Record<string, string | number>;

export interface I18nSnapshot {
  readonly preference: LanguagePreference;
  readonly locale: UiLocale;
}

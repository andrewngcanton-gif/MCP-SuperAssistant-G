// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from '../lib/i18n/locales/en.js';
import { zhCN } from '../lib/i18n/locales/zh-CN.js';
import {
  formatMessage,
  getI18nSnapshot,
  getLocale,
  normalizeLanguagePreference,
  resetI18nForTesting,
  resolveLocale,
  setLanguagePreference,
  subscribeI18n,
  t,
  translateForLocale,
} from '../lib/i18n/core.js';

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

test('en and zh-CN catalogs have identical keys and non-empty strings', () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zhCN).sort();
  assert.deepEqual(zhKeys, enKeys);

  for (const key of enKeys as Array<keyof typeof en>) {
    assert.ok(typeof en[key] === 'string' && en[key].trim().length > 0, `Empty en value for ${key}`);
    assert.ok(typeof zhCN[key] === 'string' && zhCN[key].trim().length > 0, `Empty zh-CN value for ${key}`);
  }
});

test('en and zh-CN catalogs have matching placeholder variables', () => {
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    const enVars = extractPlaceholders(en[key]);
    const zhVars = extractPlaceholders(zhCN[key]);
    assert.deepEqual(zhVars, enVars, `Placeholder mismatch for key "${key}"`);
  }
});

test('resolveLocale handles auto browser languages and explicit overrides', () => {
  assert.equal(resolveLocale('auto', 'zh'), 'zh-CN');
  assert.equal(resolveLocale('auto', 'zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('auto', 'zh-Hans-CN'), 'zh-CN');
  assert.equal(resolveLocale('auto', 'zh-TW'), 'zh-CN');
  assert.equal(resolveLocale('auto', ['en-US', 'zh-CN']), 'en');
  assert.equal(resolveLocale('auto', 'en-US'), 'en');
  assert.equal(resolveLocale('auto', 'fr-FR'), 'en');
  assert.equal(resolveLocale('auto', []), 'en');
  assert.equal(resolveLocale('en', 'zh-CN'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(normalizeLanguagePreference('invalid'), 'auto');
  assert.equal(normalizeLanguagePreference('zh-CN'), 'zh-CN');
});

test('zh-CN catalog omits spaces between Chinese characters and ASCII tokens', () => {
  const cjkAsciiSpace = /(?:[\u4e00-\u9fff]\s+[A-Za-z0-9{]|[A-Za-z0-9}]\s+[\u4e00-\u9fff])/;
  for (const [key, value] of Object.entries(zhCN)) {
    assert.ok(!cjkAsciiSpace.test(value), `Unexpected space between CJK and ASCII in "${key}": ${value}`);
  }
});

test('formatMessage interpolates known placeholders and preserves unknown ones', () => {
  assert.equal(formatMessage('Hello {name}, {count} tools', { name: 'MCP', count: 5 }), 'Hello MCP, 5 tools');
  assert.equal(formatMessage('Keep {unknown} intact {ok}', { ok: 1 }), 'Keep {unknown} intact 1');
  assert.equal(translateForLocale('zh-CN', 'tools.enabledSummary', { enabled: 3, total: 8 }), '已启用3/8');
  assert.equal(translateForLocale('en', 'tools.enabledSummary', { enabled: 3, total: 8 }), '3 of 8 enabled');
});

test('reactive i18n store updates t(), keeps snapshot identity stable, and notifies subscribers', async () => {
  resetI18nForTesting('auto', 'en-US');
  const firstSnapshot = getI18nSnapshot();
  assert.equal(getLocale(), 'en');
  assert.equal(t('card.run'), 'Run');
  assert.strictEqual(getI18nSnapshot(), firstSnapshot);

  let notifications = 0;
  const unsubscribe = subscribeI18n(() => {
    notifications += 1;
  });

  await setLanguagePreference('zh-CN');
  const zhSnapshot = getI18nSnapshot();
  assert.equal(notifications, 1);
  assert.equal(zhSnapshot.preference, 'zh-CN');
  assert.equal(zhSnapshot.locale, 'zh-CN');
  assert.equal(t('card.run'), '运行');
  assert.strictEqual(getI18nSnapshot(), zhSnapshot);

  // Setting the same preference is a no-op and does not fire listeners or replace snapshot.
  await setLanguagePreference('zh-CN');
  assert.equal(notifications, 1);
  assert.strictEqual(getI18nSnapshot(), zhSnapshot);

  await setLanguagePreference('en');
  assert.equal(notifications, 2);
  assert.equal(t('card.run'), 'Run');
  unsubscribe();
});

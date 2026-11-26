// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

// Run: pnpm dlx tsx --test pages/content/src/render_prescript/src/parser/jsonFunctionParser.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).window ??= { location: { href: 'https://gemini.google.com/app' } };
(globalThis as any).chrome ??= undefined;

const loadParser = () => import('./jsonFunctionParser');

test('unescapePartialJsonString decodes standard JSON escapes while preserving non-JSON regex escapes', async () => {
  const { unescapePartialJsonString } = await loadParser();
  const raw = 'const lines = text.split(/\\\\r?\\\\n/);\\nconst re = /\\s+\\d+\\./;\\tconst q = "a\\"b\\\\c\\u003c";';
  const out = unescapePartialJsonString(raw);
  assert.equal(out, 'const lines = text.split(/\\r?\\n/);\nconst re = /\\s+\\d+\\./;\tconst q = "a"b\\c<";');
  assert.ok(out.includes('/\\r?\\n/'), 'literal \\r?\\n must not turn into backslash + newline');
  assert.ok(out.includes('/\\s+\\d+\\./'), 'regex escapes \\s, \\d, \\. must keep their backslashes');
});

test('extractJSONParameters preserves regex escapes when valid JSONL parses normally', async () => {
  const { extractJSONParameters } = await loadParser();
  const content = [
    '{"type": "function_call_start", "name": "webcodex.run_shell", "call_id": 1}',
    '{"type": "parameter", "key": "command", "value": "node -e \\"text.split(/\\\\r?\\\\n/)\\""}',
    '{"type": "function_call_end", "call_id": 1}',
  ].join('\n');
  const params = extractJSONParameters(content);
  assert.equal(params.command, 'node -e "text.split(/\\r?\\n/)"');
});

test('extractJSONParameters fallback preserves \\r?\\n and \\s+ when unescaped regex causes JSON.parse to fail', async () => {
  const { extractJSONParameters } = await loadParser();
  const content = [
    '{"type": "function_call_start", "name": "webcodex.run_shell", "call_id": 2}',
    '{"type": "parameter", "key": "command", "value": "const lines = s.split(/\\\\r?\\\\n/);\\nconst m = s.match(/\\s+\\d+/);"}',
    '{"type": "function_call_end", "call_id": 2}',
  ].join('\n');
  const params = extractJSONParameters(content);
  assert.ok(params.command.includes('/\\r?\\n/'), `expected literal /\\r?\\n/, got: ${params.command}`);
  assert.ok(params.command.includes('\nconst m = s.match(/\\s+\\d+/);'));
});

test('extractJSONParameters handles partial/streaming parameter values without closing quote', async () => {
  const { extractJSONParameters } = await loadParser();
  const content = [
    '{"type": "function_call_start", "name": "webcodex.run_shell", "call_id": 3}',
    '{"type": "parameter", "key": "command", "value": "node <<\'EOF\'\\nconst re = /\\\\r?\\\\n/;',
  ].join('\n');
  const params = extractJSONParameters(content);
  assert.equal(params.command, "node <<'EOF'\nconst re = /\\r?\\n/;");
});

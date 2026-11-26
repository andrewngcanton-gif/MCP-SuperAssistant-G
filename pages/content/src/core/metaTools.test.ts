// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

// Run: pnpm dlx tsx --test pages/content/src/core/metaTools.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactInputSchema, executeMetaTool, GET_TOOL_SCHEMA, TOOL_LOOKUP } from './metaTools';

const sampleTools = [
  {
    name: 'webcodex.run_shell',
    description: 'Run shell grammar or a short related command chain. ' + 'x'.repeat(240),
    input_schema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Configured project id.' },
        command: { type: 'string', description: 'Shell command. ' + 'y'.repeat(200) },
        _wc: {
          type: 'object',
          properties: { ack: { type: 'array' }, reply: { type: 'object' } },
        },
      },
      required: ['project', 'command', '_wc'],
    },
  },
  {
    name: 'webcodex.find_definition',
    description: 'Locate symbol definitions in a project.',
    input_schema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  },
];

test('compactInputSchema strips internal _wc keys and clamps long descriptions', () => {
  const compacted = compactInputSchema(sampleTools[0].input_schema) as any;
  assert.equal('_wc' in compacted.properties, false);
  assert.deepEqual(compacted.required, ['project', 'command']);
  assert.ok(compacted.properties.command.description.length <= 140);
});

test('executeMetaTool get_tool_schema returns single-line JSON without _wc', () => {
  const res = executeMetaTool(GET_TOOL_SCHEMA, { names: ['webcodex.run_shell'] }, sampleTools);
  const text = res.content[0].text;
  assert.ok(!text.includes('\n  '));
  assert.ok(!text.includes('"_wc"'));
  const parsed = JSON.parse(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'webcodex.run_shell');
  assert.ok(parsed[0].description.length <= 180);
});

test('executeMetaTool tool_lookup supports empty query and multi-token search', () => {
  const all = executeMetaTool(TOOL_LOOKUP, { query: '' }, sampleTools).content[0].text;
  assert.ok(all.includes('webcodex.run_shell'));
  assert.ok(all.includes('webcodex.find_definition'));

  const hit = executeMetaTool(TOOL_LOOKUP, { query: 'symbol definitions' }, sampleTools).content[0].text;
  assert.ok(hit.includes('webcodex.find_definition'));
  assert.ok(!hit.includes('webcodex.run_shell'));
});

test('executeMetaTool handles wildcard lookup and unknown schema names', () => {
  const star = executeMetaTool(TOOL_LOOKUP, { query: '*' }, sampleTools).content[0].text;
  assert.ok(star.includes('webcodex.run_shell'));
  assert.ok(star.includes('webcodex.find_definition'));

  const missing = executeMetaTool(GET_TOOL_SCHEMA, { names: ['webcodex.does_not_exist'] }, sampleTools).content[0].text;
  assert.ok(missing.toLowerCase().includes('no matching') || missing.toLowerCase().includes('unknown'));
});

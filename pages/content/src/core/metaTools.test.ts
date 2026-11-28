// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

// Run: pnpm dlx tsx --test pages/content/src/core/metaTools.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUnknownToolError, compactInputSchema, executeMetaTool, GET_TOOL_SCHEMA, TOOL_LOOKUP } from './metaTools';

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

test('buildUnknownToolError intercepts hallucinated WebCodex edit tools with self-healing guidance', () => {
  const wcTools = [
    { name: 'webcodex.list_projects', description: 'List projects.' },
    { name: 'webcodex.search_project_texts', description: 'Search text.' },
    { name: 'webcodex.read_files', description: 'Read files.' },
    { name: 'webcodex.run_shell', description: 'Run shell.' },
    { name: 'webcodex.edit_project_files', description: 'Edit files.' },
    { name: 'other.ping', description: 'Ping another server.' },
  ];
  const enabled = new Set(wcTools.filter(t => t.name !== 'webcodex.edit_project_files').map(t => t.name));

  const err = buildUnknownToolError('webcodex.edit_file', wcTools, enabled, false);
  assert.ok(err, 'expected local unknown-tool error');
  assert.ok(err.includes('Unknown tool "webcodex.edit_file"'));
  assert.ok(err.includes('Do NOT stop or ask the user to refresh tools/list'));
  assert.ok(err.includes('For file edits, use "webcodex.run_shell"'));
  assert.ok(!err.includes('webcodex.edit_project_files'), 'disabled tools should not be suggested');
  assert.ok(!err.includes('other.ping'), 'same-namespace tools should be prioritized');
  assert.ok(err.includes('webcodex.list_projects'));
});

test('buildUnknownToolError ignores known, disabled-but-known, browser_*, meta-tools, and empty catalogs', () => {
  const tools = [
    { name: 'webcodex.run_shell', description: 'Run shell.' },
    { name: 'webcodex.edit_project_files', description: 'Edit files.' },
  ];
  const enabled = new Set(['webcodex.run_shell']);

  assert.equal(buildUnknownToolError('webcodex.run_shell', tools, enabled, false), null);
  assert.equal(buildUnknownToolError('webcodex.edit_project_files', tools, enabled, false), null);
  assert.equal(buildUnknownToolError('browser_click', tools, enabled, false), null);
  assert.equal(buildUnknownToolError(GET_TOOL_SCHEMA, tools, enabled, false), null);
  assert.equal(buildUnknownToolError(TOOL_LOOKUP, tools, enabled, false), null);
  assert.equal(buildUnknownToolError('webcodex.edit_file', [], enabled, false), null);
});

test('buildUnknownToolError truncates long tool lists cleanly with tool_lookup hint', () => {
  const manyTools = Array.from({ length: 15 }, (_, i) => ({ name: `srv.tool_${i + 1}`, description: 'Tool' }));
  const err = buildUnknownToolError('srv.missing', manyTools, new Set(manyTools.map(t => t.name)), false);
  assert.ok(err);
  assert.ok(err.includes('(+3 more via tool_lookup)'));
  assert.ok(err.includes('srv.tool_1'));
  assert.ok(!err.includes('srv.tool_15'));
});

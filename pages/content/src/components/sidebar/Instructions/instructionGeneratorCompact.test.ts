// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

// Run: pnpm dlx tsx --test pages/content/src/components/sidebar/Instructions/instructionGeneratorCompact.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatCompactParamSignature,
  generateInstructionReminder,
  generateInstructionsCompact,
  oneLiner,
  partitionToolsForCompactIndex,
} from './instructionGeneratorCompact';

const makeWebCodexTools = () => [
  { name: 'webcodex.list_projects', schema: '{}', description: 'List configured projects and resolve their exact project IDs for subsequent tool calls.' },
  { name: 'webcodex.work_on_project', schema: '{}', description: 'Bootstrap a workflow session for a registered project and inspect repository conventions.' },
  { name: 'webcodex.search_project_texts', schema: '{}', description: 'Search literal strings or regular expressions across project files in parallel batches.' },
  { name: 'webcodex.read_files', schema: '{}', description: 'Read bounded line ranges from one or more project files with line numbers.' },
  { name: 'webcodex.list_project_files', schema: '{}', description: 'List files inside a project directory respecting ignore rules.' },
  { name: 'webcodex.run_shell', schema: '{}', description: 'Run shell grammar or a short related command chain inside the project.' },
  { name: 'webcodex.edit_project_files', schema: '{}', description: 'Apply structured JSON file edits to project paths.' },
  { name: 'webcodex.find_definition', schema: '{}', description: 'Locate symbol definitions.' },
  { name: 'webcodex.find_references', schema: '{}', description: 'Locate symbol references.' },
  { name: 'webcodex.observe_jobs', schema: '{}', description: 'Observe background jobs.' },
  { name: 'webcodex.wait_for_job_readiness', schema: '{}', description: 'Wait until a job is ready.' },
  { name: 'webcodex.run_process', schema: '{}', description: 'Run a process with literal argv.' },
  { name: 'webcodex.run_script', schema: '{}', description: 'Run a typed script.' },
  { name: 'webcodex.read_workspace_changes', schema: '{}', description: 'Read workspace git status and diff summary.' },
  { name: 'webcodex.call_runtime_tool', schema: '{}', description: 'Call runtime tool.' },
  { name: 'webcodex.read_tool_manifest', schema: '{}', description: 'Read tool manifest.' },
  { name: 'webcodex.search_file_context', schema: '{}', description: 'Search context around lines.' },
];

test('oneLiner truncates cleanly at word boundary without dangling punctuation', () => {
  const text = 'Read a structured workspace summary with protected-files handling and long trailing details.';
  const out = oneLiner(text, 48);
  assert.ok(out.length <= 48);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.endsWith('-…'));
});

test('partitionToolsForCompactIndex keeps high-frequency WebCodex core and defers the rest', () => {
  const tools = makeWebCodexTools();
  const { core, deferredGroups } = partitionToolsForCompactIndex(tools);
  assert.deepEqual(
    core.map(t => t.name),
    [
      'webcodex.list_projects',
      'webcodex.work_on_project',
      'webcodex.search_project_texts',
      'webcodex.read_files',
      'webcodex.run_shell',
    ],
  );
  assert.equal(deferredGroups.length, 1);
  assert.equal(deferredGroups[0].prefix, 'webcodex.');
  assert.equal(deferredGroups[0].names.length, 12);
  assert.ok(deferredGroups[0].names.includes('edit_project_files'));
});

test('generateInstructionsCompact stays lean on Gemini and avoids legacy json fence conflicts', () => {
  const prevLocation = (globalThis as any).location;
  (globalThis as any).location = { hostname: 'gemini.google.com' };
  try {
    const out = generateInstructionsCompact(makeWebCodexTools(), '', false, false);
    assert.ok(out.length < 2400, `expected compact prompt < 2400 chars, got ${out.length}`);
    assert.ok(out.includes('Gemini note: Never use Python'));
    assert.ok(out.includes('python -c') && out.includes('PowerShell'));
    assert.ok(!out.includes('```json\n'));
    assert.ok(out.includes('listed or tool_lookup tools'));
    assert.ok(out.includes('More webcodex.* (12):'));
    assert.ok(out.includes("<<'EOF'") && out.includes("@'...'@"));
  } finally {
    (globalThis as any).location = prevLocation;
  }
});

test('generateInstructionReminder is ultra-compact and includes core tools and WebCodex hint', () => {
  const out = generateInstructionReminder(makeWebCodexTools(), false);
  assert.ok(out.length < 750, `expected reminder < 750 chars, got ${out.length}`);
  assert.ok(out.includes('[MCP SuperAssistant reminder]'));
  assert.ok(out.includes('webcodex.list_projects'));
  assert.ok(out.includes('(+12 more via tool_lookup)'));
  assert.ok(out.includes('webcodex.run_shell'));
});

test('generateInstructionReminder handles empty tools and optional RTK hint', () => {
  assert.equal(generateInstructionReminder([], false), '');
  const withRtk = generateInstructionReminder(makeWebCodexTools(), true);
  assert.ok(withRtk.includes('RTK:'));
  assert.ok(withRtk.includes('webcodex.run_process'));
  assert.ok(withRtk.length < 850, `expected reminder with RTK < 850 chars, got ${withRtk.length}`);
});

test('formatCompactParamSignature extracts concise required signatures while stripping _wc', () => {
  assert.equal(formatCompactParamSignature(''), '');
  assert.equal(formatCompactParamSignature('{}'), '');
  assert.equal(formatCompactParamSignature('invalid json'), '');
  assert.equal(
    formatCompactParamSignature(JSON.stringify({ type: 'object', properties: { query: { type: 'string' } } })),
    '()',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          project: { type: 'string' },
          command: { type: ['string', 'null'] },
          _wc: { type: 'object' },
        },
        required: ['project', 'command', '_wc'],
      }),
    ),
    '(project, command)',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'object' } },
          paths: { type: 'array', items: { type: 'string' } },
          limit: { type: 'integer' },
          dry_run: { type: 'boolean' },
          opts: { type: 'object' },
          extra: { type: 'number' },
        },
        required: ['files', 'paths', 'limit', 'dry_run', 'opts', 'extra'],
      }),
    ),
    '(files: object[], paths: string[], limit: int, dry_run: bool, opts: object, …)',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          project: { type: 'string' },
          client_id: { type: 'string' },
          path: { type: 'string' },
          session_id: { type: 'string' },
          instruction: { type: 'string' },
          _wc: { type: 'object' },
        },
        required: ['instruction'],
      }),
    ),
    '(project | client_id+path | session_id, instruction)',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          id: { type: 'string' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          action: { type: 'string' },
        },
        required: ['action'],
        oneOf: [{ required: ['id'] }, { required: ['owner', 'repo'] }],
      }),
    ),
    '(id | owner+repo, action)',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          project: { type: 'string' },
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: { pattern: { type: 'string' }, path: { type: 'string' } },
              required: ['pattern'],
            },
          },
        },
        required: ['project', 'queries'],
      }),
    ),
    '(project, queries: {pattern}[])',
  );
  assert.equal(
    formatCompactParamSignature(
      JSON.stringify({
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['a', 'b', 'c', 'd'],
            },
          },
          target: {
            type: 'object',
            required: ['path', 'content'],
          },
        },
        required: ['items', 'target'],
      }),
    ),
    '(items: {a, b, c, …}[], target: {path, content})',
  );
});

test('generateInstructionsCompact includes inline core signatures to skip Turn-1 schema lookup', () => {
  const tools = makeWebCodexTools().map(tool => {
    if (tool.name === 'webcodex.list_projects') {
      return { ...tool, schema: JSON.stringify({ type: 'object', properties: { query: { type: 'string' } } }) };
    }
    if (tool.name === 'webcodex.work_on_project') {
      return {
        ...tool,
        schema: JSON.stringify({ type: 'object', properties: { project: { type: 'string' } }, required: ['project'] }),
      };
    }
    if (tool.name === 'webcodex.search_project_texts') {
      return {
        ...tool,
        schema: JSON.stringify({
          type: 'object',
          properties: {
            project: { type: 'string' },
            queries: { type: 'array', items: { type: 'object', required: ['pattern'] } },
          },
          required: ['project', 'queries'],
        }),
      };
    }
    if (tool.name === 'webcodex.run_shell') {
      return {
        ...tool,
        schema: JSON.stringify({
          type: 'object',
          properties: { project: { type: 'string' }, command: { type: 'string' }, _wc: { type: 'object' } },
          required: ['project', 'command', '_wc'],
        }),
      };
    }
    if (tool.name === 'webcodex.read_files') {
      return {
        ...tool,
        schema: JSON.stringify({
          type: 'object',
          properties: { project: { type: 'string' }, files: { type: 'array', items: { type: 'object' } } },
          required: ['project', 'files'],
        }),
      };
    }
    return tool;
  });
  const out = generateInstructionsCompact(tools, '', false, false);
  assert.ok(out.includes('webcodex.list_projects() —'));
  assert.ok(out.includes('webcodex.work_on_project(project) —'));
  assert.ok(out.includes('webcodex.search_project_texts(project, queries: {pattern}[]) —'));
  assert.ok(out.includes('webcodex.run_shell(project, command) —'));
  assert.ok(out.includes('webcodex.read_files(project, files: object[]) —'));
  assert.ok(out.includes('Call core tools directly;'));
  assert.ok(out.length < 2500, `expected compact prompt with signatures < 2500 chars, got ${out.length}`);
});

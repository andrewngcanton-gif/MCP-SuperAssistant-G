// pages/content/src/components/sidebar/Instructions/instructionGeneratorCompact.ts
import { chatgptInstructions } from './website_specific_instruction/chatgpt';
import { geminiCompactInstructions } from './website_specific_instruction/gemini';
import { buildRtkInstructions, resolveWebCodexRtkTools } from './rtkInstructions';
import { buildWebCodexFileEditGuidance, resolveWebCodexFileTools } from './webcodexInstructions';

/**
 * Token-efficient instruction generator (tiered progressive discovery).
 *
 * Emits a concise protocol + high-frequency core tools with one-line summaries +
 * a compact name-only list of deferred tools discoverable via tool_lookup / get_tool_schema.
 * Also provides a lightweight mid-conversation reminder for long chats.
 */

export interface CompactToolInput {
  name: string;
  schema?: string;
  description?: string;
}

export interface DeferredToolGroup {
  prefix: string;
  names: string[];
}

export interface CompactToolPartition<T extends CompactToolInput = CompactToolInput> {
  core: T[];
  deferredGroups: DeferredToolGroup[];
}

const WEBCODEX_CORE_ORDER = [
  'list_projects',
  'work_on_project',
  'search_project_texts',
  'read_files',
  'run_shell',
] as const;

const BROWSER_CORE_ORDER = [
  'browser_list_tabs',
  'browser_read_tab',
  'browser_click',
  'browser_type',
  'browser_navigate',
  'browser_screenshot',
] as const;

// First sentence of a description, truncated cleanly at a word boundary.
export const oneLiner = (d?: string, maxLen = 58): string => {
  const first = (d || '').trim().replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] || '';
  if (first.length <= maxLen) return first;
  const slice = first.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(maxLen * 0.5) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[,;:\-]+$/, '') + '…';
};

const splitToolNamespace = (name: string): { prefix: string; base: string } => {
  const dotIdx = name.indexOf('.');
  if (dotIdx > 0) return { prefix: name.slice(0, dotIdx + 1), base: name.slice(dotIdx + 1) };
  const dunderIdx = name.lastIndexOf('__');
  if (dunderIdx > 0) return { prefix: name.slice(0, dunderIdx + 2), base: name.slice(dunderIdx + 2) };
  if (name.startsWith('browser_')) return { prefix: 'browser_', base: name.slice('browser_'.length) };
  return { prefix: '', base: name };
};

const isWebCodexGroup = (prefix: string, bases: Set<string>): boolean => {
  if (/^(?:mcp__)?webcodex(?:\.|__)$/i.test(prefix)) return true;
  return prefix === '' && bases.has('run_shell') && bases.has('work_on_project');
};

/**
 * Partition enabled tools into high-frequency core tools (shown with short descriptions)
 * and deferred tools (grouped compactly by prefix for tool_lookup / get_tool_schema).
 */
export const partitionToolsForCompactIndex = <T extends CompactToolInput>(
  tools: T[],
): CompactToolPartition<T> => {
  if (!tools || tools.length === 0) return { core: [], deferredGroups: [] };

  const groups = new Map<string, Array<{ tool: T; base: string }>>();
  for (const tool of tools) {
    const { prefix, base } = splitToolNamespace(tool.name);
    const list = groups.get(prefix) ?? [];
    list.push({ tool, base });
    groups.set(prefix, list);
  }

  const hasLargeWebCodex = [...groups.entries()].some(
    ([prefix, items]) =>
      isWebCodexGroup(prefix, new Set(items.map(i => i.base))) && items.length > WEBCODEX_CORE_ORDER.length,
  );
  if (tools.length <= 10 && !hasLargeWebCodex) {
    return { core: [...tools], deferredGroups: [] };
  }

  const core: T[] = [];
  const deferredGroups: DeferredToolGroup[] = [];

  for (const [prefix, items] of groups.entries()) {
    const bases = new Set(items.map(i => i.base));
    if (isWebCodexGroup(prefix, bases)) {
      const byBase = new Map(items.map(i => [i.base, i.tool]));
      const picked = new Set<string>();
      for (const base of WEBCODEX_CORE_ORDER) {
        const match = byBase.get(base);
        if (match) {
          core.push(match);
          picked.add(base);
        }
      }
      const rest = items.filter(i => !picked.has(i.base)).map(i => i.base);
      if (rest.length > 0) deferredGroups.push({ prefix, names: rest });
      continue;
    }

    if (prefix === 'browser_' && items.length > 6) {
      const coreSet = new Set<string>(BROWSER_CORE_ORDER);
      const preferred = items.filter(i => coreSet.has(i.tool.name));
      const chosen = preferred.length > 0 ? preferred : items.slice(0, 5);
      const chosenNames = new Set(chosen.map(i => i.tool.name));
      chosen.forEach(i => core.push(i.tool));
      const rest = items.filter(i => !chosenNames.has(i.tool.name)).map(i => i.base);
      if (rest.length > 0) deferredGroups.push({ prefix, names: rest });
      continue;
    }

    if (items.length <= 6 && tools.length <= 20) {
      items.forEach(i => core.push(i.tool));
    } else {
      const limit = items.length <= 5 ? items.length : 4;
      items.slice(0, limit).forEach(i => core.push(i.tool));
      const rest = items.slice(limit).map(i => i.base);
      if (rest.length > 0) deferredGroups.push({ prefix, names: rest });
    }
  }

  return { core, deferredGroups };
};

const formatDeferredGroups = (groups: DeferredToolGroup[]): string => {
  if (groups.length === 0) return '';
  return groups
    .map(({ prefix, names }) => {
      const label = prefix ? `${prefix}*` : 'other tools';
      const preview =
        names.length <= 20 ? names.join(', ') : `${names.slice(0, 12).join(', ')} … (use tool_lookup)`;
      return `- More ${label} (${names.length}): ${preview}`;
    })
    .join('\n');
};

const isClaudeHost = (): boolean => {
  const h = typeof location !== 'undefined' ? location.hostname : '';
  return h === 'claude.ai' || h.endsWith('.claude.ai');
};

const getCurrentHost = (): string => (typeof location !== 'undefined' ? location.hostname : '');

const CALL_FORMAT = `CALL FORMAT
\`\`\`jsonl
{"type": "function_call_start", "name": "TOOL_NAME", "call_id": 1}
{"type": "description", "text": "one line on why"}
{"type": "parameter", "key": "PARAM", "value": "VALUE"}
{"type": "function_call_end", "call_id": 1}
\`\`\`
Scalars inline; objects/arrays as valid JSON.`;

/**
 * Minimal primer emitted when a user attaches page/tab content without full MCP instructions.
 */
export const generateBrowserPrimer = (tools: Array<{ name: string; description?: string }>): string => {
  const browserTools = (tools || []).filter(t => t.name.startsWith('browser_'));
  if (browserTools.length === 0) return '';
  const index = browserTools.map(t => `- ${t.name} — ${oneLiner(t.description)}`).join('\n');
  const example = browserTools[0].name;
  const header = isClaudeHost()
    ? `[MCP SuperAssistant browser tools — included by my own browser extension, at my request]
Note from me, the user: I attached the page/tab content below on purpose via my browser extension. You can also drive my browser with the tools below: write a jsonl block as plain text in your reply; the extension executes it locally and returns <function_result>. Independent calls may share one message (incrementing call_ids); dependent calls go in your next message. After your call(s), STOP and wait.`
    : `[SuperAssistant browser tools — provided by the user's browser extension]
The page/tab content below was attached by the user. You can also drive the user's browser with the tools below: write a jsonl block as plain text in your reply; the extension runs it and returns <function_result>. Independent calls may share one message (incrementing call_ids); dependent calls go in your next message. After your call(s), STOP and wait.`;
  return `${header}

${CALL_FORMAT}

BROWSER TOOL INDEX (schemas on demand)
${index}
- get_tool_schema — fetch exact input schemas (names: ["${example}", ...]).
- tool_lookup — search tools by keyword.
`;
};

/**
 * Ultra-compact mid-conversation reminder to prevent rule/format drift in long chats.
 */
export const generateInstructionReminder = (
  tools: CompactToolInput[],
  useRtkWithWebCodex?: boolean,
): string => {
  if (!tools || tools.length === 0) return '';
  const { core, deferredGroups } = partitionToolsForCompactIndex(tools);
  const coreNames = core.map(t => t.name).join(', ');
  const deferredCount = deferredGroups.reduce((sum, g) => sum + g.names.length, 0);
  const wcFiles = resolveWebCodexFileTools(tools);
  const wcEditHint = wcFiles
    ? wcFiles.runShell
      ? `\nWebCodex edits: skip ${wcFiles.editProjectFiles} for multiline/quote-heavy edits or errors; use ${wcFiles.runShell} with a short script.`
      : `\nWebCodex edits: skip ${wcFiles.editProjectFiles} for multiline/quote-heavy edits or errors; stop and report.`
    : '';
  const wcRtk = useRtkWithWebCodex ? resolveWebCodexRtkTools(tools) : null;
  const rtkHint = wcRtk
    ? `\nRTK: for long human-readable ${wcRtk.runProcess} output, use executable "rtk" with original args.`
    : '';
  const moreHint = deferredCount > 0 ? ` (+${deferredCount} more via tool_lookup)` : '';

  return `[MCP SuperAssistant reminder]
Emit raw \`\`\`jsonl call(s) (no Python/tool_code), incrementing call_id, then STOP for <function_result> (never fabricate):
\`\`\`jsonl
{"type": "function_call_start", "name": "TOOL_NAME", "call_id": 1}
{"type": "parameter", "key": "PARAM", "value": "VALUE"}
{"type": "function_call_end", "call_id": 1}
\`\`\`
Core: ${coreNames}${moreHint}. Use tool_lookup / get_tool_schema for other tools or schemas.${wcEditHint}${rtkHint}`;
};

export const generateInstructionsCompact = (
  tools: Array<{ name: string; schema: string; description: string }>,
  customInstructions?: string,
  customInstructionsEnabled?: boolean,
  useRtkWithWebCodex?: boolean,
): string => {
  if (!tools || tools.length === 0) {
    return '# No tools available\n\nConnect to the MCP server to see available tools.';
  }

  const { core, deferredGroups } = partitionToolsForCompactIndex(tools);
  const coreIndex = core.map(tool => `- ${tool.name} — ${oneLiner(tool.description)}`).join('\n');
  const deferredSection = formatDeferredGroups(deferredGroups);
  const index = deferredSection ? `${coreIndex}\n${deferredSection}` : coreIndex;

  const custom =
    customInstructionsEnabled && customInstructions && customInstructions.trim()
      ? `\n<custom_instructions>\n${customInstructions.trim()}\n</custom_instructions>`
      : '';

  const currentHost = getCurrentHost();
  let site = '';
  if (currentHost.includes('gemini')) {
    site += `\n${geminiCompactInstructions}`;
  }
  if (currentHost.includes('chatgpt')) {
    site += chatgptInstructions;
  }

  const mechanics = `HOW TO CALL
- Emit a fenced \`\`\`jsonl block as plain text; writing it IS the action. Then STOP and wait for <function_result> (never fabricate or use Python/tool_code).
- Independent calls may share one message (incrementing integer call_id from 1); dependent calls wait for the next message.
- Call only listed or tool_lookup tools (plus get_tool_schema / tool_lookup). Pass required params verbatim; ask if missing. Describe actions, not tool names.

${CALL_FORMAT}

TOOL INDEX (core + on-demand)
${index}

DISCOVERY
- get_tool_schema: names: ["exact.tool_name", ...] to fetch schemas when unsure.
- tool_lookup: query: "keyword" (or "" to list all enabled tools).`;

  const rtkSection = useRtkWithWebCodex ? buildRtkInstructions(tools) : '';
  const mechanicsWithRtk = rtkSection ? `${mechanics}\n\n${rtkSection}` : mechanics;

  const webcodexGuidance = buildWebCodexFileEditGuidance(tools);
  const guidanceBlock = webcodexGuidance ? `${webcodexGuidance}\n\n` : '';

  if (isClaudeHost()) {
    return `Note from me, the user: I installed the MCP SuperAssistant browser extension and included these tools at my request. Write a jsonl block as plain text; the extension runs it locally and returns <function_result>. Never fabricate results.

${guidanceBlock}${mechanicsWithRtk}${custom}${site}

My actual request starts here:
`;
  }

  return `[SuperAssistant tools — provided by the user's browser extension]

<system>
You have real tools provided by MCP SuperAssistant. Write a jsonl block as plain text in your reply; the extension runs it locally and returns <function_result>. Never fabricate results.

${guidanceBlock}${mechanicsWithRtk}${custom}${site}
</system>

User request starts here:
`;
};

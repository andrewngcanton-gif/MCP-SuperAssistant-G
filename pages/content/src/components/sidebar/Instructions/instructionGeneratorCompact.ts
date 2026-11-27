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

const INTERNAL_SCHEMA_KEYS = new Set<string>(['_wc']);

const formatObjectRequiredHint = (schemaObj: Record<string, unknown>, fallback: string): string => {
  const req = Array.isArray(schemaObj.required) ? schemaObj.required : null;
  if (!req) return fallback;
  const keys = req.filter(
    (name): name is string => typeof name === 'string' && !INTERNAL_SCHEMA_KEYS.has(name),
  );
  if (keys.length === 0) return fallback;
  return keys.length <= 3 ? `{${keys.join(', ')}}` : `{${keys.slice(0, 3).join(', ')}, …}`;
};

const formatCompactTypeHint = (propSchema: unknown): string => {
  if (!propSchema || typeof propSchema !== 'object' || Array.isArray(propSchema)) return '';
  const prop = propSchema as Record<string, unknown>;
  const rawType = Array.isArray(prop.type)
    ? prop.type.find(t => t !== 'null')
    : prop.type;

  switch (rawType) {
    case 'boolean':
      return 'bool';
    case 'integer':
      return 'int';
    case 'number':
      return 'num';
    case 'object':
      return formatObjectRequiredHint(prop, 'object');
    case 'array': {
      const items = prop.items;
      const itemType =
        items && typeof items === 'object' && !Array.isArray(items)
          ? (items as Record<string, unknown>).type
          : undefined;
      if (itemType === 'object') return `${formatObjectRequiredHint(items as Record<string, unknown>, 'object')}[]`;
      if (itemType === 'string') return 'string[]';
      return 'array';
    }
    case 'string':
    default:
      return '';
  }
};

const extractConditionalSelector = (
  obj: Record<string, unknown>,
  props: Record<string, unknown> | null,
  requiredSet: Set<string>,
): string => {
  const variants = Array.isArray(obj.oneOf) ? obj.oneOf : Array.isArray(obj.anyOf) ? obj.anyOf : null;
  if (variants && variants.length >= 2 && variants.length <= 4) {
    const branches: string[] = [];
    for (const variant of variants) {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
        branches.length = 0;
        break;
      }
      const req = (variant as Record<string, unknown>).required;
      if (!Array.isArray(req)) {
        branches.length = 0;
        break;
      }
      const keys = req.filter(
        (name): name is string =>
          typeof name === 'string' && !INTERNAL_SCHEMA_KEYS.has(name) && !requiredSet.has(name),
      );
      if (keys.length === 0) {
        branches.length = 0;
        break;
      }
      branches.push(keys.join('+'));
    }
    if (branches.length >= 2) {
      return branches.join(' | ');
    }
  }

  // WebCodex work_on_project enforces (project | client_id+path | session_id) at runtime while
  // only declaring `instruction` in top-level `required`. Surface that mutually exclusive selector
  // so models do not invoke work_on_project({ instruction }) without resolving a project first.
  if (
    props &&
    'project' in props &&
    'client_id' in props &&
    'path' in props &&
    !requiredSet.has('project') &&
    !requiredSet.has('client_id') &&
    !requiredSet.has('path') &&
    !requiredSet.has('session_id')
  ) {
    return 'session_id' in props ? 'project | client_id+path | session_id' : 'project | client_id+path';
  }

  return '';
};

/**
 * Format an ultra-compact required-parameter signature such as `()` or `(project, command)`
 * from a tool's JSON Schema string/object, omitting internal transport keys (`_wc`).
 * Also surfaces conditional `oneOf`/`anyOf` selectors (and WebCodex project-source selectors)
 * so models do not omit mutually exclusive required parameters.
 * Returns `''` when the schema lacks object structure (e.g. `{}` or invalid JSON).
 */
export const formatCompactParamSignature = (schema?: string | Record<string, unknown>): string => {
  if (!schema) return '';
  let parsed: unknown = schema;
  if (typeof schema === 'string') {
    const trimmed = schema.trim();
    if (!trimmed) return '';
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return '';
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';

  const obj = parsed as Record<string, unknown>;
  const props =
    obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)
      ? (obj.properties as Record<string, unknown>)
      : null;
  const req = Array.isArray(obj.required) ? obj.required : null;
  const hasVariants = Array.isArray(obj.oneOf) || Array.isArray(obj.anyOf);
  if (obj.type !== 'object' && !props && !req && !hasVariants) return '';

  const requiredNames = (req ?? [])
    .filter((name): name is string => typeof name === 'string' && !INTERNAL_SCHEMA_KEYS.has(name));
  const selector = extractConditionalSelector(obj, props, new Set(requiredNames));
  if (!selector && requiredNames.length === 0) return '()';

  const maxParams = 5;
  const parts: string[] = [];
  if (selector) parts.push(selector);
  const remainingSlots = Math.max(0, maxParams - parts.length);
  for (const name of requiredNames.slice(0, remainingSlots)) {
    const hint = props ? formatCompactTypeHint(props[name]) : '';
    parts.push(hint ? `${name}: ${hint}` : name);
  }
  if (requiredNames.length > remainingSlots) parts.push('…');
  return `(${parts.join(', ')})`;
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
  const coreIndex = core
    .map(tool => `- ${tool.name}${formatCompactParamSignature(tool.schema)} — ${oneLiner(tool.description)}`)
    .join('\n');
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
- Emit a \`\`\`jsonl block as plain text, then STOP for <function_result> (never fabricate or use Python/tool_code).
- Independent calls share one message (incrementing call_id from 1); dependent calls wait for the next message.
- Call only listed or tool_lookup tools (plus get_tool_schema / tool_lookup). Pass required params verbatim; ask if missing. Describe actions, not tool names.

${CALL_FORMAT}

TOOL INDEX (core + on-demand)
${index}

DISCOVERY
- Call core tools directly; use get_tool_schema(names: ["..."]) only when unlisted or unclear.
- tool_lookup(query: "keyword" | "").`;

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
You have real tools via MCP SuperAssistant. Print a \`\`\`jsonl block; the extension runs it locally and returns <function_result>. Never fabricate results.

${guidanceBlock}${mechanicsWithRtk}${custom}${site}
</system>

User request starts here:
`;
};

import { useToolStore } from '../stores/tool.store';

/**
 * Meta-tools — client-side discovery helpers that never reach the background /
 * MCP proxy. They read the enabled tool list (with schemas) already held in the tool
 * store and return compact `{ content: [{ type: 'text', text }] }` payloads.
 *
 * The names below are a fixed cross-agent contract: the compact prompt, the
 * functionBlock auto-run bypass, and the mcp-client intercept all reference
 * exactly these strings.
 */
export const GET_TOOL_SCHEMA = 'get_tool_schema';
export const TOOL_LOOKUP = 'tool_lookup';
export const META_TOOLS = new Set<string>([GET_TOOL_SCHEMA, TOOL_LOOKUP]);

export interface MetaToolRecord {
  name: string;
  description?: string;
  input_schema?: unknown;
}

const INTERNAL_SCHEMA_KEYS = new Set<string>(['_wc']);

const clampText = (text: string | undefined, maxLen: number): string | undefined => {
  if (!text) return text;
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLen) return normalized;
  const slice = normalized.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(maxLen * 0.5) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[,;:\-]+$/, '') + '…';
};

/**
 * Strip internal transport fields (e.g. `_wc`) and overly long parameter descriptions
 * while preserving all structural JSON Schema constraints.
 */
export function compactInputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(item => compactInputSchema(item));
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const input = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const nextProps: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        if (INTERNAL_SCHEMA_KEYS.has(propName)) continue;
        nextProps[propName] = compactInputSchema(propSchema);
      }
      out[key] = nextProps;
      continue;
    }
    if (key === 'required' && Array.isArray(value)) {
      const filtered = value.filter(req => typeof req !== 'string' || !INTERNAL_SCHEMA_KEYS.has(req));
      if (filtered.length > 0) out[key] = filtered;
      continue;
    }
    if (key === 'description' && typeof value === 'string') {
      out[key] = clampText(value, 140);
      continue;
    }
    out[key] = compactInputSchema(value);
  }

  return out;
}

export function executeMetaTool(
  name: string,
  args: Record<string, unknown>,
  tools: MetaToolRecord[],
) {
  if (name === GET_TOOL_SCHEMA) {
    const names: string[] = Array.isArray((args as any).names)
      ? ((args as any).names as string[])
      : (args as any).name
        ? [(args as any).name as string]
        : [];
    const found = names
      .map(n => tools.find(t => t.name === n))
      .filter((t): t is MetaToolRecord => Boolean(t))
      .map(t => ({
        name: t.name,
        ...(t.description ? { description: clampText(t.description, 180) } : {}),
        input_schema: compactInputSchema(t.input_schema),
      }));
    const missing = names.filter(n => !tools.some(t => t.name === n));
    const text = found.length
      ? JSON.stringify(found) + (missing.length ? `\nUnknown tools: ${missing.join(', ')}` : '')
      : `No matching tools. Unknown: ${names.join(', ')}. Use ${TOOL_LOOKUP} to search.`;
    return { content: [{ type: 'text', text }] };
  }

  // tool_lookup: keyword search (or empty/* to list) -> returns concise index lines, no schema
  const rawQuery = String((args as any).query || '').trim().toLowerCase();
  const listAll = !rawQuery || rawQuery === '*' || rawQuery === 'all';
  let matches: MetaToolRecord[];
  if (listAll) {
    matches = tools;
  } else {
    const tokens = rawQuery.split(/\s+/).filter(Boolean);
    matches = tools.filter(t => {
      const hay = `${t.name} ${t.description || ''}`.toLowerCase();
      return tokens.every(tok => hay.includes(tok));
    });
    if (matches.length === 0 && tokens.length > 1) {
      matches = tools.filter(t => {
        const hay = `${t.name} ${t.description || ''}`.toLowerCase();
        return tokens.some(tok => hay.includes(tok));
      });
    }
  }
  const hits = matches
    .slice(0, 30)
    .map(t => `- ${t.name} — ${clampText(t.description, 90) || ''}`);
  const suffix = matches.length > 30 ? `\n… (${matches.length - 30} more; narrow query)` : '';
  return {
    content: [{
      type: 'text',
      text: hits.length ? hits.join('\n') + suffix : `No tools match "${rawQuery}".`,
    }],
  };
}

export function runMetaTool(name: string, args: Record<string, unknown>) {
  const { availableTools, enabledTools, isLoadingEnablement } = useToolStore.getState();
  const shouldFilter = enabledTools instanceof Set && (!isLoadingEnablement || enabledTools.size > 0);
  const activeTools = shouldFilter
    ? availableTools.filter(t => enabledTools.has(t.name))
    : availableTools;
  return executeMetaTool(name, args, activeTools);
}

// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Concise, always-on WebCodex search, read, and file-edit guidance for the initial instructions.
 *
 * It is independent of the RTK toggle and custom instructions. Tool names are taken only from the
 * advertised WebCodex surface so disabled tools are never referenced. When `edit_project_files` is
 * advertised without `run_shell`, the guidance keeps the schema/skip/no-retry rules and tells the
 * model to stop/report rather than inventing a tool or naming another server.
 */

export interface AdvertisedTool {
  name: string;
  schema?: string;
  description?: string;
}

export interface WebCodexFileTools {
  editProjectFiles?: string;
  runShell?: string;
  searchProjectTexts?: string;
  readFiles?: string;
}

const BASE_NAMES = [
  'edit_project_files',
  'run_shell',
  'work_on_project',
  'list_projects',
  'search_project_texts',
  'read_files',
] as const;
type BaseName = (typeof BASE_NAMES)[number];

const matchBaseName = (advertised: string, base: BaseName): { prefix: string; full: string } | null => {
  if (advertised === base) return { prefix: '', full: advertised };
  for (const separator of ['.', '__']) {
    const suffix = `${separator}${base}`;
    if (advertised.endsWith(suffix) && advertised.length > suffix.length) {
      return { prefix: advertised.slice(0, -suffix.length), full: advertised };
    }
  }
  return null;
};

/**
 * Resolve one WebCodex server's search/read/file-edit surface, or null when no unambiguous
 * WebCodex surface is advertised. Individual tools may be absent when disabled by the user.
 */
export const resolveWebCodexFileTools = (tools: AdvertisedTool[] | undefined): WebCodexFileTools | null => {
  if (!tools || tools.length === 0) return null;

  // server prefix -> base name -> advertised full name
  const servers = new Map<string, Map<BaseName, string>>();
  for (const tool of tools) {
    const name = tool?.name?.trim();
    if (!name) continue;
    for (const base of BASE_NAMES) {
      const match = matchBaseName(name, base);
      if (!match) continue;
      const group = servers.get(match.prefix) ?? new Map<BaseName, string>();
      if (!group.has(base) || name < group.get(base)!) group.set(base, match.full);
      servers.set(match.prefix, group);
    }
  }

  const hasGuidedTool = (group: Map<BaseName, string> | undefined): group is Map<BaseName, string> =>
    !!(group && (group.has('edit_project_files') || group.has('search_project_texts') || group.has('read_files')));

  // Prefer an explicit WebCodex namespace, even when run_shell is disabled there. Fall back only
  // to an unqualified local server that also advertises work_on_project or list_projects with run_shell.
  const named = [...servers.entries()]
    .filter(([prefix, group]) => /^(?:mcp__)?webcodex$/i.test(prefix) && hasGuidedTool(group))
    .map(([, group]) => group);
  const fallback = [...servers.entries()]
    .filter(
      ([prefix, group]) =>
        prefix === '' &&
        hasGuidedTool(group) &&
        !!group.has('run_shell') &&
        (group.has('work_on_project') || group.has('list_projects')),
    )
    .map(([, group]) => group);
  const candidates = named.length ? named : fallback;
  if (candidates.length !== 1) return null;

  const group = candidates[0];
  const edit = group.get('edit_project_files');
  const shell = group.get('run_shell');
  const search = group.get('search_project_texts');
  const read = group.get('read_files');
  if (!edit && !search && !read) return null;

  return {
    ...(edit ? { editProjectFiles: edit } : {}),
    ...(shell ? { runShell: shell } : {}),
    ...(search ? { searchProjectTexts: search } : {}),
    ...(read ? { readFiles: read } : {}),
  };
};

/** Concise shared English section; '' when no WebCodex search/read/edit tool is advertised. */
export const buildWebCodexFileEditGuidance = (tools: AdvertisedTool[] | undefined): string => {
  const names = resolveWebCodexFileTools(tools);
  if (!names) return '';

  const bullets: string[] = [];

  const searchReadClauses: string[] = [];
  if (names.searchProjectTexts) {
    searchReadClauses.push(
      `In \`${names.searchProjectTexts}\`, put optional \`path\` inside each \`queries[]\` item (never top-level) and omit \`context_before\`/\`context_after\` (<= 5 only for unique definitions).`,
    );
  }
  if (names.readFiles) {
    searchReadClauses.push(
      `Combine needed file ranges into one \`${names.readFiles}\` call (use \`start_line\`+\`limit\`, not \`end_line\`; targeted when scouting; full context for files you edit); never re-read unchanged code.`,
    );
  }
  if (searchReadClauses.length > 0) {
    bullets.push(`- ${searchReadClauses.join(' ')}`);
  }

  if (names.editProjectFiles) {
    bullets.push(
      `- \`${names.editProjectFiles}\` requires nested JSON (\`project\`, \`changes\` with \`kind\`+\`path\`). Skip it for multiline, quote-heavy, or angle-bracket edits, and never retry after an error.`,
    );
    bullets.push(
      names.runShell
        ? `- Use \`${names.runShell}\` via single-quoted \`<<'EOF'\`/\`@'...'@\` and literal \`replace\`/\`split\`/\`join\` (no inline escaped regexes; within project scope); if unavailable, stop and report.`
        : `- No WebCodex \`run_shell\` is available; stop and report instead of inventing tools (within project permissions/scope).`,
    );
  }

  if (bullets.length === 0) return '';
  return `WEBCODEX RULES\n${bullets.join('\n')}`;
};

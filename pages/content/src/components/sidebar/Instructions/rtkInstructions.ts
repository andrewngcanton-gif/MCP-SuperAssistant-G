// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

// pages/content/src/components/sidebar/Instructions/rtkInstructions.ts

/**
 * Optional RTK guidance for WebCodex projects.
 *
 * Everything here is built from the tools actually advertised to the extension, so the
 * generated text never names a tool the user does not have enabled. A WebCodex server is
 * identified by an explicit WebCodex namespace or a matching pair of project tools.
 */

export interface AdvertisedTool {
  name: string;
  schema?: string;
  description?: string;
}

export interface WebCodexRtkTools {
  runProcess?: string;
  runShell?: string;
  workOnProject?: string;
  listProjects?: string;
}

const BASE_NAMES = ['run_process', 'run_shell', 'work_on_project', 'list_projects', 'edit_project_files'] as const;
type BaseName = (typeof BASE_NAMES)[number];

/**
 * Match an advertised name to an exact base name, keeping its server prefix.
 * Handles unqualified (`run_process`) and qualified (`webcodex.run_process`,
 * `mcp__webcodex__run_process`) shapes. Anything else is ignored.
 */
const matchBaseName = (advertised: string, base: BaseName): { prefix: string; full: string } | null => {
  if (advertised === base) {
    return { prefix: '', full: advertised };
  }
  for (const separator of ['.', '__']) {
    const suffix = `${separator}${base}`;
    if (advertised.endsWith(suffix) && advertised.length > suffix.length) {
      return { prefix: advertised.slice(0, -suffix.length), full: advertised };
    }
  }
  return null;
};

/**
 * Resolve the WebCodex tool names to reference, or null when this tool set has no
 * WebCodex surface. Prefer an explicit namespace even when project setup is disabled.
 */
export const resolveWebCodexRtkTools = (tools: AdvertisedTool[] | undefined): WebCodexRtkTools | null => {
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
      // Keep deterministic choice if a server advertises two shapes for the same base.
      if (!group.has(base) || name < group.get(base)!) {
        group.set(base, match.full);
      }
      servers.set(match.prefix, group);
    }
  }

  const hasRunner = (group: Map<BaseName, string>) => group.has('run_process') || group.has('run_shell');

  const named = [...servers.entries()]
    .filter(([prefix, group]) => /^(?:mcp__)?webcodex$/i.test(prefix) && hasRunner(group))
    .map(([, group]) => group);
  const fallback = [...servers.entries()]
    .filter(
      ([prefix, group]) =>
        prefix === '' &&
        hasRunner(group) &&
        (group.has('work_on_project') || (group.has('list_projects') && group.has('edit_project_files'))),
    )
    .map(([, group]) => group);
  const candidates = named.length ? named : fallback;
  if (candidates.length !== 1) return null;

  const [group] = candidates;
  return {
    ...(group.has('run_process') ? { runProcess: group.get('run_process')! } : {}),
    ...(group.has('run_shell') ? { runShell: group.get('run_shell')! } : {}),
    ...(group.has('work_on_project') ? { workOnProject: group.get('work_on_project')! } : {}),
    ...(group.has('list_projects') ? { listProjects: group.get('list_projects')! } : {}),
  };
};

/** Concise shared English section; returns '' when there is no WebCodex surface. */
export const buildRtkInstructions = (tools: AdvertisedTool[] | undefined): string => {
  const names = resolveWebCodexRtkTools(tools);
  if (!names) return '';

  const setup = [
    names.listProjects && `discover project via \`${names.listProjects}\``,
    names.workOnProject && `call \`${names.workOnProject}\` before the first command and follow its instructions`,
  ]
    .filter(Boolean)
    .join('; ');

  if (names.runShell) {
    const shellSetup = names.listProjects ? ` First: discover project via \`${names.listProjects}\`.` : '';
    return `RTK OUTPUT COMPRESSION (WebCodex \`${names.runShell}\`)
- Always prefix verbose read-only/build/test CLI commands with \`rtk\`: \`rtk git\` (\`status\`/\`diff\`/\`log\`), \`rtk rg\`, \`rtk find "*" <dir>\`, \`rtk tsc\`/\`pytest\`/\`cargo\`/\`docker\`, and wrap custom test/build scripts (like \`pnpm\`/\`npm\` scripts) with \`rtk test <cmd>\` or \`rtk err <cmd>\` (on macOS/Linux \`rtk ls\` also works; avoid \`rtk tree\`/\`grep\`, and on Windows also avoid \`rtk ls\` and PowerShell \`Get-ChildItem\`/\`Select-String\`).${shellSetup}
- NEVER wrap file edits, \`python -c\`, heredocs, redirects, pipes, short commands, \`--json\`/\`--porcelain\`, or full/audit logs in \`rtk\` (run raw; re-run raw if RTK omits needed detail). Windows pip: \`rtk python -m pip\`.
- Never install RTK or alter trust/telemetry; run \`rtk trust\` only with explicit user consent.`;
  }

  if (names.runProcess) {
    return `RTK OUTPUT COMPRESSION (WebCodex \`${names.runProcess}\` only)
- Use executable \`rtk\` with original args (e.g. \`["git","log","-12"]\`) for supported commands with long human-readable output; include required schema params.${setup ? ` First: ${setup}.` : ''}
- Use raw commands for unsupported, short, structured/machine-readable, full-log, hash, or audit output (or if RTK summary lacks detail). Windows pip: \`rtk python -m pip\`.
- Never install RTK or alter trust/telemetry; run \`rtk trust\` only with explicit user consent.`;
  }

  return '';
};

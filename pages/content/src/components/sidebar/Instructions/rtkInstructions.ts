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
  runProcess: string;
  workOnProject?: string;
  listProjects?: string;
}

const BASE_NAMES = ['run_process', 'work_on_project', 'list_projects'] as const;
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

  const named = [...servers.entries()].filter(
    ([prefix, group]) => /^(?:mcp__)?webcodex$/i.test(prefix) && group.has('run_process'),
  ).map(([, group]) => group);
  const candidates = named.length ? named : [...servers.values()].filter(
    group => group.has('run_process') && group.has('work_on_project'),
  );
  if (candidates.length !== 1) return null;

  const [group] = candidates;
  return {
    runProcess: group.get('run_process')!,
    workOnProject: group.get('work_on_project'),
    ...(group.has('list_projects') ? { listProjects: group.get('list_projects')! } : {}),
  };
};

/** Concise shared English section; returns '' when there is no WebCodex surface. */
export const buildRtkInstructions = (tools: AdvertisedTool[] | undefined): string => {
  const names = resolveWebCodexRtkTools(tools);
  if (!names) return '';

  const setup = [
    names.listProjects && `Use \`${names.listProjects}\` if you need to discover the Project.`,
    names.workOnProject && `Call \`${names.workOnProject}\` before the first Project command and follow its returned instructions.`,
  ].filter(Boolean).join(' ');

  return `RTK OUTPUT COMPRESSION (WebCodex)
Applies only to WebCodex Project commands run with \`${names.runProcess}\`.
- Starting with the first eligible command, you MUST use RTK for every supported command expected to produce long human-readable output. Set executable to \`rtk\` and pass the original command and arguments in order, e.g. executable \`rtk\`, args \`["git","log","-12"]\`. Include all project/context parameters required by the tool schema.${setup ? `\n- ${setup}` : ''}
- Use the ordinary command for unsupported commands, output that is short, machine-readable or structured, full logs, hashes and audits. If an RTK summary is not enough, read the raw output.
- On Windows, invoke pip through RTK as \`rtk python -m pip\`.
- Do not install RTK or change its trust or telemetry settings; run \`rtk trust\` only with the user's explicit consent.`;
};

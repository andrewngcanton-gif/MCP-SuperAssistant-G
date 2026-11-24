#!/usr/bin/env node
/**
 * Generate a proxy config from a managed input that contains the existing
 * mcpServers entries plus an optional crewdispatch toggle.
 *
 * Node standard library only. The managed input is read, never modified, and
 * never passed to the proxy: only the generated file is safe to hand to it.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const USAGE = `Usage:
  node scripts/crewdispatch-config/generate-config.mjs --input <managed-input.json> --output <generated.json>

Managed input shape:
  {
    "mcpServers": { "<name>": { ... } },
    "crewdispatch": { "enabled": true, "command": "node", "args": ["<entrypoint>"] }
  }

Exactly boolean true enables mcpServers.crewdispatch. Missing or false leaves
CrewDispatch out, even when the input has a legacy crewdispatch server entry.
Other mcpServers entries are copied as-is.`;

const CREWDISPATCH_KEYS = new Set(['enabled', 'command', 'args']);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = { input: null, output: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--input' || arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        fail(`${arg} requires a file path`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return options;
}

function buildGeneratedConfig(input) {
  if (!isPlainObject(input)) {
    fail('managed input must be a JSON object');
  }

  const sourceServers = input.mcpServers === undefined ? {} : input.mcpServers;
  if (!isPlainObject(sourceServers)) {
    fail('"mcpServers" must be an object whose keys are server names');
  }

  const servers = Object.create(null);
  for (const [name, entry] of Object.entries(sourceServers)) {
    if (!isPlainObject(entry)) {
      fail(`mcpServers.${name} must be an object`);
    }
    servers[name] = entry;
  }

  const toggle = input.crewdispatch;
  let enabled = false;

  if (toggle !== undefined) {
    if (!isPlainObject(toggle)) {
      fail('"crewdispatch" must be an object with "enabled", "command" and "args"');
    }
    for (const key of Object.keys(toggle)) {
      if (!CREWDISPATCH_KEYS.has(key)) {
        fail(`"crewdispatch.${key}" is not supported (allowed keys: enabled, command, args)`);
      }
    }
    if ('enabled' in toggle) {
      if (typeof toggle.enabled !== 'boolean') {
        fail('"crewdispatch.enabled" must be true or false');
      }
      enabled = toggle.enabled === true;
    }
    if (enabled) {
      if (typeof toggle.command !== 'string' || toggle.command.trim().length === 0) {
        fail('"crewdispatch.command" must be a non-empty string when enabled');
      }
      if (!Array.isArray(toggle.args) || !toggle.args.every(arg => typeof arg === 'string')) {
        fail('"crewdispatch.args" must be an array of strings when enabled');
      }
    }
  }

  if (enabled) {
    servers.crewdispatch = {
      type: 'stdio',
      command: toggle.command,
      args: [...toggle.args],
    };
  } else {
    delete servers.crewdispatch;
  }

  return { config: { mcpServers: servers }, enabled };
}

function resolveSameFile(inputPath, outputPath) {
  if (inputPath === outputPath) {
    return true;
  }
  try {
    return realpathSync(inputPath) === realpathSync(outputPath);
  } catch {
    return false;
  }
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!options.input || !options.output) {
    fail('both --input and --output are required\n\n' + USAGE);
  }

  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);
  if (resolveSameFile(inputPath, outputPath)) {
    fail('--output must differ from --input; the managed input is never overwritten');
  }

  let raw;
  try {
    raw = readFileSync(inputPath, 'utf8');
  } catch (err) {
    fail(`cannot read input file ${options.input}: ${err.code === 'ENOENT' ? 'file not found' : err.message}`);
  }

  let input;
  try {
    input = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    fail('managed input is not valid JSON');
  }

  const { config, enabled } = buildGeneratedConfig(input);
  const contents = `${JSON.stringify(config, null, 2)}\n`;
  const tempPath = `${outputPath}.tmp-${randomUUID()}`;

  try {
    writeFileSync(tempPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(tempPath, outputPath);
  } catch (err) {
    rmSync(tempPath, { force: true });
    fail(`cannot write output file ${options.output}: ${err.message}`);
  }

  const count = Object.keys(config.mcpServers).length;
  console.log(
    `wrote ${options.output} with ${count} MCP server(s); crewdispatch ${enabled ? 'enabled' : 'disabled'}`,
  );
  console.log(`restart the proxy with --config ${options.output} after changing the toggle`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`crewdispatch-config: ${err.message}`);
  process.exitCode = 1;
}

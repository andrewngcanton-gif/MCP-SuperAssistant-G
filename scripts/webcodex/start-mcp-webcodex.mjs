#!/usr/bin/env node
// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const scriptPath = path.resolve(fileURLToPath(import.meta.url));
const serverExeName = isWin ? 'webcodex-server.exe' : 'webcodex-server';
const runnerExeName = isWin ? 'webcodex-runner.exe' : 'webcodex-runner';

const localAppData = isWin ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local') : '';
const desktopRoots = isWin
  ? [path.join(localAppData, 'dev.webcodex.desktop')]
  : [
      path.join(os.homedir(), 'Library', 'Application Support', 'dev.webcodex.desktop'),
      path.join(os.homedir(), '.local', 'share', 'dev.webcodex.desktop'),
    ];
const defaultConfigPath = isWin
  ? path.join(localAppData, 'mcp-superassistant-webcodex.json')
  : path.join(os.homedir(), '.config', 'mcp-superassistant-webcodex.json');
const logDir = isWin
  ? path.join(os.homedir(), 'mcp-superassistant')
  : isMac
    ? path.join(os.homedir(), 'Library', 'Logs', 'mcp-superassistant')
    : path.join(os.homedir(), '.local', 'state', 'mcp-superassistant');

const WIN_HEADLESS_TASK = 'McpSuperAssistantWebCodex';
const WIN_PROXY_TASK = 'McpSuperAssistantProxy';
const MAC_HEADLESS_LABEL = 'com.mcpsuperassistant.webcodex';
const MAC_PROXY_LABEL = 'com.mcpsuperassistant.proxy';

const stripBom = text => text.replace(/^\uFEFF/, '');

const readState = () => {
  for (const r of desktopRoots) {
    const stateFile = path.join(r, 'desktop-state.json');
    if (fs.existsSync(stateFile)) {
      try {
        return JSON.parse(stripBom(fs.readFileSync(stateFile, 'utf8')));
      } catch {}
    }
  }
  return null;
};

const walkFind = fileName => {
  const found = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name === fileName) found.push(full);
    }
  };
  desktopRoots.forEach(walk);
  return found;
};

const findTokenPath = desktopState => {
  if (process.env.TOKEN_PATH) return process.env.TOKEN_PATH;
  if (desktopState?.runtime?.user_token_file && fs.existsSync(desktopState.runtime.user_token_file)) {
    return desktopState.runtime.user_token_file;
  }
  const found = walkFind('webcodex-user-token');
  if (found.length === 0) {
    throw new Error(
      'webcodex-user-token not found. Sign in to WebCodex Desktop once first, or set TOKEN_PATH to the token file.',
    );
  }
  if (found.length > 1) {
    throw new Error(
      `Multiple webcodex-user-token files found. Set TOKEN_PATH to one of:\n${found.map(p => '  ' + p).join('\n')}`,
    );
  }
  return found[0];
};

const findRunnerConfig = desktopState => {
  if (process.env.WEBCODEX_RUNNER_CONFIG) return process.env.WEBCODEX_RUNNER_CONFIG;
  if (desktopState?.runtime?.runner_config && fs.existsSync(desktopState.runtime.runner_config)) {
    return desktopState.runtime.runner_config;
  }
  return walkFind('runner.toml')[0] || null;
};

const findEnvFile = desktopState => {
  if (process.env.WEBCODEX_ENV_FILE) return process.env.WEBCODEX_ENV_FILE;
  if (desktopState?.runtime?.server_env_file && fs.existsSync(desktopState.runtime.server_env_file)) {
    return desktopState.runtime.server_env_file;
  }
  for (const r of desktopRoots) {
    const candidate = path.join(r, 'runtime', 'local', 'webcodex.env');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const matchPortInFile = file => {
  if (!file || !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const urlMatch = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})/);
  if (urlMatch) return urlMatch[1];
  const bindMatch = text.match(/(?:^|\n)\s*(?:WEBCODEX_)?(?:BIND|ADDR|PORT)\s*=\s*"?(?:[^:\n]*:)?(\d{2,5})/);
  return bindMatch ? bindMatch[1] : null;
};

const detectLsofPort = () => {
  if (isWin) return null;
  try {
    const out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const candidates = [];
    for (const line of out.split(/\r?\n/)) {
      if (!/webcodex/i.test(line)) continue;
      const m = line.match(/(127\.0\.0\.1|localhost|\[::1\]|\*):(\d+)\s+\(LISTEN\)/);
      if (m) candidates.push({ host: m[1], port: m[2] });
    }
    const local = candidates.find(c => c.host !== '*') || candidates[0];
    return local ? local.port : null;
  } catch {
    return null;
  }
};

const detectPort = (desktopState, tokenPath, preferEnvFile) => {
  if (process.env.WEBCODEX_PORT) return { port: process.env.WEBCODEX_PORT, source: 'WEBCODEX_PORT env' };

  const envFile = findEnvFile(desktopState);
  if (preferEnvFile && envFile) {
    const envPort = matchPortInFile(envFile);
    if (envPort) return { port: envPort, source: envFile };
  }

  const stateUrl = desktopState?.runtime?.server_url;
  const stateMatch = typeof stateUrl === 'string' && stateUrl.match(/:(\d{2,5})(?:\/|$)/);
  if (stateMatch) return { port: stateMatch[1], source: 'desktop-state.json' };

  if (!preferEnvFile) {
    const lsofPort = detectLsofPort();
    if (lsofPort) return { port: lsofPort, source: 'lsof live process' };
  }

  const files = [];
  const tokenDir = path.dirname(tokenPath);
  if (fs.existsSync(tokenDir)) {
    for (const f of fs.readdirSync(tokenDir)) {
      if (/\.(toml|json|env)$/i.test(f)) files.push(path.join(tokenDir, f));
    }
  }
  if (!preferEnvFile && envFile) files.push(envFile);

  for (const file of files) {
    const p = matchPortInFile(file);
    if (p) return { port: p, source: file };
  }
  return { port: '60143', source: 'default fallback' };
};

const syncConfig = (preferEnvFile = false, { dryRun = false } = {}) => {
  const desktopState = readState();
  const tokenPath = findTokenPath(desktopState);
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  if (!token) throw new Error(`The webcodex-user-token file is empty: ${tokenPath}`);

  const { port, source } = detectPort(desktopState, tokenPath, preferEnvFile);
  const proxyPort = process.env.PROXY_PORT || '3006';
  const cfgPath = process.env.CONFIG_PATH || defaultConfigPath;

  const prevRaw = fs.existsSync(cfgPath) ? stripBom(fs.readFileSync(cfgPath, 'utf8')) : '';
  const cfg = prevRaw ? JSON.parse(prevRaw) : { mcpServers: {} };
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers.webcodex = {
    type: 'streamable-http',
    url: `http://127.0.0.1:${port}/mcp`,
    headers: {
      'X-WebCodex-MCP-Surface': 'cli',
      Authorization: `Bearer ${token}`,
    },
  };
  const nextRaw = JSON.stringify(cfg, null, 2) + '\n';
  const updated = nextRaw !== prevRaw;
  if (updated && !dryRun) {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, nextRaw, isWin ? { encoding: 'utf8' } : { encoding: 'utf8', mode: 0o600 });
  }
  return { desktopState, tokenPath, port, source, cfgPath, proxyPort, updated };
};

const detectRuntimeDir = () => {
  const envDir = process.env.WEBCODEX_RUNTIME_DIR?.replace(/^"+|"+$/g, '');
  if (envDir) {
    if (fs.existsSync(path.join(envDir, serverExeName))) return envDir;
    const nested = isMac
      ? path.join(envDir, 'Contents', 'Resources', 'webcodex-runtime')
      : path.join(envDir, 'webcodex-runtime');
    if (fs.existsSync(path.join(nested, serverExeName))) return nested;
    throw new Error(`WEBCODEX_RUNTIME_DIR does not contain ${serverExeName}: ${envDir}`);
  }

  if (isWin) {
    const candidates = [];
    try {
      const psCmd =
        "@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
        "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
        "'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*') | " +
        'ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } | ' +
        "Where-Object { $_.DisplayName -match 'WebCodex' } | ForEach-Object { " +
        'if ($_.InstallLocation) { $_.InstallLocation }; ' +
        "if ($_.DisplayIcon) { Split-Path -Parent ($_.DisplayIcon.Split(',')[0].Trim('\"')) } }";
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split(/\r?\n/)) {
        const cleaned = line.trim().replace(/^"+|"+$/g, '');
        if (cleaned) candidates.push(cleaned);
      }
    } catch {}
    for (const base of [
      path.join(localAppData, 'Programs', 'WebCodex Desktop'),
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'WebCodex Desktop') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'WebCodex Desktop') : '',
    ]) {
      if (base) candidates.push(base);
    }
    for (const base of candidates) {
      for (const dir of [path.join(base, 'webcodex-runtime'), base]) {
        if (fs.existsSync(path.join(dir, serverExeName)) && fs.existsSync(path.join(dir, runnerExeName))) {
          return dir;
        }
      }
    }
  } else if (isMac) {
    const apps = [
      '/Applications/WebCodex Desktop.app',
      path.join(os.homedir(), 'Applications', 'WebCodex Desktop.app'),
    ];
    try {
      const out = execFileSync('mdfind', ["kMDItemFSName == 'WebCodex Desktop.app'"], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split(/\r?\n/)) {
        if (line.trim()) apps.push(line.trim());
      }
    } catch {}
    for (const app of apps) {
      const dir = path.join(app, 'Contents', 'Resources', 'webcodex-runtime');
      if (fs.existsSync(path.join(dir, serverExeName)) && fs.existsSync(path.join(dir, runnerExeName))) {
        return dir;
      }
    }
  }

  throw new Error(`Could not locate ${serverExeName} and ${runnerExeName}. Set WEBCODEX_RUNTIME_DIR and retry.`);
};

const isPortOpen = port =>
  new Promise(resolve => {
    let settled = false;
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = ok => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

const isMcpHttpReady = port =>
  new Promise(resolve => {
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = http.get({ host: '127.0.0.1', port, path: '/mcp', timeout: 2000 }, res => {
      res.destroy();
      done(true);
    });
    req.on('timeout', () => {
      req.destroy();
      done(false);
    });
    req.on('error', () => done(false));
  });

const buildProxyInvocation = (cfgPath, proxyPort) => {
  const args = [
    '-y',
    '@srbhptl39/mcp-superassistant-proxy@0.1.9',
    '--config',
    cfgPath,
    '--outputTransport',
    'sse',
    '--port',
    proxyPort,
  ];
  if (isWin) {
    const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (fs.existsSync(npxCli)) {
      return { cmd: process.execPath, args: [npxCli, ...args], opts: {} };
    }
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const cmdLine = `"${['npx.cmd', ...args].map(q).join(' ')}"`;
    return {
      cmd: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', cmdLine],
      opts: { windowsVerbatimArguments: true },
    };
  }
  const siblingNpx = path.join(path.dirname(process.execPath), 'npx');
  return { cmd: fs.existsSync(siblingNpx) ? siblingNpx : 'npx', args, opts: {} };
};

const spawnLogged = (cmd, args, logBase, extraOpts = {}) => {
  const outFd = fs.openSync(`${logBase}.log`, 'a');
  const errFd = fs.openSync(`${logBase}.err.log`, 'a');
  const proc = spawn(cmd, args, {
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
    detached: !isWin,
    ...extraOpts,
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  return proc;
};

const killProcessTree = proc => {
  if (!proc || proc.killed || proc.exitCode !== null) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        proc.kill('SIGTERM');
      }
    }
  } catch {}
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const runPowerShell = (psScript, { dryRun = false } = {}) => {
  if (dryRun) {
    console.log('--- PowerShell Scheduled Task command (dry-run) ---');
    console.log(psScript.trimEnd());
    return;
  }
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    stdio: 'inherit',
  });
};

const escapePsSingle = value => String(value).replace(/'/g, "''");

const escapeXml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const buildMacPlist = ({ label, programArgs, envVars, outLog, errLog }) => {
  const argLines = programArgs.map(a => `    <string>${escapeXml(a)}</string>`).join('\n');
  const envLines = Object.entries(envVars)
    .map(([k, v]) => `    <key>${escapeXml(k)}</key><string>${escapeXml(v)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argLines}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envLines}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(outLog)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(errLog)}</string>
</dict>
</plist>
`;
};

const macDomain = () => `gui/${typeof process.getuid === 'function' ? process.getuid() : 501}`;
const macPlistPath = label => path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);

const resolveStableNodePath = () => {
  if (isMac) {
    for (const stable of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
      if (fs.existsSync(stable)) {
        try {
          if (fs.realpathSync(stable) === fs.realpathSync(process.execPath)) return stable;
        } catch {}
      }
    }
  }
  return process.execPath;
};

const macBootout = (label, { dryRun = false } = {}) => {
  const plistPath = macPlistPath(label);
  if (dryRun) return;
  spawnSync('launchctl', ['bootout', `${macDomain()}/${label}`], { stdio: 'ignore' });
  spawnSync('launchctl', ['bootout', macDomain(), plistPath], { stdio: 'ignore' });
};

const installHeadless = async dryRun => {
  const runtimeDir = detectRuntimeDir();
  const info = syncConfig(true, { dryRun });
  const envFile = findEnvFile(info.desktopState);
  const runnerCfg = findRunnerConfig(info.desktopState);
  if (!envFile || !fs.existsSync(envFile)) {
    throw new Error(`webcodex.env not found (${envFile || 'missing'}). Launch WebCodex Desktop once first.`);
  }
  if (!runnerCfg || !fs.existsSync(runnerCfg)) {
    throw new Error(`runner.toml not found (${runnerCfg || 'missing'}). Add a project in WebCodex Desktop first.`);
  }

  console.log(`Runtime : ${runtimeDir}`);
  console.log(`EnvFile : ${envFile}`);
  console.log(`Runner  : ${runnerCfg}`);
  console.log(`Config  : ${info.cfgPath} (${dryRun ? 'dry-run' : info.updated ? 'updated' : 'unchanged'})`);
  console.log(`Logs    : ${logDir}`);

  if (await isPortOpen(Number(info.port))) {
    console.log(
      `Note: WebCodex port ${info.port} is currently open. If WebCodex Desktop is running, quit it and disable its own auto-start on login.`,
    );
  }

  if (isWin) {
    const rt = escapePsSingle(runtimeDir);
    const nd = escapePsSingle(process.execPath);
    const sc = escapePsSingle(scriptPath);
    const ps = `$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName '${WIN_PROXY_TASK}' -Confirm:$false -ErrorAction SilentlyContinue
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command \`"\`$env:WEBCODEX_RUNTIME_DIR='$rt'; & '$nd' '$sc' --headless\`""
Register-ScheduledTask -TaskName '${WIN_HEADLESS_TASK}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName '${WIN_HEADLESS_TASK}'
`;
    runPowerShell(ps, { dryRun });
    if (!dryRun) {
      console.log(`Installed & started Windows Scheduled Task: ${WIN_HEADLESS_TASK}`);
    }
    return;
  }

  if (isMac) {
    const stableNode = resolveStableNodePath();
    const nodeDir = path.dirname(stableNode);
    const pathEnv = [
      ...new Set([nodeDir, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']),
    ].join(':');
    const plistXml = buildMacPlist({
      label: MAC_HEADLESS_LABEL,
      programArgs: [stableNode, scriptPath, '--headless'],
      envVars: {
        PATH: pathEnv,
        WEBCODEX_RUNTIME_DIR: runtimeDir,
      },
      outLog: path.join(logDir, 'launchd-webcodex.log'),
      errLog: path.join(logDir, 'launchd-webcodex.err.log'),
    });
    if (dryRun) {
      console.log(`--- LaunchAgent plist (${macPlistPath(MAC_HEADLESS_LABEL)}) ---`);
      console.log(plistXml.trimEnd());
      return;
    }
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(path.dirname(macPlistPath(MAC_HEADLESS_LABEL)), { recursive: true });
    macBootout(MAC_PROXY_LABEL);
    if (fs.existsSync(macPlistPath(MAC_PROXY_LABEL))) fs.unlinkSync(macPlistPath(MAC_PROXY_LABEL));
    macBootout(MAC_HEADLESS_LABEL);
    await sleep(300);
    fs.writeFileSync(macPlistPath(MAC_HEADLESS_LABEL), plistXml, 'utf8');
    execFileSync('launchctl', ['bootstrap', macDomain(), macPlistPath(MAC_HEADLESS_LABEL)], { stdio: 'inherit' });
    console.log(`Installed & started macOS LaunchAgent: ${MAC_HEADLESS_LABEL}`);
    return;
  }

  throw new Error(`--install-headless only supports Windows and macOS (current: ${process.platform}).`);
};

const installProxyOnly = async dryRun => {
  const info = syncConfig(false, { dryRun });
  console.log(`Token   : ${info.tokenPath}`);
  console.log(`WebCodex: http://127.0.0.1:${info.port}/mcp (from ${info.source})`);
  console.log(`Config  : ${info.cfgPath} (${dryRun ? 'dry-run' : info.updated ? 'updated' : 'unchanged'})`);
  console.log(`Proxy   : http://localhost:${info.proxyPort}/sse`);

  if (isWin) {
    const nd = escapePsSingle(process.execPath);
    const sc = escapePsSingle(scriptPath);
    const ps = `$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName '${WIN_HEADLESS_TASK}' -Confirm:$false -ErrorAction SilentlyContinue
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command \`"& '$nd' '$sc' --watch\`""
Register-ScheduledTask -TaskName '${WIN_PROXY_TASK}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName '${WIN_PROXY_TASK}'
`;
    runPowerShell(ps, { dryRun });
    if (!dryRun) {
      console.log(`Installed & started Windows Scheduled Task: ${WIN_PROXY_TASK}`);
    }
    return;
  }

  if (isMac) {
    const stableNode = resolveStableNodePath();
    const nodeDir = path.dirname(stableNode);
    const pathEnv = [
      ...new Set([nodeDir, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']),
    ].join(':');
    const plistXml = buildMacPlist({
      label: MAC_PROXY_LABEL,
      programArgs: [stableNode, scriptPath, '--watch'],
      envVars: { PATH: pathEnv },
      outLog: path.join(logDir, 'launchd-proxy.log'),
      errLog: path.join(logDir, 'launchd-proxy.err.log'),
    });
    if (dryRun) {
      console.log(`--- LaunchAgent plist (${macPlistPath(MAC_PROXY_LABEL)}) ---`);
      console.log(plistXml.trimEnd());
      return;
    }
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(path.dirname(macPlistPath(MAC_PROXY_LABEL)), { recursive: true });
    macBootout(MAC_HEADLESS_LABEL);
    if (fs.existsSync(macPlistPath(MAC_HEADLESS_LABEL))) fs.unlinkSync(macPlistPath(MAC_HEADLESS_LABEL));
    macBootout(MAC_PROXY_LABEL);
    await sleep(300);
    fs.writeFileSync(macPlistPath(MAC_PROXY_LABEL), plistXml, 'utf8');
    execFileSync('launchctl', ['bootstrap', macDomain(), macPlistPath(MAC_PROXY_LABEL)], { stdio: 'inherit' });
    console.log(`Installed & started macOS LaunchAgent: ${MAC_PROXY_LABEL}`);
    return;
  }

  throw new Error(`--install-proxy only supports Windows and macOS (current: ${process.platform}).`);
};

const uninstallAutoStart = async dryRun => {
  if (isWin) {
    const ps = `$ErrorActionPreference = 'SilentlyContinue'
foreach ($t in @('${WIN_HEADLESS_TASK}', '${WIN_PROXY_TASK}')) {
  Stop-ScheduledTask -TaskName $t
  Unregister-ScheduledTask -TaskName $t -Confirm:$false
}
`;
    runPowerShell(ps, { dryRun });
    if (!dryRun) {
      console.log(`Removed Windows Scheduled Tasks: ${WIN_HEADLESS_TASK}, ${WIN_PROXY_TASK}`);
    }
    return;
  }

  if (isMac) {
    for (const label of [MAC_HEADLESS_LABEL, MAC_PROXY_LABEL]) {
      const plistPath = macPlistPath(label);
      if (dryRun) {
        console.log(`Would bootout & remove: ${plistPath}`);
      } else {
        macBootout(label);
        if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
      }
    }
    if (!dryRun) {
      await sleep(300);
      console.log(`Removed macOS LaunchAgents: ${MAC_HEADLESS_LABEL}, ${MAC_PROXY_LABEL}`);
    }
    return;
  }

  throw new Error(`--uninstall only supports Windows and macOS (current: ${process.platform}).`);
};

const runHeadlessLoop = async () => {
  const runtimeDir = detectRuntimeDir();
  const serverExe = path.join(runtimeDir, serverExeName);
  const runnerExe = path.join(runtimeDir, runnerExeName);
  fs.mkdirSync(logDir, { recursive: true });
  const logLine = msg =>
    fs.appendFileSync(path.join(logDir, 'launcher.log'), `${new Date().toISOString()} ${msg}\n`, 'utf8');

  let serverProc = null;
  let runnerProc = null;
  let proxyProc = null;
  let stopping = false;

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    logLine('Shutting down headless launcher...');
    for (const p of [proxyProc, runnerProc, serverProc]) {
      killProcessTree(p);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logLine(`Headless launcher started (${process.platform}, runtime=${runtimeDir}).`);
  while (!stopping) {
    try {
      const info = syncConfig(true);
      const port = Number(info.port);
      const proxyPort = Number(info.proxyPort);

      if (!serverProc && !(await isPortOpen(port))) {
        const envFile = findEnvFile(info.desktopState);
        if (!envFile || !fs.existsSync(envFile)) {
          logLine(`ERROR: missing webcodex.env (${envFile || 'not found'})`);
        } else {
          const p = spawnLogged(serverExe, ['--env-file', envFile], path.join(logDir, 'webcodex-server'));
          serverProc = p;
          logLine(`Started ${serverExeName} (PID ${p.pid}) on port ${port}`);
          p.once('exit', (code, sig) => {
            logLine(`${serverExeName} exited (code=${code}, signal=${sig})`);
            if (serverProc === p) serverProc = null;
          });
          for (let i = 0; i < 60 && !stopping; i++) {
            if (await isPortOpen(port)) break;
            await sleep(1000);
          }
        }
      }

      if (serverProc && !runnerProc && (await isPortOpen(port))) {
        const runnerCfg = findRunnerConfig(info.desktopState);
        if (!runnerCfg || !fs.existsSync(runnerCfg)) {
          logLine(`ERROR: missing runner.toml (${runnerCfg || 'not found'})`);
        } else {
          const p = spawnLogged(runnerExe, ['--config', runnerCfg], path.join(logDir, 'webcodex-runner'));
          runnerProc = p;
          logLine(`Started ${runnerExeName} (PID ${p.pid})`);
          p.once('exit', (code, sig) => {
            logLine(`${runnerExeName} exited (code=${code}, signal=${sig})`);
            if (runnerProc === p) runnerProc = null;
          });
        }
      }

      if (!proxyProc && !(await isPortOpen(proxyPort)) && (await isMcpHttpReady(port))) {
        const fresh = syncConfig(true);
        const inv = buildProxyInvocation(fresh.cfgPath, fresh.proxyPort);
        const p = spawnLogged(inv.cmd, inv.args, path.join(logDir, 'proxy'), inv.opts);
        proxyProc = p;
        logLine(`Started proxy (PID ${p.pid}) -> http://localhost:${fresh.proxyPort}/sse`);
        p.once('exit', (code, sig) => {
          logLine(`proxy exited (code=${code}, signal=${sig})`);
          if (proxyProc === p) proxyProc = null;
        });
      }
    } catch (err) {
      logLine(`ERROR: ${err?.message || err}`);
    }
    await sleep(5000);
  }
};

const runWatchLoop = async () => {
  fs.mkdirSync(logDir, { recursive: true });
  const logLine = msg =>
    fs.appendFileSync(path.join(logDir, 'proxy-watch.log'), `${new Date().toISOString()} ${msg}\n`, 'utf8');

  let proxyProc = null;
  let stopping = false;

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    killProcessTree(proxyProc);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stopping) {
    const proxyPort = process.env.PROXY_PORT || '3006';
    if (!proxyProc && !(await isPortOpen(Number(proxyPort)))) {
      try {
        const info = syncConfig(false);
        if (await isMcpHttpReady(Number(info.port))) {
          const inv = buildProxyInvocation(info.cfgPath, info.proxyPort);
          const p = spawnLogged(inv.cmd, inv.args, path.join(logDir, 'proxy'), inv.opts);
          proxyProc = p;
          logLine(`Started proxy (PID ${p.pid}) -> http://localhost:${info.proxyPort}/sse`);
          p.once('exit', (code, sig) => {
            logLine(`proxy exited (code=${code}, signal=${sig})`);
            if (proxyProc === p) proxyProc = null;
          });
        }
      } catch (err) {
        logLine(`ERROR: ${err?.message || err}`);
      }
    }
    await sleep(5000);
  }
};

const printHelp = () => {
  console.log(`Usage: node ${path.basename(scriptPath)} [mode] [--dry-run]

Modes (default: foreground proxy with WebCodex Desktop):
  --install-headless   Install & start background WebCodex CLI + Proxy auto-start
  --install-proxy      Install & start background Proxy-only auto-start (for Desktop)
  --uninstall          Stop & remove installed auto-start tasks / LaunchAgents
  --headless           Run WebCodex Server + Runner + Proxy supervisor loop
  --watch              Run Proxy-only supervisor loop
  --dry-run            Preview changes without modifying OS tasks or config files
  -h, --help           Show this help

Optional env vars:
  WEBCODEX_PORT, TOKEN_PATH, PROXY_PORT, CONFIG_PATH,
  WEBCODEX_RUNTIME_DIR, WEBCODEX_RUNNER_CONFIG, WEBCODEX_ENV_FILE, NO_START=1`);
};

(async () => {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');

  if (args.has('--help') || args.has('-h')) {
    printHelp();
    return;
  }
  if (args.has('--uninstall')) {
    await uninstallAutoStart(dryRun);
    return;
  }
  if (args.has('--install-headless')) {
    await installHeadless(dryRun);
    return;
  }
  if (args.has('--install-proxy')) {
    await installProxyOnly(dryRun);
    return;
  }
  if (args.has('--headless')) {
    await runHeadlessLoop();
    return;
  }
  if (args.has('--watch')) {
    await runWatchLoop();
    return;
  }

  const info = syncConfig(false, { dryRun });
  console.log(`Token   : ${info.tokenPath}`);
  console.log(`WebCodex: http://127.0.0.1:${info.port}/mcp (from ${info.source})`);
  console.log(`Config  : ${info.cfgPath} (${dryRun ? 'dry-run' : info.updated ? 'updated' : 'unchanged'})`);
  console.log(`Proxy   : http://localhost:${info.proxyPort}/sse`);

  if (dryRun || process.env.NO_START === '1') return;
  const inv = buildProxyInvocation(info.cfgPath, info.proxyPort);
  const res = spawnSync(inv.cmd, inv.args, { stdio: 'inherit', ...inv.opts });
  process.exit(res.status ?? 0);
})().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});

# Using WebCodex on macOS

<p align="center">
  <a href="WEBCODEX_MACOS.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="WEBCODEX_WINDOWS.en.md">Windows guide</a>
</p>

## One-click setup & launch (recommended)

**Prerequisites**: Install and sign in to **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)** (tested on macOS with **[v0.5.1 Apple Silicon DMG](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**; older versions such as `0.4.6` do not support the `cli` tool surface), make sure the Runner shows **Connected**, and register at least one local project folder.

1. Open macOS **Terminal**, paste the entire block below, and press Enter to create `~/start-mcp-webcodex.sh` (it reads `desktop-state.json` / `webcodex-user-token`, auto-detects the live WebCodex port, idempotently updates `~/.config/mcp-superassistant-webcodex.json`, and starts the local SSE proxy):

   ```bash
   cat <<'EOF' > ~/start-mcp-webcodex.sh
   #!/usr/bin/env bash
   set -euo pipefail

   exec node -e '
   const fs = require("node:fs");
   const os = require("node:os");
   const path = require("node:path");
   const { execFileSync, spawnSync } = require("node:child_process");

   const roots = [
     path.join(os.homedir(), "Library", "Application Support", "dev.webcodex.desktop"),
     path.join(os.homedir(), ".local", "share", "dev.webcodex.desktop"),
   ];

   let desktopState = null;
   for (const r of roots) {
     const stateFile = path.join(r, "desktop-state.json");
     if (fs.existsSync(stateFile)) {
       try { desktopState = JSON.parse(fs.readFileSync(stateFile, "utf8")); break; } catch {}
     }
   }

   const foundTokens = [];
   const walk = (dir) => {
     if (!fs.existsSync(dir)) return;
     for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
       const full = path.join(dir, ent.name);
       if (ent.isDirectory()) walk(full);
       else if (ent.isFile() && ent.name === "webcodex-user-token") foundTokens.push(full);
     }
   };

   if (process.env.TOKEN_PATH) {
     foundTokens.push(process.env.TOKEN_PATH);
   } else if (desktopState?.runtime?.user_token_file && fs.existsSync(desktopState.runtime.user_token_file)) {
     foundTokens.push(desktopState.runtime.user_token_file);
   } else {
     roots.forEach(walk);
   }

   if (foundTokens.length === 0) {
     console.error("webcodex-user-token not found. Sign in to WebCodex Desktop first, or pass TOKEN_PATH=\"/path/to/webcodex-user-token\".");
     process.exit(1);
   }
   if (foundTokens.length > 1) {
     console.error("Multiple webcodex-user-token files found. Re-run with TOKEN_PATH=\"full_path\":");
     foundTokens.forEach((p) => console.error("  " + p));
     process.exit(1);
   }

   const tokenPath = foundTokens[0];
   const token = fs.readFileSync(tokenPath, "utf8").trim();
   if (!token) throw new Error("The webcodex-user-token file is empty.");

   const detectPort = () => {
     if (process.env.WEBCODEX_PORT) return { port: process.env.WEBCODEX_PORT, source: "WEBCODEX_PORT env" };

     const stateUrl = desktopState?.runtime?.server_url;
     const stateMatch = typeof stateUrl === "string" && stateUrl.match(/:(\d{2,5})(?:\/|$)/);
     if (stateMatch) return { port: stateMatch[1], source: "desktop-state.json" };

     try {
       const out = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
         encoding: "utf8",
         stdio: ["ignore", "pipe", "ignore"],
       });
       const candidates = [];
       for (const line of out.split(/\r?\n/)) {
         if (!/webcodex/i.test(line)) continue;
         const m = line.match(/(127\.0\.0\.1|localhost|\[::1\]|\*):(\d+)\s+\(LISTEN\)/);
         if (m) candidates.push({ host: m[1], port: m[2] });
       }
       const local = candidates.find((c) => c.host !== "*") || candidates[0];
       if (local) return { port: local.port, source: "lsof live process" };
     } catch {}

     const files = [];
     const tokenDir = path.dirname(tokenPath);
     if (fs.existsSync(tokenDir)) {
       for (const f of fs.readdirSync(tokenDir)) {
         if (/\.(toml|json|env)$/i.test(f)) files.push(path.join(tokenDir, f));
       }
     }
     for (const r of roots) files.push(path.join(r, "runtime", "local", "webcodex.env"));

     for (const file of files) {
       if (!fs.existsSync(file)) continue;
       const text = fs.readFileSync(file, "utf8");
       const urlMatch = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})/);
       if (urlMatch) return { port: urlMatch[1], source: file };
       const bindMatch = text.match(/(?:^|\n)\s*(?:WEBCODEX_)?(?:BIND|ADDR|PORT)\s*=\s*"?(?:[^:\n]*:)?(\d{2,5})/);
       if (bindMatch) return { port: bindMatch[1], source: file };
     }

     return { port: "60143", source: "default fallback" };
   };

   const { port, source } = detectPort();
   const proxyPort = process.env.PROXY_PORT || "3006";
   const cfgPath = process.env.CONFIG_PATH || path.join(os.homedir(), ".config", "mcp-superassistant-webcodex.json");

   fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
   const prevRaw = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, "utf8") : "";
   const cfg = prevRaw ? JSON.parse(prevRaw) : { mcpServers: {} };
   cfg.mcpServers = cfg.mcpServers || {};
   cfg.mcpServers.webcodex = {
     type: "streamable-http",
     url: `http://127.0.0.1:${port}/mcp`,
     headers: {
       "X-WebCodex-MCP-Surface": "cli",
       Authorization: `Bearer ${token}`,
     },
   };
   const nextRaw = JSON.stringify(cfg, null, 2) + "\n";
   const updated = nextRaw !== prevRaw;
   if (updated) {
     fs.writeFileSync(cfgPath, nextRaw, { mode: 0o600 });
   }

   console.log(`Token   : ${tokenPath}`);
   console.log(`WebCodex: http://127.0.0.1:${port}/mcp (from ${source})`);
   console.log(`Config  : ${cfgPath} (${updated ? "updated" : "unchanged"})`);
   console.log(`Proxy   : http://localhost:${proxyPort}/sse`);

   if (process.env.NO_START === "1") process.exit(0);

   const res = spawnSync(
     "npx",
     ["-y", "@srbhptl39/mcp-superassistant-proxy@0.1.9", "--config", cfgPath, "--outputTransport", "sse", "--port", proxyPort],
     { stdio: "inherit" },
   );
   process.exit(res.status ?? 0);
   '
   EOF
   chmod +x ~/start-mcp-webcodex.sh
   ```

2. Run the launcher script and keep this terminal open:

   ```bash
   ~/start-mcp-webcodex.sh
   ```

3. Open the extension sidebar's connection settings, choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once **Connected**, check the **Tools** tab to verify the WebCodex tools are enabled.

   > **Note on WebCodex `v0.5.1` tool count**: With `"X-WebCodex-MCP-Surface": "cli"`, WebCodex `v0.5.1` exposes 9 core tools (`list_projects`, `run_shell`, `observe_jobs`, `stop_job`, `search_project_texts`, `read_files`, `edit_project_files`, `read_tool_manifest`, `call_runtime_tool`); specialized tools remain available on demand via `read_tool_manifest` + `call_runtime_tool`. Built-in extension meta-tools (`get_tool_schema`, `tool_lookup`) are handled locally in the content script and do not appear in the server tool list.

4. **Optional environment overrides** (usually unnecessary):
   - `WEBCODEX_PORT=57610 ~/start-mcp-webcodex.sh`: override the WebCodex port
   - `TOKEN_PATH="/full/path/to/webcodex-user-token" ~/start-mcp-webcodex.sh`: pick a specific token when multiple logins exist
   - `PROXY_PORT=3006 ~/start-mcp-webcodex.sh`: change the local SSE proxy port
   - `NO_START=1 ~/start-mcp-webcodex.sh`: update config only without launching the proxy

---

## Manual configuration

If you maintain your own `mcp-config.json`, merge this entry (updating the port and `<your WebCodex token>`):

```json
{
  "mcpServers": {
    "webcodex": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:60143/mcp",
      "headers": {
        "X-WebCodex-MCP-Surface": "cli",
        "Authorization": "Bearer <your WebCodex token>"
      }
    }
  }
}
```

Where to get `<your WebCodex token>`:
- Signed in with **WebCodex Desktop**: locate `webcodex-user-token` under `~/Library/Application Support/dev.webcodex.desktop/local-connections/`;
- Or via WebCodex CLI: `webcodex login ... --print-mcp-config` / `webcodex share`.

Launch the proxy:

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

---

<a id="webcodex-runner-config"></a>
## Advanced config & port troubleshooting

1. **Check the active WebCodex port**:

   ```bash
   lsof -nP -iTCP | grep LISTEN | grep -i webcodex
   ```

2. **`runner.toml` policy & RTK instructions** (under `~/Library/Application Support/dev.webcodex.desktop/local-connections/`):

   ```toml
   [policy]
   allow_raw_shell = true
   allow_cwd_anywhere = false
   allowed_roots = ['/Users/your-name/projects']
   max_timeout_secs = 3600
   max_output_bytes = 262144
   ```

   On the `v0.5.1` `cli` 9-tool surface, turning on [Optional WebCodex RTK guidance](README.en.md#new-features-and-improvements) in the extension sidebar directly injects `run_shell` RTK rules (no `work_on_project` needed). Only when using a surface that exposes `work_on_project` (`v0.5.0` or `adaptive`) do you need to create `rtk-instructions.md` next to `runner.toml` and attach it via `[instructions].files`:

   ```toml
   [instructions]
   files = ['/Users/your-name/Library/Application Support/dev.webcodex.desktop/local-connections/<account-dir>/rtk-instructions.md']
   ```

3. **`webcodex.env` compact & compatibility flags** (`~/Library/Application Support/dev.webcodex.desktop/runtime/local/webcodex.env`; restart WebCodex Desktop after editing):

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

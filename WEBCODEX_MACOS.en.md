# Using WebCodex on macOS

<p align="center">
  <a href="WEBCODEX_MACOS.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="WEBCODEX_WINDOWS.en.md">Windows guide</a>
</p>

**Prerequisites & connecting**: Install and sign in to **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)** (tested on macOS with **[v0.5.1 Apple Silicon DMG](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**; older versions such as `0.4.6` do not support the `cli` tool surface), add at least one local project folder, and have Node.js installed. Once the proxy is running on port `3006`, open the extension sidebar's connection settings, choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, click **Connect**, and check the **Tools** tab to verify WebCodex tools are enabled.

> **Note on WebCodex `v0.5.1` tool count**: With `"X-WebCodex-MCP-Surface": "cli"`, WebCodex `v0.5.1` exposes 9 core tools (`list_projects`, `run_shell`, `observe_jobs`, `stop_job`, `search_project_texts`, `read_files`, `edit_project_files`, `read_tool_manifest`, `call_runtime_tool`); specialized tools remain available on demand via `read_tool_manifest` + `call_runtime_tool`. Built-in extension meta-tools (`get_tool_schema`, `tool_lookup`) are handled locally in the content script and do not appear in the server tool list.

---

## 1. One-click headless auto-start for WebCodex CLI & local Proxy (recommended)

**One cross-platform script + one `launchd` LaunchAgent**: silently launches **both** **WebCodex (`webcodex-server` + `webcodex-runner`)** and the **local SSE Proxy** after login — **no WebCodex Desktop window, no open Terminal window, and zero manual path editing** (reuses Desktop's env, runner config, and token while saving GUI RAM).

**Prerequisites**: Sign in once in WebCodex Desktop and add your project(s) (creating `desktop-state.json`, `webcodex.env`, `runner.toml`, and `webcodex-user-token`), then quit WebCodex Desktop and **disable Desktop's own auto-start on login** (so ports do not conflict).

Run these two lines in **Terminal** to download the script and install + start the LaunchAgent (no sudo required):

```bash
curl -fsSL https://raw.githubusercontent.com/andrewngcanton-gif/MCP-SuperAssistant-G/custom/scripts/webcodex/start-mcp-webcodex.mjs -o ~/start-mcp-webcodex.mjs
node ~/start-mcp-webcodex.mjs --install-headless
```

- **Offline / manual copy**: open [scripts/webcodex/start-mcp-webcodex.mjs](scripts/webcodex/start-mcp-webcodex.mjs), copy its raw contents to `~/start-mcp-webcodex.mjs`, then run the second line.
- **Logs & notes**: Logs are saved in `~/Library/Logs/mcp-superassistant/`. If `WebCodex Desktop.app` lives outside `/Applications`, run `WEBCODEX_RUNTIME_DIR="/path/to/WebCodex Desktop.app" node ~/start-mcp-webcodex.mjs --install-headless`. If projects sit in TCC-protected folders (`~/Desktop`, `~/Documents`), either move them to a standard folder or use Section 2 (Desktop).
- **Uninstall auto-start**: `node ~/start-mcp-webcodex.mjs --uninstall`.

---

## 2. Lightweight option: Keep WebCodex Desktop (foreground or Proxy-only auto-start)

If you prefer keeping the **WebCodex Desktop** GUI open, reuse the same `~/start-mcp-webcodex.mjs`:

- **Foreground on demand** (keep Terminal open; refreshing pages or opening new chats reuses it):

  ```bash
  node ~/start-mcp-webcodex.mjs
  ```

- **Silent background auto-start for Proxy only** (LaunchAgent manages port `3006` only — enable Desktop's own auto-start or launch WebCodex Desktop when needed):

  ```bash
  node ~/start-mcp-webcodex.mjs --install-proxy
  ```

<details>
<summary>Optional: Environment variable overrides</summary>

- `WEBCODEX_PORT=57610 node ~/start-mcp-webcodex.mjs`: override the WebCodex port
- `TOKEN_PATH="/full/path/to/webcodex-user-token" node ~/start-mcp-webcodex.mjs`: pick a specific token when multiple logins exist
- `PROXY_PORT=3006 node ~/start-mcp-webcodex.mjs`: change the local SSE proxy port
- `WEBCODEX_RUNTIME_DIR="/path/to/WebCodex Desktop.app" node ~/start-mcp-webcodex.mjs --install-headless`: specify custom app/runtime path
- `NO_START=1 node ~/start-mcp-webcodex.mjs`: update config only without launching the proxy

</details>

---

## 3. Manual configuration

<details>
<summary>Expand manual `mcp-config.json` & `npx` instructions</summary>

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

Where to get `<your WebCodex token>` (keep it local only — never commit it or share it publicly):
- Signed in with **WebCodex Desktop**: locate `webcodex-user-token` under `~/Library/Application Support/dev.webcodex.desktop/local-connections/`;
- Or via WebCodex CLI: `webcodex login ... --print-mcp-config` / `webcodex share`.

Launch the proxy:

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

</details>

---

<a id="webcodex-runner-config"></a>
<details>
<summary>Optional: WebCodex advanced config & port troubleshooting (runner.toml, Homebrew PATH, webcodex.env)</summary>

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

   > **Homebrew `PATH` tip**: If you installed RTK via Homebrew (`/opt/homebrew/bin/rtk`) and launch WebCodex Desktop from Finder/Launchpad, GUI apps do not read `~/.zshrc`. Add `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` to `~/.zshenv` and restart Desktop so `run_shell` can find `rtk` (headless LaunchAgents already include common Homebrew paths).
   >
   > On the `v0.5.1` `cli` 9-tool surface, turning on [Optional WebCodex RTK guidance](README.en.md#new-features-and-improvements) in the extension sidebar directly injects `run_shell` RTK rules (no `work_on_project` needed). Only when using a surface that exposes `work_on_project` (`v0.5.0` or `adaptive`) do you need to create `rtk-instructions.md` next to `runner.toml` and attach it via `[instructions].files`:

   ```toml
   [instructions]
   files = ['/Users/your-name/Library/Application Support/dev.webcodex.desktop/local-connections/<account-dir>/rtk-instructions.md']
   ```

3. **`webcodex.env` compact & compatibility flags** (`~/Library/Application Support/dev.webcodex.desktop/runtime/local/webcodex.env`; restart WebCodex after editing):

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

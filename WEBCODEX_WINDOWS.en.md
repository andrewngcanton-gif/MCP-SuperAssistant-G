# Using WebCodex on Windows

<p align="center">
  <a href="WEBCODEX_WINDOWS.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="WEBCODEX_MACOS.en.md">macOS guide</a>
</p>

**Prerequisites & connecting**: Install and sign in to **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)** (tested on Windows with **[v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)** and compatible with **[v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**), add at least one local project folder, and have Node.js installed. Once the proxy is running on port `3006`, open the extension sidebar's connection settings, choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, click **Connect**, and verify the WebCodex tools are enabled in the **Tools** tab.

> **Note on `v0.5.0` vs `v0.5.1` tool count**: With `"X-WebCodex-MCP-Surface": "cli"`, `v0.5.0` exposes 17 tools, whereas `v0.5.1` exposes 9 core tools (`list_projects`, `run_shell`, `observe_jobs`, `stop_job`, `search_project_texts`, `read_files`, `edit_project_files`, `read_tool_manifest`, `call_runtime_tool`) with specialized tools available via `read_tool_manifest` + `call_runtime_tool`. Built-in extension meta-tools (`get_tool_schema`, `tool_lookup`) are handled locally in the content script and do not appear in the server tool list. Both versions work directly with the extension (including **Use RTK with WebCodex**).

---

## 1. One-click headless auto-start for WebCodex CLI & local Proxy (recommended)

**One cross-platform script + one hidden Scheduled Task**: silently launches **both** **WebCodex (`webcodex-server` + `webcodex-runner`)** and the **local SSE Proxy** after Windows sign-in — **no WebCodex Desktop window, no open terminal window, and zero manual path editing**. It reuses Desktop's env, runner config, and token while skipping its WebView2 GUI (~**480 MB** RAM saved; works in both **Windows PowerShell 5.1** and **PowerShell 7**).

**Prerequisites**: Sign in once in WebCodex Desktop and add your project(s) (creating `desktop-state.json`, `webcodex.env`, `runner.toml`, and `webcodex-user-token`), then quit WebCodex Desktop and **disable Desktop's own auto-start on login** (so it doesn't compete for port `60143`).

Run these two lines in **PowerShell** to download the script and register + start the task (no admin required):

```powershell
irm https://raw.githubusercontent.com/andrewngcanton-gif/MCP-SuperAssistant-G/custom/scripts/webcodex/start-mcp-webcodex.mjs -OutFile "$env:USERPROFILE\start-mcp-webcodex.mjs"
node "$env:USERPROFILE\start-mcp-webcodex.mjs" --install-headless
```

- **Offline / manual copy**: open [scripts/webcodex/start-mcp-webcodex.mjs](scripts/webcodex/start-mcp-webcodex.mjs), copy its raw contents to `$env:USERPROFILE\start-mcp-webcodex.mjs`, then run the second line.
- **Logs**: `$env:USERPROFILE\mcp-superassistant\` (if you installed WebCodex in a custom folder not detected automatically, set `$env:WEBCODEX_RUNTIME_DIR` and re-run `--install-headless`).
- **Clean legacy task / uninstall**: if you previously created the older `WebCodexCLI` task manually, remove it with `Unregister-ScheduledTask -TaskName WebCodexCLI -Confirm:$false -ErrorAction SilentlyContinue`; to remove tasks created by this script, run `node "$env:USERPROFILE\start-mcp-webcodex.mjs" --uninstall`.

---

## 2. Lightweight option: Keep WebCodex Desktop (foreground or Proxy-only auto-start)

If you prefer managing projects inside the **WebCodex Desktop** GUI, reuse the same `$env:USERPROFILE\start-mcp-webcodex.mjs`:

- **Foreground on demand** (keep the terminal open; refreshing pages or starting new chats reuses it):

  ```powershell
  node "$env:USERPROFILE\start-mcp-webcodex.mjs"
  ```

- **Silent background auto-start for Proxy only** (no terminal window; starts the port `3006` proxy only — enable WebCodex Desktop's own auto-start or launch Desktop when needed):

  ```powershell
  node "$env:USERPROFILE\start-mcp-webcodex.mjs" --install-proxy
  ```

<details>
<summary>Optional: Environment variable overrides</summary>

- `$env:WEBCODEX_PORT = "60143"`: override the WebCodex port
- `$env:TOKEN_PATH = "full_path"`: pick a specific `webcodex-user-token` when multiple logins exist
- `$env:PROXY_PORT = "3006"`: change the local SSE proxy port
- `$env:WEBCODEX_RUNTIME_DIR = "path"`: point to a non-standard `webcodex-runtime` folder
- `$env:NO_START = "1"`: update config only without launching the proxy

</details>

---

## 3. Manual configuration

<details>
<summary>Expand manual `mcp-config.json` & `npx` instructions</summary>

If you maintain your own `mcp-config.json`, merge this `webcodex` entry into `mcpServers` (updating the port and `<your WebCodex token>`):

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
- Signed in with **WebCodex Desktop**: find `webcodex-user-token` under `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\` and copy its plain-text content;
- Or via WebCodex CLI: `webcodex login ... --print-mcp-config` / `webcodex share`.

Launch the proxy and leave it running:

```powershell
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

</details>

---

<a id="webcodex-runner-config"></a>
<details>
<summary>Optional: WebCodex advanced config (runner.toml policy & RTK instructions, webcodex.env flags)</summary>

1. **`runner.toml` execution policy & RTK instruction injection** (find your exact file path with `Get-ChildItem "$env:LOCALAPPDATA\dev.webcodex.desktop\local-connections" -Recurse -File -Filter 'runner.toml' | Select-Object -ExpandProperty FullName`):

   - Recommended `[policy]` settings to enable `run_shell` safely within configured project roots:

     ```toml
     [policy]
     allow_raw_shell = true
     allow_cwd_anywhere = false
     allowed_roots = ['D:\your-projects-root']
     max_timeout_secs = 3600
     max_output_bytes = 262144
     ```

   - **Pair with [Optional WebCodex RTK guidance](README.en.md#new-features-and-improvements)**: On the `v0.5.1` `cli` 9-tool surface, turning on **Use RTK with WebCodex** in the extension sidebar directly injects `run_shell` RTK rules (no `work_on_project` needed). When using a surface that exposes `work_on_project` (`v0.5.0` or `adaptive`), you can also create `rtk-instructions.md` next to `runner.toml` and attach it via `[instructions].files` so `work_on_project` returns the compression rules too:

     ```toml
     [instructions]
     files = ['<path to your local-connections dir>\rtk-instructions.md']
     ```

     Example `rtk-instructions.md`:

     ```markdown
     # RTK output compression

     - When running supported commands on this Runner that produce verbose human-readable output, compress output with RTK before returning it: prefix the command with `rtk` in `run_shell` (e.g. `rtk git log -12`), or if `run_shell` is disabled, call `run_process` with `executable: "rtk"` and pass the original command and arguments in `args`. Use original commands for short outputs or unsupported commands.
     - Always run original commands for machine-readable output, structured verification evidence, full logs, releases, security checks, forensics, or hashes; inspect full output if compressed summary is insufficient.
     - Keep telemetry disabled; only run `rtk trust` with explicit user consent.
     ```

2. **`webcodex.env` server-side compact & compatibility flags** (on Windows, located at `%LOCALAPPDATA%\dev.webcodex.desktop\runtime\local\webcodex.env`; restart WebCodex server after editing):

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

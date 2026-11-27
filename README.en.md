# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G banner" width="640">
</p>

<p align="center">
  <a href="README.md">中文</a> &bull; <strong>English</strong>
</p>

**MCP SuperAssistant G** is a community-enhanced Chrome extension based on [MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) that lets web chats such as Gemini Web and Google AI Studio use local MCP tools directly. Compared to upstream, it focuses on fixing auto-submit and historical replay issues, shrinking tool prompts to save tokens, and adding out-of-the-box support for WebCodex and RTK. This repository provides the source—build it and load it in Chrome Developer mode.

The upstream baseline is commit `30bb204`. [`main` holds the upstream source snapshot, and `custom` is this project's default branch](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom).

This project supports and acknowledges the LINUX DO community. Thank you for giving developers a place to share their work and learn from one another. [LINUX DO](https://linux.do/)

## Contents

- [Changelog](#changelog)
- [Bug fixes](#bug-fixes)
- [New features and improvements](#new-features-and-improvements)
- [Install in Chrome](#install-in-chrome)
  - [1. Install the prerequisites](#1-install-the-prerequisites)
  - [2. Clone and build](#2-clone-and-build)
  - [3. Load the unpacked extension](#3-load-the-unpacked-extension)
  - [4. Connect an MCP server](#4-connect-an-mcp-server)
    - [Connect WebCodex](#connect-webcodex)
  - [5. Test and update](#5-test-and-update)
- [Known issues](#known-issues)
- [License](#license)

## Changelog

### v0.1.7 (2026-11-27)

- **Fixed Gemini's input cursor shifting or disappearing after inserting multiple tool results.** Switched the chip bar to a single-row horizontally scrollable strip and mounted it in the vertical composer wrapper above Gemini's `.text-input-field` so inserting 3+ tool results no longer crowds or hides the editor cursor.
- **Prevented 400 invalid-argument errors on `work_on_project` first calls.** Surfaced conditional required-parameter selectors (such as `project | client_id+path | session_id` and `oneOf`/`anyOf` schemas) in compact tool signatures so models do not omit the project source.

> For earlier releases, see the [full changelog (CHANGELOG.en.md)](CHANGELOG.en.md).

## Bug fixes

- **Gemini Auto Submit could stall.** The extension waits for an enabled Send button in the current composer, checks that the conversation and draft are still current, and clicks once. Batching ignores stale loading cards from earlier turns and continues to wait for active tools in the current batch.
- **Gemini manual sends could omit MCP Instructions.** **Insert** keeps the original preview chip. Type a task and use Gemini's Send button or Enter to merge the pending instructions into the draft before sending.
- **Gemini Usage pages could show a broken sidebar.** The chat sidebar is suspended on `/usage` and `/u/<account-index>/usage`. Its previous state is restored when you return to chat.
- **AI Studio could replay results from conversation history.** Historical tool cards remain manual. The extension also deduplicates automatic execution and result delivery when AI Studio redraws a current card.
- **Late AI Studio results could miss Auto Submit.** Eligible late results in the same conversation can still be delivered. When **Run** is busy, the extension waits for the original composer to become ready. Editing the draft or switching conversations cancels that pending send.
- **Auto Submit counted the configured delay twice.** The configured delay now applies once during batching. A 2-second setting saves about 2 seconds of fixed waiting. The separate Auto Insert delay, result batching, and button readiness checks still apply.

## New features and improvements

- **Optional WebCodex RTK guidance.** Install the RTK command-line tool on the machine running WebCodex Runner and make sure `rtk` is on the Runner's `PATH`. This works with stock WebCodex. **Instructions → Use RTK with WebCodex** is off by default. Enable WebCodex's `run_process` tool and turn on the toggle, then send the regenerated MCP Instructions to the chat. The guidance asks the model to use RTK for long output from suitable commands. To also return the rule from `work_on_project`, see [WebCodex advanced config (runner.toml / RTK instructions)](#webcodex-runner-config) to configure the Runner's `[instructions].files`. [RTK installation](https://github.com/rtk-ai/rtk)
- **WebCodex file-edit guidance.** Instructions spell out the required `project` and `changes` arguments for `edit_project_files`, including `kind` and `path` on every change. For complex content or after the first error, the guidance points the model to `run_shell` on the same WebCodex server when available, reducing repeated attempts and token use.
- **Shorter MCP Instructions.** The Compact and JSON templates use fewer words while retaining required arguments, schema lookup, call examples, and the WebCodex and RTK rules. The blanket instruction to retry after a schema hint was removed.
- **Opt-in CrewDispatch proxy setup.** The publicly released CrewDispatch plugin is outdated and will receive no further updates. Most users can leave this option off, which is the default. If you already have a working CrewDispatch MCP server, you can register it with the config generator. After changing the toggle, generate the config again and restart the proxy. [CrewDispatch setup](CUSTOMIZATIONS.en.md#crewdispatch-opt-in-proxy-configuration)
- **New icons and sidebar banner.** The extension and in-page MCP icons have been updated. The sidebar uses the new banner and its logo no longer opens an external site.

## Install in Chrome

### 1. Install the prerequisites

- Install Git, Node.js **22.12.0 or later**, and Chrome.
- Use **pnpm 9.15.1**. If you need it, run the following commands in a terminal.

```bash
npm install --global pnpm@9.15.1
pnpm --version
```

On Windows, run the commands below in **Git Bash**. If you prefer PowerShell, run `bash --version` first to make sure it can find Bash, which the build scripts use.

### 2. Clone and build

```bash
git clone --branch custom --single-branch https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G.git
cd MCP-SuperAssistant-G
pnpm install --frozen-lockfile
pnpm build
```

After the build, the project's `dist/` directory contains `manifest.json`. Keep this directory in place for Chrome to load.

### 3. Load the unpacked extension

1. Open `chrome://extensions/` and turn on **Developer mode**.
2. If you have the upstream extension or another build installed, disable those copies to avoid running two content scripts on the same site.
3. Click **Load unpacked** and select **`MCP-SuperAssistant-G/dist`**, the directory containing `manifest.json`.
4. Open a Gemini or Google AI Studio chat. Refresh any chat tab that was already open and look for the **MCP** button near the composer or the sidebar.

### 4. Connect an MCP server

If you already have an MCP endpoint that the extension can reach, enter its transport type and URL in the sidebar. For local `stdio` tools or to expose multiple servers through one endpoint, use the upstream MCP SuperAssistant Proxy.

1. Prepare your own `mcp-config.json` with the server entries supplied by your tools in `mcpServers`.
2. In a terminal in the same directory as that config, run this command and leave the proxy running.

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. Open the extension sidebar's connection settings. Choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once it says **Connected**, check the **Tools** tab to see that the tools you need are enabled.

See the [upstream proxy guide](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server) for example server configurations and other transports.

#### Connect WebCodex

[WebCodex](https://github.com/yyjeqhc/webcodex) ([download v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)) exposes your local project folders as MCP tools (reading files, searching code, running shell commands) so web chats like Gemini and Google AI Studio can work directly with your local codebase.

The connection chain looks like this (the local proxy bridges SSE for the extension to WebCodex's `/mcp` Streamable HTTP endpoint):

```text
Web AI (Gemini / AI Studio) ←→ Browser Extension ←→ Local Proxy (SSE) ←→ WebCodex (Local Projects)
```

Follow these 3 steps (using local WebCodex **0.5.0** as an example):

1. **Get WebCodex running**
   - Start the WebCodex server (or Desktop app) and Runner, make sure the Runner shows as **Connected**, and register the local project folder(s) you want the AI to access.
   - Note WebCodex's local port (`60143` in the examples below; adjust if you configured a different port).

2. **Create the proxy config file (choose one option)**
   - **Option A (Recommended on Windows — auto-read token & write config)**: Make sure you are signed in to WebCodex Desktop first, then run this script in **PowerShell 7** (`pwsh`). It finds your local `webcodex-user-token` file and writes `%LOCALAPPDATA%\mcp-superassistant-webcodex.json` (preserving any existing `mcpServers` entries):

     ```powershell
     # 1) List local signed-in WebCodex token file paths
     $profileRoot = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop/local-connections'
     Get-ChildItem -LiteralPath $profileRoot -Recurse -File -Filter 'webcodex-user-token' |
         Select-Object -ExpandProperty FullName

     # 2) Paste one full path from above when prompted (pick the one matching your server/account)
     $tokenPath = (Read-Host 'Full path of the token file for this WebCodex login').Trim('"')
     $token = (Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
     if (-not $token) { throw 'The WebCodex token file is empty.' }

     # 3) Write or update the proxy config file (change $configPath if using an existing mcp-config.json)
     $configPath = Join-Path $env:LOCALAPPDATA 'mcp-superassistant-webcodex.json'
     $config = if (Test-Path -LiteralPath $configPath) {
         Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop
     } else {
         @{ mcpServers = @{} }
     }
     if (-not $config.Contains('mcpServers')) { $config['mcpServers'] = @{} }
     $config.mcpServers['webcodex'] = @{
         type = 'streamable-http'
         url = 'http://127.0.0.1:60143/mcp'
         headers = @{
             'X-WebCodex-MCP-Surface' = 'cli'
             'Authorization' = "Bearer $token"
         }
     }
     $config | ConvertTo-Json -Depth 32 | Set-Content -LiteralPath $configPath -Encoding utf8 -ErrorAction Stop
     ```

     > If nothing is listed, sign in to that connection in WebCodex Desktop first, or issue a user API token from the WebCodex server and use Option B below.

   - **Option B (Manual config or non-Windows)**: Merge this `webcodex` entry into `mcpServers` in your proxy's `mcp-config.json` (updating the port and `<your WebCodex token>`):

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

     How to get `<your WebCodex token>` (keep it local only — never commit it or share it publicly):
     - Run `webcodex login ... --print-mcp-config` with the WebCodex CLI (or `webcodex share` for a quick session) and copy the Bearer token printed in the terminal;
     - If you signed in with **WebCodex Desktop**, look for the `webcodex-user-token` file in its local connections directory (on Windows, under `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\`, the same file Option A reads) and copy its plain-text content;
     - Or use a user API token issued directly by your self-hosted WebCodex server.

3. **Start the proxy and connect in the extension**
   - For **Option A**, start (or restart) the proxy with the command below and leave it running; for **Option B**, point `--config` to your own `./mcp-config.json`:

     ```powershell
     npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
     ```

   - In the extension sidebar's connection settings, choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once **Connected**, open the **Tools** tab and confirm the WebCodex tools (such as `webcodex.list_projects` and `webcodex.run_shell`) are listed and enabled.

<a id="webcodex-runner-config"></a>
<details>
<summary>Optional: WebCodex advanced config (runner.toml policy & RTK instructions, webcodex.env flags)</summary>

1. **`runner.toml` execution policy & RTK instruction injection** (located at the `runner.toml` path found below):

   - Recommended `[policy]` settings to enable `run_shell` safely within configured project roots:

     ```toml
     [policy]
     allow_raw_shell = true
     allow_cwd_anywhere = false
     allowed_roots = ['D:\your-projects-root']
     max_timeout_secs = 3600
     max_output_bytes = 262144
     ```

   - **Pair with [Optional WebCodex RTK guidance](#new-features-and-improvements)**: create `rtk-instructions.md` next to `runner.toml` and attach it via `[instructions].files` so `work_on_project` also returns the RTK compression rules to the model:

     ```toml
     [instructions]
     files = ['<path to your local-connections dir>\rtk-instructions.md']
     ```

     Example `rtk-instructions.md`:

     ```markdown
     # RTK output compression

     - When running supported commands on this Runner that produce verbose human-readable output, compress output with RTK before returning it: call `run_process` with `executable: "rtk"` and pass the original command and arguments in `args` (e.g. `["git","log","-12"]`). Use original commands for short outputs or unsupported commands.
     - Always run original commands for machine-readable output, structured verification evidence, full logs, releases, security checks, forensics, or hashes; inspect full output if compressed summary is insufficient.
     - Keep telemetry disabled; only run `rtk trust` with explicit user consent.
     ```

2. **`webcodex.env` server-side compact & compatibility flags** (on Windows, located at `%LOCALAPPDATA%\dev.webcodex.desktop\runtime\local\webcodex.env`; restart WebCodex server after editing):

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

<details>
<summary>Optional (Windows): Headless auto-start on login for WebCodex CLI & local Proxy (saves ~480 MB RAM, no open terminal windows)</summary>

If you don't want to manually open **WebCodex Desktop** or keep a terminal window open, you can register two hidden Windows Scheduled Tasks that launch `webcodex-server` + `webcodex-runner` and the local SSE proxy after sign-in. They reuse the exact env file, runner config, and token created by WebCodex Desktop while skipping its WebView2 GUI (~480 MB RAM saved).

**Prerequisites**: Sign in once in WebCodex Desktop and register your project(s) so `webcodex.env` and `runner.toml` exist, then quit Desktop and **disable WebCodex Desktop's own auto-start on login** (so it doesn't compete with headless `WebCodexCLI` for port `60143`), and complete **Step 2** above to generate your proxy config file.

1. Find your `runner.toml` path (needed for the launcher script below):

   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\dev.webcodex.desktop\local-connections" -Recurse -File -Filter 'runner.toml' |
       Select-Object -ExpandProperty FullName
   ```

2. Create `$env:USERPROFILE\mcp-superassistant\` and save these two scripts inside it (replace `<WebCodex Desktop install dir>` and `<full path to runner.toml>`):

   **`start-webcodex-cli.ps1`** (starts `webcodex-server` + `webcodex-runner` hidden and restarts exited components every 15s):

   ```powershell
   $ErrorActionPreference = "Stop"

   # Workaround for Windows PowerShell 5.1: clear lowercase duplicate proxy env vars so Start-Process won't throw
   foreach ($name in @('http_proxy','https_proxy','no_proxy','all_proxy')) {
       [System.Environment]::SetEnvironmentVariable($name, $null, 'Process')
   }

   $runtimeDir = "<WebCodex Desktop install dir>\webcodex-runtime"
   $serverExe  = Join-Path $runtimeDir "webcodex-server.exe"
   $runnerExe  = Join-Path $runtimeDir "webcodex-runner.exe"
   $envFile    = Join-Path $env:LOCALAPPDATA "dev.webcodex.desktop\runtime\local\webcodex.env"
   $runnerCfg  = "\\?\<full path to runner.toml>"
   $logDir     = Join-Path $env:USERPROFILE "mcp-superassistant"
   $mainLog    = Join-Path $logDir "webcodex-cli.log"
   $serverLog  = Join-Path $logDir "webcodex-server.log"
   $runnerLog  = Join-Path $logDir "webcodex-runner.log"

   function Write-Log($msg) {
       Add-Content -Path $mainLog -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" -Encoding utf8
   }

   foreach ($f in @($serverExe, $runnerExe, $envFile, $runnerCfg)) {
       if (-not (Test-Path -LiteralPath $f)) { Write-Log "ERROR: missing path: $f"; exit 1 }
   }

   if (Get-NetTCPConnection -LocalPort 60143 -State Listen -ErrorAction SilentlyContinue) {
       Write-Log "WebCodex server already listening on 60143. Exiting."
       exit 0
   }

   function Start-Component($name, $exe, $argList, $outLog) {
       $proc = Start-Process -FilePath $exe -ArgumentList $argList -WindowStyle Hidden `
           -RedirectStandardOutput $outLog -RedirectStandardError "$outLog.err" -PassThru
       Write-Log "Started $name (PID $($proc.Id))"
       return ,$proc
   }

   $server = Start-Component "server" $serverExe @('--env-file', $envFile) $serverLog
   $ready = $false
   for ($i = 0; $i -lt 60; $i++) {
       if (Get-NetTCPConnection -LocalPort 60143 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
       Start-Sleep -Seconds 1
   }
   if (-not $ready) { Write-Log "ERROR: webcodex-server did not bind 60143 within 60s."; exit 1 }

   $runner = Start-Component "runner" $runnerExe @('--config', $runnerCfg) $runnerLog
   Start-Sleep -Seconds 2

   $components = @(
       @{ Name='server'; Proc=$server; Exe=$serverExe; Args=@('--env-file',$envFile); Log=$serverLog },
       @{ Name='runner'; Proc=$runner; Exe=$runnerExe; Args=@('--config',$runnerCfg); Log=$runnerLog }
   )
   while ($true) {
       Start-Sleep -Seconds 15
       foreach ($c in $components) {
           $c.Proc.Refresh()
           if ($c.Proc.HasExited) {
               Write-Log "$($c.Name) exited (code $($c.Proc.ExitCode)). Restarting..."
               $c.Proc = Start-Component $c.Name $c.Exe $c.Args $c.Log
           }
       }
   }
   ```

   **`start-proxy.ps1`** (waits for `127.0.0.1:60143/mcp` to answer HTTP requests, then launches the SSE proxy on port `3006`):

   ```powershell
   $ErrorActionPreference = "Stop"
   $workDir      = Join-Path $env:USERPROFILE "mcp-superassistant"
   $logFile      = Join-Path $workDir "proxy.log"
   $configPath   = Join-Path $env:LOCALAPPDATA "mcp-superassistant-webcodex.json"
   $webcodexPort = 60143

   function Write-Log($msg) {
       Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" -Encoding utf8
   }

   if (Get-NetTCPConnection -LocalPort 3006 -State Listen -ErrorAction SilentlyContinue) {
       Write-Log "Proxy already listening on 3006. Exiting."
       exit 0
   }

   # Any HTTP response (including 401) means the MCP endpoint is ready
   $ready = $false
   for ($i = 0; $i -lt 90; $i++) {
       if (Get-NetTCPConnection -LocalPort $webcodexPort -State Listen -ErrorAction SilentlyContinue) {
           try {
               $resp = Invoke-WebRequest -Uri "http://127.0.0.1:${webcodexPort}/mcp" -Method Get -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
               $ready = $true; Write-Log "WebCodex ready (HTTP $([int]$resp.StatusCode))."; break
           } catch {
               if ($_.Exception.Response) {
                   $ready = $true; Write-Log "WebCodex ready (HTTP $([int]$_.Exception.Response.StatusCode))."; break
               }
           }
       }
       Start-Sleep -Seconds 2
   }
   if (-not $ready) { Write-Log "ERROR: WebCodex MCP endpoint timeout."; exit 1 }

   Set-Location $workDir
   & npx.cmd -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config $configPath --outputTransport sse --port 3006 2>&1 |
       ForEach-Object { Write-Output $_; Write-Log $_ }
   ```

3. Register both hidden login tasks for your Windows user and start them immediately (no admin privileges required):

   ```powershell
   $dir = Join-Path $env:USERPROFILE "mcp-superassistant"
   $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
       -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
   $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

   foreach ($item in @(
       @{ Name = 'WebCodexCLI';            Script = (Join-Path $dir 'start-webcodex-cli.ps1') },
       @{ Name = 'McpSuperAssistantProxy'; Script = (Join-Path $dir 'start-proxy.ps1') }
   )) {
       $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
           -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$($item.Script)`""
       Register-ScheduledTask -TaskName $item.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
       Start-ScheduledTask -TaskName $item.Name
   }
   ```

   To remove auto-start later: `Unregister-ScheduledTask -TaskName WebCodexCLI, McpSuperAssistantProxy -Confirm:$false`.

</details>

### 5. Test and update

- Open the **MCP** menu by the composer, click **Insert** to add MCP Instructions, and send them with a read-only test request (with WebCodex, ask it to list your projects to verify `list_projects`). When the model produces a tool card, click **Run** to test it manually before enabling any automatic execution, insertion, or submission.
- To update, run `git pull --ff-only`, `pnpm install --frozen-lockfile`, and `pnpm build` in the project directory. Click **Reload** for this extension in `chrome://extensions/` and refresh open chat tabs. If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

## Known issues

- **Gemini may drift from tool-calling rules in long conversations.** If it stops following the calling format, open the **MCP** hover menu next to the composer and click **Remind** (or **规则提醒** in Simplified Chinese) to insert a lightweight rule reminder. Because the full tool list and parameter descriptions sent earlier are already in the conversation history, the model only needs a brief format nudge rather than re-sending the entire MCP Instructions via **Insert** or **Attach**, which saves significant tokens—re-send the full instructions only in a new chat or after changing enabled tools.
- **Gemini may occasionally clear its thinking/progress indicator and stop with a blank reply.** In long sessions or high-reasoning modes, a turn after receiving tool results can occasionally roll back or end empty, pausing the tool chain. Usually **no page refresh is needed**—just send a short message such as `continue` or `?` in the same chat to resume (the previous tool result is already in the conversation context). If it stopped near a file write or Git command, ask the model to verify the current workspace state before continuing; only refresh the tab if the page itself becomes unresponsive.
- **Tool calls can return HTTP 400 or time out.** The model can sometimes recover by switching tools. The MCP Instructions explicitly tell the model to switch from WebCodex's `edit_project_files` to `run_shell` on the same server after the first error, if available. Recovery from other tool errors or timeouts depends on the model and the error. If a file edit times out, check whether the file changed before retrying.
- **Tested environment.** This extension has only been tested in Chrome on Windows 11.

## License

This project (**MCP SuperAssistant G**) and its additions and modifications on the `custom` branch are licensed under the [GNU General Public License v3.0 or later (GPL-3.0-or-later)](LICENSE), Copyright (c) 2026 `andrewngcanton-gif`.

The upstream baseline is derived from [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant) (commit `30bb204`), whose original MIT License and copyright notice are preserved verbatim in [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT). Thanks to the upstream authors and contributors.

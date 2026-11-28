# Using WebCodex on Windows

<p align="center">
  <a href="WEBCODEX_WINDOWS.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="WEBCODEX_MACOS.en.md">macOS guide</a>
</p>

Follow these 3 steps (compatible with local WebCodex **0.5.0** and **0.5.1**; examples below follow our tested **v0.5.0** setup):

## 1. Get WebCodex running

- Start **[WebCodex Desktop v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)** (also compatible with **[v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**) or Server and Runner, make sure the Runner shows as **Connected**, and register the local project folder(s) you want the AI to access.
- Note WebCodex's local port (usually `60143`; if `v0.5.1` or a custom setup uses another port, Option A auto-reads `runtime.server_url` from `desktop-state.json`, while Option B should update it manually).

## 2. Create the proxy config file (choose one option)

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

  # 3) Auto-detect local endpoint & write proxy config (change $configPath if using an existing mcp-config.json)
  $serverBase = 'http://127.0.0.1:60143'
  $statePath = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop/desktop-state.json'
  if (Test-Path -LiteralPath $statePath) {
      try {
          $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json -ErrorAction Stop
          if ($state.runtime.server_url) { $serverBase = $state.runtime.server_url.TrimEnd('/') }
      } catch {}
  }

  $configPath = Join-Path $env:LOCALAPPDATA 'mcp-superassistant-webcodex.json'
  $config = if (Test-Path -LiteralPath $configPath) {
      Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop
  } else {
      @{ mcpServers = @{} }
  }
  if (-not $config.Contains('mcpServers')) { $config['mcpServers'] = @{} }
  $config.mcpServers['webcodex'] = @{
      type = 'streamable-http'
      url = "$serverBase/mcp"
      headers = @{
          'X-WebCodex-MCP-Surface' = 'cli'
          'Authorization' = "Bearer $token"
      }
  }
  $config | ConvertTo-Json -Depth 32 | Set-Content -LiteralPath $configPath -Encoding utf8 -ErrorAction Stop
  ```

  > If nothing is listed, sign in to that connection in WebCodex Desktop first, or issue a user API token from the WebCodex server and use Option B below.

- **Option B (Manual config)**: Merge this `webcodex` entry into `mcpServers` in your proxy's `mcp-config.json` (updating the port and `<your WebCodex token>`):

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

## 3. Start the proxy and connect in the extension

- For **Option A**, start (or restart) the proxy with the command below and leave it running; for **Option B**, point `--config` to your own `./mcp-config.json`:

  ```powershell
  npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
  ```

- In the extension sidebar's connection settings, choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once **Connected**, open the **Tools** tab and confirm the WebCodex tools (such as `webcodex.list_projects` and `webcodex.run_shell`) are listed and enabled.

  > **Note on `v0.5.0` vs `v0.5.1` tool count**: With `"X-WebCodex-MCP-Surface": "cli"`, `v0.5.0` exposes 17 tools, whereas `v0.5.1` exposes 9 core tools (`list_projects`, `run_shell`, `observe_jobs`, `stop_job`, `search_project_texts`, `read_files`, `edit_project_files`, `read_tool_manifest`, `call_runtime_tool`) with specialized tools available via `read_tool_manifest` + `call_runtime_tool`. Both versions work directly with the extension (including **Use RTK with WebCodex**).

---

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

   - **Pair with [Optional WebCodex RTK guidance](README.en.md#new-features-and-improvements)**: On the `v0.5.1` `cli` 9-tool surface, turning on **Use RTK with WebCodex** in the extension sidebar directly injects `run_shell` RTK rules (no `work_on_project` needed). When using a surface that exposes `work_on_project` (`v0.5.0` or `adaptive`), you can also create `rtk-instructions.md` next to `runner.toml` and attach it via `[instructions].files` so `work_on_project` returns the compression rules too:

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

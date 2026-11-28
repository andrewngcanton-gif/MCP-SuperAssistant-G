# Windows 与 WebCodex 配合使用指南

<p align="center">
  <strong>中文</strong> &bull; <a href="WEBCODEX_WINDOWS.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="WEBCODEX_MACOS.md">macOS 指南</a>
</p>

按下面 3 步即可接通（兼容本地 WebCodex **0.5.0** 与 **0.5.1**；以下以实测的 **v0.5.0** 环境为例）：

## 1. 准备好 WebCodex

- 启动 **[WebCodex Desktop v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)**（同样兼容 **[v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**）或服务端与 Runner，确认界面里显示 Runner **已连接**，并添加好你要让 AI 访问的本地项目目录。
- 记下 WebCodex 服务的本地端口（固定端口通常为 `60143`；若 `v0.5.1` 或自定义配置使用其他端口，方式 A 脚本会自动从 `desktop-state.json` 读取，方式 B 请手动替换）。

## 2. 生成代理配置文件（二选一）

- **方式 A（推荐，Windows 一键读取并生成）**：先确保已在 WebCodex Desktop 中登录；在 **PowerShell 7**（`pwsh`）里运行下面整段脚本，它会自动查找你本机的 `webcodex-user-token` 文件，并把配置写入 `%LOCALAPPDATA%\mcp-superassistant-webcodex.json`（如果该文件已有其它 MCP 服务，脚本会保留原有条目）：

  ```powershell
  # 1) 列出本机已登录的 WebCodex token 文件路径
  $profileRoot = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop/local-connections'
  Get-ChildItem -LiteralPath $profileRoot -Recurse -File -Filter 'webcodex-user-token' |
      Select-Object -ExpandProperty FullName

  # 2) 复制上面输出的完整路径粘贴到提示后（若有多条，选目标服务和账号对应的那一条）
  $tokenPath = (Read-Host 'Full path of the token file for this WebCodex login').Trim('"')
  $token = (Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
  if (-not $token) { throw 'The WebCodex token file is empty.' }

  # 3) 自动探测本地地址并写入代理配置文件（已有自建 mcp-config.json 时可把下面路径改成你的文件）
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

  > 若脚本没有列出任何文件路径，说明尚未在 WebCodex Desktop 登录该连接；请先在桌面端完成登录，或直接在 WebCodex 服务端签发用户 API token 后改用下面的方式 B。

- **方式 B（手动编写）**：将下面条目加入你的代理配置文件 `mcp-config.json`（按实际修改端口和 `<你的 WebCodex token>`）：

  ```json
  {
    "mcpServers": {
      "webcodex": {
        "type": "streamable-http",
        "url": "http://127.0.0.1:60143/mcp",
        "headers": {
          "X-WebCodex-MCP-Surface": "cli",
          "Authorization": "Bearer <你的 WebCodex token>"
        }
      }
    }
  }
  ```

  `<你的 WebCodex token>` 可通过以下任一方式获取（仅保存在本地配置文件，切勿提交到仓库或公开分享）：
  - 使用 WebCodex CLI 登录时带上 `--print-mcp-config`（如 `webcodex login ... --print-mcp-config`），或使用临时试用命令 `webcodex share`，终端会直接打印连接地址与对应的 Bearer token；
  - 已登录 **WebCodex Desktop** 时，可在桌面端本地连接目录找到 `webcodex-user-token` 文件（Windows 位于 `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\` 下，即方式 A 脚本读取的同一文件），复制其中的纯文本内容；
  - 使用自建服务端时，也可直接填入由同一 WebCodex 服务端为你签发的用户 API token。

## 3. 启动代理并在扩展中连接

- 如果采用 **方式 A**，运行下面命令启动（或重启）代理并保持窗口开启；如果采用 **方式 B**，把 `--config` 换成你自己的 `./mcp-config.json` 路径：

  ```powershell
  npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
  ```

- 打开网页侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse` 后点击 **Connect**。显示 **Connected** 后，切换到 **Tools** 标签页，确认已能看到并勾选 WebCodex 工具（例如 `webcodex.list_projects`、`webcodex.run_shell` 等）。

  > **关于 `v0.5.0` 与 `v0.5.1` 工具数量说明**：带上 `"X-WebCodex-MCP-Surface": "cli"` 时，`v0.5.0` 会返回 17 个工具；`v0.5.1` 会精简返回 9 个核心工具（`list_projects`、`run_shell`、`observe_jobs`、`stop_job`、`search_project_texts`、`read_files`、`edit_project_files`、`read_tool_manifest`、`call_runtime_tool`），其余专用工具可通过 `read_tool_manifest` 与 `call_runtime_tool` 按需发现调用。两种版本均可直接配合本扩展使用（包括 **在 WebCodex 中使用 RTK** 开关）。

---

<a id="webcodex-runner-config"></a>
<details>
<summary>可选：WebCodex 进阶配置（runner.toml 权限与 RTK 指令注入、webcodex.env 省 token 参数）</summary>

1. **`runner.toml` 执行策略与 RTK 指令注入**（文件位于下方找到的 `runner.toml` 路径）：

   - 推荐的 `[policy]` 权限与超限控制（允许在受限项目目录下执行 `run_shell`，避免越界访问）：

     ```toml
     [policy]
     allow_raw_shell = true
     allow_cwd_anywhere = false
     allowed_roots = ['D:\你的工作目录']
     max_timeout_secs = 3600
     max_output_bytes = 262144
     ```

   - **与 [WebCodex RTK 开关](README.md#新功能与改进) 联动**：在 `v0.5.1` `cli` 9 工具模式下，打开扩展侧栏的 **在 WebCodex 中使用 RTK** 开关即可直接为 `run_shell` 注入 RTK 规则（无需 `work_on_project`）；如果你使用的是暴露了 `work_on_project` 的 `v0.5.0` 或 `adaptive` 工具面，还可以额外在 `runner.toml` 同目录新建 `rtk-instructions.md`，并通过 `[instructions].files` 挂载，让模型打开项目时一并拿到压缩规则：

     ```toml
     [instructions]
     files = ['<你的 local-connections 账号目录>\rtk-instructions.md']
     ```

     `rtk-instructions.md` 参考内容：

     ```markdown
     # RTK 输出压缩

     - 在本 Runner 上执行预计有大量人读输出的受支持命令时，用 RTK 在工具返回前压缩输出。用 WebCodex 的 `run_process`，把 `executable` 设为 `rtk`，把原命令和各参数按原顺序放入 `args`，例如 `["git","log","-12"]`。工具不支持或预期输出本就很短时用原命令。
     - 机器可读输出、结构化验证证据、完整日志、发布、安全核查、取证或哈希使用原命令；摘要不足时补读完整输出。
     - 遥测保持关闭；仅在明确需要并同意时才运行 `rtk trust`。
     ```

2. **`webcodex.env` 服务端精简与兼容参数**（Windows 默认位于 `%LOCALAPPDATA%\dev.webcodex.desktop\runtime\local\webcodex.env`，修改后需重启 WebCodex 服务）：

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

<details>
<summary>可选（Windows）：无界面开机自启 WebCodex CLI 与本地 Proxy（省约 480 MB 内存，免开终端窗口）</summary>

如果不想每次手动启动 **WebCodex Desktop** 和终端窗口，可以用 Windows 计划任务在登录后后台静默拉起 `webcodex-server` + `webcodex-runner` 与本地 Proxy（直接复用桌面端已配置好的环境与 token，同时省去桌面端 WebView2 进程约 480 MB 内存）。

**前置条件**：至少先打开过一次 WebCodex Desktop 完成登录和项目添加（以生成 `webcodex.env` 和 `runner.toml`），配置完成后彻底退出桌面端界面并**关闭 WebCodex Desktop 自身的开机自启**（避免与无界面 `WebCodexCLI` 争抢 `60143` 端口）；同时已按上面「第 2 步」生成好配置文件。

1. 先查看你的 `runner.toml` 路径（后面会填进脚本）：

   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\dev.webcodex.desktop\local-connections" -Recurse -File -Filter 'runner.toml' |
       Select-Object -ExpandProperty FullName
   ```

2. 新建目录 `$env:USERPROFILE\mcp-superassistant\`，并在其中创建以下两个启动脚本（将 `<你的 WebCodex Desktop 安装目录>` 和 `<你的 runner.toml 完整路径>` 替换成你本机的实际路径）：

   **`start-webcodex-cli.ps1`**（无界面拉起 `webcodex-server` + `webcodex-runner`，并每 15 秒巡检保活）：

   ```powershell
   $ErrorActionPreference = "Stop"

   # 兼容 Windows PowerShell 5.1：移除代理工具注入的小写重复环境变量，避免 Start-Process 报错
   foreach ($name in @('http_proxy','https_proxy','no_proxy','all_proxy')) {
       [System.Environment]::SetEnvironmentVariable($name, $null, 'Process')
   }

   $runtimeDir = "<你的 WebCodex Desktop 安装目录>\webcodex-runtime"
   $serverExe  = Join-Path $runtimeDir "webcodex-server.exe"
   $runnerExe  = Join-Path $runtimeDir "webcodex-runner.exe"
   $envFile    = Join-Path $env:LOCALAPPDATA "dev.webcodex.desktop\runtime\local\webcodex.env"
   $runnerCfg  = "\\?\<你的 runner.toml 完整路径>"
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

   **`start-proxy.ps1`**（等 `127.0.0.1:60143/mcp` 真正就绪后，再启动 `3006` 端口本地 SSE Proxy）：

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

   # 等待 WebCodex MCP 接口真正返回 HTTP 响应（哪怕是 401 也说明已就绪）
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

3. 注册为当前用户的开机（登录后）静默计划任务并立即启动（无需管理员权限）：

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

   如需取消开机自启，运行：`Unregister-ScheduledTask -TaskName WebCodexCLI, McpSuperAssistantProxy -Confirm:$false`。

</details>

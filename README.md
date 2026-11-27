# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G 横幅" width="640">
</p>

<p align="center">
  <strong>中文</strong> &bull; <a href="README.en.md">English</a>
</p>

**MCP SuperAssistant G** 是基于 [原版 MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) 的社区增强版 Chrome 扩展，让 Gemini 网页版、Google AI Studio 等网页 AI 直接使用本地 MCP 工具。相比原版，重点修复了自动发送与历史对话回放问题，大幅精简了省 token 的工具说明，并针对 WebCodex 与 RTK 做了开箱适配。本项目通过 GitHub 提供源码，按下方步骤自行构建后在 Chrome 开发者模式加载即可使用。

原版基线为 `30bb204`。 [`main` 保存原版源码快照，`custom` 是本项目的默认分支](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom)。

本项目支持并认可 LINUX DO 社区，感谢社区为开发者提供分享和交流的空间。 [LINUX DO 社区](https://linux.do/)

## 目录

- [更新记录](#更新记录)
- [相比原版修复了什么](#相比原版修复了什么)
- [新功能与改进](#新功能与改进)
- [在 Chrome 中安装](#在-chrome-中安装)
  - [1. 准备构建环境](#1-准备构建环境)
  - [2. 获取源码并构建](#2-获取源码并构建)
  - [3. 加载已解压的扩展](#3-加载已解压的扩展)
  - [4. 连接 MCP 服务器](#4-连接-mcp-服务器)
    - [与 WebCodex 配合使用](#与-webcodex-配合使用)
  - [5. 试跑并更新](#5-试跑并更新)
- [已知问题](#已知问题)
- [许可证](#许可证)

## 更新记录

### v0.1.9（2026-11-27）

- **修复 Gemini 与 AI Studio 发送 `规则提醒（Remind）` 合并提示词后误折叠为空白“工具结果”且无法展开。** 发送提醒消息时，你的提问原文会保留在折叠条上方，下方折叠条正确显示为 **MCP提醒** 并可正常点击展开查看全文；同时收紧工具结果识别，正文里顺带提到 `<function_result>` 不再被误折叠。
- **修复 AI Studio Build / Apps 首页按钮错位与工作区结果不折叠。** 将 `/app/apps` 首页的 MCP 按钮移至与 `+` 号同一行右侧对齐，并支持 `/apps/<id>` 左侧对话气泡自动折叠工具结果与提醒上下文。
- **在 Gemini 的 `规则提醒` 中补充 `python -c` 引导。** 长对话中段点击 **规则提醒** 后也会继续提醒模型用简短 `python -c` 替代容易出错的长 PowerShell 脚本。

> 更早版本的更新说明见 [完整更新记录（CHANGELOG.md）](CHANGELOG.md)。

## 相比原版修复了什么

- **Gemini 自动发送卡住。** 等待当前输入框可用的发送按钮，在确认会话和草稿仍有效后只点击一次。合批时过滤残留的历史加载卡片，继续等待本批仍在运行的工具。
- **Gemini 手动发送漏带 MCP Instructions。** **Insert** 保留原来的小卡片。输入任务后点击 Gemini 的原生发送按钮或按 Enter，待发送的指令会随草稿合并发出。
- **Gemini 用量页侧栏显示异常。** 在 `/usage` 与 `/u/<账号序号>/usage` 暂停显示聊天侧栏，返回聊天时恢复之前的侧栏状态。
- **AI Studio 打开历史对话时重复执行或回传结果。** 历史工具卡片保持手动操作，当前工具调用因卡片重新渲染产生的重复自动执行和结果回传会被去重。
- **AI Studio 晚到的工具结果无法自动发送。** 同一会话内仍有效的晚到结果可以继续回传。**Run** 忙时等待原输入框就绪，编辑草稿或切换会话会取消待发送。
- **Auto Submit 重复等待。** 配置的 Auto Submit 延时在合批阶段计入一次。设为 2 秒时，可省去约 2 秒的固定等待。Auto Insert 的独立延时、合批和按钮就绪检查仍然适用。

## 新功能与改进

- **WebCodex RTK 开关。** 先在运行 WebCodex Runner 的机器上安装 RTK 命令行工具，并确保 Runner 能在 `PATH` 中找到 `rtk`。直接使用原版 WebCodex 即可。侧栏 **Instructions → Use RTK with WebCodex** 默认关闭。启用 WebCodex 的 `run_process` 并打开开关后，将重新生成的 MCP Instructions 发到对话。指令会提示模型使用 RTK 压缩适用命令的长输出。若还希望 `work_on_project` 在打开项目时一并返回同一规则，可按 [WebCodex 进阶配置（runner.toml / RTK 指令注入）](#webcodex-runner-config) 配置 Runner 的 `[instructions].files`。 [RTK 安装说明](https://github.com/rtk-ai/rtk)
- **WebCodex 文件编辑规则。** 指令说明 `edit_project_files` 必须提供 `project` 和 `changes`，每项包含 `kind` 和 `path`。内容复杂或首次报错时，提示模型改用同一 WebCodex 服务上可用的 `run_shell`，以减少重复尝试和 token 消耗。
- **更短的 MCP Instructions。** 精简 Compact 和 JSON 两种模板的自然语言，保留必填参数、schema 查询方式、调用示例以及 WebCodex 和 RTK 规则。去掉收到 schema 错误提示就重试的通用指令。
- **CrewDispatch 代理配置开关。** CrewDispatch 插件的公开发布版已过时，后续不再更新。大多数用户可以忽略此选项，保持默认关闭。已有可运行的 CrewDispatch MCP 服务时，可以用配置生成器注册。修改开关后，重新生成代理配置并重启代理即可生效。 [CrewDispatch 配置指南](CUSTOMIZATIONS.md#crewdispatch-opt-in-proxy-configuration)
- **新图标和侧栏横幅。** 更新扩展和网页内的 MCP 图标，使用新版侧栏横幅，并移除横幅原有的站外跳转。

## 在 Chrome 中安装

### 1. 准备构建环境

- 安装 Git、Node.js **22.12.0 或更新版本**以及 Chrome。
- 使用 **pnpm 9.15.1**。如果没有这个版本，可在终端运行以下命令安装。

```bash
npm install --global pnpm@9.15.1
pnpm --version
```

Windows 用户可直接在 **Git Bash** 里执行下面的构建命令。若使用 PowerShell，先用 `bash --version` 确认终端可以找到 Bash，构建脚本会调用它。

### 2. 获取源码并构建

```bash
git clone --branch custom --single-branch https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G.git
cd MCP-SuperAssistant-G
pnpm install --frozen-lockfile
pnpm build
```

成功后，项目根目录下的 `dist/` 会包含 `manifest.json`。保留这个目录供 Chrome 加载（扩展本体与通过 `npx` 启动的代理均为跨平台前端/Node 产物，Windows、macOS 与 Linux Chrome 共用同一套 `dist/`，无需按系统重新编译；也可直接下载 [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) 中的预构建压缩包解压使用）。

### 3. 加载已解压的扩展

1. 在 Chrome 地址栏打开 `chrome://extensions/`，打开右上角的 **开发者模式**。
2. 如果已安装原版或其他同名构建，先停用它们，避免同一个网页有两套扩展脚本运行。
3. 点击 **加载已解压的扩展程序**，选择刚构建的 **`MCP-SuperAssistant-G/dist`**，也就是直接包含 `manifest.json` 的目录。
4. 打开 Gemini 或 Google AI Studio 的聊天页面。若标签页之前已经打开，刷新一下，再找输入框附近的 **MCP** 按钮或页面侧栏。

### 4. 连接 MCP 服务器

如果已经有扩展可访问的 MCP 服务地址，直接在侧栏配置相应的连接类型和地址。有本地 `stdio` 工具，或希望把多个服务汇总成一个地址时，可以使用原版 MCP SuperAssistant Proxy。

1. 准备自己的 `mcp-config.json`，在 `mcpServers` 中填入工具提供方给出的服务器配置。
2. 在该配置文件所在目录打开终端，运行下面的命令并保持代理运行。

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. 打开扩展侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse`，然后点击 **Connect**。显示 **Connected** 后，到 **Tools** 确认所需工具可见且已启用。

如果需要代理的服务器配置示例或其它传输方式，可参照 [原版代理连接指南](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server)。

#### 与 WebCodex 配合使用

[WebCodex](https://github.com/yyjeqhc/webcodex)（[下载 v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)）可以把你电脑上的代码目录打包成“读文件 / 搜代码 / 跑终端命令”等 MCP 工具，让网页里的 Gemini 或 AI Studio 也能像本地编程助手一样查看和修改你的本地项目。

整体连接链路如下（本地 Proxy 负责把本扩展使用的 SSE 协议桥接到 WebCodex 的 `/mcp` 接口）：

```text
网页 AI（Gemini / AI Studio） ←→ 本浏览器扩展 ←→ 本地 Proxy（SSE） ←→ WebCodex（本地项目）
```

按下面 3 步即可接通（以下以本地 WebCodex **0.5.0** 为例）：

1. **准备好 WebCodex**
   - 启动 WebCodex 服务端（或桌面端）和 Runner，确认界面里显示 Runner **已连接**，并添加好你要让 AI 访问的本地项目目录。
   - 记下 WebCodex 服务的本地端口（下文以默认示例 `60143` 为例，若你改过端口请一并替换）。

2. **生成代理配置文件（二选一）**
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

     # 3) 写入或更新代理配置文件（已有自建 mcp-config.json 时可把下面路径改成你的文件）
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

     > 若脚本没有列出任何文件路径，说明尚未在 WebCodex Desktop 登录该连接；请先在桌面端完成登录，或直接在 WebCodex 服务端签发用户 API token 后改用下面的方式 B。

   - **方式 B（手动编写或非 Windows 系统）**：将下面条目加入你的代理配置文件 `mcp-config.json`（按实际修改端口和 `<你的 WebCodex token>`）：

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
     - 已登录 **WebCodex Desktop** 时，可在桌面端本地连接目录找到 `webcodex-user-token` 文件（Windows 位于 `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\` 下，即方式 A 脚本读取的同一文件；macOS 通常位于 `~/Library/Application Support/dev.webcodex.desktop/local-connections/` 下），复制其中的纯文本内容；
     - 使用自建服务端时，也可直接填入由同一 WebCodex 服务端为你签发的用户 API token。

3. **启动代理并在扩展中连接**
   - 如果采用 **方式 A**（Windows PowerShell），运行下面命令启动（或重启）代理并保持窗口开启；如果采用 **方式 B**（如 macOS / Linux 终端），把 `--config` 换成你自己的 `./mcp-config.json` 路径：

     ```powershell
     npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
     ```

     ```bash
     # macOS / Linux 终端（zsh / bash）
     npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
     ```

   - 打开网页侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse` 后点击 **Connect**。显示 **Connected** 后，切换到 **Tools** 标签页，确认已能看到并勾选 WebCodex 工具（例如 `webcodex.list_projects`、`webcodex.run_shell` 等）。

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

   - **与 [WebCodex RTK 开关](#新功能与改进) 联动**：在 `runner.toml` 同目录新建一个 `rtk-instructions.md`，并通过 `[instructions].files` 挂载。这样模型在调用 `work_on_project` 打开项目时也能拿到同一份 RTK 压缩规则：

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

### 5. 试跑并更新

- 在聊天输入框旁打开 **MCP** 菜单，点 **Insert** 加入 MCP Instructions，再输入一条只读测试请求一起发送（接 WebCodex 时可直接发「列出我的 WebCodex 项目」验证 `list_projects`）。模型生成工具卡片后，先手动点 **Run** 验证，再按需开启自动执行、插入和发送。
- 更新时，在项目目录执行 `git pull --ff-only`、`pnpm install --frozen-lockfile` 和 `pnpm build`。回到 `chrome://extensions/` 点本扩展的 **重新加载**，再刷新已打开的聊天页。遇到 `Extension context is invalid` 时，也应刷新聊天页重新注入扩展脚本。

## 已知问题

- **Gemini 长对话中可能忘记工具调用方式。** 如果模型不再按规则调用工具，在输入框旁的 **MCP** 悬浮菜单点 **规则提醒**（英文界面为 **Remind**）插入一条轻量规则提醒即可。因为开场已经发送过的完整工具清单和参数说明仍在当前会话历史上下文中，模型只是在长对话里出现了格式/规则漂移，通常不需要再点 **直接插入 / 作为附件** 重复发送整份 MCP Instructions，这样能节省大量 token；仅在新开对话或增删启用工具后，才需要重新发送完整指令。
- **Gemini 偶尔在显示思考/进度后突然清空并停住。** 在长会话或高推理模式下，工具结果回传后模型偶发出现空回复或前端进度回滚，导致工具链中断。通常**无需刷新页面**，直接在当前对话输入「继续」或 `?` 即可唤醒下一轮（刚才的工具结果已在上下文中）；如果中断恰好发生在写文件或 Git 操作附近，建议先让模型核对当前文件/仓库状态再继续，避免重复执行副作用；仅当网页本身无响应时再刷新页面。
- **工具调用偶尔返回 HTTP 400 或超时。** 个别调用报错后，模型有时能换用合适的工具继续。MCP Instructions 明确提示，WebCodex 的 `edit_project_files` 首次报错时改用同一服务上可用的 `run_shell`。其他工具报错或超时后的处理取决于模型和错误类型。若修改文件的调用超时，重试前先检查文件是否已被修改。
- **测试环境。** 本扩展目前仅在 Windows 11 上的 Chrome 中进行了测试。

## 许可证

本项目（**MCP SuperAssistant G**）及其在 `custom` 分支上的新增与修改代码采用 [GNU 通用公共许可证 v3.0 或更高版本（GPL-3.0-or-later）](LICENSE) 发布，版权归 `andrewngcanton-gif` 所有。

上游基线代码来自 [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant)（原版提交 `30bb204`），其原始 MIT 许可证与版权声明完整保留在 [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT) 中。感谢原作者和社区贡献者。

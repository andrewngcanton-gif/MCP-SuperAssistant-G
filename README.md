# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G 横幅" width="640">
</p>

<p align="center">
  <strong>中文</strong> &bull; <a href="README.en.md">English</a>
</p>

**MCP SuperAssistant G** 是基于 [原版 MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) 的社区定制版。它让 Gemini、Google AI Studio 等网页 AI 通过浏览器扩展使用 MCP 工具。本项目通过 GitHub 提供源码，使用 Chrome 开发者模式加载自行构建的扩展。

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

### v0.1.4

- **常用工具首轮自带必填参数，省掉额外查参数往返。** 新开对话时，高频工具会直接附上简单的必填参数提示，模型第一轮就能直接调用常用工具，不必先多跑一轮查参数。
- **减少改文件时的转义报错与重试。** 提示模型在终端命令里优先使用整段代码块和直接文本替换来改文件，并修复长脚本里换行和正则符号容易被吃掉的问题。
- **修复刷新 Gemini 老对话时误重跑旧工具调用。** 重新打开或刷新已有对话时，之前跑过或报错过的旧工具卡片不再自动执行和自动发送，仍可随时手动点击 **Run** 查看结果。

### v0.1.3

- **大幅精简工具说明，节省 token。** 首次发送工具说明时只展开最常用的核心工具，其余工具按需再查；查询工具参数时也去掉了冗余和内部字段，已关闭的工具不再暴露给模型，并移除了 Gemini 下容易引起冲突的旧示例。
- **悬浮菜单新增 Remind 轻量提醒，并移除 Tabs 按钮。** 长对话里模型容易忘记调用格式时，点一下 **Remind** 就能插入一条很短的规则提醒，不必把整份工具说明再发一遍。

### v0.1.2

- **修复 Gemini 工具结果展开到输入框后偶尔不自动发送。** 模型仍在收尾时先等待其结束再自动发送，不再因为短暂出现停止按钮或输入框换行格式化而中断。
- **修复流式中断的工具卡片一直转圈。** 模型输出异常截断导致工具调用未完整闭合时，卡片会及时停止转圈并提示流已中断。

### v0.1.1

- **修复 AI Studio 中 `Ctrl+Enter` 漏发 MCP Instructions。** 点击 **Run** 或按 `Ctrl+Enter` 都会把待发指令和输入内容一起发出，默认 `Ctrl+Enter` 模式下普通 `Enter` 仍用于换行。
- **修复 AI Studio 新对话首轮工具卡片停在手动 `Run`。** 多次开新对话提问相同内容时，首轮工具调用不再被之前新对话的旧记录误拦。
- **修复 AI Studio 首轮工具结果展开后未自动发出、以及模型思考较久导致无法自动执行。** 新对话自动跳转为具体会话链接或模型长时间思考后，工具执行与结果回传都能正常继续。

## 相比原版修复了什么

- **Gemini 自动发送卡住。** 等待当前输入框可用的发送按钮，在确认会话和草稿仍有效后只点击一次。合批时过滤残留的历史加载卡片，继续等待本批仍在运行的工具。
- **Gemini 手动发送漏带 MCP Instructions。** **Insert** 保留原来的小卡片。输入任务后点击 Gemini 的原生发送按钮或按 Enter，待发送的指令会随草稿合并发出。
- **Gemini 用量页侧栏显示异常。** 在 `/usage` 与 `/u/<账号序号>/usage` 暂停显示聊天侧栏，返回聊天时恢复之前的侧栏状态。
- **AI Studio 打开历史对话时重复执行或回传结果。** 历史工具卡片保持手动操作，当前工具调用因卡片重新渲染产生的重复自动执行和结果回传会被去重。
- **AI Studio 晚到的工具结果无法自动发送。** 同一会话内仍有效的晚到结果可以继续回传。**Run** 忙时等待原输入框就绪，编辑草稿或切换会话会取消待发送。
- **Auto Submit 重复等待。** 配置的 Auto Submit 延时在合批阶段计入一次。设为 2 秒时，可省去约 2 秒的固定等待。Auto Insert 的独立延时、合批和按钮就绪检查仍然适用。

## 新功能与改进

- **WebCodex RTK 开关。** 先在运行 WebCodex Runner 的机器上安装 RTK 命令行工具，并确保 Runner 能在 `PATH` 中找到 `rtk`。直接使用原版 WebCodex 即可。侧栏 **Instructions → Use RTK with WebCodex** 默认关闭。启用 WebCodex 的 `run_process` 并打开开关后，将重新生成的 MCP Instructions 发到对话。指令会提示模型使用 RTK 压缩适用命令的长输出。若还希望 `work_on_project` 返回同一规则，可以另外配置 Runner 的 `[instructions].files`。 [RTK 安装说明](https://github.com/rtk-ai/rtk)
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

成功后，项目根目录下的 `dist/` 会包含 `manifest.json`。保留这个目录供 Chrome 加载。

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
     - 已登录 **WebCodex Desktop** 时，可在桌面端本地连接目录找到 `webcodex-user-token` 文件（Windows 位于 `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\` 下，即方式 A 脚本读取的同一文件），复制其中的纯文本内容；
     - 使用自建服务端时，也可直接填入由同一 WebCodex 服务端为你签发的用户 API token。

3. **启动代理并在扩展中连接**
   - 如果采用 **方式 A**，运行下面命令启动（或重启）代理并保持窗口开启；如果采用 **方式 B**，把 `--config` 换成你自己的 `./mcp-config.json` 路径：

     ```powershell
     npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
     ```

   - 打开网页侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse` 后点击 **Connect**。显示 **Connected** 后，切换到 **Tools** 标签页，确认已能看到并勾选 WebCodex 工具（例如 `webcodex.list_projects`、`webcodex.run_shell` 等）。

### 5. 试跑并更新

- 在聊天输入框旁打开 **MCP** 菜单，点 **Insert** 加入 MCP Instructions，再输入一条只读测试请求一起发送（接 WebCodex 时可直接发「列出我的 WebCodex 项目」验证 `list_projects`）。模型生成工具卡片后，先手动点 **Run** 验证，再按需开启自动执行、插入和发送。
- 更新时，在项目目录执行 `git pull --ff-only`、`pnpm install --frozen-lockfile` 和 `pnpm build`。回到 `chrome://extensions/` 点本扩展的 **重新加载**，再刷新已打开的聊天页。遇到 `Extension context is invalid` 时，也应刷新聊天页重新注入扩展脚本。

## 已知问题

- **Gemini 长对话中可能忘记工具说明。** 如果模型不再按工具说明调用，在输入框旁的 **MCP** 菜单点 **Insert** 或 **Attach**，把最新的 MCP Instructions 再发一次。
- **工具调用偶尔返回 HTTP 400 或超时。** 个别调用报错后，模型有时能换用合适的工具继续。MCP Instructions 明确提示，WebCodex 的 `edit_project_files` 首次报错时改用同一服务上可用的 `run_shell`。其他工具报错或超时后的处理取决于模型和错误类型。若修改文件的调用超时，重试前先检查文件是否已被修改。
- **测试环境。** 本扩展目前仅在 Windows 11 上的 Chrome 中进行了测试。

## 许可证

本项目（**MCP SuperAssistant G**）及其在 `custom` 分支上的新增与修改代码采用 [GNU 通用公共许可证 v3.0 或更高版本（GPL-3.0-or-later）](LICENSE) 发布，版权归 `andrewngcanton-gif` 所有。

上游基线代码来自 [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant)（原版提交 `30bb204`），其原始 MIT 许可证与版权声明完整保留在 [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT) 中。感谢原作者和社区贡献者。

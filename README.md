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

扩展连接 MCP SuperAssistant Proxy 的 SSE 地址，代理再通过 Streamable HTTP 连接 WebCodex 的 `/mcp`。以下配置以本地 WebCodex **0.5.0** 为例。

1. 启动 WebCodex 服务和 Runner，确认 Runner 已连接，并在 WebCodex 中配置要访问的项目。
2. 将下面的 `webcodex` 条目合并到代理 `mcp-config.json` 的 `mcpServers` 中。WebCodex 0.5.0 的这个连接方式使用 `X-WebCodex-MCP-Surface: cli`。`Authorization` 使用同一 WebCodex 服务的用户 token，Windows 可按下方脚本从桌面版的已登录连接读取。按实际情况调整示例端口 `60143`。

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

3. 用上面的命令启动或重启代理，在扩展侧栏选择 **SSE** 并连接 `http://localhost:3006/sse`。到 **Tools** 确认 WebCodex 工具已出现并启用。
4. 在聊天里插入并发送更新后的 **MCP Instructions**，再请模型用 `list_projects` 列出项目，或用 `work_on_project` 打开一个已知项目，验证连接。

##### 获取用户 token 并生成本地配置（Windows）

对已经登录的 WebCodex Desktop 0.5.0，下面的 **PowerShell 7** 脚本会先列出 `webcodex-user-token` 文件的路径。若有多个，选择与目标服务器和账号对应的文件。若找不到文件，先在 WebCodex Desktop 登录该连接，或使用该服务器为你签发的用户 API token。脚本只显示文件路径，把 Bearer token 写入仓库外的本地配置文件。已有代理配置时，可以把 `$configPath` 改成它的路径，脚本会保留其他 `mcpServers` 条目。

```powershell
$profileRoot = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop/local-connections'
Get-ChildItem -LiteralPath $profileRoot -Recurse -File -Filter 'webcodex-user-token' |
    Select-Object -ExpandProperty FullName

$tokenPath = (Read-Host 'Full path of the token file for this WebCodex login').Trim('"')
$token = (Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
if (-not $token) { throw 'The WebCodex token file is empty.' }
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

使用脚本的默认配置路径时，用以下命令启动代理。

```powershell
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
```

### 5. 试跑并更新

- 在聊天输入框旁打开 **MCP** 菜单，点 **Insert** 加入 MCP Instructions。输入一条只读测试请求，连同指令一起发送。模型生成工具卡片后，可以先手动点 **Run** 验证，再按需开启自动执行、插入和发送。
- 更新时，在项目目录执行 `git pull --ff-only`、`pnpm install --frozen-lockfile` 和 `pnpm build`。回到 `chrome://extensions/` 点本扩展的 **重新加载**，再刷新已打开的聊天页。遇到 `Extension context is invalid` 时，也应刷新聊天页重新注入扩展脚本。

## 已知问题

- **Gemini 长对话中可能忘记工具说明。** 如果模型不再按工具说明调用，在输入框旁的 **MCP** 菜单点 **Insert** 或 **Attach**，把最新的 MCP Instructions 再发一次。
- **偶尔无法 Auto Submit。** 间歇性原因尚待排查。如果工具结果已经在输入框里，等网页恢复可发送后，可以手动发送一次。

## 许可证

本项目沿用上游的 [MIT 许可证](LICENSE)，保留原版权声明。感谢 [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant) 的作者和贡献者。

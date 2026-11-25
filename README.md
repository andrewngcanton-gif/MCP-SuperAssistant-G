# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G 横幅" width="640">
</p>

[English README](README.en.md)

**MCP SuperAssistant G** 是基于 [原版 MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) 的社区定制版。它让 Gemini、Google AI Studio 等网页 AI 通过浏览器扩展使用 MCP 工具。本项目通过 GitHub 提供源码，使用 Chrome 开发者模式加载自行构建的扩展。

原版基线为 `30bb204`。 [`main` 保存原版源码快照，`custom` 是本项目的默认分支](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom)。

## 相比原版修复了什么

- **Gemini 自动发送卡住。** 等待当前输入框可用的发送按钮，在确认会话和草稿仍有效后只点击一次。合批时过滤残留的历史加载卡片，继续等待本批仍在运行的工具。
- **Gemini 手动发送漏带 MCP Instructions。** **Insert** 保留原来的小卡片。输入任务后点击 Gemini 的原生发送按钮或按 Enter，待发送的指令会随草稿合并发出。
- **Gemini 用量页侧栏显示异常。** 在 `/usage` 与 `/u/<账号序号>/usage` 暂停显示聊天侧栏，返回聊天时恢复之前的侧栏状态。
- **AI Studio 打开历史对话时重复执行或回传结果。** 历史工具卡片保持手动操作，当前工具调用因卡片重新渲染产生的重复自动执行和结果回传会被去重。
- **AI Studio 晚到的工具结果无法自动发送。** 同一会话内仍有效的晚到结果可以继续回传。**Run** 忙时等待原输入框就绪，编辑草稿或切换会话会取消待发送。
- **Auto Submit 重复等待。** 配置的 Auto Submit 延时在合批阶段计入一次。设为 2 秒时，可省去约 2 秒的固定等待。Auto Insert 的独立延时、合批和按钮就绪检查仍然适用。

## 新功能与改进

- **WebCodex RTK 开关。** 先在运行 WebCodex Runner 的机器上安装 RTK 命令行工具，并确保 Runner 能在 `PATH` 中找到 `rtk`。直接使用原版 WebCodex 即可。侧栏 **Instructions → Use RTK with WebCodex** 默认关闭。启用 WebCodex 的 `run_process` 并打开开关后，将重新生成的 MCP Instructions 发到对话。指令会提示模型使用 RTK 压缩适用命令的长输出。若还希望 `work_on_project` 返回同一规则，可以另外配置 Runner 的 `[instructions].files`。 [RTK 安装说明](https://github.com/rtk-ai/rtk)
- **WebCodex 文件编辑规则。** 指令说明 `edit_project_files` 必须提供 `project` 和 `changes`，每项包含 `kind` 和 `path`。内容复杂或首次报错时，提示模型改用同一 WebCodex 服务上可用的 `run_shell`。
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
2. 将下面的 `webcodex` 条目合并到代理 `mcp-config.json` 的 `mcpServers` 中。把端点和请求头的值换成 WebCodex 提供的配置。`60143` 是示例端口，Bearer token 只保存在本地配置文件里。

   ```json
   {
     "mcpServers": {
       "webcodex": {
         "type": "streamable-http",
         "url": "http://127.0.0.1:60143/mcp",
         "headers": {
           "X-WebCodex-MCP-Surface": "<WebCodex 提供的值>",
           "Authorization": "Bearer <你的 WebCodex token>"
         }
       }
     }
   }
   ```

3. 用上面的命令启动或重启代理，在扩展侧栏选择 **SSE** 并连接 `http://localhost:3006/sse`。到 **Tools** 确认 WebCodex 工具已出现并启用。
4. 在聊天里插入并发送更新后的 **MCP Instructions**，再请模型用 `list_projects` 列出项目，或用 `work_on_project` 打开一个已知项目，验证连接。

### 5. 试跑并更新

- 在聊天输入框旁打开 **MCP** 菜单，点 **Insert** 加入 MCP Instructions。输入一条只读测试请求，连同指令一起发送。模型生成工具卡片后，可以先手动点 **Run** 验证，再按需开启自动执行、插入和发送。
- 更新时，在项目目录执行 `git pull --ff-only`、`pnpm install --frozen-lockfile` 和 `pnpm build`。回到 `chrome://extensions/` 点本扩展的 **重新加载**，再刷新已打开的聊天页。遇到 `Extension context is invalid` 时，也应刷新聊天页重新注入扩展脚本。

## 许可证

本项目沿用上游的 [MIT 许可证](LICENSE)，保留原版权声明。感谢 [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant) 的作者和贡献者。

# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G 横幅" width="640">
</p>

<p align="center">
  <strong>中文</strong> &bull; <a href="README.en.md">English</a>
</p>

**MCP SuperAssistant G** 是基于 [原版 MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) 的社区增强版 Chrome 扩展，让 Gemini 网页版、Google AI Studio 等网页 AI 直接使用本地 MCP 工具。相比原版，重点修复了自动发送与历史对话回放问题，大幅精简了省 token 的工具说明，并针对 WebCodex 与 RTK 做了开箱适配。可直接下载 [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) 中的预构建扩展包在 Chrome 开发者模式加载使用，也可从源码自行构建。

原版基线为 `30bb204`。 [`main` 保存原版源码快照，`custom` 是本项目的默认分支](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom)。

本项目支持并认可 LINUX DO 社区，感谢社区为开发者提供分享和交流的空间。 [LINUX DO 社区](https://linux.do/)

## 目录

- [更新记录](#更新记录)
- [相比原版修复了什么](#相比原版修复了什么)
- [新功能与改进](#新功能与改进)
- [在 Chrome 中安装](#在-chrome-中安装)
  - [1. 下载预构建扩展包（推荐）](#1-下载预构建扩展包推荐)
  - [2. 加载已解压的扩展](#2-加载已解压的扩展)
  - [3. 连接 MCP 服务器](#3-连接-mcp-服务器)
    - [与 WebCodex 配合使用](#与-webcodex-配合使用)
  - [4. 试跑并更新](#4-试跑并更新)
- [已知问题](#已知问题)
- [许可证](#许可证)

## 更新记录

### v0.2.0（2026-11-27）

- **新增 macOS `Cmd+Enter` 发送与轮次校验支持。** 适配标签芯片输入框、AI Studio 轮次门控以及 AI Studio Build / Apps 的自动回传按键，Windows 下的 `Ctrl+Enter` 与回车行为保持不变，并已在 macOS M1 Chrome + WebCodex `v0.5.1` 环境实测通过。
- **新增 macOS CI 验证与自动跨平台打包发布工作流。** 升级至 Node 22 LTS（`>=22.13.0`），通过 GitHub Actions `macos-latest` 自动执行构建、类型检查、单元测试与 DOM 集成测试，并在打 tag 时自动打包上传 Chrome 扩展压缩包到 GitHub Releases。
- **拆分并完善 WebCodex 独立双语使用指南。** 将 README 保留为通用概述，并拆分出面向 macOS（`v0.5.1`，含顶部一键启动脚本）与 Windows（`v0.5.0`）的独立指南页面（[WEBCODEX_MACOS.md](WEBCODEX_MACOS.md) / [WEBCODEX_WINDOWS.md](WEBCODEX_WINDOWS.md)）。

> 更早版本的更新说明见 [完整更新记录（CHANGELOG.md）](CHANGELOG.md)。

## 相比原版修复了什么

- **Gemini 自动发送卡住。** 等待当前输入框可用的发送按钮，在确认会话和草稿仍有效后只点击一次。合批时过滤残留的历史加载卡片，继续等待本批仍在运行的工具。
- **Gemini 手动发送漏带 MCP Instructions。** **Insert** 保留原来的小卡片。输入任务后点击 Gemini 的原生发送按钮或按 Enter，待发送的指令会随草稿合并发出。
- **Gemini 用量页侧栏显示异常。** 在 `/usage` 与 `/u/<账号序号>/usage` 暂停显示聊天侧栏，返回聊天时恢复之前的侧栏状态。
- **AI Studio 打开历史对话时重复执行或回传结果。** 历史工具卡片保持手动操作，当前工具调用因卡片重新渲染产生的重复自动执行和结果回传会被去重。
- **AI Studio 晚到的工具结果无法自动发送。** 同一会话内仍有效的晚到结果可以继续回传。**Run** 忙时等待原输入框就绪，编辑草稿或切换会话会取消待发送。
- **Auto Submit 重复等待。** 配置的 Auto Submit 延时在合批阶段计入一次。设为 2 秒时，可省去约 2 秒的固定等待。Auto Insert 的独立延时、合批和按钮就绪检查仍然适用。

## 新功能与改进

- **WebCodex RTK 开关。** 先在运行 WebCodex Runner 的机器上安装 RTK 命令行工具，并确保 Runner 能在 `PATH` 中找到 `rtk`。直接使用原版 WebCodex 即可。侧栏 **Instructions → Use RTK with WebCodex** 默认关闭。启用 WebCodex 的命令执行工具（`v0.5.0` 为 `run_process`，`v0.5.1` 为 `run_shell`）并打开开关后，将重新生成的 MCP Instructions 发到对话。指令会提示模型使用 RTK 压缩适用命令的长输出。若在保留 `work_on_project` 的工具面（`v0.5.0` 或 `adaptive`）下还希望打开项目时一并返回同一规则，可按 [Windows 进阶配置](WEBCODEX_WINDOWS.md#webcodex-runner-config) 或 [macOS 进阶配置](WEBCODEX_MACOS.md#webcodex-runner-config) 配置 Runner 的 `[instructions].files`。 [RTK 安装说明](https://github.com/rtk-ai/rtk)
- **WebCodex 文件编辑规则。** 指令说明 `edit_project_files` 必须提供 `project` 和 `changes`，每项包含 `kind` 和 `path`。内容复杂或首次报错时，提示模型改用同一 WebCodex 服务上可用的 `run_shell`，以减少重复尝试和 token 消耗。
- **更短的 MCP Instructions。** 精简 Compact 和 JSON 两种模板的自然语言，保留必填参数、schema 查询方式、调用示例以及 WebCodex 和 RTK 规则。去掉收到 schema 错误提示就重试的通用指令。
- **CrewDispatch 代理配置开关。** CrewDispatch 插件的公开发布版已过时，后续不再更新。大多数用户可以忽略此选项，保持默认关闭。已有可运行的 CrewDispatch MCP 服务时，可以用配置生成器注册。修改开关后，重新生成代理配置并重启代理即可生效。 [CrewDispatch 配置指南](CUSTOMIZATIONS.md#crewdispatch-opt-in-proxy-configuration)
- **新图标和侧栏横幅。** 更新扩展和网页内的 MCP 图标，使用新版侧栏横幅，并移除横幅原有的站外跳转。

## 在 Chrome 中安装

### 1. 下载预构建扩展包（推荐）

1. 前往 [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) 下载最新版本的 **`mcp-superassistant-g-vX.Y.Z-chrome.zip`**（扩展本体为跨平台前端产物，Windows、macOS 与 Linux Chrome 共用同一份压缩包）。
2. 将压缩包解压到一个**长期保留**的固定文件夹（例如 `mcp-superassistant-g/`，不要解压在随时会被清理的临时目录中）。

> [!NOTE]
> **解压后没有 `dist/` 文件夹是正常的**：Release `.zip` 直接打包了构建产物本身，解压后的文件夹根目录就是 **`manifest.json`**（无需再找 `dist/` 子目录）。使用预构建包也**无需安装 Git 或 pnpm**；仅在需要通过 `npx` 启动本地 Proxy 时才需要 Node.js。

如果你希望跟随最新源码提交或自行修改打包，请见 **[从源码自行构建指南（BUILD_FROM_SOURCE.md）](BUILD_FROM_SOURCE.md)**。

### 2. 加载已解压的扩展

1. 在 Chrome 地址栏打开 `chrome://extensions/`，打开右上角的 **开发者模式**。
2. 如果已安装原版或其他同名构建，先停用它们，避免同一个网页有两套扩展脚本运行。
3. 点击 **加载已解压的扩展程序**，选择直接包含 `manifest.json` 的目录：
   - **使用 Release 预构建包**：直接选择刚才解压出来的文件夹本身；
   - **从源码自行构建**：选择 `MCP-SuperAssistant-G/dist`。
4. 打开 Gemini 或 Google AI Studio 的聊天页面。若标签页之前已经打开，刷新一下，再找输入框附近的 **MCP** 按钮或页面侧栏。

### 3. 连接 MCP 服务器

如果已经有扩展可访问的 MCP 服务地址，直接在侧栏配置相应的连接类型和地址。有本地 `stdio` 工具，或希望把多个服务汇总成一个地址时，可以使用原版 MCP SuperAssistant Proxy。

1. 准备自己的 `mcp-config.json`，在 `mcpServers` 中填入工具提供方给出的服务器配置。
2. 在该配置文件所在目录打开终端，运行下面的命令并保持代理运行。

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. 打开扩展侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse`，然后点击 **Connect**。显示 **Connected** 后，到 **Tools** 确认所需工具可见且已启用。

如果需要代理的服务器配置示例或其它传输方式，可参照 [原版代理连接指南](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server)。

#### 与 WebCodex 配合使用

[WebCodex](https://github.com/yyjeqhc/webcodex)（Windows 实测 [v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0) 并兼容 [v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)，macOS 实测 [v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)）可以把你电脑上的代码目录打包成“读文件 / 搜代码 / 跑终端命令”等 MCP 工具，让网页里的 Gemini 或 AI Studio 也能像本地编程助手一样查看和修改你的本地项目。

整体连接链路如下（本地 Proxy 负责把本扩展使用的 SSE 协议桥接到 WebCodex 的 `/mcp` 接口）：

```text
网页 AI（Gemini / AI Studio） ←→ 本浏览器扩展 ←→ 本地 Proxy（SSE） ←→ WebCodex（本地项目）
```

**通用前置条件**：先启动本地 WebCodex Desktop（或服务端）与 Runner，完成登录并添加你要让 AI 访问的项目目录，确认 Runner 状态显示 **已连接**。然后按系统选择对应的完整接入页面：

- **[macOS 接入指南（WEBCODEX_MACOS.md）](WEBCODEX_MACOS.md)** — 页面顶部即附带一键启动脚本（自动读取 token、自动探测端口并启动 Proxy），以及手动配置与进阶参数。
- **[Windows 接入指南（WEBCODEX_WINDOWS.md）](WEBCODEX_WINDOWS.md)** — 包含 PowerShell 一键生成配置脚本、进阶 `runner.toml` / RTK 配置与无界面开机自启方案。

Proxy 启动后，在扩展侧栏连接设置中选 **SSE**、**Server URI** 填 `http://localhost:3006/sse` 点击 **Connect**，并在 **Tools** 标签页确认 WebCodex 工具已启用即可开始使用。

### 4. 试跑并更新

- 在聊天输入框旁打开 **MCP** 菜单，点 **Insert** 加入 MCP Instructions，再输入一条只读测试请求一起发送（接 WebCodex 时可直接发「列出我的 WebCodex 项目」验证 `list_projects`）。模型生成工具卡片后，先手动点 **Run** 验证，再按需开启自动执行、插入和发送。

> [!TIP]
> **体验最佳建议**：验证首次工具调用正常后，推荐同时开启 **自动执行**、**自动插入**、**自动发送** 三个自动选项，实现多轮工具调用自动闭环，整体体验最佳。

- 更新时：
  - **使用 Release 预构建包**：下载新版 `.zip` 覆盖解压到同一固定目录，回到 `chrome://extensions/` 点击本扩展的 **重新加载**，再刷新已打开的聊天页。
  - **从源码构建**：见 [更新源码并重新构建](BUILD_FROM_SOURCE.md#更新源码并重新构建)。
  - 遇到 `Extension context is invalid` 时，同样需要刷新聊天页重新注入扩展脚本。

## 已知问题

- **Gemini 长对话中可能忘记工具调用方式。** 如果模型不再按规则调用工具，在输入框旁的 **MCP** 悬浮菜单点 **规则提醒**（英文界面为 **Remind**）插入一条轻量规则提醒即可。因为开场已经发送过的完整工具清单和参数说明仍在当前会话历史上下文中，模型只是在长对话里出现了格式/规则漂移，通常不需要再点 **直接插入 / 作为附件** 重复发送整份 MCP Instructions，这样能节省大量 token；仅在新开对话或增删启用工具后，才需要重新发送完整指令。
- **Gemini 偶尔在显示思考/进度后突然清空并停住。** 在长会话或高推理模式下，工具结果回传后模型偶发出现空回复或前端进度回滚，导致工具链中断。通常**无需刷新页面**，直接在当前对话输入「继续」或 `?` 即可唤醒下一轮（刚才的工具结果已在上下文中）；如果中断恰好发生在写文件或 Git 操作附近，建议先让模型核对当前文件/仓库状态再继续，避免重复执行副作用；仅当网页本身无响应时再刷新页面。
- **工具调用偶尔返回 HTTP 400 或超时。** 个别调用报错后，模型有时能换用合适的工具继续。MCP Instructions 明确提示，WebCodex 的 `edit_project_files` 首次报错时改用同一服务上可用的 `run_shell`。其他工具报错或超时后的处理取决于模型和错误类型。若修改文件的调用超时，重试前先检查文件是否已被修改。
- **测试环境。** 本扩展已在 Windows 11 Chrome（配合 WebCodex v0.5.0）与 macOS Apple Silicon（M1）Chrome（配合 WebCodex v0.5.1，并接入 GitHub Actions macOS 自动化 DOM 测试）上完成实测。

## 许可证

本项目（**MCP SuperAssistant G**）及其在 `custom` 分支上的新增与修改代码采用 [GNU 通用公共许可证 v3.0 或更高版本（GPL-3.0-or-later）](LICENSE) 发布，版权归 `andrewngcanton-gif` 所有。

上游基线代码来自 [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant)（原版提交 `30bb204`），其原始 MIT 许可证与版权声明完整保留在 [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT) 中。感谢原作者和社区贡献者。

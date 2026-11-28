# RTK 输出压缩小白指南（搭配 WebCodex）

<p align="center">
  <strong>中文</strong> &bull; <a href="RTK_GUIDE.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="WEBCODEX_MACOS.md">macOS 指南</a> &bull; <a href="WEBCODEX_WINDOWS.md">Windows 指南</a>
</p>

## RTK 是什么？为什么值得开？

[RTK（Rust Token Killer）](https://github.com/rtk-ai/rtk) 是一个跑在你本地终端上的命令行输出压缩工具：模型在 WebCodex 里执行命令时，RTK 会先把目录列表、类型检查、单元测试或 `git diff` 里冗长的过程噪音过滤精简，再把压缩后的结果回传给网页 AI（Gemini / Google AI Studio）。

- **真实省流效果（实测）**：
  - `rtk find` 列目录：实测可省约 **77%** token；
  - `rtk err` 跑类型检查：实测可省约 **83%** token；
  - `rtk test` 跑单元测试：实测可省约 **97%** token。
- **不会改坏文件（默认关闭，按需开启）**：
  - 扩展内置的安全规则**严格禁止**对写文件、`python -c`、heredoc、重定向（`>`）、管道（`|`）、`--json`/`--porcelain` 或审计完整日志套用 `rtk`，只对受支持的只读与构建/测试命令生效。

---

## 3 步完成安装与配置

### 第 1 步：在运行 WebCodex Runner 的电脑上安装 RTK

> [!IMPORTANT]
> 请安装在**实际运行 WebCodex Runner 的那台电脑**上（一般就是你当前跑项目代码的本机）。安装或更新 `PATH` 后，务必**彻底重启 WebCodex Desktop / Runner** 才会生效。

- **Windows（二选一）**：

  1. 使用 `winget` 一键安装（推荐）：

     ```powershell
     winget install rtk-ai.rtk
     ```

  2. 或者从 [RTK GitHub Releases](https://github.com/rtk-ai/rtk/releases) 下载 `rtk-x86_64-pc-windows-msvc.zip`，把里面的 `rtk.exe` 解压放到 `%USERPROFILE%\.local\bin\`（若目录不存在请新建），再把 `%USERPROFILE%\.local\bin` 加入用户环境变量 `PATH`。

  验证：重开一个 PowerShell 窗口运行下面命令能打印版本号即可：

  ```powershell
  rtk --version
  ```

- **macOS**：

  使用 Homebrew 安装：

  ```bash
  brew install rtk
  rtk --version
  ```

  > [!WARNING]
  > **Apple Silicon（M1/M2/M3/M4）macOS 必看**：如果你习惯从桌面图标或启动台直接打开 **WebCodex Desktop**，GUI 进程不会加载 `~/.zshrc`，会导致找不到 `/opt/homebrew/bin/rtk`。请在终端执行下面一行把它写入 `~/.zshenv`，再重启 WebCodex Desktop：
  >
  > ```bash
  > grep -q '/opt/homebrew/bin' ~/.zshenv 2>/dev/null || echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' >> ~/.zshenv
  > ```

---

### 第 2 步：在扩展侧栏打开开关

1. 打开 Gemini 或 Google AI Studio 页面，打开右侧 **MCP SuperAssistant G** 侧栏，确认 WebCodex 已连接。
2. 切换到 **指令（Instructions）** 标签页，打开 **在 WebCodex 中使用 RTK**（英文界面为 **Use RTK with WebCodex**）。
3. **不需要改 WebCodex 本体，也不要运行 `rtk init -g`**（`rtk init -g` 是给本机 Claude Code / Codex CLI 改全局 hook 用的，与本浏览器扩展无关）。

---

### 第 3 步：新开对话试跑 + 查看省流统计

1. **新开一个对话**（或清空当前对话），在输入框旁点 **MCP → Insert** 插入新生成的指令。
2. 发送一条适合验证压缩效果的测试提示词，例如：

   > 帮我用终端在我的项目目录下跑一下类型检查（`pnpm type-check`）和单元测试（`pnpm test:unit`），告诉我有没有报错。

3. 对话结束后，在你的本地终端运行下面命令即可看到每次压缩前后的真实 token 对比：

   ```bash
   rtk gain --history
   ```

---

## 与 WebCodex 不同版本的配合说明（v0.5.0 / v0.5.1）

**`v0.5.0` 和 `v0.5.1` 都可以直接用，无需额外改配置**：

- 本扩展优先通过两版都有的 **`run_shell`** 在命令前加 `rtk` 前缀（只有当你显式禁用了 `run_shell`、仅保留 `run_process` 时，才会自动回退到 `run_process` 的 `executable: "rtk"` 方式）。
- 因此，在 `v0.5.1` 的 9 工具 `cli` 精简面板以及 `v0.5.0` 的 17 工具面板下，打开扩展里的 RTK 开关都会立即生效。

<details>
<summary>进阶可选：在使用了 work_on_project 的工具面下额外挂载 rtk-instructions.md</summary>

如果你使用的是保留了 `work_on_project` 的工具面（`v0.5.0` 或未传 `X-WebCodex-MCP-Surface: cli` 的 `adaptive` 模式），并且希望模型调用 `work_on_project` 打开项目时从服务端再补充一份本地约定，可按系统在 `runner.toml` 中挂载 `rtk-instructions.md`：

- **[Windows 进阶配置](WEBCODEX_WINDOWS.md#webcodex-runner-config)**
- **[macOS 进阶配置](WEBCODEX_MACOS.md#webcodex-runner-config)**

在 `v0.5.1` `cli` 9 工具模式下不包含 `work_on_project`，只需打开扩展侧栏的 RTK 开关即可，无需配置此处。

</details>

---

## 小白常见问题与避坑

- **工具结果 stderr 里出现 `[rtk] /!\ No hook installed` 正常吗？**
  完全正常，忽略即可。那是 `rtk` 在提醒你没在本机跑 `rtk init -g` 安装终端 hook；本扩展是通过指令直接带 `rtk` 前缀，**不需要也不建议**跑 `rtk init -g`。

- **为什么模型有时先跑了一遍 `rtk` 命令，紧接着又跑了一遍不带 `rtk` 的原命令？**
  这是正常且安全的防瞎编兜底机制。比如你问“通过了多少条测试”，而 `rtk test` 把具体数字压缩掉了，规则会要求模型补跑一次原命令获取准确结果，避免胡乱猜测。

- **在 Windows 上 `rtk tree` / `rtk ls` / `rtk grep` 报错怎么办？**
  这是 RTK 上游在 Windows 下的已知兼容性缺口（例如 Windows 自带 `System32\tree.com` 会拦截 `rtk tree` 报 `Too many parameters`，PowerShell 默认也没有独立的 `ls.exe`/`grep.exe`）。本扩展已内置防踩坑引导：
  - 全平台统一优先用纯 Rust 内置的 **`rtk find "*" <目录>`** 与 **`rtk rg`**；
  - 允许 macOS / Linux 继续用 `rtk ls`，同时提醒模型避免使用 `rtk tree` / `rtk grep`（以及 Windows 下的 `rtk ls`）；
  - 自定义 `pnpm` / `npm` 测试与构建脚本自动改用 **`rtk test <命令>`** 或 **`rtk err <命令>`**，不会误走无压缩的 `rtk fallback`。

- **本机同时装了 Codex CLI / Claude Code，需要单独配另一份 RTK 吗？**
  **不需要。** 本扩展（通过 WebCodex Runner 调用的 `rtk`）与你本机上的 Codex CLI、Claude Code 等工具会**自动共用同一份本地统计库**（Windows 下为 `%LOCALAPPDATA%\rtk\history.db`），直接运行 `rtk gain` 就能看到合计节省效果；**不要**去手动修改 `RTK_DB_PATH` 环境变量。

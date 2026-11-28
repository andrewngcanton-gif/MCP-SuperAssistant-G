# macOS 与 WebCodex 配合使用指南

<p align="center">
  <strong>中文</strong> &bull; <a href="WEBCODEX_MACOS.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="WEBCODEX_WINDOWS.md">Windows 指南</a>
</p>

**通用前置与连接方式**：先安装并登录 **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)**（macOS 实测 **[v0.5.1 Apple Silicon DMG](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**；`0.5.0` 以下如 `0.4.6` 不支持 `cli` 精简工具面），添加至少一个本地项目目录，并确认本机已安装 Node.js。以下任一方式将 `3006` 端口代理拉起后，打开网页侧栏连接设置选 **SSE**、**Server URI** 填 `http://localhost:3006/sse` 点击 **Connect**，并在 **Tools** 标签页确认 WebCodex 工具已启用即可使用。

> **关于 WebCodex `v0.5.1` 工具数量说明**：在 `v0.5.1` 上带上 `"X-WebCodex-MCP-Surface": "cli"` 会返回 9 个核心工具（`list_projects`、`run_shell`、`observe_jobs`、`stop_job`、`search_project_texts`、`read_files`、`edit_project_files`、`read_tool_manifest`、`call_runtime_tool`），其余专用工具可通过 `read_tool_manifest` 与 `call_runtime_tool` 按需发现调用；`get_tool_schema` 与 `tool_lookup` 为本扩展前端内置元工具，不会出现在服务端 Tools 列表中。

---

## 1. 一键无界面开机自启 WebCodex CLI 与本地 Proxy（推荐）

只需 **1 个跨平台脚本 + 1 个 `launchd` LaunchAgent**：开机登录后静默拉起 **WebCodex（`webcodex-server` + `webcodex-runner`）与本地 Proxy**，**免开 WebCodex Desktop 窗口、免留终端窗口、免手工填写任何路径**，直接复用桌面端环境与 token（省去桌面端 GUI 内存）。

**准备条件**：先打开过一次 WebCodex Desktop 完成登录并添加项目（生成 `desktop-state.json`、`webcodex.env`、`runner.toml`、`webcodex-user-token`），完成后退出 WebCodex Desktop 并**关闭其自带开机自启**（避免占用端口）。

在 macOS **终端**中运行以下两行即可自动下载并完成注册与启动（无需管理员密码）：

```bash
curl -fsSL https://raw.githubusercontent.com/andrewngcanton-gif/MCP-SuperAssistant-G/custom/scripts/webcodex/start-mcp-webcodex.mjs -o ~/start-mcp-webcodex.mjs
node ~/start-mcp-webcodex.mjs --install-headless
```

- **离线/手动保存脚本**：可打开 [scripts/webcodex/start-mcp-webcodex.mjs](scripts/webcodex/start-mcp-webcodex.mjs) 点击页面右上角复制全文保存到 `~/start-mcp-webcodex.mjs`，再执行第二行。
- **日志路径**：`~/Library/Logs/mcp-superassistant/`。若 `WebCodex Desktop.app` 不在 `/Applications`，可先 `WEBCODEX_RUNTIME_DIR="/你的/WebCodex Desktop.app" node ~/start-mcp-webcodex.mjs --install-headless`；若项目位于 `~/Desktop` 或 `~/Documents` 等受保护目录，首次无界面访问若遇 macOS 权限拦截，请改放常规目录或改用第 2 节桌面端方案。
- **取消开机自启**：运行 `node ~/start-mcp-webcodex.mjs --uninstall`。

---

## 2. 轻量方案：保留 WebCodex Desktop（前台启动或仅自启 Proxy）

如果平时继续使用 **WebCodex Desktop** 界面，直接复用同一份 `~/start-mcp-webcodex.mjs` 即可：

- **前台随用随开**（不关终端窗口或重启电脑只需运行一次）：

  ```bash
  node ~/start-mcp-webcodex.mjs
  ```

- **后台静默仅自启 Proxy**（只由 `launchd` 自动接管 `3006` Proxy；WebCodex 本身请开启桌面端自带开机自启或按需打开 Desktop）：

  ```bash
  node ~/start-mcp-webcodex.mjs --install-proxy
  ```

<details>
<summary>可选：环境变量覆盖说明</summary>

- `WEBCODEX_PORT=57610 node ~/start-mcp-webcodex.mjs`：强制指定 WebCodex 端口
- `TOKEN_PATH="完整路径" node ~/start-mcp-webcodex.mjs`：多账号时显式指定 `webcodex-user-token` 路径
- `PROXY_PORT=3006 node ~/start-mcp-webcodex.mjs`：修改本地 SSE Proxy 监听端口
- `WEBCODEX_RUNTIME_DIR="/路径" node ~/start-mcp-webcodex.mjs --install-headless`：指定 `WebCodex Desktop.app` 或 `webcodex-runtime` 路径
- `NO_START=1 node ~/start-mcp-webcodex.mjs`：仅生成/更新配置文件，不启动 Proxy

</details>

---

## 3. 手动配置方式

<details>
<summary>展开查看手动配置 `mcp-config.json` 与 `npx` 命令</summary>

如果你已经自建了 `mcp-config.json`，可手动合并以下条目（按实际端口和 `<你的 WebCodex token>` 替换）：

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

`<你的 WebCodex token>` 获取途径（仅保存在本地配置文件，切勿提交或分享）：
- 已登录 **WebCodex Desktop** 时，可在 `~/Library/Application Support/dev.webcodex.desktop/local-connections/` 下找到 `webcodex-user-token`；
- 或使用 WebCodex CLI：`webcodex login ... --print-mcp-config` / `webcodex share`。

启动代理：

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

</details>

---

<a id="webcodex-runner-config"></a>
<details>
<summary>可选：WebCodex 进阶配置与端口排查（runner.toml、Homebrew PATH、webcodex.env）</summary>

1. **查看当前 WebCodex 监听端口**：

   ```bash
   lsof -nP -iTCP | grep LISTEN | grep -i webcodex
   ```

2. **`runner.toml` 执行策略与 RTK 指令注入**（路径可在 `~/Library/Application Support/dev.webcodex.desktop/local-connections/` 下查找）：

   ```toml
   [policy]
   allow_raw_shell = true
   allow_cwd_anywhere = false
   allowed_roots = ['/Users/你的用户名/工作目录']
   max_timeout_secs = 3600
   max_output_bytes = 262144
   ```

   > **Homebrew `PATH` 提醒**：若通过 Homebrew 安装 RTK（`/opt/homebrew/bin/rtk`），且从桌面图标启动 WebCodex Desktop，GUI 启动环境不会读取 `~/.zshrc`。建议把 `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` 写入 `~/.zshenv` 并重启（无界面 LaunchAgent 已内置常见 `PATH`）。
   >
   > 在 `v0.5.1` `cli` 9 工具模式下，打开扩展侧栏的 [WebCodex RTK 开关](README.md#新功能与改进) 即可直接为 `run_shell` 注入 RTK 压缩规则（无需 `work_on_project`）。仅当你改用暴露了 `work_on_project` 的 `v0.5.0` 或 `adaptive` 工具面时，才需另外在 `runner.toml` 同目录新建 `rtk-instructions.md` 并挂载：

   ```toml
   [instructions]
   files = ['/Users/你的用户名/Library/Application Support/dev.webcodex.desktop/local-connections/<账号目录>/rtk-instructions.md']
   ```

3. **`webcodex.env` 服务端精简参数**（默认位于 `~/Library/Application Support/dev.webcodex.desktop/runtime/local/webcodex.env`，修改后重启 WebCodex 服务）：

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

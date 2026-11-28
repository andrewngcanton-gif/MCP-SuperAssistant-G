# Windows 与 WebCodex 配合使用指南

<p align="center">
  <strong>中文</strong> &bull; <a href="WEBCODEX_WINDOWS.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="WEBCODEX_MACOS.md">macOS 指南</a>
</p>

**通用前置与连接方式**：先安装并登录 **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)**（Windows 实测 **[v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0)**，同时兼容 **[v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**），添加至少一个本地项目目录，并确认本机已安装 Node.js。以下任一方式将 `3006` 端口代理拉起后，打开网页侧栏连接设置选 **SSE**、**Server URI** 填 `http://localhost:3006/sse` 点击 **Connect**，并在 **Tools** 标签页确认 WebCodex 工具已启用即可使用。

> **关于 `v0.5.0` 与 `v0.5.1` 工具数量说明**：配置中带上 `"X-WebCodex-MCP-Surface": "cli"` 时，`v0.5.0` 返回 17 个工具；`v0.5.1` 精简返回 9 个核心工具（`list_projects`、`run_shell`、`observe_jobs`、`stop_job`、`search_project_texts`、`read_files`、`edit_project_files`、`read_tool_manifest`、`call_runtime_tool`），其余专用工具可通过 `read_tool_manifest` 与 `call_runtime_tool` 按需发现调用；`get_tool_schema` 与 `tool_lookup` 为扩展前端内置元工具，不会出现在服务端列表中。两种版本均兼容本扩展与 **在 WebCodex 中使用 RTK** 开关。

---

## 1. 一键无界面开机自启 WebCodex CLI 与本地 Proxy（推荐）

只需 **1 个跨平台脚本 + 1 个后台计划任务**：开机登录后静默拉起 **WebCodex（`webcodex-server` + `webcodex-runner`）与本地 Proxy**，**免开 WebCodex Desktop 窗口、免留终端窗口、免手工填写任何路径**，直接复用桌面端环境与 token，可省去 WebView2 进程约 **480 MB** 内存（兼容 **Windows PowerShell 5.1** 与 **PowerShell 7**）。

**准备条件**：至少打开过一次 WebCodex Desktop 完成登录并添加项目（生成 `desktop-state.json`、`webcodex.env`、`runner.toml`、`webcodex-user-token`），完成后彻底退出 WebCodex Desktop 并**关闭其自带的开机自启**（避免争抢 `60143` 端口）。

在 **PowerShell** 中直接运行以下两行即可自动下载并完成注册与启动（无需管理员权限）：

```powershell
irm https://raw.githubusercontent.com/andrewngcanton-gif/MCP-SuperAssistant-G/custom/scripts/webcodex/start-mcp-webcodex.mjs -OutFile "$env:USERPROFILE\start-mcp-webcodex.mjs"
node "$env:USERPROFILE\start-mcp-webcodex.mjs" --install-headless
```

- **离线/手动保存脚本**：可打开 [scripts/webcodex/start-mcp-webcodex.mjs](scripts/webcodex/start-mcp-webcodex.mjs) 点击页面右上角复制全文保存到 `$env:USERPROFILE\start-mcp-webcodex.mjs`，再执行第二行。
- **日志路径**：`$env:USERPROFILE\mcp-superassistant\`（如更换了 WebCodex 安装目录，可设 `$env:WEBCODEX_RUNTIME_DIR` 后重新执行 `--install-headless`）。
- **清理旧任务 / 取消开机自启**：若之前手动安装过旧版拆分任务，运行 `Unregister-ScheduledTask -TaskName WebCodexCLI -Confirm:$false -ErrorAction SilentlyContinue`；取消本脚本注册的自启任务运行 `node "$env:USERPROFILE\start-mcp-webcodex.mjs" --uninstall`。

---

## 2. 轻量方案：保留 WebCodex Desktop（前台启动或仅自启 Proxy）

如果你平时直接用 **WebCodex Desktop** 界面管理项目，直接复用同一份 `$env:USERPROFILE\start-mcp-webcodex.mjs` 即可：

- **前台随用随开**（不关终端窗口或重启电脑只需运行一次）：

  ```powershell
  node "$env:USERPROFILE\start-mcp-webcodex.mjs"
  ```

- **后台静默仅自启 Proxy**（无黑框；仅负责后台接管 `3006` Proxy，WebCodex 本身请开启 WebCodex Desktop 自带开机自启或按需打开桌面端）：

  ```powershell
  node "$env:USERPROFILE\start-mcp-webcodex.mjs" --install-proxy
  ```

<details>
<summary>可选：环境变量覆盖说明</summary>

- `$env:WEBCODEX_PORT = "60143"`：强制指定 WebCodex 端口
- `$env:TOKEN_PATH = "完整路径"`：多账号时显式指定 `webcodex-user-token` 路径
- `$env:PROXY_PORT = "3006"`：修改本地 SSE Proxy 监听端口
- `$env:WEBCODEX_RUNTIME_DIR = "路径"`：指定非默认目录下的 `webcodex-runtime`
- `$env:NO_START = "1"`：仅生成/更新配置文件，不启动 Proxy

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
- 已登录 **WebCodex Desktop** 时，可在 `%LOCALAPPDATA%\dev.webcodex.desktop\local-connections\` 下找到 `webcodex-user-token` 文件，复制其中的纯文本内容；
- 或使用 WebCodex CLI：`webcodex login ... --print-mcp-config` / `webcodex share`。

启动代理并保持窗口开启：

```powershell
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

</details>

---

<a id="webcodex-runner-config"></a>
<details>
<summary>可选：WebCodex 进阶配置（runner.toml 权限与 RTK 指令注入、webcodex.env 省 token 参数）</summary>

1. **`runner.toml` 执行策略与 RTK 指令注入**（可通过 `Get-ChildItem "$env:LOCALAPPDATA\dev.webcodex.desktop\local-connections" -Recurse -File -Filter 'runner.toml' | Select-Object -ExpandProperty FullName` 查看实际路径）：

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

     - 在本 Runner 上执行预计有大量人读输出的受支持命令时，用 RTK 在工具返回前压缩输出。启用 `run_shell` 时直接给命令加上 `rtk` 前缀（例如 `rtk git log -12`）；若禁用了 `run_shell`，则改用 `run_process`，把 `executable` 设为 `rtk` 并把原命令和各参数按原顺序放入 `args`。工具不支持或预期输出本就很短时用原命令。
     - 机器可读输出、结构化验证证据、完整日志、发布、安全核查、取证或哈希使用原命令；摘要不足时补读完整输出。
     - 遥测保持关闭；仅在明确需要并同意时才运行 `rtk trust`。
     ```

2. **`webcodex.env` 服务端精简与兼容参数**（Windows 默认位于 `%LOCALAPPDATA%\dev.webcodex.desktop\runtime\local\webcodex.env`，修改后需重启 WebCodex 服务）：

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

</details>

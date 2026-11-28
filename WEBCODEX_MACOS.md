# macOS 与 WebCodex 配合使用指南

<p align="center">
  <strong>中文</strong> &bull; <a href="WEBCODEX_MACOS.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="WEBCODEX_WINDOWS.md">Windows 指南</a>
</p>

## 一键配置并启动（推荐）

**前置条件**：先安装并登录 **[WebCodex Desktop](https://github.com/yyjeqhc/webcodex)**（macOS 实测 **[v0.5.1 Apple Silicon DMG](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1)**；`0.5.0` 以下如 `0.4.6` 不支持 `cli` 精简工具面），确认界面内 Runner **已连接** 且已添加至少一个本地项目目录。

1. 打开 macOS **终端**，粘贴下面整段命令并回车，生成可执行脚本 `~/start-mcp-webcodex.sh`（会自动读取 `desktop-state.json` / `webcodex-user-token`、自动探测 WebCodex 当前实际端口、幂等写入 `~/.config/mcp-superassistant-webcodex.json`，并启动本地 SSE Proxy）：

   ```bash
   cat <<'EOF' > ~/start-mcp-webcodex.sh
   #!/usr/bin/env bash
   set -euo pipefail

   exec node -e '
   const fs = require("node:fs");
   const os = require("node:os");
   const path = require("node:path");
   const { execFileSync, spawnSync } = require("node:child_process");

   const roots = [
     path.join(os.homedir(), "Library", "Application Support", "dev.webcodex.desktop"),
     path.join(os.homedir(), ".local", "share", "dev.webcodex.desktop"),
   ];

   let desktopState = null;
   for (const r of roots) {
     const stateFile = path.join(r, "desktop-state.json");
     if (fs.existsSync(stateFile)) {
       try { desktopState = JSON.parse(fs.readFileSync(stateFile, "utf8")); break; } catch {}
     }
   }

   const foundTokens = [];
   const walk = (dir) => {
     if (!fs.existsSync(dir)) return;
     for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
       const full = path.join(dir, ent.name);
       if (ent.isDirectory()) walk(full);
       else if (ent.isFile() && ent.name === "webcodex-user-token") foundTokens.push(full);
     }
   };

   if (process.env.TOKEN_PATH) {
     foundTokens.push(process.env.TOKEN_PATH);
   } else if (desktopState?.runtime?.user_token_file && fs.existsSync(desktopState.runtime.user_token_file)) {
     foundTokens.push(desktopState.runtime.user_token_file);
   } else {
     roots.forEach(walk);
   }

   if (foundTokens.length === 0) {
     console.error("未找到 webcodex-user-token，请先启动 WebCodex Desktop 并登录，或用 TOKEN_PATH=\"完整路径\" 指定。");
     process.exit(1);
   }
   if (foundTokens.length > 1) {
     console.error("检测到多个登录 token，请任选一条加上 TOKEN_PATH=\"完整路径\" 重新运行：");
     foundTokens.forEach((p) => console.error("  " + p));
     process.exit(1);
   }

   const tokenPath = foundTokens[0];
   const token = fs.readFileSync(tokenPath, "utf8").trim();
   if (!token) throw new Error("webcodex-user-token 文件为空。");

   const detectPort = () => {
     if (process.env.WEBCODEX_PORT) return { port: process.env.WEBCODEX_PORT, source: "WEBCODEX_PORT env" };

     const stateUrl = desktopState?.runtime?.server_url;
     const stateMatch = typeof stateUrl === "string" && stateUrl.match(/:(\d{2,5})(?:\/|$)/);
     if (stateMatch) return { port: stateMatch[1], source: "desktop-state.json" };

     try {
       const out = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
         encoding: "utf8",
         stdio: ["ignore", "pipe", "ignore"],
       });
       const candidates = [];
       for (const line of out.split(/\r?\n/)) {
         if (!/webcodex/i.test(line)) continue;
         const m = line.match(/(127\.0\.0\.1|localhost|\[::1\]|\*):(\d+)\s+\(LISTEN\)/);
         if (m) candidates.push({ host: m[1], port: m[2] });
       }
       const local = candidates.find((c) => c.host !== "*") || candidates[0];
       if (local) return { port: local.port, source: "lsof live process" };
     } catch {}

     const files = [];
     const tokenDir = path.dirname(tokenPath);
     if (fs.existsSync(tokenDir)) {
       for (const f of fs.readdirSync(tokenDir)) {
         if (/\.(toml|json|env)$/i.test(f)) files.push(path.join(tokenDir, f));
       }
     }
     for (const r of roots) files.push(path.join(r, "runtime", "local", "webcodex.env"));

     for (const file of files) {
       if (!fs.existsSync(file)) continue;
       const text = fs.readFileSync(file, "utf8");
       const urlMatch = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})/);
       if (urlMatch) return { port: urlMatch[1], source: file };
       const bindMatch = text.match(/(?:^|\n)\s*(?:WEBCODEX_)?(?:BIND|ADDR|PORT)\s*=\s*"?(?:[^:\n]*:)?(\d{2,5})/);
       if (bindMatch) return { port: bindMatch[1], source: file };
     }

     return { port: "60143", source: "default fallback" };
   };

   const { port, source } = detectPort();
   const proxyPort = process.env.PROXY_PORT || "3006";
   const cfgPath = process.env.CONFIG_PATH || path.join(os.homedir(), ".config", "mcp-superassistant-webcodex.json");

   fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
   const prevRaw = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, "utf8") : "";
   const cfg = prevRaw ? JSON.parse(prevRaw) : { mcpServers: {} };
   cfg.mcpServers = cfg.mcpServers || {};
   cfg.mcpServers.webcodex = {
     type: "streamable-http",
     url: `http://127.0.0.1:${port}/mcp`,
     headers: {
       "X-WebCodex-MCP-Surface": "cli",
       Authorization: `Bearer ${token}`,
     },
   };
   const nextRaw = JSON.stringify(cfg, null, 2) + "\n";
   const updated = nextRaw !== prevRaw;
   if (updated) {
     fs.writeFileSync(cfgPath, nextRaw, { mode: 0o600 });
   }

   console.log(`Token   : ${tokenPath}`);
   console.log(`WebCodex: http://127.0.0.1:${port}/mcp (from ${source})`);
   console.log(`Config  : ${cfgPath} (${updated ? "updated" : "unchanged"})`);
   console.log(`Proxy   : http://localhost:${proxyPort}/sse`);

   if (process.env.NO_START === "1") process.exit(0);

   const res = spawnSync(
     "npx",
     ["-y", "@srbhptl39/mcp-superassistant-proxy@0.1.9", "--config", cfgPath, "--outputTransport", "sse", "--port", proxyPort],
     { stdio: "inherit" },
   );
   process.exit(res.status ?? 0);
   '
   EOF
   chmod +x ~/start-mcp-webcodex.sh
   ```

2. 运行一键脚本并保持该终端窗口开启：

   ```bash
   ~/start-mcp-webcodex.sh
   ```

3. 打开网页侧栏的连接设置，连接类型选 **SSE**，**Server URI** 填 `http://localhost:3006/sse` 后点击 **Connect**。显示 **Connected** 后，切换到 **Tools** 标签页确认 WebCodex 工具已就绪。

   > **关于 WebCodex `v0.5.1` 工具数量说明**：在 `v0.5.1` 上带上 `"X-WebCodex-MCP-Surface": "cli"` 会返回 9 个核心工具（`list_projects`、`run_shell`、`observe_jobs`、`stop_job`、`search_project_texts`、`read_files`、`edit_project_files`、`read_tool_manifest`、`call_runtime_tool`），其余专用工具可通过 `read_tool_manifest` 与 `call_runtime_tool` 按需发现调用；`get_tool_schema` 与 `tool_lookup` 为本扩展前端内置元工具，不会出现在服务端 Tools 列表中。

4. **常用可选环境变量**（一般无需填写）：
   - `WEBCODEX_PORT=57610 ~/start-mcp-webcodex.sh`：强制指定 WebCodex 端口
   - `TOKEN_PATH="完整路径" ~/start-mcp-webcodex.sh`：多账号时显式指定 `webcodex-user-token` 路径
   - `PROXY_PORT=3006 ~/start-mcp-webcodex.sh`：修改本地 SSE Proxy 监听端口
   - `NO_START=1 ~/start-mcp-webcodex.sh`：仅生成/更新配置文件，不启动 Proxy

---

## 手动配置方式

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

`<你的 WebCodex token>` 获取途径：
- 已登录 **WebCodex Desktop** 时，可在 `~/Library/Application Support/dev.webcodex.desktop/local-connections/` 下找到 `webcodex-user-token`；
- 或使用 WebCodex CLI：`webcodex login ... --print-mcp-config` / `webcodex share`。

启动代理：

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
```

---

<a id="webcodex-runner-config"></a>
## 进阶配置与端口排查

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

   > **Homebrew `PATH` 提醒**：若通过 Homebrew 安装 RTK（`/opt/homebrew/bin/rtk`），且是从桌面图标直接启动 WebCodex Desktop，GUI 启动环境不会读取 `~/.zshrc`。建议把 `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` 写入 `~/.zshenv` 并重启 WebCodex Desktop，确保 `run_shell` 能正常找到 `rtk`。
   >
   > 在 `v0.5.1` `cli` 9 工具模式下，打开扩展侧栏的 [WebCodex RTK 开关](README.md#新功能与改进) 即可直接为 `run_shell` 注入 RTK 压缩规则（无需 `work_on_project`）。仅当你改用暴露了 `work_on_project` 的 `v0.5.0` 或 `adaptive` 工具面时，才需另外在 `runner.toml` 同目录新建 `rtk-instructions.md` 并挂载：

   ```toml
   [instructions]
   files = ['/Users/你的用户名/Library/Application Support/dev.webcodex.desktop/local-connections/<账号目录>/rtk-instructions.md']
   ```

3. **`webcodex.env` 服务端精简参数**（默认位于 `~/Library/Application Support/dev.webcodex.desktop/runtime/local/webcodex.env`，修改后重启 WebCodex Desktop）：

   ```ini
   WEBCODEX_MCP_COMPACT_SCHEMAS=true
   WEBCODEX_MCP_TEXT_JSON_COMPAT=true
   ```

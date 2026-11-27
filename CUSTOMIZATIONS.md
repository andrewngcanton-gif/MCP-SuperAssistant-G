# MCP SuperAssistant G — 技术定制与内部更新日志

<p align="center">
  <strong>中文</strong> &bull; <a href="CUSTOMIZATIONS.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a> &bull; <a href="CHANGELOG.md">用户版更新记录</a>
</p>

本仓库是基于 MCP SuperAssistant v0.7.3 的公开社区增强版本：

- `main` 分支保留了上游 MCP SuperAssistant 提交 `30bb2045e630d7db3547179f374c15af6f308924` 的源码快照。
- `custom` 分支包含本地整合构建以及全部定制修改。
- 本地标签 `baseline-v0.7.3-local` 保留了重建分支历史前的整合基线；公开仓库展示新的快照提交历史。

本仓库并非 MCP SuperAssistant 官方发布版，上游原版仓库地址为 https://github.com/srbhptl39/MCP-SuperAssistant 。

## 基线中的定制改动

基线包含已验收的本地改动，涵盖 Gemini 自动发送控制、AI Studio 历史轮次隔离门禁、WebCodex RTK 引导指令以及 WebCodex 文件编辑策略提示。相对 `main` 分支的完整源码差异可在 `custom` 分支直接对比查看。

本地联调环境参考 WebCodex 0.5.0 与 RTK 0.49.0。本地 Runner 配置、CrewDispatch 凭据、浏览器配置目录、私有日志及本机启动脚本等敏感或机器相关文件均已排除在仓库之外。

<a id="crewdispatch-opt-in-proxy-configuration"></a>
## CrewDispatch 代理配置开关

原版代理会直接加载 `mcpServers` 下的全部条目，不支持 `enabled` 字段。为在不给代理打补丁的前提下实现 CrewDispatch 按需启用，可在托管配置文件中将既有 `mcpServers` 条目与 `crewdispatch` 开关写在一起，再通过脚本生成真正传给代理的配置文件。

`scripts/crewdispatch-config/mcp-servers.example.json` 默认关闭 CrewDispatch。将其复制为 `scripts/crewdispatch-config/mcp-servers.json`，并填入你现有的 MCP 服务器配置（包括所需的请求头 `headers`）。如需启用，填写本地已安装的 CrewDispatch MCP 入口路径并开启开关：

```json
"crewdispatch": {
  "enabled": true,
  "command": "node",
  "args": ["<已安装的 CrewDispatch MCP 入口绝对路径>"]
}
```

仅当 `enabled` 严格为布尔值 `true` 时，生成脚本才会把 `mcpServers.crewdispatch` 作为 `stdio` 条目写入输出配置；缺省或为 `false` 时会自动省略 CrewDispatch（即使原配置中存在旧的 `crewdispatch` 条目）。其余服务器条目及其 `headers` 会原样复制；托管源文件不会被改写，且不要直接把托管源文件传给代理进程。

生成配置并启动代理：

```bash
node scripts/crewdispatch-config/generate-config.mjs --input scripts/crewdispatch-config/mcp-servers.json --output scripts/crewdispatch-config/mcp-servers.generated.json

npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config scripts/crewdispatch-config/mcp-servers.generated.json --outputTransport sse --port 3006
```

修改开关后，重新执行生成脚本并重启代理即可生效（运行中的代理不会热重载配置）。本地 `mcp-servers.json` 与生成结果文件均已加入 `.gitignore`，请勿将真实路径、请求头与 token 提交到仓库或公开输出中。

## 技术更新日志

以下记录各版本的具体实现细节与故障根因分析。面向用户的简要更新说明见 [README.md](README.md) 与 [CHANGELOG.md](CHANGELOG.md)。

### v0.1.7（2026-11-27）

- **修复 Gemini 多结果芯片导致输入区错位/光标消失，以及芯片栏单行横向滚动（`gemini.adapter.ts`、`input-chips.ts`、`scripts/dom-tests/gemini.test.ts`）。**
  - 根因：`GeminiAdapter.getChipAnchors()` 此前直接返回 `resolveComposerRoot(input)`，实际匹配到 Gemini 的内部 CSS Grid / 横向 Flex 容器 `.text-input-field`。把 `#mcp-input-chips-host` 直接 `prepend` 到 `.text-input-field` 内部后，芯片栏占用了与 `.ql-editor` 同行的横向轨道，导致前 2 个芯片将光标右推，第 3 个起将 `.ql-editor` 挤压至 0 宽。
  - 修复：在 `gemini.adapter.ts` 中新增 `resolveChipContainer(input)`（保留 `resolveComposerRoot()` 继续用于发送/停止控件判定），跳过 `.text-input-field`、网格容器与横向 Flex 行，在主聊天区域边界内向上解析到最近的纵向容器（`block` / `flow-root` / `flex-direction: column`）挂载 `#mcp-input-chips-host`；同时在 `input-chips.ts` 的 `CHIP_STYLES` 中改为单行横向滚动（`flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden;`，`.chip { flex-shrink: 0; max-width: 210px; }`），并在 `:host` 补充 `grid-column: 1 / -1;` 防护。
  - 回归测试：在 `scripts/dom-tests/gemini.test.ts` 新增无头 Chrome DOM 用例，复现 `.input-area-container` → `.input-area (flex column)` → `.text-input-field (grid: auto 1fr auto)` → `.ql-editor` 结构，断言挂载目标为 `.input-area` 且连续插入 3 个 `tool-result` 后编辑器的 `left`/`width`/`height` 均保持不变。
- **在精简指令（Compact）中补充条件必选参数签名（`instructionGeneratorCompact.ts`、`instructionGeneratorCompact.test.ts`）。**
  - 根因：`formatCompactParamSignature()` 此前只读取顶层 `required` 数组，导致输出 `work_on_project(instruction)`，模型漏传运行期必填的 `project` / `client_id+path` / `session_id` 来源参数并触发 HTTP 400（`-32602`）。
  - 修复：新增 `extractConditionalSelector()`，在精简签名中展示 `oneOf`/`anyOf` 条件必选分支以及 WebCodex 互斥的 `project | client_id+path | session_id` 选择器，并在 `instructionGeneratorCompact.test.ts` 补充单元测试。

### v0.1.6（2026-11-27）

- **共享、零 Suspense 的界面 i18n 引擎（`packages/shared/lib/i18n/*`、`packages/shared/index.mts`、`packages/shared/tests/i18n.test.ts`）。**
  - 新增编译期键值校验的独立 i18n 模块（`types.ts`、`locales/en.ts`、`locales/zh-CN.ts`、`core.ts`、`react.ts`、`dom.ts`），通过 `chrome.storage.local`（`mcp-ui-language`）与受保护的 `chrome.storage.onChanged` 实现跨上下文同步，支持按 BCP-47 优先级解析 `'auto'` 语言、React 19 `useSyncExternalStore` hook（`useI18n()`）以及面向原生 DOM 工具卡片的实时属性同步（`setI18nText`、`setI18nAttr`、`bindI18nDomSync`）。
  - 在 `packages/shared/tests/i18n.test.ts` 新增单元测试（已接入 `package.json` `test:unit`），校验 `en`/`zh-CN` 键名与占位符一致、中英文混排无多余空格、语言解析以及快照引用稳定性。
- **全量界面本地化与中文排版优化（`Settings.tsx`、`Sidebar.tsx`、`ServerStatus.tsx`、`SetupHelp.tsx`、`AvailableTools.tsx`、`InstructionManager.tsx`、`ConsentBanner.tsx`、`mcpPopover.tsx`、`TabPicker.tsx`、`TabPickerPanel.tsx`、`components.ts`、`functionBlock.ts`、`functionResult.ts`、`functionHistory.ts`、`input-chips.ts`、`sidebar.css`、`pages/options/src/*`）。**
  - 完成侧栏、悬浮菜单、标签页选择器、原生工具卡片、输入芯片以及选项页/授权页的全部界面文案接入，同时保持发给大模型的工具指令生成器、聊天注入文本、宿主页按钮匹配规则和 DOM 测试选择器不变。
  - 在 `sidebar.css` 为 `select`/`option`/`label`/`textarea` 补充中文无衬线字体回退栈，在 `InstructionManager.tsx` 优化 RTK 开关卡片标题与说明的堆叠排版，并同步展开菜单的 Insert/Attach 悬停提示。

### v0.1.5（2026-11-27）

- **Google AI Studio Build / Apps 适配与独立轮次门禁（`aistudio-apps.ts`、`aistudioAppsTurnGate.ts`、`aistudio.adapter.ts`、`aistudioTurnGate.ts`、`plugin-types.ts`、`input-chips.ts`、`index.ts`、`functionBlock.ts`、`components.ts`）。**
  - 新增路由隔离的辅助模块 `aistudio-apps.ts`，同时支持 `/app/apps` 初始生成页输入框（`ms-applet-generator-form` `contenteditable="plaintext-only"`）与 `/apps/<id>` 左侧对话栏（`ms-code-assistant-chat` `<textarea class="cdk-textarea-autosize">`），准确排除右侧竞争的 Monaco 代码编辑器（`.monaco-editor textarea.inputarea`），在提交前等待停止按钮消失，并兼容 `Ctrl+Enter` 与禁用按钮等待状态。
  - 新增 `aistudioAppsTurnGate.ts`，将 `/app/apps` 与 `/apps/*` 与 Playground（`aistudioTurnGate.ts`）彻底隔离：在 `Ctrl+Enter`（忽略 IME 组字）、发送点击和扩展自动发送时武装门禁，支持 `/app/apps` → `/apps/<id>` 首次发送跳转与查询参数变化保持武装状态，刷新或切换应用时阻止历史重放，遵守 `window.__mcpToolEnablement`，并通过 `claimAistudioAppsAutoExecution()` 按轮次去重自动执行。
- **无头 Chrome DOM 回归测试集（`scripts/dom-tests/aistudio-apps.test.ts`、`scripts/dom-tests/run.mjs`）。**
  - 新增 10 条集成测试用例，覆盖落地页与双栏工作区 DOM（含竞争 Monaco `<textarea>`）、历史重放拦截、手动 Run `skipAutoDelivery`、生成中等待停止、草稿编辑或跳转取消、多轮连续执行、跨应用重复调用工具以及 `Disable All` / 单工具禁用规则。

### v0.1.4（2026-11-26）

- **保留 `run_shell` 调用中的正则与换行转义（`jsonFunctionParser.ts`、`webcodexInstructions.ts`）。**
  - 根因：当 `parameter` JSONL 行因包含非 JSON 正则转义（如 `\s`、`\d`）导致 `JSON.parse()` 失败并回退到 `extractJSONParameters()` 正则提取时，链式替换先于 `\\\\` 处理了 `\\n`，把字面量 `\r?\n` 破坏为 `\` 加真换行；同时模型在内联正则脚本中也常因 shell/JSON 三重转义失败。
  - 修复：新增单遍解析的 `unescapePartialJsonString()`，保留非 JSON 正则转义（`\s`、`\d` 等）并仅将 `\\n` 严格还原为 `\n`；同时更新 `buildWebCodexFileEditGuidance()`，引导模型在 `run_shell` 中改用单引号 heredoc（`<<'EOF'` / `@'...'@`）和字面量 `replace`/`split`/`join`。
- **防止 Gemini 历史工具调用重放并持久化失败调用记录（`geminiTurnGate.ts`、`functionBlock.ts`、`index.ts`、`gemini.adapter.ts`、`components.ts`）。**
  - 根因：与 AI Studio（`aistudioTurnGate.ts`）不同，Gemini 仅依赖按 URL 分桶的 `localStorage` 历史记录，且 `components.ts` 仅在成功时调用 `storeExecutedFunction()`。重新加载历史 Gemini 会话时，先前失败/超时或被逐出缓存的卡片可能被误自动执行并把结果发回对话；此外，扩展重载后尚未刷新的旧标签页中的孤立脚本仍可能跑本地元工具并向对话返回 `ERROR: Extension context is invalid`，不带停止按钮的 Angular hydration 也容易被误判为流式输出。
  - 修复：新增 `geminiTurnGate.ts`（`initializeGeminiTurnGate`、`notifyGeminiSubmission`、`observeGeminiBlock`、`canGeminiAutoExecute`），要求 `armed || hasVisibleGeminiStopControl()` 才将未闭合块视为实时流式输出，确保既有/延迟水合/历史轮次卡片保持手动 **Run**，而武装发送（含 `/app` → `/app/<id>` 首轮跳转）及实时重生成正常自动执行；在 `functionBlock.ts` 新增 `isExtensionContextAlive()`、在 `components.ts` 增加 `skipAutoDelivery` 与 `isExtensionContextInvalidError()` 防护；并在 `storeExecutedFunction()` 中记录失败的 `mcpClient.callTool()` 调用（跳过前置 `!isReady()` 与 context-invalid 退出）。
- **单测与 DOM 回归覆盖（`jsonFunctionParser.test.ts`、`instructionGeneratorCompact.test.ts`、`scripts/dom-tests/gemini.test.ts`）。**
  - 新增 `unescapePartialJsonString()` 与回退提取单元测试，校验加入 heredoc 提示后精简指令仍控制在 `< 2,400` 字符以内，并在 Gemini DOM 测试集中覆盖历史重放拦截与失败记录持久化。
- **在精简指令（Compact）中直出核心工具必填参数签名（`instructionGeneratorCompact.ts`）。**
  - 新增 `formatCompactParamSignature()`，为核心工具拼接简洁的必填参数签名（如 `()` 或 `(project, command)`，自动剥离内部 `_wc` 键并标注 `object[]`、`int`、`bool` 等非字符串类型），并更新 `DISCOVERY` 引导模型首轮直接调用核心工具，省去不必要的 `get_tool_schema` 往返。

### v0.1.3（2026-11-26）

- **分层精简 MCP 指令、移除 Gemini 冲突示例与长对话 `Remind`（`instructionGeneratorCompact.ts`、`instructionPipeline.ts`、`website_specific_instruction/gemini.ts`、`webcodexInstructions.ts`、`rtkInstructions.ts`）。**
  - 新增 `partitionToolsForCompactIndex()`，内联 5 个高频 WebCodex 核心工具（`list_projects`、`work_on_project`、`search_project_texts`、`read_files`、`run_shell`），将低频工具折叠为按前缀分组的清单供 `tool_lookup` / `get_tool_schema` 按需查询；收紧 `oneLiner()`（58 字符按词边界截断）和协议措辞，使 Gemini 下 17 个 WebCodex 工具的提示控制在 2,400 字符以内。
  - 在 Compact 模式下使用极简 `geminiCompactInstructions`（单行禁用 Python/`tool_code` 提示），避开旧版 5 条列表与 `json` 代码块示例冲突，同时完整保留 Full 模式兼容性。
  - 新增低于 750 字符的 `generateInstructionReminder()` 用于对话中段轻量级规则提醒。
- **按需元工具精简响应与禁用工具过滤（`metaTools.ts`）。**
  - 新增 `compactInputSchema()` 剥离内部传输键（如 `_wc`）、截断冗长参数说明并将 `get_tool_schema` 序列化为单行 JSON。
  - 更新 `runMetaTool()` 以结合 `enabledTools` 过滤结果，不再把已禁用工具暴露给 `tool_lookup` 或 `get_tool_schema`，并在 `tool_lookup` 中支持空串、`*`、`all` 及多词检索。
- **悬浮菜单精简为 5 个按钮并加入 `Remind`（`mcpPopover.tsx`）。**
  - 将较少使用的 `Tabs` 按钮替换为 `Remind`（通过 `generateInstructionReminder()` 插入 `MCP Reminder` 芯片），保留 `Hide Sidebar` / `Show Sidebar` 及其状态同步（`Insert` / `Remind` / `Attach` / `Hide Sidebar` / `Configure`）。
- **单测与 DOM 回归覆盖（`instructionGeneratorCompact.test.ts`、`metaTools.test.ts`、`scripts/dom-tests/gemini.test.ts`、`pnpm test:unit`）。**
  - 新增精简分组、Gemini 字符预算、`Remind` 输出与元工具 schema 过滤压缩单测，以及 Gemini DOM 下 `MCP Reminder` 芯片插入与发送用例。

### v0.1.2（2026-11-26）

- **修复 Gemini 工具结果展开到输入框后，在模型收尾或 Quill 重排空白时偶发卡住不自动发送（`gemini.adapter.ts`）。**
  - 根因 1：`GeminiAdapter.submitForm()` 先将芯片刷新进 `.ql-editor`，随后若检测到 `findVisibleStopControl(root)` 仍可见（例如第 1 个调用已完成但模型仍在流式输出后续段落或调用）便直接 `abortSubmit`，等待完成后不会重新发送。
  - 根因 2：`getComposerChange()` 使用严格的 `readDraft(snapshot.input) !== snapshot.draft` 对比，Quill 在 `insertText` 后自动规范化段落空白容易被误判为 `draft text changed` 并中止发送。
  - 修复：刷新芯片前若可见 Stop 按钮则有界轮询等待其清除（`STOP_CLEAR_TIMEOUT_MS = 15000`，每 `120ms` 校验 `canProceed()`、URL、编辑器连接与规范化草稿）；刷新后循环在截止时间内容忍瞬时 Stop 状态；在 `getComposerChange()` 中对草稿做空白归一化，并在 `SEND_HINT_RE` 中补充 `发送提示` / `提交`。
- **修复截断或异常的流式工具卡片一直转圈（`streamObserver.ts`、`stalledStreamHandler.ts`）。**
  - 根因 1：`createStalledIndicator()` 移除了 `function-loading` 类但未移除 `.spinner` DOM 节点，导致卡片切换为 `function-stalled` 后仍在转圈。
  - 根因 2：`monitorNode()` 的断流检测仅查询 `.function-block[data-block-id="${blockId}"]`，当多工具调用第 0 段已完成而后续分段 `${blockId}-s1` / `-s2` 中断时会漏检。
  - 修复：断流时匹配 `${blockId}` 及 `${blockId}-s*` 所有仍在加载中的卡片并逐一派发 `stream-abruptly-ended`；在 `createStalledIndicator()` 内清理 `.spinner` 节点。
- **无头 Chrome DOM 回归测试集（`scripts/dom-tests/`、`pnpm test:dom`）。**
  - 新增基于真实扩展模块打包运行的浏览器 DOM 集成测试，覆盖 AI Studio、Gemini 与断流场景（`aistudio.test.ts`、`gemini.test.ts`）。

### v0.1.1（2026-11-25）

- **AI Studio `Ctrl+Enter` 与 `Run` 按钮合并发送指令芯片（`input-chips.ts`、`aistudio.adapter.ts`、`aistudioTurnGate.ts`）。**
  - 通过 `window` 捕获阶段在 `isChipSubmitEnter(e, { allowCtrl: isAistudio })` 中拦截 `Ctrl+Enter`，确保芯片负载先于 AI Studio 自身发送处理器完成合并。
  - 遵守 AI Studio 默认的 `button.ctrl-enter-submits` 模式以保留普通 `Enter` 换行，并在 `insertTextToChatInput` 中避免合并芯片时出现四连换行（`\n\n\n\n`）；发送期间保持监听器挂载以吸收重复按键/点击。
- **修复 AI Studio 首轮工具卡片被共享 `/prompts/new_chat` 执行历史误拦截（`storage.ts`、`functionBlock.ts`、`aistudioTurnGate.ts`）。**
  - AI Studio 在首条模型回复完成后数秒才把 URL 从 `/prompts/new_chat` 跳转到具体会话地址；把首轮调用记录写入 `localStorage['mcp_url_based_function_history']` 会导致之后每次开新对话提问相同内容都被判为 `alreadyExec: true`。
  - 新增 `isAistudioNewChatUrl()` 在共享新对话路由跳过读写 URL 历史，并在 AI Studio 上改用轮次作用域的 `aistudioTurnGate` 溯源与 `claimAistudioAutomaticInvocation()`。
- **AI Studio 及时轮次绑定、鲁棒草稿校验与首轮自动发送 URL 迁移兼容（`aistudioTurnGate.ts`、`functionResult.ts`、`automation.service.ts`）。**
  - 新增即时 `MutationObserver`（`bindObserver`）与微任务/轮询刷新钩子，避免模型长思考超过 `BIND_TIMEOUT_MS` 导致漏绑。
  - 放宽 `draftMatchesTurn()` 对 Angular `#comment` 注释节点、空白折叠及 `<hr>` 的匹配容错，同时对历史与无关轮次保持严格拒绝。
  - 新增 `isSameAistudioConversation()` 并接入 `AutomationService`（`isComposerStillInserted`、`queueDeferredSubmit`、`isDeferredScopeValid`），使 `autoInsert` 与 `autoSubmit` 之间发生 `/prompts/new_chat` → `/prompts/<id>` 跳转时仍可正确发送结果一次。
- **AI Studio 发送按钮作用域收敛与 Angular 表单同步（`aistudio.adapter.ts`、`aistudioTurnGate.ts`、`automation.service.ts`）。**
  - 将 `submitChatInput()` 与 `isAistudioSendControlReady()` 收敛至对应输入容器内的 `findAistudioSendButton(chatInput)`，在 `Stop` 或 `aria-disabled="true"` 时平稳延后；通过原生 `HTMLTextAreaElement.prototype.value` setter 与 `InputEvent('input')` / `change` 确保 Angular 正确更新表单可提交状态。

## 许可证

**MCP SuperAssistant G**（完整衍生作品及 `custom` 分支上的全部新增与修改内容）采用 GNU 通用公共许可证 v3.0 或更高版本（`GPL-3.0-or-later`，完整文本见 [LICENSE](LICENSE)）发布，版权归 `andrewngcanton-gif` 所有（Copyright (c) 2026）。

上游基线（`main` 分支，提交 `30bb204`）衍生自 MIT 许可的 MCP SuperAssistant，原始许可证与版权声明完整保留在 [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT) 中。项目新增源码文件均标注 `Copyright (c) 2026 andrewngcanton-gif` 与 `SPDX-License-Identifier: GPL-3.0-or-later`。

## 仓库分支说明

默认分支为 `custom`。为保持仓库专注在 `main` 与 `custom` 两个分支，`custom` 移除了上游的 Dependabot 定时配置；`main` 分支保留了上游原始配置。两分支共享上游 v0.7.3 源码快照（原始上游提交号记录在快照提交信息中）。

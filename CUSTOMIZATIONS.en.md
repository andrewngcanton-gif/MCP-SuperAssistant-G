# MCP SuperAssistant G — Technical Customizations

<p align="center">
  <a href="CUSTOMIZATIONS.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="CHANGELOG.en.md">User-facing changelog</a>
</p>

This repository is a public community build based on MCP SuperAssistant v0.7.3.

- `main` starts from a source snapshot of upstream MCP SuperAssistant commit `30bb2045e630d7db3547179f374c15af6f308924`.
- `custom` contains the local integrated build and its custom changes.
- The local `baseline-v0.7.3-local` tag preserves the integrated build from before the branch history was rebuilt. The public repository contains the new snapshot history.

This repository is not an official release of MCP SuperAssistant. The upstream project is available at https://github.com/srbhptl39/MCP-SuperAssistant.

## Customizations in the baseline

The baseline includes the accepted local changes for Gemini submit handling, AI Studio historical-turn gating, WebCodex RTK instructions, and WebCodex file-edit guidance. The exact source diff is visible on `custom` relative to `main`.

The local integration references WebCodex 0.5.0 and RTK 0.49.0. Local Runner configuration, CrewDispatch credentials, browser profiles, private logs, and machine-specific startup files are intentionally excluded from this repository.

<a id="crewdispatch-opt-in-proxy-configuration"></a>
## CrewDispatch opt-in proxy configuration

The stock proxy loads `mcpServers` and registers every entry; it has no `enabled` field. To keep CrewDispatch opt-in without patching the proxy, keep a managed input that combines the existing `mcpServers` entries with a `crewdispatch` toggle, then generate the file the proxy actually reads.

`scripts/crewdispatch-config/mcp-servers.example.json` defaults to CrewDispatch off. Copy it to `scripts/crewdispatch-config/mcp-servers.json` and use your existing MCP server entries, including any required headers. To opt in, set the installed CrewDispatch MCP entrypoint and enable it.

```json
"crewdispatch": {
  "enabled": true,
  "command": "node",
  "args": ["<absolute path to the installed CrewDispatch MCP entrypoint>"]
}
```

Only the exact boolean `true` adds an `mcpServers.crewdispatch` stdio entry to the generated config. Missing or `false` leaves CrewDispatch out, even if the input still contains an older `crewdispatch` server entry. Other server entries and their `headers` are copied unchanged; the managed input is never modified and must not be passed to the proxy directly.

Generate the proxy config and start the proxy with it.

```bash
node scripts/crewdispatch-config/generate-config.mjs --input scripts/crewdispatch-config/mcp-servers.json --output scripts/crewdispatch-config/mcp-servers.generated.json

npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config scripts/crewdispatch-config/mcp-servers.generated.json --outputTransport sse --port 3006
```

After changing the toggle, re-run the generator and restart the proxy; the running process does not reload its config. Local `mcp-servers.json` and generated files are gitignored — keep real entrypoint paths, headers, and tokens out of tracked files and out of shared output.

## Technical changelog

Detailed implementation-level notes for each release and fix. User-facing summaries live in [README.en.md](README.en.md) and [CHANGELOG.en.md](CHANGELOG.en.md).

### v0.2.0 (2026-11-27)

- **macOS `Cmd+Enter` submit & turn-provenance gate support:**
  - `pages/content/src/services/input-chips.ts`: extended `isChipSubmitEnter` and `onKeydown` to support `Cmd+Enter` (`metaKey`) while preserving existing Windows `Ctrl+Enter` and plain `Enter` paths.
  - `pages/content/src/render_prescript/src/provenance/aistudioTurnGate.ts`: updated `onKeyDown` to accept single-modifier `ctrlKey || metaKey` (rejecting dual-modifier chords).
  - `pages/content/src/render_prescript/src/provenance/aistudioAppsTurnGate.ts`: updated `onWindowKeydown` with `hasPrimaryModifier = (e.ctrlKey && !e.metaKey) || (e.metaKey && !e.ctrlKey)`.
  - `pages/content/src/plugins/adapters/aistudio-apps.ts`: updated timeout fallback synthetic keydown dispatch using `isMac` (`ctrlKey: !isMac, metaKey: isMac`).
  - `scripts/dom-tests/aistudio.test.ts` & `scripts/dom-tests/aistudio-apps.test.ts`: added `Cmd+Enter` coverage in Test 6 and Test 1 respectively.
- **macOS CI verification & automated GitHub Release packaging:**
  - Added `.github/workflows/release-zip.yml` running on `macos-latest` in clean-checkout order (`pnpm build` before `pnpm type-check` so generated `@extension/i18n/lib/i18n.js` exists, followed by `pnpm test:unit` and `pnpm test:dom`), uploading `mcp-superassistant-g-${LABEL}-chrome.zip` and publishing it on `refs/tags/v*`.
  - Updated `.nvmrc` to `22` and `package.json` `engines.node` to `>=22.13.0` to satisfy `eslint-visitor-keys@5.0.1`.
- **OS-specific bilingual WebCodex guides:**
  - Added `WEBCODEX_MACOS.en.md` (with top-level one-click `~/start-mcp-webcodex.sh` launcher script) and `WEBCODEX_WINDOWS.en.md`, linking both from the shared WebCodex section in `README.en.md` (`v0.5.0` on Windows, `v0.5.1` on macOS).

### v0.1.9 (2026-11-27)

- **Fixed `Remind` + user prompt collapsing into an unexpandable empty "Tool result" and Markdown `<hr>` splitting (`functionResult.ts`, `functionResultObserver.ts`, `scripts/dom-tests/gemini.test.ts`).**
  - Root cause: `generateInstructionReminder()` mentions `<function_result>` literally without `<system>` tags or a closing `</function_result>`. `renderFunctionResult()` matched loose `content.includes('<function_result')`, extracted an empty string, hid the user's prompt, and built a zero-height unexpandable Tool result card; furthermore, Markdown hosts convert `\n\n---\n` to `<hr>`, omitting `---` from `textContent`.
  - Fix: Explicitly detect `[MCP SuperAssistant reminder]` in both `functionResult.ts` and `functionResultObserver.ts`, reuse `chips.mcpReminder` (`MCP Reminder` / `MCP提醒`) for the header, fall back to splitting at the instruction/reminder header (`splitIdx = sep >= 0 ? sep : sysIdx`) when `---` is rendered as `<hr>`, require a paired `<function_result\b[^>]*>([\s\S]*?)<\/function_result>` match before folding as a Tool result, and add coverage for `---`, `<hr>`, and unpaired prose mentions in `scripts/dom-tests/gemini.test.ts`.
- **Fixed AI Studio Build / Apps landing MCP button placement and workspace user bubble collapsing (`aistudio-apps.ts`, `aistudio.adapter.ts`, `config.ts`, `scripts/dom-tests/aistudio-apps.test.ts`).**
  - Fix: Added route-gated `findAistudioAppsButtonInsertionPoint()` in `aistudio-apps.ts` targeting `ms-applet-generator-form .actions-container` immediately after `:scope > ms-add-media-menu` (before `span.spacer`) with flex centering in `aistudio.adapter.ts`, appended `'ms-code-assistant-chat .bubble.user'` to `aistudio`'s `function_result_selector` in `config.ts`, and added a DOM regression test in `scripts/dom-tests/aistudio-apps.test.ts`.
- **Reinforced `python -c` in Gemini `Remind` output (`instructionGeneratorCompact.ts`, `instructionGeneratorCompact.test.ts`).**
  - Improvement: `generateInstructionReminder()` emits `short python -c script` when running on Gemini hosts while remaining under 750 characters, verified by unit test for both Gemini and non-Gemini hosts.

### v0.1.8 (2026-11-27)

- **Fixed trailing cards in multi-call JSONL blocks freezing in `.function-loading` (`functionBlock.ts`, `scripts/dom-tests/gemini.test.ts`).**
  - Root cause: `renderFunctionCall()`'s skip guard checked only whether Card 0 (`.function-block[data-block-id="${blockId}"]`) already carried `.function-complete` alongside `functionInfo.isComplete`. In a multi-call JSONL block, Card 0 receives `.function-complete` as soon as the first call closes; once Call 2 begins streaming into `${blockId}-s1` in `.function-loading` and then receives its final arguments + `function_call_end` (flipping `functionInfo.isComplete` back to `true`), the guard returned `false` and dropped the closing render for Card 2, leaving it permanently spinning without a `Run` button, blocking `automationService` auto-submit for up to 60 seconds, and omitting its result from the reply.
  - Fix: Added `!hasLoadingCard && renderedCardCount >= expectedCardCount` to the skip guard (checking both `${blockId}` and `${blockId}-s*` cards against `splitJSONFunctionSegments()`), plus a regression test in `scripts/dom-tests/gemini.test.ts`.
- **Preserved structured MCP 400 / JSON-RPC errors and `Expected input_schema` (`components.ts`, `functionHistory.ts`, `scripts/dom-tests/gemini.test.ts`).**
  - Root cause: The catch blocks in `components.ts` and `functionHistory.ts` unconditionally matched substring `.includes('timeout')` / `.includes('connection')`, rewriting structured HTTP 400 / JSON-RPC `-32602` validation errors whose returned `Expected input_schema` contained `timeout_secs` (e.g., `search_project_texts`) into `Request timed out. Please try again.`.
  - Fix: Guarded the friendly-message rewrite behind `!isStructuredToolError` (`/MCP error \d{3}|"jsonrpc"|Expected input_schema|invalid arguments/i`), keeping structured tool error details intact while preserving friendly mapping for actual timeouts/disconnects; covered in `scripts/dom-tests/gemini.test.ts`.
- **Surfaced required keys for objects/object-arrays in Compact signatures and added Gemini `python -c` shell guidance (`instructionGeneratorCompact.ts`, `website_specific_instruction/gemini.ts`, `instructionGeneratorCompact.test.ts`).**
  - Improvement: Added `formatObjectRequiredHint()` inside `formatCompactTypeHint()` to read required inner keys (up to 3 keys, excluding `_wc`) on `object` parameters and `items.type === 'object'` arrays, producing hints like `queries: {pattern}[]`, `items: {path}[]`, and `{path, content}`. Updated `geminiCompactInstructions` to prefer `python -c` over `$`-heavy/piped PowerShell one-liners and tightened `instructionGeneratorCompact.ts` copy so a 17-tool WebCodex prompt on Gemini still stays under the 2,400-char test budget (covered in `instructionGeneratorCompact.test.ts`).

### v0.1.7 (2026-11-27)

- **Gemini multi-chip composer layout fix and single-row chip scrolling (`gemini.adapter.ts`, `input-chips.ts`, `scripts/dom-tests/gemini.test.ts`).**
  - Root cause: `GeminiAdapter.getChipAnchors()` previously returned `resolveComposerRoot(input)`, which resolved to `.text-input-field` — Gemini's internal CSS Grid / horizontal flex composer container. Prepending `#mcp-input-chips-host` directly inside `.text-input-field` placed the chip bar into a horizontal track alongside `.ql-editor`, shifting the caret right on chips #1–#2 and crushing `.ql-editor` to zero width on chip #3+.
  - Fix: Added `resolveChipContainer(input)` in `gemini.adapter.ts` (keeping `resolveComposerRoot()` intact for send/stop control scoping) to skip `.text-input-field`, grids, and horizontal flex rows and mount `#mcp-input-chips-host` in the nearest vertical-stacking composer ancestor (`block` / `flow-root` / `flex-direction: column`) below main chat boundaries; updated `CHIP_STYLES` in `input-chips.ts` to single-row horizontal scroll (`flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden;`, `.chip { flex-shrink: 0; max-width: 210px; }`) with `:host { grid-column: 1 / -1; }` defense-in-depth.
  - Regression test: Added a headless Chrome DOM test in `scripts/dom-tests/gemini.test.ts` reproducing `.input-area-container` → `.input-area (flex column)` → `.text-input-field (grid: auto 1fr auto)` → `.ql-editor` and asserting mount target plus unchanged `left`/`width`/`height` across 3 inserted `tool-result` chips.
- **Conditional required-parameter signatures in Compact instructions (`instructionGeneratorCompact.ts`, `instructionGeneratorCompact.test.ts`).**
  - Root cause: `formatCompactParamSignature()` previously inspected only top-level `required`, emitting `work_on_project(instruction)` and causing models to omit the runtime-required `project` / `client_id+path` / `session_id` selector and hit HTTP 400 (`-32602`).
  - Fix: Added `extractConditionalSelector()` to surface `oneOf`/`anyOf` required-key branches and WebCodex's mutually exclusive `project | client_id+path | session_id` selector in compact signatures, with unit test coverage in `instructionGeneratorCompact.test.ts`.

### v0.1.6 (2026-11-27)

- **Shared, zero-Suspense UI i18n engine (`packages/shared/lib/i18n/*`, `packages/shared/index.mts`, `packages/shared/tests/i18n.test.ts`).**
  - Added a standalone, compile-time-checked i18n layer (`types.ts`, `locales/en.ts`, `locales/zh-CN.ts`, `core.ts`, `react.ts`, `dom.ts`) backed by `chrome.storage.local` (`mcp-ui-language`) with guarded `chrome.storage.onChanged` cross-context sync, BCP-47 priority-order `'auto'` locale resolution, React 19 `useSyncExternalStore` hook (`useI18n()`), and live DOM attribute sync (`setI18nText`, `setI18nAttr`, `bindI18nDomSync`) for native DOM tool cards.
  - Added unit tests in `packages/shared/tests/i18n.test.ts` (registered in `package.json` `test:unit`) verifying `en`/`zh-CN` key parity, placeholder parity, CJK-ASCII spacing conventions, locale resolution, and snapshot stability.
- **Full UI localization and CJK layout polish (`Settings.tsx`, `Sidebar.tsx`, `ServerStatus.tsx`, `SetupHelp.tsx`, `AvailableTools.tsx`, `InstructionManager.tsx`, `ConsentBanner.tsx`, `mcpPopover.tsx`, `TabPicker.tsx`, `TabPickerPanel.tsx`, `components.ts`, `functionBlock.ts`, `functionResult.ts`, `functionHistory.ts`, `input-chips.ts`, `sidebar.css`, `pages/options/src/*`).**
  - Wired all sidebar, popover, tab-picker, native tool card, input chip, and options/consent/grant UI strings while keeping LLM instruction generators, chat-injected prompts, host-site button matchers, and DOM test selectors completely untouched.
  - Added CJK sans-serif fallbacks and `select`/`option`/`label`/`textarea` coverage in `sidebar.css`, stacked the RTK opt-in card header/description layout in `InstructionManager.tsx`, and synchronized tooltips on the expanded popover's Insert/Attach buttons.

### v0.1.5 (2026-11-27)

- **Google AI Studio Build / Apps adapter and isolated turn gate (`aistudio-apps.ts`, `aistudioAppsTurnGate.ts`, `aistudio.adapter.ts`, `aistudioTurnGate.ts`, `plugin-types.ts`, `input-chips.ts`, `index.ts`, `functionBlock.ts`, `components.ts`).**
  - Added dedicated route-gated helpers (`aistudio-apps.ts`) supporting both the `/app/apps` landing composer (`ms-applet-generator-form` `contenteditable="plaintext-only"`) and the `/apps/<id>` workspace assistant pane (`ms-code-assistant-chat` `<textarea class="cdk-textarea-autosize">`) while excluding the competing right-pane Monaco editor (`.monaco-editor textarea.inputarea`), waiting for Stop-control completion before chip flush/submit, and handling `Ctrl+Enter` / disabled-button states.
  - Added `aistudioAppsTurnGate.ts` to keep `/app/apps` and `/apps/*` isolated from Playground (`aistudioTurnGate.ts`), arming on `Ctrl+Enter` (ignoring IME composition), Send clicks, and extension auto-submits, preserving armed state across `/app/apps` → `/apps/<id>` first-send navigation and query-param changes, blocking historical replay on reload or app switch, enforcing `window.__mcpToolEnablement`, and scoping auto-execution dedupe per turn (`claimAistudioAppsAutoExecution()`).
- **Headless Chrome DOM regression suite (`scripts/dom-tests/aistudio-apps.test.ts`, `scripts/dom-tests/run.mjs`).**
  - Added a 10-test suite covering landing and dual-pane workspace DOMs (including competing Monaco `<textarea>`), historical replay blocking, manual Run `skipAutoDelivery`, mid-generation Stop wait, draft-edit/navigation abort, multi-turn rounds, cross-app repeated tool calls, and `Disable All` / per-tool disable enforcement.

### v0.1.4 (2026-11-26)

- **Preserved regex & newline escapes in `run_shell` tool calls (`jsonFunctionParser.ts`, `webcodexInstructions.ts`).**
  - Root cause: When a `parameter` JSONL line failed `JSON.parse()` (e.g., due to non-JSON regex escapes such as `\s` or `\d`) and fell back to regex extraction in `extractJSONParameters()`, chained replacements replaced `\\n` before `\\\\`, corrupting literal `\r?\n` into `\` + newline. Models also frequently triggered shell/JSON triple-escaping failures with inline regex scripts.
  - Fix: Added single-pass `unescapePartialJsonString()` preserving non-JSON regex escapes (`\s`, `\d`, etc.) and decoding `\\n` strictly as literal `\n`, and updated `buildWebCodexFileEditGuidance()` to steer `run_shell` edits toward single-quoted heredocs (`<<'EOF'` / `@'...'@`) and literal `replace`/`split`/`join`.
- **Prevented historical tool-call replay on Gemini and persisted failed tool attempts (`geminiTurnGate.ts`, `functionBlock.ts`, `index.ts`, `gemini.adapter.ts`, `components.ts`).**
  - Root cause: Unlike AI Studio (`aistudioTurnGate.ts`), Gemini relied solely on URL-keyed `localStorage` history, and `components.ts` only called `storeExecutedFunction()` on success. Reloading an existing Gemini chat could replay an earlier failed/timed-out or evicted card automatically and send its result into the chat; additionally, orphaned content scripts (before refreshing an already-open tab after extension reload) could still auto-run local meta-tools and emit `ERROR: Extension context is invalid` back to chat, and Angular hydration without a Stop button could resemble incremental streaming.
  - Fix: Added `geminiTurnGate.ts` (`initializeGeminiTurnGate`, `notifyGeminiSubmission`, `observeGeminiBlock`, `canGeminiAutoExecute`) requiring `armed || hasVisibleGeminiStopControl()` before treating partial blocks as live streams so existing/late-hydrated/prior-turn Gemini cards require manual `Run` while armed user sends (including `/app` → `/app/<id>` first-send migration) and live-streaming regenerations auto-execute as expected; added `isExtensionContextAlive()` in `functionBlock.ts` and `skipAutoDelivery` / `isExtensionContextInvalidError()` guards in `components.ts` (suppressing auto-delivery on manual historical Gemini runs and invalidated contexts); and persisted failed `mcpClient.callTool()` attempts (excluding pre-flight `!isReady()` and context-invalid exits) in `storeExecutedFunction()`.
- **Unit & DOM regression coverage (`jsonFunctionParser.test.ts`, `instructionGeneratorCompact.test.ts`, `scripts/dom-tests/gemini.test.ts`).**
  - Added unit tests for `unescapePartialJsonString()` and fallback extraction, verified Compact prompt length stays `< 2,400` chars with the heredoc hint, and added Gemini DOM tests for historical-replay blocking and failed-call persistence.
- **Inline required-parameter signatures for Compact core tools (`instructionGeneratorCompact.ts`).**
  - Added `formatCompactParamSignature()` to append concise required-parameter signatures such as `()` or `(project, command)` (stripping internal `_wc` keys and annotating non-string types like `object[]`, `int`, `bool`) to the inlined core tools, and updated `DISCOVERY` to direct calling core tools immediately without a redundant Turn-1 `get_tool_schema` round-trip.

### v0.1.3 (2026-11-26)

- **Tiered Compact MCP instructions, Gemini conflict removal, and long-chat `Remind` (`instructionGeneratorCompact.ts`, `instructionPipeline.ts`, `website_specific_instruction/gemini.ts`, `webcodexInstructions.ts`, `rtkInstructions.ts`).**
  - Added `partitionToolsForCompactIndex()` to inline 5 high-frequency WebCodex core tools (`list_projects`, `work_on_project`, `search_project_texts`, `read_files`, `run_shell`) while collapsing lower-frequency tools into a compact prefix list discoverable via `tool_lookup` / `get_tool_schema`. Tightened `oneLiner()` (58-char word-boundary truncation) and protocol wording, keeping a 17-tool WebCodex prompt on Gemini under 2,400 chars.
  - Added minimal `geminiCompactInstructions` for Compact mode (single-line no-Python/no-`tool_code` note) to eliminate the legacy 5-bullet list and conflicting `json` code-fence example while keeping legacy Full mode intact.
  - Added `generateInstructionReminder()` (< 750 chars) for lightweight mid-conversation rule reinforcement.
- **Compact on-demand meta-tool responses and disabled-tool filtering (`metaTools.ts`).**
  - Added `compactInputSchema()` to strip internal transport keys (such as `_wc`), clamp long parameter descriptions, and serialize `get_tool_schema` as single-line JSON.
  - Updated `runMetaTool()` to filter against `enabledTools` so disabled tools are not exposed by `tool_lookup` or `get_tool_schema`, and added empty/`*`/`all` query support plus multi-token matching in `tool_lookup`.
- **Hover menu streamlined to 5 buttons with `Remind` (`mcpPopover.tsx`).**
  - Replaced the unused `Tabs` trigger with `Remind` (inserts `MCP Reminder` chip via `generateInstructionReminder()`), while keeping `Hide Sidebar` / `Show Sidebar` and its visibility sync intact (`Insert` / `Remind` / `Attach` / `Hide Sidebar` / `Configure`).
- **Unit & DOM regression coverage (`instructionGeneratorCompact.test.ts`, `metaTools.test.ts`, `scripts/dom-tests/gemini.test.ts`, `pnpm test:unit`).**
  - Added unit tests for Compact partitioning, Gemini prompt budget, `Remind` output, and meta-tool schema compaction/filtering, plus a Gemini DOM test for `MCP Reminder` chip insertion and submission.

### v0.1.2 (2026-11-26)

- **Gemini Auto Submit could expand a tool result and stall when Gemini was still closing its turn or Quill reformatted whitespace (`gemini.adapter.ts`).**
  - Root cause 1: `GeminiAdapter.submitForm()` flushed pending chips into `.ql-editor` first, then immediately called `abortSubmit('Gemini is generating (stop control present)')` without polling if `findVisibleStopControl(root)` was still visible (e.g., when call #1 failed or completed while Gemini was still streaming a trailing call or paragraph). Once Gemini finished generating and switched Stop back to Send, nothing retried submission.
  - Root cause 2: `getComposerChange()` compared `readDraft(snapshot.input) !== snapshot.draft` strictly, so Quill paragraph/whitespace normalization after `insertText` could falsely abort submission as `draft text changed`.
  - Fix: Added a bounded pre-flush wait (`STOP_CLEAR_TIMEOUT_MS = 15000`, polling every `120ms` while checking `canProceed()`, URL, editor connection, and normalized draft) when Stop is visible, changed the post-flush loop to wait out transient Stop states until `deadline` instead of aborting on the first tick, normalized whitespace in `getComposerChange()`, and extended `SEND_HINT_RE` with `发送提示` / `提交`.
- **Truncated / malformed streaming tool-call cards kept spinning indefinitely (`streamObserver.ts`, `stalledStreamHandler.ts`).**
  - Root cause 1: `createStalledIndicator()` removed the `function-loading` CSS class but never removed the `.spinner` DOM node, so CSS animation continued spinning after a card transitioned to `function-stalled`.
  - Root cause 2: `monitorNode()`'s abrupt-end detector only queried `.function-block[data-block-id="${blockId}"]`, missing multi-call segment cards (`${blockId}-s1`, `${blockId}-s2`, …) when segment 0 had already completed and a later segment stalled.
  - Fix: Query all `.function-block.function-loading` cards matching `${blockId}` or `${blockId}-s*` on abrupt end and dispatch `stream-abruptly-ended` for each; remove `.spinner` elements inside `createStalledIndicator()`.
- **Headless Chrome DOM regression suite (`scripts/dom-tests/`, `pnpm test:dom`).**
  - Added automated browser-DOM integration tests bundling the real extension modules against AI Studio, Gemini, and stalled-stream regression scenarios (`aistudio.test.ts` and `gemini.test.ts`).

### v0.1.1 (2026-11-25)

- **AI Studio `Ctrl+Enter` and `Run` button instruction-chip merging (`input-chips.ts`, `aistudio.adapter.ts`, `aistudioTurnGate.ts`).**
  - Enabled `Ctrl+Enter` interception in `isChipSubmitEnter(e, { allowCtrl: isAistudio })` using `window` capture so pending instruction chips flush before AI Studio's own composer handler runs.
  - Respected AI Studio's default `button.ctrl-enter-submits` mode so plain `Enter` remains a newline in both `input-chips.ts` and `aistudioTurnGate.ts`, and prevented quadruple newlines (`\n\n\n\n`) when merging chip payloads in `insertTextToChatInput`.
  - Kept window listeners attached while `sending` is true to swallow duplicate clicks/keystrokes during submission.
- **First-turn AI Studio tool cards blocked by shared `/prompts/new_chat` execution history (`storage.ts`, `functionBlock.ts`, `aistudioTurnGate.ts`).**
  - AI Studio keeps the shared `/prompts/new_chat` URL until several seconds after the first model reply completes. Persisting first-turn calls (such as `get_tool_schema` with `call_id=1`) under that URL in `localStorage['mcp_url_based_function_history']` caused every subsequent new chat with the same prompt to hit `alreadyExec: true` and stall at manual `Run`.
  - Added `isAistudioNewChatUrl()` to skip reading/writing URL-keyed history on shared new-chat routes, and bypassed URL-keyed `executionTracker.isFunctionExecuted` / `getPreviousExecution` checks on AI Studio in favor of turn-scoped `aistudioTurnGate` provenance and `claimAistudioAutomaticInvocation(provenance, callId)`.
- **AI Studio eager turn binding, resilient draft verification, and first-send URL migration during auto-submit (`aistudioTurnGate.ts`, `functionResult.ts`, `automation.service.ts`).**
  - Added an eager `MutationObserver` (`bindObserver`) and microtask/poll refresh hooks so newly rendered user turns bind immediately instead of waiting until the first model tool card completes and hitting `BIND_TIMEOUT_MS` during long thinking phases.
  - Relaxed `draftMatchesTurn()` to use `chunk.contains(original.replacement)` (tolerating Angular `#comment` sibling nodes), whitespace collapsing, `<hr>` stripping, and content anchors for chip/`<function_result>` payloads while keeping historical and unrelated turns fail-closed.
  - Added `isSameAistudioConversation()` and wired it into `AutomationService` (`isComposerStillInserted`, `queueDeferredSubmit`, `isDeferredScopeValid`) so a verified `/prompts/new_chat` → `/prompts/<id>` transition occurring between `autoInsert` and `autoSubmit` does not abort sending an already-expanded tool result.
- **AI Studio send-button scoping and Angular form sync (`aistudio.adapter.ts`, `aistudioTurnGate.ts`, `automation.service.ts`).**
  - Scoped `submitChatInput()` and `isAistudioSendControlReady()` to `findAistudioSendButton(chatInput)` inside the matching composer root, deferring cleanly when `Stop` or `aria-disabled="true"` is active, and only cancelling `deferredSubmit` on trusted edits or actual draft changes.
  - Updated `insertTextToChatInput()` to use the native `HTMLTextAreaElement.prototype.value` setter and dispatch `InputEvent('input')` + `change` so Angular updates form state and clears `aria-disabled="true"`.

## License

MCP SuperAssistant G (the integrated derivative work and all additions/modifications on `custom`) is licensed under the GNU General Public License v3.0 or later (`GPL-3.0-or-later`; full text in [LICENSE](LICENSE)), Copyright (c) 2026 `andrewngcanton-gif`.

The upstream baseline (`main`, commit `30bb204`) is derived from MCP SuperAssistant under the MIT License; its original license text and copyright notice are preserved in [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT). Newly added project modules carry `Copyright (c) 2026 andrewngcanton-gif` and `SPDX-License-Identifier: GPL-3.0-or-later` headers.

## Repository branches

The default branch is `custom`. It omits the upstream Dependabot schedule to keep the repository focused on `main` and `custom`. The `main` branch retains the original upstream configuration. The two branches share a snapshot of the upstream v0.7.3 source. The original upstream commit ID is recorded in the snapshot commit.

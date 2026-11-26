# MCP SuperAssistant G

This repository is a public community build based on MCP SuperAssistant v0.7.3.

- main starts from a source snapshot of upstream MCP SuperAssistant commit 30bb2045e630d7db3547179f374c15af6f308924.
- custom contains the local integrated build and its custom changes.
- The local `baseline-v0.7.3-local` tag preserves the integrated build from before the branch history was rebuilt. The public repository contains the new snapshot history.

This repository is not an official release of MCP SuperAssistant. The upstream project is available at https://github.com/srbhptl39/MCP-SuperAssistant.

## Customizations in the baseline

The baseline includes the accepted local changes for Gemini submit handling, AI Studio historical-turn gating, WebCodex RTK instructions, and WebCodex file-edit guidance. The exact source diff is visible on custom relative to main.

The local integration references WebCodex 0.5.0 and RTK 0.49.0. Local Runner configuration, CrewDispatch credentials, browser profiles, private logs, and machine-specific startup files are intentionally excluded from this repository.

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

Detailed implementation-level notes for each release and fix. User-facing summaries live in [README.md](README.md) and [README.en.md](README.en.md).

### v0.1.3

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

### v0.1.2

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

### v0.1.1

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

The upstream project is distributed under the MIT License. The original LICENSE file and copyright notice are retained.

## Repository branches

The default branch is custom. It omits the upstream Dependabot schedule to keep the repository focused on main and custom. The main branch retains the original upstream configuration. The two branches share a snapshot of the upstream v0.7.3 source. The original upstream commit ID is recorded in the snapshot commit.

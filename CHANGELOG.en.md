# Changelog

<p align="center">
  <a href="CHANGELOG.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="CUSTOMIZATIONS.en.md">Technical customizations &amp; changelog</a>
</p>

User-facing release history for **MCP SuperAssistant G**.

### v0.1.8 (2026-11-27)

- **Fixed trailing cards in multi-call tool blocks freezing on a spinner and never executing.** When the first call in a multi-call JSONL block finishes before subsequent calls finish streaming, later cards are no longer skipped on their closing chunk—they finish rendering, auto-execute, and return with the batch instead of holding auto-submit for up to 60 seconds or dropping results.
- **Preserved structured MCP 400 / JSON-RPC error details and schemas.** Validation errors whose returned `Expected input_schema` mentions words like `timeout_secs` or `connection` are no longer overwritten as generic timeout or connection-lost messages, allowing models to self-correct immediately.
- **Surfaced required keys inside object and object-array parameters, plus Gemini `python -c` shell guidance.** Compact core signatures now display required inner keys (such as `queries: {pattern}[]` and `items: {path}[]`) to prevent first-turn argument guesswork, and Gemini's compact prompt steers complex shell tasks toward `python -c` to avoid PowerShell `$` and pipe escaping corruption.

### v0.1.7 (2026-11-27)

- **Fixed Gemini's input cursor shifting or disappearing after inserting multiple tool results.** Switched the chip bar to a single-row horizontally scrollable strip and mounted it in the vertical composer wrapper above Gemini's `.text-input-field` so inserting 3+ tool results no longer crowds or hides the editor cursor.
- **Prevented 400 invalid-argument errors on `work_on_project` first calls.** Surfaced conditional required-parameter selectors (such as `project | client_id+path | session_id` and `oneOf`/`anyOf` schemas) in compact tool signatures so models do not omit the project source.

### v0.1.6 (2026-11-27)

- **Added multi-language UI support, starting with Simplified Chinese and English.** Follows your browser language automatically by default, and can be switched live at any time from Sidebar **Settings** or the extension Options page with instant cross-tab sync; tool instructions sent to AI stay in English.
- **Polished Chinese typography, card layout, and action tooltips.** Covers the sidebar, hover popover, tab picker, tool cards, input chips, and options/permission pages, adds explicit CJK font fallbacks for `<select>` controls, and refines the RTK card layout and instruction button tooltips.

### v0.1.5 (2026-11-27)

- **Added support for Google AI Studio Build / Apps (`/app/apps` and `/apps/<id>`).** Works with both the initial prompt box and the left-side assistant chat pane after an app is created, supporting **Insert / Remind** chip merging, `Ctrl+Enter` or Send button submission, and multi-turn automatic tool execution, insertion, and submission without touching the right-side code editor.
- **Added historical-replay and mid-generation guards for AI Studio Build / Apps.** Reloading or switching to an existing app no longer auto-runs or auto-submits older tool cards (manual **Run** still works); auto-submit waits for generation to finish before sending and honors cross-app navigation and tool enablement toggles.

### v0.1.4 (2026-11-26)

- **Core tools include required parameters upfront to skip extra lookup rounds.** Frequently used tools now show brief required-parameter hints in the initial prompt, so the model can call common tools directly on the first turn instead of doing an extra schema lookup first.
- **Fewer file-edit retries caused by broken escapes in shell commands.** Guides the model toward quoted script blocks and literal text replacement, and fixes parser fallback unescaping so regex and newline escapes are no longer mangled.
- **Fixed Gemini replaying old tool calls when reloading existing chats.** Refreshing or reopening a Gemini chat no longer auto-runs or auto-submits earlier finished or failed tool cards, while manual **Run** clicks still work.

### v0.1.3 (2026-11-26)

- **Much shorter tool instructions and parameter lookups to save tokens.** The initial instructions now highlight only the most-used core tools while keeping the rest discoverable on demand; returned tool details drop redundant and internal fields, disabled tools are no longer exposed to the model, and an outdated conflicting Gemini example was removed.
- **Added a lightweight Remind button to the hover menu and removed Tabs.** In long chats where the model starts forgetting how to call tools, click **Remind** to insert a brief rule reminder instead of re-sending the full instructions.

### v0.1.2 (2026-11-26)

- **Fixed Gemini tool results occasionally stalling in the input box without auto-sending.** When Gemini is still finishing its reply, auto-submit now waits briefly for generation to end instead of aborting immediately, and no longer aborts on editor whitespace formatting.
- **Fixed interrupted tool cards spinning indefinitely.** When a model response is cut off mid-tool-call, the card now stops spinning and shows that the stream was interrupted.

### v0.1.1 (2026-11-25)

- **Fixed AI Studio `Ctrl+Enter` omitting MCP Instructions.** Both clicking **Run** and pressing `Ctrl+Enter` now send pending instructions together with your message, while plain `Enter` stays a newline in default `Ctrl+Enter` mode.
- **Fixed first-turn AI Studio tool cards stalling at manual `Run` in new chats.** Repeating a prompt in a new chat is no longer blocked by an earlier new chat's history.
- **Fixed AI Studio tool results stalling after expansion and long thinking phases breaking auto-execution.** Tool execution and automatic result submission now continue smoothly even after long model thinking or the initial new-chat URL redirect.

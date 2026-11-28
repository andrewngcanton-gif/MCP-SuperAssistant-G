# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G banner" width="640">
</p>

<p align="center">
  <a href="README.md">中文</a> &bull; <strong>English</strong>
</p>

**MCP SuperAssistant G** is a community-enhanced Chrome extension based on [MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) that lets web chats such as Gemini Web and Google AI Studio use local MCP tools directly. Compared to upstream, it focuses on fixing auto-submit and historical replay issues, shrinking tool prompts to save tokens, and adding out-of-the-box support for WebCodex and RTK. Download a prebuilt bundle from [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) to load directly in Chrome Developer mode, or build from source.

The upstream baseline is commit `30bb204`. [`main` holds the upstream source snapshot, and `custom` is this project's default branch](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom).

This project supports and acknowledges the LINUX DO community. Thank you for giving developers a place to share their work and learn from one another. [LINUX DO](https://linux.do/)

## Contents

- [Changelog](#changelog)
- [Bug fixes](#bug-fixes)
- [New features and improvements](#new-features-and-improvements)
- [Install in Chrome](#install-in-chrome)
  - [1. Download the prebuilt extension (recommended)](#1-download-the-prebuilt-extension-recommended)
  - [2. Load the unpacked extension](#2-load-the-unpacked-extension)
  - [3. Connect an MCP server](#3-connect-an-mcp-server)
    - [Connect WebCodex](#connect-webcodex)
  - [4. Test and update](#4-test-and-update)
- [Known issues](#known-issues)
- [License](#license)

## Changelog

### v0.2.0 (2026-11-27)

- **Added macOS `Cmd+Enter` submit and turn-gate support.** Updated chip input, AI Studio turn provenance gates, and AI Studio Build / Apps auto-submit key dispatch to accept `Cmd+Enter` on macOS while keeping Windows `Ctrl+Enter` and plain `Enter` behavior unchanged; verified live on macOS M1 Chrome with WebCodex `v0.5.1`.
- **Added macOS CI verification and automated GitHub Release zip packaging.** Upgraded CI baseline to Node 22 LTS (`>=22.13.0`) with a `macos-latest` workflow running clean build, type-check, unit tests, and DOM integration tests, automatically publishing the Chrome extension `.zip` to GitHub Releases on version tags.
- **Split WebCodex setup into dedicated OS-specific guides.** Kept the shared overview in the main README and moved setup details to [WEBCODEX_MACOS.en.md](WEBCODEX_MACOS.en.md) (`v0.5.1`, including a top-level one-click launcher script) and [WEBCODEX_WINDOWS.en.md](WEBCODEX_WINDOWS.en.md) (`v0.5.0`).

> For earlier releases, see the [full changelog (CHANGELOG.en.md)](CHANGELOG.en.md).

## Bug fixes

- **Gemini Auto Submit could stall.** The extension waits for an enabled Send button in the current composer, checks that the conversation and draft are still current, and clicks once. Batching ignores stale loading cards from earlier turns and continues to wait for active tools in the current batch.
- **Gemini manual sends could omit MCP Instructions.** **Insert** keeps the original preview chip. Type a task and use Gemini's Send button or Enter to merge the pending instructions into the draft before sending.
- **Gemini Usage pages could show a broken sidebar.** The chat sidebar is suspended on `/usage` and `/u/<account-index>/usage`. Its previous state is restored when you return to chat.
- **AI Studio could replay results from conversation history.** Historical tool cards remain manual. The extension also deduplicates automatic execution and result delivery when AI Studio redraws a current card.
- **Late AI Studio results could miss Auto Submit.** Eligible late results in the same conversation can still be delivered. When **Run** is busy, the extension waits for the original composer to become ready. Editing the draft or switching conversations cancels that pending send.
- **Auto Submit counted the configured delay twice.** The configured delay now applies once during batching. A 2-second setting saves about 2 seconds of fixed waiting. The separate Auto Insert delay, result batching, and button readiness checks still apply.

## New features and improvements

- **Optional WebCodex RTK guidance.** Install the RTK command-line tool on the machine running WebCodex Runner and make sure `rtk` is on the Runner's `PATH`. This works with stock WebCodex. **Instructions → Use RTK with WebCodex** is off by default. Enable WebCodex's command runner (both `v0.5.0` and `v0.5.1` prefer `run_shell` with an `rtk` prefix, falling back to `run_process` only when `run_shell` is disabled) and turn on the toggle, then send the regenerated MCP Instructions to the chat. The guidance asks the model to use RTK for long output from suitable commands. When using a surface that exposes `work_on_project` (`v0.5.0` or `adaptive`), you can also follow the [Windows advanced config](WEBCODEX_WINDOWS.en.md#webcodex-runner-config) or [macOS advanced config](WEBCODEX_MACOS.en.md#webcodex-runner-config) to attach the rule via the Runner's `[instructions].files`. [RTK installation](https://github.com/rtk-ai/rtk)
- **WebCodex file-edit guidance.** Instructions spell out the required `project` and `changes` arguments for `edit_project_files`, including `kind` and `path` on every change. For complex content or after the first error, the guidance points the model to `run_shell` on the same WebCodex server when available, reducing repeated attempts and token use.
- **Shorter MCP Instructions.** The Compact and JSON templates use fewer words while retaining required arguments, schema lookup, call examples, and the WebCodex and RTK rules. The blanket instruction to retry after a schema hint was removed.
- **Opt-in CrewDispatch proxy setup.** The publicly released CrewDispatch plugin is outdated and will receive no further updates. Most users can leave this option off, which is the default. If you already have a working CrewDispatch MCP server, you can register it with the config generator. After changing the toggle, generate the config again and restart the proxy. [CrewDispatch setup](CUSTOMIZATIONS.en.md#crewdispatch-opt-in-proxy-configuration)
- **New icons and sidebar banner.** The extension and in-page MCP icons have been updated. The sidebar uses the new banner and its logo no longer opens an external site.

## Install in Chrome

### 1. Download the prebuilt extension (recommended)

1. Download the latest **`mcp-superassistant-g-vX.Y.Z-chrome.zip`** from [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) (cross-platform bundle shared across Windows, macOS, and Linux Chrome).
2. Extract the archive into a **permanent** folder (for example `mcp-superassistant-g/`, not a temporary folder that might be cleaned up).

> [!NOTE]
> **There is no `dist/` subfolder after unzipping—this is intentional**: the Release `.zip` packages the built files directly at the archive root, so **`manifest.json`** sits right inside the extracted folder. You also **do not need Git or pnpm** for the prebuilt package; Node.js is only required if you launch the local proxy with `npx`.

If you want to track the latest commits or build locally, see **[Build from Source Guide (BUILD_FROM_SOURCE.en.md)](BUILD_FROM_SOURCE.en.md)**.

### 2. Load the unpacked extension

1. Open `chrome://extensions/` and turn on **Developer mode**.
2. If you have the upstream extension or another build installed, disable those copies to avoid running two content scripts on the same site.
3. Click **Load unpacked** and select the directory that directly contains `manifest.json`:
   - **Prebuilt Release zip**: select the extracted folder itself;
   - **Built from source**: select `MCP-SuperAssistant-G/dist`.
4. Open a Gemini or Google AI Studio chat. Refresh any chat tab that was already open and look for the **MCP** button near the composer or the sidebar.

### 3. Connect an MCP server

If you already have an MCP endpoint that the extension can reach, enter its transport type and URL in the sidebar. For local `stdio` tools or to expose multiple servers through one endpoint, use the upstream MCP SuperAssistant Proxy.

1. Prepare your own `mcp-config.json` with the server entries supplied by your tools in `mcpServers`.
2. In a terminal in the same directory as that config, run this command and leave the proxy running.

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. Open the extension sidebar's connection settings. Choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once it says **Connected**, check the **Tools** tab to see that the tools you need are enabled.

See the [upstream proxy guide](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server) for example server configurations and other transports.

#### Connect WebCodex

[WebCodex](https://github.com/yyjeqhc/webcodex) ([v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0) tested on Windows and compatible with [v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1); [v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1) tested on macOS) exposes your local project folders as MCP tools (reading files, searching code, running shell commands) so web chats like Gemini and Google AI Studio can work directly with your local codebase.

The connection chain looks like this (the local proxy bridges SSE for the extension to WebCodex's `/mcp` Streamable HTTP endpoint):

```text
Web AI (Gemini / AI Studio) ←→ Browser Extension ←→ Local Proxy (SSE) ←→ WebCodex (Local Projects)
```

**Prerequisites**: Start WebCodex Desktop (or Server) and Runner on your machine, sign in, add the project folder(s) you want the AI to access, and confirm the Runner shows **Connected**. Then pick your OS guide below:

- **[macOS Guide (WEBCODEX_MACOS.en.md)](WEBCODEX_MACOS.en.md)** — starts right at the top with a one-click launcher script (auto-reads token, auto-detects the live WebCodex port, and starts the proxy), plus manual setup and advanced options.
- **[Windows Guide (WEBCODEX_WINDOWS.en.md)](WEBCODEX_WINDOWS.en.md)** — includes the PowerShell auto-config script, advanced `runner.toml` / RTK configuration, and optional headless auto-start via Scheduled Tasks.

Once the proxy is running, choose **SSE** in the extension sidebar's connection settings, enter `http://localhost:3006/sse` as **Server URI**, click **Connect**, and verify the WebCodex tools in the **Tools** tab.

### 4. Test and update

- Open the **MCP** menu by the composer, click **Insert** to add MCP Instructions, and send them with a read-only test request (with WebCodex, ask it to list your projects to verify `list_projects`). When the model produces a tool card, click **Run** to test it manually before enabling any automatic execution, insertion, or submission.

> [!TIP]
> **Best experience**: Once your first tool call succeeds, turning on all three auto options (**Auto Execute**, **Auto Insert**, and **Auto Submit**) gives the smoothest end-to-end multi-turn workflow.

- To update:
  - **Prebuilt Release zip**: download the newer `.zip`, extract it over the same folder, click **Reload** for this extension in `chrome://extensions/`, and refresh open chat tabs.
  - **Built from source**: see [Update and rebuild](BUILD_FROM_SOURCE.en.md#update-and-rebuild).
  - If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

## Known issues

- **Gemini may drift from tool-calling rules in long conversations.** If it stops following the calling format, open the **MCP** hover menu next to the composer and click **Remind** (or **规则提醒** in Simplified Chinese) to insert a lightweight rule reminder. Because the full tool list and parameter descriptions sent earlier are already in the conversation history, the model only needs a brief format nudge rather than re-sending the entire MCP Instructions via **Insert** or **Attach**, which saves significant tokens—re-send the full instructions only in a new chat or after changing enabled tools.
- **Gemini may occasionally clear its thinking/progress indicator and stop with a blank reply.** In long sessions or high-reasoning modes, a turn after receiving tool results can occasionally roll back or end empty, pausing the tool chain. Usually **no page refresh is needed**—just send a short message such as `continue` or `?` in the same chat to resume (the previous tool result is already in the conversation context). If it stopped near a file write or Git command, ask the model to verify the current workspace state before continuing; only refresh the tab if the page itself becomes unresponsive.
- **Tool calls can return HTTP 400 or time out.** The model can sometimes recover by switching tools. The MCP Instructions explicitly tell the model to switch from WebCodex's `edit_project_files` to `run_shell` on the same server after the first error, if available. Recovery from other tool errors or timeouts depends on the model and the error. If a file edit times out, check whether the file changed before retrying.
- **Tested environment.** This extension has been tested in Chrome on Windows 11 (with WebCodex v0.5.0) and on macOS Apple Silicon (M1, with WebCodex v0.5.1, plus automated macOS CI DOM tests).

## License

This project (**MCP SuperAssistant G**) and its additions and modifications on the `custom` branch are licensed under the [GNU General Public License v3.0 or later (GPL-3.0-or-later)](LICENSE), Copyright (c) 2026 `andrewngcanton-gif`.

The upstream baseline is derived from [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant) (commit `30bb204`), whose original MIT License and copyright notice are preserved verbatim in [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT). Thanks to the upstream authors and contributors.

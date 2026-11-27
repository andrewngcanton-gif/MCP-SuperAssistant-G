# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G banner" width="640">
</p>

<p align="center">
  <a href="README.md">中文</a> &bull; <strong>English</strong>
</p>

**MCP SuperAssistant G** is a community-enhanced Chrome extension based on [MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3) that lets web chats such as Gemini Web and Google AI Studio use local MCP tools directly. Compared to upstream, it focuses on fixing auto-submit and historical replay issues, shrinking tool prompts to save tokens, and adding out-of-the-box support for WebCodex and RTK. This repository provides the source—build it and load it in Chrome Developer mode.

The upstream baseline is commit `30bb204`. [`main` holds the upstream source snapshot, and `custom` is this project's default branch](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom).

This project supports and acknowledges the LINUX DO community. Thank you for giving developers a place to share their work and learn from one another. [LINUX DO](https://linux.do/)

## Contents

- [Changelog](#changelog)
- [Bug fixes](#bug-fixes)
- [New features and improvements](#new-features-and-improvements)
- [Install in Chrome](#install-in-chrome)
  - [1. Install the prerequisites](#1-install-the-prerequisites)
  - [2. Clone and build](#2-clone-and-build)
  - [3. Load the unpacked extension](#3-load-the-unpacked-extension)
  - [4. Connect an MCP server](#4-connect-an-mcp-server)
    - [Connect WebCodex](#connect-webcodex)
  - [5. Test and update](#5-test-and-update)
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

- **Optional WebCodex RTK guidance.** Install the RTK command-line tool on the machine running WebCodex Runner and make sure `rtk` is on the Runner's `PATH`. This works with stock WebCodex. **Instructions → Use RTK with WebCodex** is off by default. Enable WebCodex's `run_process` tool and turn on the toggle, then send the regenerated MCP Instructions to the chat. The guidance asks the model to use RTK for long output from suitable commands. To also return the rule from `work_on_project`, see the [Windows advanced config](WEBCODEX_WINDOWS.en.md#webcodex-runner-config) or [macOS advanced config](WEBCODEX_MACOS.en.md#webcodex-runner-config) to configure the Runner's `[instructions].files`. [RTK installation](https://github.com/rtk-ai/rtk)
- **WebCodex file-edit guidance.** Instructions spell out the required `project` and `changes` arguments for `edit_project_files`, including `kind` and `path` on every change. For complex content or after the first error, the guidance points the model to `run_shell` on the same WebCodex server when available, reducing repeated attempts and token use.
- **Shorter MCP Instructions.** The Compact and JSON templates use fewer words while retaining required arguments, schema lookup, call examples, and the WebCodex and RTK rules. The blanket instruction to retry after a schema hint was removed.
- **Opt-in CrewDispatch proxy setup.** The publicly released CrewDispatch plugin is outdated and will receive no further updates. Most users can leave this option off, which is the default. If you already have a working CrewDispatch MCP server, you can register it with the config generator. After changing the toggle, generate the config again and restart the proxy. [CrewDispatch setup](CUSTOMIZATIONS.en.md#crewdispatch-opt-in-proxy-configuration)
- **New icons and sidebar banner.** The extension and in-page MCP icons have been updated. The sidebar uses the new banner and its logo no longer opens an external site.

## Install in Chrome

### 1. Install the prerequisites

- Install Git, Node.js **22.13.0 or later**, and Chrome.
- Use **pnpm 9.15.1**. If you need it, run the following commands in a terminal.

```bash
npm install --global pnpm@9.15.1
pnpm --version
```

On Windows, run the commands below in **Git Bash**. If you prefer PowerShell, run `bash --version` first to make sure it can find Bash, which the build scripts use.

### 2. Clone and build

```bash
git clone --branch custom --single-branch https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G.git
cd MCP-SuperAssistant-G
pnpm install --frozen-lockfile
pnpm build
```

After the build, the project's `dist/` directory contains `manifest.json`. Keep this directory in place for Chrome to load (both the extension bundle and the `npx`-launched proxy are cross-platform across Windows, macOS, and Linux Chrome without OS-specific builds; you can also download and unzip a prebuilt bundle from [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases)).

### 3. Load the unpacked extension

1. Open `chrome://extensions/` and turn on **Developer mode**.
2. If you have the upstream extension or another build installed, disable those copies to avoid running two content scripts on the same site.
3. Click **Load unpacked** and select **`MCP-SuperAssistant-G/dist`**, the directory containing `manifest.json`.
4. Open a Gemini or Google AI Studio chat. Refresh any chat tab that was already open and look for the **MCP** button near the composer or the sidebar.

### 4. Connect an MCP server

If you already have an MCP endpoint that the extension can reach, enter its transport type and URL in the sidebar. For local `stdio` tools or to expose multiple servers through one endpoint, use the upstream MCP SuperAssistant Proxy.

1. Prepare your own `mcp-config.json` with the server entries supplied by your tools in `mcpServers`.
2. In a terminal in the same directory as that config, run this command and leave the proxy running.

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. Open the extension sidebar's connection settings. Choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once it says **Connected**, check the **Tools** tab to see that the tools you need are enabled.

See the [upstream proxy guide](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server) for example server configurations and other transports.

#### Connect WebCodex

[WebCodex](https://github.com/yyjeqhc/webcodex) ([v0.5.0](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.0) tested on Windows; [v0.5.1](https://github.com/yyjeqhc/webcodex/releases/tag/v0.5.1) tested on macOS) exposes your local project folders as MCP tools (reading files, searching code, running shell commands) so web chats like Gemini and Google AI Studio can work directly with your local codebase.

The connection chain looks like this (the local proxy bridges SSE for the extension to WebCodex's `/mcp` Streamable HTTP endpoint):

```text
Web AI (Gemini / AI Studio) ←→ Browser Extension ←→ Local Proxy (SSE) ←→ WebCodex (Local Projects)
```

**Prerequisites**: Start WebCodex Desktop (or Server) and Runner on your machine, sign in, add the project folder(s) you want the AI to access, and confirm the Runner shows **Connected**. Then pick your OS guide below:

- **[macOS Guide (WEBCODEX_MACOS.en.md)](WEBCODEX_MACOS.en.md)** — starts right at the top with a one-click launcher script (auto-reads token, auto-detects the live WebCodex port, and starts the proxy), plus manual setup and advanced options.
- **[Windows Guide (WEBCODEX_WINDOWS.en.md)](WEBCODEX_WINDOWS.en.md)** — includes the PowerShell auto-config script, advanced `runner.toml` / RTK configuration, and optional headless auto-start via Scheduled Tasks.

Once the proxy is running, choose **SSE** in the extension sidebar's connection settings, enter `http://localhost:3006/sse` as **Server URI**, click **Connect**, and verify the WebCodex tools in the **Tools** tab.

### 5. Test and update

- Open the **MCP** menu by the composer, click **Insert** to add MCP Instructions, and send them with a read-only test request (with WebCodex, ask it to list your projects to verify `list_projects`). When the model produces a tool card, click **Run** to test it manually before enabling any automatic execution, insertion, or submission.
- To update, run `git pull --ff-only`, `pnpm install --frozen-lockfile`, and `pnpm build` in the project directory. Click **Reload** for this extension in `chrome://extensions/` and refresh open chat tabs. If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

## Known issues

- **Gemini may drift from tool-calling rules in long conversations.** If it stops following the calling format, open the **MCP** hover menu next to the composer and click **Remind** (or **规则提醒** in Simplified Chinese) to insert a lightweight rule reminder. Because the full tool list and parameter descriptions sent earlier are already in the conversation history, the model only needs a brief format nudge rather than re-sending the entire MCP Instructions via **Insert** or **Attach**, which saves significant tokens—re-send the full instructions only in a new chat or after changing enabled tools.
- **Gemini may occasionally clear its thinking/progress indicator and stop with a blank reply.** In long sessions or high-reasoning modes, a turn after receiving tool results can occasionally roll back or end empty, pausing the tool chain. Usually **no page refresh is needed**—just send a short message such as `continue` or `?` in the same chat to resume (the previous tool result is already in the conversation context). If it stopped near a file write or Git command, ask the model to verify the current workspace state before continuing; only refresh the tab if the page itself becomes unresponsive.
- **Tool calls can return HTTP 400 or time out.** The model can sometimes recover by switching tools. The MCP Instructions explicitly tell the model to switch from WebCodex's `edit_project_files` to `run_shell` on the same server after the first error, if available. Recovery from other tool errors or timeouts depends on the model and the error. If a file edit times out, check whether the file changed before retrying.
- **Tested environment.** This extension has been tested in Chrome on Windows 11 (with WebCodex v0.5.0) and on macOS Apple Silicon (M1, with WebCodex v0.5.1, plus automated macOS CI DOM tests).

## License

This project (**MCP SuperAssistant G**) and its additions and modifications on the `custom` branch are licensed under the [GNU General Public License v3.0 or later (GPL-3.0-or-later)](LICENSE), Copyright (c) 2026 `andrewngcanton-gif`.

The upstream baseline is derived from [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant) (commit `30bb204`), whose original MIT License and copyright notice are preserved verbatim in [LICENSE-UPSTREAM-MIT](LICENSE-UPSTREAM-MIT). Thanks to the upstream authors and contributors.

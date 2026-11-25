# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G banner" width="640">
</p>

[简体中文](README.md)

**MCP SuperAssistant G** is a community build based on [MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3). It brings MCP tools to web chat apps such as Gemini and Google AI Studio through a browser extension. This repository provides the source. Build it and load it using Chrome Developer mode.

The upstream baseline is commit `30bb204`. [`main` holds the upstream source snapshot, and `custom` is this project's default branch](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom).

## Bug fixes

- **Gemini Auto Submit could stall.** The extension waits for an enabled Send button in the current composer, checks that the conversation and draft are still current, and clicks once. Batching ignores stale loading cards from earlier turns and continues to wait for active tools in the current batch.
- **Gemini manual sends could omit MCP Instructions.** **Insert** keeps the original preview chip. Type a task and use Gemini's Send button or Enter to merge the pending instructions into the draft before sending.
- **Gemini Usage pages could show a broken sidebar.** The chat sidebar is suspended on `/usage` and `/u/<account-index>/usage`. Its previous state is restored when you return to chat.
- **AI Studio could replay results from conversation history.** Historical tool cards remain manual. The extension also deduplicates automatic execution and result delivery when AI Studio redraws a current card.
- **Late AI Studio results could miss Auto Submit.** Eligible late results in the same conversation can still be delivered. When **Run** is busy, the extension waits for the original composer to become ready. Editing the draft or switching conversations cancels that pending send.
- **Auto Submit counted the configured delay twice.** The configured delay now applies once during batching. A 2-second setting saves about 2 seconds of fixed waiting. The separate Auto Insert delay, result batching, and button readiness checks still apply.

## New features and improvements

- **Optional WebCodex RTK guidance.** **Instructions → Use RTK with WebCodex** is off by default. If you turn it on and have compatible WebCodex tools enabled, generated instructions ask the model to use RTK already installed on the Runner for long output, starting with the first suitable `run_process` command.
- **WebCodex file-edit guidance.** Instructions spell out the required `project` and `changes` arguments for `edit_project_files`, including `kind` and `path` on every change. For complex content or after the first error, the guidance points the model to `run_shell` on the same WebCodex server when available.
- **Shorter MCP Instructions.** The Compact and JSON templates use fewer words while retaining required arguments, schema lookup, call examples, and the WebCodex and RTK rules. The blanket instruction to retry after a schema hint was removed.
- **Opt-in CrewDispatch proxy setup.** CrewDispatch is off by default. A config generator can register an installed CrewDispatch MCP server. After changing the toggle, generate the config again and restart the proxy. [CrewDispatch setup](CUSTOMIZATIONS.md#crewdispatch-opt-in-proxy-configuration)
- **New icons and sidebar banner.** The extension and in-page MCP icons have been updated. The sidebar uses the new banner and its logo no longer opens an external site.

## Install in Chrome

### 1. Install the prerequisites

- Install Git, Node.js **22.12.0 or later**, and Chrome.
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

After the build, the project's `dist/` directory contains `manifest.json`. Keep this directory in place for Chrome to load.

### 3. Load the unpacked extension

1. Open `chrome://extensions/` and turn on **Developer mode**.
2. If you have the upstream extension or another build installed, disable those copies to avoid running two content scripts on the same site.
3. Click **Load unpacked** and select **`MCP-SuperAssistant-G/dist`**, the directory containing `manifest.json`.
4. Open a Gemini or Google AI Studio chat. Refresh any chat tab that was already open and look for the **MCP** button near the composer or the sidebar.

### 4. Connect an MCP server

If you already have an MCP endpoint that the extension can reach, enter its transport type and URL in the sidebar. For local `stdio` tools or to expose multiple servers through one endpoint, use the upstream MCP SuperAssistant Proxy.

1. Prepare your own `mcp-config.json` with the server entries supplied by your tools in `mcpServers`. Use your own endpoint and credentials for WebCodex.
2. In a terminal in the same directory as that config, run this command and leave the proxy running.

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. Open the extension sidebar's connection settings. Choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once it says **Connected**, check the **Tools** tab to see that the tools you need are enabled.

See the [upstream proxy guide](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server) for example server configurations and other transports.

### 5. Test and update

- Open the **MCP** menu by the composer, click **Insert** to add MCP Instructions, and send them with a read-only test request. When the model produces a tool card, click **Run** to test it manually before enabling any automatic execution, insertion, or submission.
- To update, run `git pull --ff-only`, `pnpm install --frozen-lockfile`, and `pnpm build` in the project directory. Click **Reload** for this extension in `chrome://extensions/` and refresh open chat tabs. If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

## License

This build retains the upstream [MIT license](LICENSE) and original copyright notice. Thanks to the authors and contributors of [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant).

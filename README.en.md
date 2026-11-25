# MCP SuperAssistant G

<p align="center">
  <img src="chrome-extension/public/superassistant-banner.svg" alt="MCP SuperAssistant G banner" width="640">
</p>

<p align="center">
  <a href="README.md">中文</a> &bull; <strong>English</strong>
</p>

**MCP SuperAssistant G** is a community build based on [MCP SuperAssistant v0.7.3](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3). It brings MCP tools to web chat apps such as Gemini and Google AI Studio through a browser extension. This repository provides the source. Build it and load it using Chrome Developer mode.

The upstream baseline is commit `30bb204`. [`main` holds the upstream source snapshot, and `custom` is this project's default branch](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/compare/main...custom).

This project supports and acknowledges the LINUX DO community. Thank you for giving developers a place to share their work and learn from one another. [LINUX DO](https://linux.do/)

## Bug fixes

- **Gemini Auto Submit could stall.** The extension waits for an enabled Send button in the current composer, checks that the conversation and draft are still current, and clicks once. Batching ignores stale loading cards from earlier turns and continues to wait for active tools in the current batch.
- **Gemini manual sends could omit MCP Instructions.** **Insert** keeps the original preview chip. Type a task and use Gemini's Send button or Enter to merge the pending instructions into the draft before sending.
- **Gemini Usage pages could show a broken sidebar.** The chat sidebar is suspended on `/usage` and `/u/<account-index>/usage`. Its previous state is restored when you return to chat.
- **AI Studio could replay results from conversation history.** Historical tool cards remain manual. The extension also deduplicates automatic execution and result delivery when AI Studio redraws a current card.
- **Late AI Studio results could miss Auto Submit.** Eligible late results in the same conversation can still be delivered. When **Run** is busy, the extension waits for the original composer to become ready. Editing the draft or switching conversations cancels that pending send.
- **Auto Submit counted the configured delay twice.** The configured delay now applies once during batching. A 2-second setting saves about 2 seconds of fixed waiting. The separate Auto Insert delay, result batching, and button readiness checks still apply.

## New features and improvements

- **Optional WebCodex RTK guidance.** Install the RTK command-line tool on the machine running WebCodex Runner and make sure `rtk` is on the Runner's `PATH`. This works with stock WebCodex. **Instructions → Use RTK with WebCodex** is off by default. Enable WebCodex's `run_process` tool and turn on the toggle, then send the regenerated MCP Instructions to the chat. The guidance asks the model to use RTK for long output from suitable commands. To also return the rule from `work_on_project`, you can configure the Runner's `[instructions].files` separately. [RTK installation](https://github.com/rtk-ai/rtk)
- **WebCodex file-edit guidance.** Instructions spell out the required `project` and `changes` arguments for `edit_project_files`, including `kind` and `path` on every change. For complex content or after the first error, the guidance points the model to `run_shell` on the same WebCodex server when available, reducing repeated attempts and token use.
- **Shorter MCP Instructions.** The Compact and JSON templates use fewer words while retaining required arguments, schema lookup, call examples, and the WebCodex and RTK rules. The blanket instruction to retry after a schema hint was removed.
- **Opt-in CrewDispatch proxy setup.** The publicly released CrewDispatch plugin is outdated and will receive no further updates. Most users can leave this option off, which is the default. If you already have a working CrewDispatch MCP server, you can register it with the config generator. After changing the toggle, generate the config again and restart the proxy. [CrewDispatch setup](CUSTOMIZATIONS.md#crewdispatch-opt-in-proxy-configuration)
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

1. Prepare your own `mcp-config.json` with the server entries supplied by your tools in `mcpServers`.
2. In a terminal in the same directory as that config, run this command and leave the proxy running.

   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config ./mcp-config.json --outputTransport sse --port 3006
   ```

3. Open the extension sidebar's connection settings. Choose **SSE**, enter `http://localhost:3006/sse` as **Server URI**, and click **Connect**. Once it says **Connected**, check the **Tools** tab to see that the tools you need are enabled.

See the [upstream proxy guide](https://github.com/srbhptl39/MCP-SuperAssistant/tree/v0.7.3#connecting-to-local-proxy-server) for example server configurations and other transports.

#### Connect WebCodex

The extension connects to MCP SuperAssistant Proxy over SSE. The proxy connects to WebCodex's `/mcp` endpoint using Streamable HTTP. This example uses a local WebCodex **0.5.0** installation.

1. Start the WebCodex server and Runner, confirm that the Runner is connected, and configure the projects you want to access in WebCodex.
2. Merge this `webcodex` entry into `mcpServers` in the proxy's `mcp-config.json`. This WebCodex 0.5.0 connection uses `X-WebCodex-MCP-Surface: cli`. Use a user token for the same WebCodex server in `Authorization`. On Windows, the script below can read it from a signed-in Desktop connection. Adjust the example port `60143` to match your server.

   ```json
   {
     "mcpServers": {
       "webcodex": {
         "type": "streamable-http",
         "url": "http://127.0.0.1:60143/mcp",
         "headers": {
           "X-WebCodex-MCP-Surface": "cli",
           "Authorization": "Bearer <your WebCodex token>"
         }
       }
     }
   }
   ```

3. Start or restart the proxy using the command above. In the extension sidebar, select **SSE** and connect to `http://localhost:3006/sse`. Check that the WebCodex tools are listed and enabled under **Tools**.
4. Insert and send the updated **MCP Instructions** in the chat. To verify the connection, ask the model to list projects with `list_projects` or open a known project with `work_on_project`.

##### Get the user token and generate the local config (Windows)

For a signed-in WebCodex Desktop 0.5.0 connection, this **PowerShell 7** script lists the paths to `webcodex-user-token` files. If several are listed, choose the one for the target server and account. If none are listed, sign in to that connection in WebCodex Desktop or use a user API token issued by the server. The script displays file paths and writes the bearer token to a local config outside the repository. To update an existing proxy config, set `$configPath` to its path. The script preserves the other `mcpServers` entries.

```powershell
$profileRoot = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop/local-connections'
Get-ChildItem -LiteralPath $profileRoot -Recurse -File -Filter 'webcodex-user-token' |
    Select-Object -ExpandProperty FullName

$tokenPath = (Read-Host 'Full path of the token file for this WebCodex login').Trim('"')
$token = (Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
if (-not $token) { throw 'The WebCodex token file is empty.' }
$configPath = Join-Path $env:LOCALAPPDATA 'mcp-superassistant-webcodex.json'
$config = if (Test-Path -LiteralPath $configPath) {
    Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop
} else {
    @{ mcpServers = @{} }
}
if (-not $config.Contains('mcpServers')) { $config['mcpServers'] = @{} }
$config.mcpServers['webcodex'] = @{
    type = 'streamable-http'
    url = 'http://127.0.0.1:60143/mcp'
    headers = @{
        'X-WebCodex-MCP-Surface' = 'cli'
        'Authorization' = "Bearer $token"
    }
}
$config | ConvertTo-Json -Depth 32 | Set-Content -LiteralPath $configPath -Encoding utf8 -ErrorAction Stop
```

If you used the default config path, start the proxy with this command.

```powershell
npx -y @srbhptl39/mcp-superassistant-proxy@0.1.9 --config "$env:LOCALAPPDATA/mcp-superassistant-webcodex.json" --outputTransport sse --port 3006
```

### 5. Test and update

- Open the **MCP** menu by the composer, click **Insert** to add MCP Instructions, and send them with a read-only test request. When the model produces a tool card, click **Run** to test it manually before enabling any automatic execution, insertion, or submission.
- To update, run `git pull --ff-only`, `pnpm install --frozen-lockfile`, and `pnpm build` in the project directory. Click **Reload** for this extension in `chrome://extensions/` and refresh open chat tabs. If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

## Known issues

- **Gemini may forget the tool descriptions in long conversations.** If it stops following the tool instructions, use **Insert** or **Attach** in the **MCP** menu next to the composer, then send the current MCP Instructions again.
- **Auto Submit occasionally fails.** The intermittent cause has yet to be diagnosed. If the result is already in the composer, wait until the page is ready and send it manually once.

## License

This build retains the upstream [MIT license](LICENSE) and original copyright notice. Thanks to the authors and contributors of [MCP SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant).

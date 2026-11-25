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

## License

The upstream project is distributed under the MIT License. The original LICENSE file and copyright notice are retained.

## Repository branches

The default branch is custom. It omits the upstream Dependabot schedule to keep the repository focused on main and custom. The main branch retains the original upstream configuration. The two branches share a snapshot of the upstream v0.7.3 source. The original upstream commit ID is recorded in the snapshot commit.

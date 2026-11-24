# MCP SuperAssistant G

This repository is a public community build based on MCP SuperAssistant v0.7.3.

- main contains the upstream MCP SuperAssistant source at commit 30bb2045e630d7db3547179f374c15af6f308924.
- custom contains the local integrated build and its custom changes.
- Tag baseline-v0.7.3-local identifies the local integrated baseline on custom.

This repository is not an official release of MCP SuperAssistant. The upstream project is available at https://github.com/srbhptl39/MCP-SuperAssistant.

## Customizations in the baseline

The baseline includes the accepted local changes for Gemini submit handling, AI Studio historical-turn gating, WebCodex RTK instructions, and WebCodex file-edit guidance. The exact source diff is visible on custom relative to main.

The local integration references WebCodex 0.5.0 and RTK 0.49.0. Local Runner configuration, CrewDispatch credentials, browser profiles, private logs, and machine-specific startup files are intentionally excluded from this repository.

## License

The upstream project is distributed under the MIT License. The original LICENSE file and copyright notice are retained.

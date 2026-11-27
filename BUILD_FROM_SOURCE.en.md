# Build from Source Guide

<p align="center">
  <a href="BUILD_FROM_SOURCE.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a>
</p>

Follow these steps if you want to track the latest commits on the `custom` branch or modify and debug the extension locally. Most users can simply download the prebuilt `.zip` from [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) without setting up a build environment.

## 1. Install the prerequisites

- Install Git, Node.js **22.13.0 or later**, and Chrome.
- Use **pnpm 9.15.1**. If you need it, run the following commands in a terminal:

```bash
npm install --global pnpm@9.15.1
pnpm --version
```

On Windows, run the commands below in **Git Bash**. If you prefer PowerShell, run `bash --version` first to make sure it can find Bash, which the build scripts use.

## 2. Clone and build

```bash
git clone --branch custom --single-branch https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G.git
cd MCP-SuperAssistant-G
pnpm install --frozen-lockfile
pnpm build
```

After the build, the project's `dist/` directory contains `manifest.json`. Keep this directory in place for Chrome to load (both the extension bundle and the `npx`-launched proxy are cross-platform across Windows, macOS, and Linux Chrome without OS-specific builds).

Next, return to [README — 2. Load the unpacked extension](README.en.md#2-load-the-unpacked-extension) and select `MCP-SuperAssistant-G/dist` in Chrome.

## Update and rebuild

Run these commands inside the project directory:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

Then click **Reload** for this extension in `chrome://extensions/` and refresh open chat tabs. If you see `Extension context is invalid`, refresh the chat tab to load the current content script.

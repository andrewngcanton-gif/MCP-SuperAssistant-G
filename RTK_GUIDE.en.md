# RTK Output Compression Guide (with WebCodex)

<p align="center">
  <a href="RTK_GUIDE.md">中文</a> &bull; <strong>English</strong>
</p>

<p align="center">
  <a href="README.en.md">Back to README</a> &bull; <a href="WEBCODEX_MACOS.en.md">macOS Guide</a> &bull; <a href="WEBCODEX_WINDOWS.en.md">Windows Guide</a>
</p>

## What is RTK and why enable it?

[RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) is a local CLI proxy that compacts verbose command-line output (directory trees, type-checks, unit tests, `git diff`) before the output is sent into your web AI chat (Gemini / Google AI Studio).

- **Real-world savings (measured)**:
  - `rtk find` directory listings: ~**77%** fewer tokens;
  - `rtk err` wrapping type-check output: ~**83%** fewer tokens;
  - `rtk test` wrapping unit tests: ~**97%** fewer tokens.
- **Safe for code edits (off by default, opt-in)**:
  - The extension's rules **strictly forbid** wrapping file edits, `python -c`, heredocs, redirects (`>`), pipes (`|`), `--json`/`--porcelain`, or full/audit logs in `rtk`. Only supported read-only, build, and test CLI commands are prefixed.

---

## Set up in 3 steps

### Step 1: Install RTK on the machine running WebCodex Runner

> [!IMPORTANT]
> Install RTK on the **computer where WebCodex Runner actually executes commands**. After installing or updating `PATH`, **completely restart WebCodex Desktop / Runner** so it picks up the new `PATH`.

- **Windows (choose one option)**:

  1. Install via `winget` (recommended):

     ```powershell
     winget install rtk-ai.rtk
     ```

  2. Or download `rtk-x86_64-pc-windows-msvc.zip` from [RTK GitHub Releases](https://github.com/rtk-ai/rtk/releases), extract `rtk.exe` to `%USERPROFILE%\.local\bin\`, and add `%USERPROFILE%\.local\bin` to your user `PATH`.

  Verify in a fresh PowerShell window:

  ```powershell
  rtk --version
  ```

- **macOS**:

  Install with Homebrew:

  ```bash
  brew install rtk
  rtk --version
  ```

  > [!WARNING]
  > **Required for Apple Silicon (M1/M2/M3/M4) GUI launches**: If you open **WebCodex Desktop** from Finder or Launchpad, GUI apps do not read `~/.zshrc`, so Runner will miss `/opt/homebrew/bin/rtk`. Run this line once in Terminal and restart WebCodex Desktop:
  >
  > ```bash
  > grep -q '/opt/homebrew/bin' ~/.zshenv 2>/dev/null || echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' >> ~/.zshenv
  > ```

---

### Step 2: Turn on the extension toggle

1. Open Gemini or Google AI Studio, open the **MCP SuperAssistant G** sidebar, and verify WebCodex is **Connected**.
2. Go to the **Instructions** tab and turn on **Use RTK with WebCodex**.
3. **No WebCodex modification needed, and do NOT run `rtk init -g`** (`rtk init -g` is only for local CLI hooks such as Claude Code / Codex CLI and is not used by this browser extension).

---

### Step 3: Test in a new chat & inspect savings

1. **Start a fresh chat**, click **MCP → Insert** near the composer to insert the updated instructions.
2. Send a prompt that runs verbose read-only/check commands, for example:

   > Run `pnpm type-check` and `pnpm test:unit` in my project directory via the terminal and tell me if there are any errors.

3. Afterward, check your actual local token savings in a terminal:

   ```bash
   rtk gain --history
   ```

---

## Using RTK with WebCodex v0.5.0 vs v0.5.1

**Both `v0.5.0` and `v0.5.1` work out of the box with no extra configuration**:

- The extension prefers **`run_shell`** (prefixing supported commands with `rtk`) on both versions, and automatically falls back to `run_process` (`executable: "rtk"` + `args`) only when `run_shell` is disabled.
- Both the 9-tool `cli` surface in `v0.5.1` and the 17-tool `cli` surface in `v0.5.0` receive the RTK guidance immediately once the sidebar toggle is on.

<details>
<summary>Optional advanced setup: attach rtk-instructions.md on surfaces with work_on_project</summary>

If you use a surface that exposes `work_on_project` (`v0.5.0` or the `adaptive` surface without `X-WebCodex-MCP-Surface: cli`) and also want `work_on_project` to return local RTK notes from `runner.toml`, see:

- **[Windows advanced config](WEBCODEX_WINDOWS.en.md#webcodex-runner-config)**
- **[macOS advanced config](WEBCODEX_MACOS.en.md#webcodex-runner-config)**

On the `v0.5.1` `cli` 9-tool surface (`work_on_project` is omitted), simply turning on the extension's sidebar toggle handles everything.

</details>

---

## Common questions & troubleshooting

- **I see `[rtk] /!\ No hook installed` in stderr — is something broken?**
  No, ignore it safely. That message only tells you global CLI hooks (`rtk init -g`) are not installed; this extension passes `rtk` explicitly via instructions and does **not** need `rtk init -g`.

- **Why did the model run an `rtk` command and then run the raw command right after?**
  That is the intentional accuracy safeguard (`re-run raw if RTK omits needed detail`). For example, if you ask for the exact number of passed tests and `rtk test` trims the summary line, the model re-runs the raw command instead of guessing.

- **What about `rtk tree`, `rtk ls`, or `rtk grep` failing on Windows?**
  Those are known upstream RTK Windows compatibility gaps (Windows' built-in `System32\tree.com` intercepts `rtk tree` with `Too many parameters`, and stock PowerShell lacks standalone `ls.exe`/`grep.exe`). Our extension's built-in rules already route around them:
  - Always prefer RTK's built-in **`rtk find "*" <dir>`** and **`rtk rg`** across platforms;
  - Allow `rtk ls` on macOS/Linux while warning models off `rtk tree`/`rtk grep` (and `rtk ls` on Windows);
  - Wrap custom `pnpm`/`npm` test and build scripts with **`rtk test <cmd>`** / **`rtk err <cmd>`** so they compress cleanly instead of hitting `rtk fallback`.

- **If I also use Codex CLI or Claude Code on the same machine, do I need a separate RTK setup?**
  **No.** Commands run through WebCodex Runner and local CLI agents like Codex CLI or Claude Code **automatically share the same local RTK database** (`%LOCALAPPDATA%\rtk\history.db` on Windows), so `rtk gain` reports combined savings. Do **not** change `RTK_DB_PATH`.

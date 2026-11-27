# 从源码自行构建指南

<p align="center">
  <strong>中文</strong> &bull; <a href="BUILD_FROM_SOURCE.en.md">English</a>
</p>

<p align="center">
  <a href="README.md">返回 README</a>
</p>

如果你希望跟随 `custom` 分支的最新提交，或自行修改与本地调试代码，可以按以下步骤从源码构建。绝大多数日常用户可直接下载 [GitHub Releases](https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G/releases) 中的预构建压缩包，无需搭建构建环境。

## 1. 准备构建环境

- 安装 Git、Node.js **22.13.0 或更新版本**以及 Chrome。
- 使用 **pnpm 9.15.1**。如果没有这个版本，可在终端运行以下命令安装：

```bash
npm install --global pnpm@9.15.1
pnpm --version
```

Windows 用户可直接在 **Git Bash** 里执行下面的构建命令。若使用 PowerShell，先用 `bash --version` 确认终端可以找到 Bash，构建脚本会调用它。

## 2. 获取源码并构建

```bash
git clone --branch custom --single-branch https://github.com/andrewngcanton-gif/MCP-SuperAssistant-G.git
cd MCP-SuperAssistant-G
pnpm install --frozen-lockfile
pnpm build
```

成功后，项目根目录下的 `dist/` 会包含 `manifest.json`。保留这个目录供 Chrome 加载（扩展本体与通过 `npx` 启动的代理均为跨平台前端/Node 产物，Windows、macOS 与 Linux Chrome 共用同一套 `dist/`，无需按系统重新编译）。

接下来回到 [README — 2. 加载已解压的扩展](README.md#2-加载已解压的扩展)，在 Chrome 中选择 `MCP-SuperAssistant-G/dist` 完成加载即可。

## 更新源码并重新构建

在项目目录执行以下命令拉取更新并重新构建：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

构建完成后，回到 `chrome://extensions/` 点击本扩展的 **重新加载**，再刷新已打开的聊天页。遇到 `Extension context is invalid` 时，同样需要刷新聊天页重新注入扩展脚本。

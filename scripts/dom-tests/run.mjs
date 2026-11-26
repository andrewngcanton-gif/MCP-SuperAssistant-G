import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const esbuild = require('esbuild');

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
      : null,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Chrome/Chromium binary not found. Set CHROME_PATH to your Chrome executable to run DOM tests.',
  );
}

const locationShim = `
const __origAdd = EventTarget.prototype.addEventListener;
const __origRem = EventTarget.prototype.removeEventListener;
const __wrapped = new WeakMap();
EventTarget.prototype.addEventListener = function(type, fn, opts) {
  if (typeof fn !== 'function') return __origAdd.call(this, type, fn, opts);
  let w = __wrapped.get(fn);
  if (!w) {
    w = function(ev) {
      if (ev && ev.__simTrusted) {
        const proxy = new Proxy(ev, {
          get(t, p) {
            if (p === 'isTrusted') return true;
            const v = Reflect.get(t, p, t);
            return typeof v === 'function' ? v.bind(t) : v;
          },
        });
        return fn.call(this, proxy);
      }
      return fn.call(this, ev);
    };
    __wrapped.set(fn, w);
  }
  return __origAdd.call(this, type, w, opts);
};
EventTarget.prototype.removeEventListener = function(type, fn, opts) {
  const w = (typeof fn === 'function' && __wrapped.get(fn)) || fn;
  return __origRem.call(this, type, w, opts);
};
const __mockState = { host: 'aistudio.google.com', path: '/prompts/new_chat' };
window.__setMockHost = (h) => { __mockState.host = h; };
window.__setMockPath = (p) => { __mockState.path = p; };
const location = {
  get hostname() { return __mockState.host; },
  get host() { return __mockState.host; },
  get origin() { return 'https://' + __mockState.host; },
  get protocol() { return 'https:'; },
  get pathname() { return __mockState.path; },
  get search() { return ''; },
  get hash() { return ''; },
  get href() { return 'https://' + __mockState.host + __mockState.path; },
};
if (!window.chrome) window.chrome = { runtime: { getURL: () => '', sendMessage: async () => ({}) }, storage: { local: { get: async () => ({}), set: async () => {} } } };
`;

async function runSuite(chromePath, suiteArg) {
  const entryPath = path.isAbsolute(suiteArg) ? suiteArg : path.join(testDir, suiteArg);
  const suiteName = path.basename(entryPath);
  const built = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'chrome120',
    loader: { '.css': 'empty' },
    define: {
      'process.env.NODE_ENV': '"test"',
      'window.location': 'location',
    },
    banner: { js: `(function(){\n${locationShim}\n` },
    footer: { js: `\n})();` },
    alias: {
      '@extension/shared': path.join(repoRoot, 'packages/shared'),
      '@extension/storage': path.join(repoRoot, 'packages/storage'),
      '@extension/env': path.join(repoRoot, 'packages/env'),
      '@src': path.join(repoRoot, 'pages/content/src'),
    },
    nodePaths: [
      path.join(repoRoot, 'node_modules'),
      path.join(repoRoot, 'pages/content/node_modules'),
    ],
  });

  const bundleCode = built.outputFiles[0].text;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sa-dom-'));
  let chromeProc = null;
  let server = null;

  try {
    const report = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chromeProc?.kill();
        server?.close();
        reject(new Error(`Timed out waiting for headless Chrome test report (${suiteName})`));
      }, 30000);

      server = http.createServer((req, res) => {
        if (req.url === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><html><body>
<script src="/bundle.js"></script>
<script>
window.addEventListener('error', e => {
  fetch('/report', { method: 'POST', body: JSON.stringify([{ name: 'uncaught', pass: false, error: String(e.error || e.message) }]) });
});
window.addEventListener('unhandledrejection', e => {
  fetch('/report', { method: 'POST', body: JSON.stringify([{ name: 'unhandledrejection', pass: false, error: String(e.reason) }]) });
});
const poll = setInterval(() => {
  if (window.__testsDone) {
    clearInterval(poll);
    fetch('/report', { method: 'POST', body: JSON.stringify(window.__testResults) });
  }
}, 50);
</script></body></html>`);
          return;
        }
        if (req.url === '/bundle.js') {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(bundleCode);
          return;
        }
        if (req.url === '/report' && req.method === 'POST') {
          let body = '';
          req.on('data', c => (body += c));
          req.on('end', () => {
            res.writeHead(200);
            res.end('ok');
            clearTimeout(timeout);
            server.close();
            chromeProc?.kill();
            resolve(JSON.parse(body));
          });
          return;
        }
        res.writeHead(404);
        res.end();
      });

      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        chromeProc = spawn(
          chromePath,
          [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${userDataDir}`,
            `http://127.0.0.1:${port}/`,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
      });
    });

    console.log(`\n=== ${suiteName} ===`);
    let failed = 0;
    for (const item of report) {
      console.log(`${item.pass ? 'PASS' : 'FAIL'}: ${item.name}`);
      if (!item.pass) {
        failed++;
        console.error(item.error);
      }
    }
    console.log(`Suite ${suiteName}: Total ${report.length}, Passed ${report.length - failed}, Failed ${failed}`);
    return { total: report.length, failed };
  } finally {
    if (chromeProc && !chromeProc.killed) {
      chromeProc.kill();
    }
    await new Promise(r => setTimeout(r, 150));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup if Windows holds a Chrome lock briefly
    }
  }
}

const suites = process.argv.slice(2);
const targets = suites.length > 0 ? suites : ['aistudio.test.ts', 'gemini.test.ts'];
const chromePath = findChromeBinary();

let grandTotal = 0;
let grandFailed = 0;
for (const suite of targets) {
  const { total, failed } = await runSuite(chromePath, suite);
  grandTotal += total;
  grandFailed += failed;
}

console.log(`\nAll suites: Total ${grandTotal}, Passed ${grandTotal - grandFailed}, Failed ${grandFailed}`);
process.exit(grandFailed > 0 ? 1 : 0);

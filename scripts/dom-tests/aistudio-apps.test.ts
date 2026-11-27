// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import { AIStudioAdapter } from '@src/plugins/adapters/aistudio.adapter';
import {
  findAistudioAppsInput,
  isAistudioAppsRoute,
  submitAistudioAppsInput,
} from '@src/plugins/adapters/aistudio-apps';
import {
  canAistudioAppsAutoExecute,
  initializeAistudioAppsTurnGate,
  isAistudioAppsHost,
  resetAistudioAppsTurnGateForTests,
} from '@src/render_prescript/src/provenance/aistudioAppsTurnGate';
import {
  __resetAistudioTurnGateForTests,
  initializeAistudioTurnGate,
  isAistudioHost,
} from '@src/render_prescript/src/provenance/aistudioTurnGate';
import {
  generateContentSignature,
  getPreviousExecution,
  storeExecutedFunction,
} from '@src/render_prescript/src/mcpexecute/storage';
import { renderFunctionCall, renderedFunctionBlocks } from '@src/render_prescript/src/renderer/functionBlock';
import { generateInstructionReminder } from '@src/components/sidebar/Instructions/instructionGeneratorCompact';
import { inputChips, isChipSubmitEnter } from '@src/services/input-chips';
import { automationService } from '@src/services/automation.service';
import { useUIStore } from '@src/stores/ui.store';
import { useToolStore } from '@src/stores/tool.store';
import { useAdapterStore } from '@src/stores/adapter.store';

declare global {
  interface Window {
    __setMockHost: (h: string) => void;
    __setMockPath: (p: string) => void;
    __testResults?: Array<{ name: string; pass: boolean; error?: string }>;
    __testsDone?: boolean;
  }
}

const results: Array<{ name: string; pass: boolean; error?: string }> = [];
const assert = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const makeTrustedEvent = <T extends Event>(event: T): T => {
  (event as any).__simTrusted = true;
  return event;
};

interface MockAppsPage {
  editor: HTMLElement;
  buttonsRow: HTMLDivElement;
  chatPane: HTMLDivElement;
  sentMessages: string[];
  getSendButton: () => HTMLButtonElement | null;
  getStopButton: () => HTMLButtonElement | null;
  setStop: (stop: boolean) => void;
  monacoTextarea?: HTMLTextAreaElement;
}

/** Landing `/app/apps` composer (`ms-applet-generator-form` + `contenteditable` + dynamic Send button). */
function mountAistudioAppsDom(sendLabel = 'Send'): MockAppsPage {
  document.body.innerHTML = '';

  const chatPane = document.createElement('div');
  chatPane.className = 'apps-chat-pane';
  document.body.appendChild(chatPane);

  const form = document.createElement('ms-applet-generator-form');
  form.className = 'animating build-start-iteration';

  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container lost-focus';

  const wrapper = document.createElement('div');
  wrapper.className = 'prompt-input-wrapper row column';

  const textWrapper = document.createElement('div');
  textWrapper.className = 'text-wrapper';
  const autocomplete = document.createElement('ms-autocomplete-textarea');
  const acWrapper = document.createElement('div');
  acWrapper.className = 'textarea-autocomplete-wrapper';

  const editor = document.createElement('div');
  editor.className = 'textarea prompt-textarea';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('tabindex', '0');
  editor.setAttribute('contenteditable', 'plaintext-only');
  editor.setAttribute('aria-disabled', 'false');
  editor.setAttribute('placeholder', 'Describe an app and let Gemini do the rest');
  editor.setAttribute('aria-label', 'Describe an app and let Gemini do the rest');

  acWrapper.appendChild(editor);
  autocomplete.appendChild(acWrapper);
  textWrapper.appendChild(autocomplete);

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'buttons-row';

  wrapper.append(textWrapper, buttonsRow);
  inputContainer.appendChild(wrapper);
  form.appendChild(inputContainer);
  document.body.appendChild(form);

  const sentMessages: string[] = [];
  let sendBtn: HTMLButtonElement | null = null;
  let stopBtn: HTMLButtonElement | null = null;
  let stopMode = false;

  const readEditor = () => (editor.innerText || editor.textContent || '').replace(/\r\n/g, '\n');

  const syncButtons = () => {
    if (stopMode) {
      if (sendBtn) {
        sendBtn.remove();
        sendBtn = null;
      }
      if (!stopBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stop-button ms-button-icon';
        btn.setAttribute('aria-label', 'Stop generating');
        Object.assign(btn.style, { width: '36px', height: '36px', display: 'inline-block' });
        buttonsRow.appendChild(btn);
        stopBtn = btn;
      }
      return;
    }

    if (stopBtn) {
      stopBtn.remove();
      stopBtn = null;
    }

    const hasText = readEditor().trim().length > 0;
    if (hasText && !sendBtn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mat-mdc-tooltip-trigger send-button running ms-button-icon ms-button-primary ng-star-inserted';
      btn.setAttribute('aria-label', sendLabel);
      Object.assign(btn.style, { width: '36px', height: '36px', display: 'inline-block' });
      btn.addEventListener('click', sendCurrent);
      buttonsRow.appendChild(btn);
      sendBtn = btn;
    } else if (!hasText && sendBtn) {
      sendBtn.remove();
      sendBtn = null;
    }
  };

  const sendCurrent = () => {
    if (stopMode) return;
    const payload = readEditor();
    if (!payload.trim()) return;
    sentMessages.push(payload);
    editor.textContent = '';
    syncButtons();
  };

  editor.addEventListener('input', syncButtons);
  editor.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      sendCurrent();
    }
  });

  return {
    editor,
    buttonsRow,
    chatPane,
    sentMessages,
    getSendButton: () => sendBtn,
    getStopButton: () => stopBtn,
    setStop: (s: boolean) => {
      stopMode = s;
      syncButtons();
    },
  };
}

/** Workspace `/apps/<uuid>` DOM (`ms-code-assistant-chat` left-panel `textarea` + right-panel Monaco editor). */
function mountAistudioAppsWorkspaceDom(sendLabel = 'Send'): MockAppsPage {
  document.body.innerHTML = '';

  const rootContainer = document.createElement('div');
  rootContainer.className = 'container';

  const leftPanel = document.createElement('div');
  leftPanel.className = 'console-left-panel visible';
  const assistantChat = document.createElement('ms-code-assistant-chat');
  const innerContainer = document.createElement('div');
  innerContainer.className = 'container';

  const chatPane = document.createElement('div');
  chatPane.className = 'apps-chat-pane';

  const bottomContainer = document.createElement('div');
  bottomContainer.className = 'bottom-container';
  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container ng-star-inserted';

  const editor = document.createElement('textarea');
  editor.className = 'cdk-textarea-autosize ng-untouched ng-pristine ng-valid';
  editor.setAttribute('placeholder', 'Make changes, add new features, ask for anything');

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'buttons-row';
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'mat-mdc-tooltip-trigger send-button ms-button-icon ms-button-primary ng-star-inserted disabled';
  sendBtn.setAttribute('aria-label', sendLabel);
  sendBtn.disabled = true;
  Object.assign(sendBtn.style, { width: '36px', height: '36px', display: 'inline-block' });
  buttonsRow.appendChild(sendBtn);

  inputContainer.append(editor, buttonsRow);
  bottomContainer.appendChild(inputContainer);
  innerContainer.append(chatPane, bottomContainer);
  assistantChat.appendChild(innerContainer);
  leftPanel.appendChild(assistantChat);

  // Competing right-panel Monaco editor textarea (must NEVER be matched by findAistudioAppsInput)
  const codeEditor = document.createElement('div');
  codeEditor.className = 'code-editor ng-star-inserted';
  const consoleEditor = document.createElement('ms-console-editor');
  consoleEditor.className = 'visible';
  const monacoEditor = document.createElement('div');
  monacoEditor.className = 'monaco-editor no-user-select';
  monacoEditor.setAttribute('role', 'code');
  const monacoTextarea = document.createElement('textarea');
  monacoTextarea.className = 'inputarea monaco-mouse-cursor-text';
  monacoTextarea.setAttribute('aria-label', 'Editor content');
  monacoTextarea.setAttribute('role', 'textbox');
  monacoEditor.appendChild(monacoTextarea);
  consoleEditor.appendChild(monacoEditor);
  codeEditor.appendChild(consoleEditor);

  rootContainer.append(leftPanel, codeEditor);
  document.body.appendChild(rootContainer);

  const sentMessages: string[] = [];
  let stopBtn: HTMLButtonElement | null = null;
  let stopMode = false;

  const syncButtons = () => {
    if (stopMode) {
      sendBtn.style.display = 'none';
      if (!stopBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stop-button ms-button-icon';
        btn.setAttribute('aria-label', 'Stop generating');
        Object.assign(btn.style, { width: '36px', height: '36px', display: 'inline-block' });
        buttonsRow.appendChild(btn);
        stopBtn = btn;
      }
      return;
    }

    if (stopBtn) {
      stopBtn.remove();
      stopBtn = null;
    }
    sendBtn.style.display = 'inline-block';

    const hasText = editor.value.trim().length > 0;
    sendBtn.disabled = !hasText;
    if (hasText) sendBtn.classList.remove('disabled');
    else sendBtn.classList.add('disabled');
  };

  const sendCurrent = () => {
    if (stopMode || sendBtn.disabled) return;
    if (!editor.value.trim()) return;
    sentMessages.push(editor.value);
    editor.value = '';
    syncButtons();
  };

  editor.addEventListener('input', syncButtons);
  sendBtn.addEventListener('click', sendCurrent);
  editor.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      sendCurrent();
    }
  });

  return {
    editor,
    buttonsRow,
    chatPane,
    sentMessages,
    getSendButton: () => (stopMode ? null : sendBtn),
    getStopButton: () => stopBtn,
    setStop: (s: boolean) => {
      stopMode = s;
      syncButtons();
    },
    monacoTextarea,
  };
}

function setupStoresAndAdapter(): AIStudioAdapter {
  const adapter = new AIStudioAdapter();
  const noop = () => {};
  (adapter as any).context = {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    eventBus: { emit: noop, on: noop, off: noop },
    stores: { ui: useUIStore.getState(), tool: useToolStore.getState() },
  };
  useUIStore.setState(state => ({
    ...state,
    preferences: {
      ...state.preferences,
      autoExecute: true,
      autoInsert: true,
      autoSubmit: true,
      autoDiscovery: true,
      autoExecuteDelay: 0,
      autoInsertDelay: 0,
      autoSubmitDelay: 0,
    },
  }));
  useToolStore.setState(state => ({
    ...state,
    availableTools: [
      { name: 'list_projects', description: 'List projects', schema: '{}' },
      { name: 'work_on_project', description: 'Work on project', schema: '{}' },
      { name: 'run_shell', description: 'Run shell', schema: '{}' },
    ],
    enabledTools: new Set(['list_projects', 'work_on_project', 'run_shell']),
  }));
  useAdapterStore.setState(state => ({
    ...state,
    activeAdapterName: adapter.name,
    lastAdapterError: null,
    getActiveAdapter: () => ({
      plugin: adapter,
      instance: adapter,
      status: 'active',
    }),
  }) as any);
  return adapter;
}

const makeJsonlPre = (
  blockId: string,
  fnName: string,
  callId: number,
  params: Record<string, unknown>,
  complete = true,
): HTMLPreElement => {
  const pre = document.createElement('pre');
  pre.setAttribute('data-block-id', blockId);
  const lines = [JSON.stringify({ type: 'function_call_start', name: fnName, call_id: callId })];
  for (const [key, value] of Object.entries(params)) {
    lines.push(JSON.stringify({ type: 'parameter', key, value }));
  }
  if (complete) {
    lines.push(JSON.stringify({ type: 'function_call_end', call_id: callId }));
  }
  pre.textContent = lines.join('\n');
  return pre;
};

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    localStorage.clear();
    renderedFunctionBlocks.clear();
    inputChips.teardown();
    automationService.cleanup();
    __resetAistudioTurnGateForTests();
    resetAistudioAppsTurnGateForTests();
    await fn();
    results.push({ name, pass: true });
  } catch (err: any) {
    results.push({ name, pass: false, error: err?.stack || String(err) });
  } finally {
    delete (window as any).mcpClient;
    delete (window as any).__mcpAutomationState;
    delete (window as any).__mcpToolEnablement;
    localStorage.clear();
    renderedFunctionBlocks.clear();
    inputChips.teardown();
    automationService.cleanup();
    __resetAistudioTurnGateForTests();
    resetAistudioAppsTurnGateForTests();
  }
}

async function main() {
  window.__setMockHost('aistudio.google.com');
  const sampleInstructions = `[SuperAssistant tools — call by emitting a fenced code block:]\n<system>\nHOW TO CALL A TOOL\n\`\`\`jsonl\n{"type": "function_call_start", "name": "get_tool_schema", "call_id": 1}\n{"type": "function_call_end", "call_id": 1}\n\`\`\`\n</system>`;

  // Test 1: /app/apps chip capture, plain Enter preservation, IME guard, and Ctrl+Enter flush+submit
  await runTest('/app/apps chip capture, plain Enter preservation, IME guard, and Ctrl+Enter submit', async () => {
    window.__setMockPath('/app/apps');
    const page = mountAistudioAppsDom();
    const adapter = setupStoresAndAdapter();

    assert(page.getSendButton() === null, 'Send button must be absent while editor is empty');
    const captured = await adapter.insertText(sampleInstructions, { source: 'instructions' });
    assert(captured === true, 'insertText should capture chip on /app/apps');
    assert(document.getElementById('mcp-input-chips-host') !== null, 'Chip bar host should be mounted');

    // Plain Enter and IME Ctrl+Enter must NOT trigger chip flush/submit
    page.editor.dispatchEvent(
      makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })),
    );
    const imeEv = makeTrustedEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }),
    );
    page.editor.dispatchEvent(imeEv);
    assert(
      isChipSubmitEnter(
        { isTrusted: true, key: 'Enter', ctrlKey: true, shiftKey: false, metaKey: false, altKey: false, isComposing: false, keyCode: 229 },
        { allowCtrl: true },
      ) === false,
      'keyCode 229 IME must be rejected',
    );

    await sleep(350);
    assert(page.sentMessages.length === 0, `Plain Enter / IME must not submit, got ${page.sentMessages.length}`);

    // Trusted Ctrl+Enter flushes chip, mounts Send, clicks it, and submits once
    page.editor.dispatchEvent(
      makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })),
    );
    await sleep(500);
    assert(page.sentMessages.length === 1, `Expected 1 submit after Ctrl+Enter, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].includes('[SuperAssistant tools'), 'Submitted message must contain instructions');
  });

  // Test 2: Pre-typed draft + Send / Chinese 发送 click merge, strict route matching, and Monaco exclusion
  await runTest('/app/apps & /apps/<uuid> merge on Send / Chinese 发送, route matching, and Monaco exclusion', async () => {
    assert(isAistudioAppsRoute('/app/apps') === true, '/app/apps matches');
    assert(isAistudioAppsRoute('/apps/dd413b65-4b89-42ea-9aa9-2176234afbb1?showPreview=true&showAssistant=true') === true, '/apps/<uuid> matches');
    assert(isAistudioAppsRoute('/u/0/app/apps') === true, 'account-prefixed apps route matches');
    assert(isAistudioAppsRoute('/prompts/new_chat') === false, 'Playground new_chat excluded');
    assert(isAistudioAppsRoute('/app/prompts/123') === false, 'Playground named chat excluded');
    assert(isAistudioAppsRoute('/') === false, 'Root route excluded');

    for (const label of ['Send', '发送']) {
      inputChips.teardown();
      window.__setMockPath('/app/apps');
      const page = mountAistudioAppsDom(label);
      const adapter = setupStoresAndAdapter();

      await adapter.insertText(sampleInstructions, { source: 'instructions' });
      page.editor.textContent = 'Build a Pomodoro timer';
      page.editor.dispatchEvent(new Event('input', { bubbles: true }));
      const sendBtn = page.getSendButton();
      assert(sendBtn !== null, `Send button (${label}) should mount once draft is non-empty`);

      sendBtn!.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      await sleep(500);
      assert(page.sentMessages.length === 1, `Expected 1 merged send (${label}), got ${page.sentMessages.length}`);
      assert(page.sentMessages[0].startsWith('Build a Pomodoro timer'), 'Draft must precede appended chip');
      assert(page.sentMessages[0].includes('[SuperAssistant tools'), 'Merged send must include instructions chip');
    }

    // Real workspace /apps/<uuid> DOM must be supported and exclude Monaco editor textarea
    inputChips.teardown();
    window.__setMockPath('/apps/dd413b65-4b89-42ea-9aa9-2176234afbb1');
    const ws = mountAistudioAppsWorkspaceDom('发送');
    const adapter = setupStoresAndAdapter();
    assert(adapter.isSupported() === true, 'AIStudioAdapter.isSupported() must return true on /apps/<uuid>');
    const picked = findAistudioAppsInput();
    assert(picked === ws.editor, 'findAistudioAppsInput must pick ms-code-assistant-chat textarea, never Monaco textarea');
    assert(picked !== ws.monacoTextarea, 'Monaco textarea must never be targeted');
  });

  // Test 3: Visible Stop before flush on /apps/<uuid> waits cleanly without prematurely flushing chips
  await runTest('/apps/<uuid> submitForm waits for Stop to clear before flushing chips', async () => {
    window.__setMockPath('/apps/wait-stop');
    const page = mountAistudioAppsWorkspaceDom();
    const adapter = setupStoresAndAdapter();

    await adapter.insertText('<function_result call_id="10">\nok\n</function_result>', { source: 'tool-result' });
    page.setStop(true);
    setTimeout(() => page.setStop(false), 300);

    const sent = await adapter.submitForm();
    assert(sent === true, 'Expected submitForm to succeed once Stop cleared');
    assert(page.sentMessages.length === 1, `Expected 1 send after Stop cleared, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].includes('call_id="10"'), 'Submitted payload must include flushed tool result');
    assert(page.monacoTextarea!.value === '', 'Monaco editor textarea must remain untouched');
  });

  // Test 4: Aborts cleanly without flushing/sending on user edit OR navigation while waiting on Stop
  await runTest('/apps/<uuid> submitForm aborts cleanly on user edit or navigation while waiting on Stop', async () => {
    {
      window.__setMockPath('/apps/edit-abort');
      const page = mountAistudioAppsWorkspaceDom();
      const adapter = setupStoresAndAdapter();
      const ta = page.editor as HTMLTextAreaElement;
      await adapter.insertText('<function_result call_id="11">\nok\n</function_result>', { source: 'tool-result' });
      page.setStop(true);

      setTimeout(() => {
        ta.value = 'User took over typing';
        page.setStop(false);
      }, 150);

      const sent = await adapter.submitForm();
      assert(sent === false, 'Expected submitForm to abort on user edit while waiting on Stop');
      assert(page.sentMessages.length === 0, 'Edited draft must not be auto-submitted');
      assert(!ta.value.includes('call_id="11"'), 'Chip must not be flushed after user edit');
    }
    {
      window.__setMockPath('/apps/nav-abort-1');
      const page = mountAistudioAppsWorkspaceDom();
      const adapter = setupStoresAndAdapter();
      const ta = page.editor as HTMLTextAreaElement;
      await adapter.insertText('<function_result call_id="12">\nok\n</function_result>', { source: 'tool-result' });
      page.setStop(true);

      setTimeout(() => {
        window.__setMockPath('/apps/nav-abort-2');
        page.setStop(false);
      }, 150);

      const sent = await adapter.submitForm();
      assert(sent === false, 'Expected submitForm to abort on route change while waiting on Stop');
      assert(page.sentMessages.length === 0, 'Must not submit into another app');
      assert(!ta.value.includes('call_id="12"'), 'Chip must not flush into another app');
    }
  });

  // Test 5: Post-flush transient Stop + whitespace normalization survives; persistent Stop refuses forced Ctrl+Enter
  await runTest('/apps/<uuid> survives post-flush Stop & whitespace normalization, and refuses forced submit while Stop active', async () => {
    {
      window.__setMockPath('/apps/post-flush-ws');
      const page = mountAistudioAppsWorkspaceDom();
      const adapter = setupStoresAndAdapter();
      const ta = page.editor as HTMLTextAreaElement;
      await adapter.insertText('<function_result call_id="13">\nLine A\n\nLine B\n</function_result>', { source: 'tool-result' });

      ta.addEventListener(
        'input',
        () => {
          page.setStop(true);
          ta.value = ta.value.replace(/\n+/g, '  ');
          setTimeout(() => page.setStop(false), 250);
        },
        { once: true },
      );

      const sent = await adapter.submitForm();
      assert(sent === true, 'Expected submitForm to survive transient post-flush Stop and whitespace collapse');
      assert(page.sentMessages.length === 1, `Expected 1 send, got ${page.sentMessages.length}`);
      assert(page.sentMessages[0].includes('Line A') && page.sentMessages[0].includes('Line B'), 'Result body preserved');
    }
    {
      window.__setMockPath('/apps/persistent-stop');
      const page = mountAistudioAppsWorkspaceDom();
      const ta = page.editor as HTMLTextAreaElement;
      ta.value = 'Pending payload';
      page.setStop(true);

      const sent = await submitAistudioAppsInput(320);
      assert(sent === false, 'submitAistudioAppsInput must return false and refuse Ctrl+Enter fallback while Stop active');
      assert(page.sentMessages.length === 0, 'Must not force-send while Stop control is visible');
    }
  });

  // Test 6: End-to-end /app/apps -> /apps/<uuid> (ms-code-assistant-chat + Monaco) two rounds auto-execute/insert/submit
  await runTest('/app/apps -> /apps/<uuid> two consecutive rounds auto-execute, auto-insert into left textarea, and auto-submit once each', async () => {
    window.__setMockPath('/app/apps');
    const landing = mountAistudioAppsDom();
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    initializeAistudioAppsTurnGate();
    await automationService.initialize();

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    landing.editor.textContent = 'Inspect demo-project then open it';
    landing.editor.dispatchEvent(new Event('input', { bubbles: true }));
    landing.editor.dispatchEvent(
      makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })),
    );
    await sleep(450);
    assert(landing.sentMessages.length === 1, 'Initial /app/apps prompt sent');

    // Simulate SPA transition to real /apps/<uuid> workspace DOM (ms-code-assistant-chat + Monaco editor)
    window.__setMockPath('/apps/dd413b65-4b89-42ea-9aa9-2176234afbb1');
    window.dispatchEvent(new Event('popstate'));
    assert(adapter.isSupported() === true, 'Adapter must stay supported after transition to /apps/<uuid>');
    const appPage = mountAistudioAppsWorkspaceDom();

    let toolCalls = 0;
    const callNames: string[] = [];
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async (name: string) => {
        toolCalls++;
        callNames.push(name);
        return `{"ok":true,"tool":"${name}"}`;
      },
    };

    const pre1 = makeJsonlPre('apps-r1', 'list_projects', 1, { filter: 'demo-project' });
    appPage.chatPane.appendChild(pre1);
    assert(renderFunctionCall(pre1, { current: false }), 'Round 1 card rendered');
    for (let i = 0; i < 20 && (toolCalls < 1 || appPage.sentMessages.length < 1); i++) {
      await sleep(150);
    }
    assert(toolCalls === 1 && callNames[0] === 'list_projects', `Round 1 auto-executed once, got ${callNames}`);
    assert(appPage.sentMessages.length === 1 && appPage.sentMessages[0].includes('list_projects'), 'Round 1 result auto-submitted once');
    assert(appPage.monacoTextarea!.value === '', 'Round 1 auto-insert must NOT write into Monaco editor');

    const pre2 = makeJsonlPre('apps-r2', 'work_on_project', 2, { project: 'demo-project' });
    appPage.chatPane.appendChild(pre2);
    assert(renderFunctionCall(pre2, { current: false }), 'Round 2 card rendered');
    for (let i = 0; i < 20 && (toolCalls < 2 || appPage.sentMessages.length < 2); i++) {
      await sleep(150);
    }
    assert(toolCalls === 2 && callNames[1] === 'work_on_project', `Round 2 auto-executed once without re-running Round 1, got ${callNames}`);
    assert(appPage.sentMessages.length === 2 && appPage.sentMessages[1].includes('work_on_project'), 'Round 2 result auto-submitted once');
    assert(appPage.monacoTextarea!.value === '', 'Round 2 auto-insert must NOT write into Monaco editor');
  });

  // Test 7: Historical replay blocked across reload, late partial->complete hydration, and SPA switch; manual Run keeps skipAutoDelivery
  await runTest('/apps/<uuid> historical replay blocked across reload/hydration/navigation while manual Run works locally', async () => {
    window.__setMockPath('/apps/hist-app-1');
    const page = mountAistudioAppsWorkspaceDom();
    const ta = page.editor as HTMLTextAreaElement;
    const preOld = makeJsonlPre('apps-hist-1', 'run_shell', 1, { command: 'echo old-1' });
    page.chatPane.appendChild(preOld);

    setupStoresAndAdapter();
    initializeAistudioAppsTurnGate();
    resetAistudioAppsTurnGateForTests();
    await automationService.initialize();

    let calls = 0;
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        calls++;
        return 'ok';
      },
    };

    assert(renderFunctionCall(preOld, { current: false }), 'hist-1 rendered');

    // Late hydration partial -> complete without armed submission
    const preLate = makeJsonlPre('apps-hist-2', 'run_shell', 2, { command: 'echo late' }, false);
    page.chatPane.appendChild(preLate);
    assert(renderFunctionCall(preLate, { current: false }), 'late partial rendered');
    preLate.textContent = makeJsonlPre('apps-hist-2', 'run_shell', 2, { command: 'echo late' }, true).textContent;
    assert(renderFunctionCall(preLate, { current: false }), 'late complete rendered');

    await sleep(750);
    assert(calls === 0, `Reload/late historical cards must not auto-execute, got ${calls}`);

    // Manual Run executes locally without dispatching auto-delivery event or submitting
    let completionEvents = 0;
    const onComplete = () => completionEvents++;
    document.addEventListener('mcp:tool-execution-complete', onComplete);
    const manualBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="apps-hist-1"] .execute-button');
    assert(manualBtn !== null, 'Manual Run button must exist on historical card');
    manualBtn!.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(200);
    document.removeEventListener('mcp:tool-execution-complete', onComplete);
    assert(calls === 1, `Manual Run on historical card should execute once, got ${calls}`);
    assert(completionEvents === 0, `Manual Run on historical card must emit 0 auto-delivery events, got ${completionEvents}`);
    assert(page.sentMessages.length === 0, 'Manual Run on historical card must not auto-submit');

    // Armed session disarms immediately upon switching to another /apps/<id2>
    ta.value = 'New question';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.getSendButton()!.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(50);

    window.__setMockPath('/apps/hist-app-2');
    window.dispatchEvent(new Event('popstate'));
    const preSwitched = makeJsonlPre('apps-hist-3', 'run_shell', 3, { command: 'echo other-app' });
    page.chatPane.appendChild(preSwitched);
    assert(renderFunctionCall(preSwitched, { current: false }), 'switched-app card rendered');
    await sleep(750);
    assert(calls === 1, `Navigating to another /apps/<id> must disarm and block auto-execute, got ${calls}`);
  });

  // Test 8: Stale /app/apps landing localStorage must NOT block first-turn tools; Disable All & per-tool disable block /apps/<id>
  await runTest('Shared /app/apps localStorage ignored for new /apps/<id>, while Disable All & per-tool disable block auto-execute', async () => {
    window.__setMockPath('/app/apps');
    const landing = mountAistudioAppsDom();
    setupStoresAndAdapter();
    initializeAistudioAppsTurnGate();
    await automationService.initialize();

    const sig = generateContentSignature('list_projects', { filter: 'demo-project' });
    const key = `list_projects:1:${sig}`;
    localStorage.setItem(
      'mcp_url_based_function_history',
      JSON.stringify({
        'https://aistudio.google.com/app/apps': {
          [key]: { functionName: 'list_projects', callId: '1', contentSignature: sig, executedAt: Date.now(), params: { filter: 'demo-project' } },
        },
      }),
    );

    assert(getPreviousExecution('list_projects', '1', sig) === null, 'getPreviousExecution must ignore shared /app/apps landing bucket');
    storeExecutedFunction('list_projects', '1', { filter: 'demo-project' }, sig);

    // Arm on /app/apps -> /apps/fresh-app-id (real workspace DOM)
    landing.editor.textContent = 'Start fresh app';
    landing.editor.dispatchEvent(new Event('input', { bubbles: true }));
    landing.getSendButton()!.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    window.__setMockPath('/apps/fresh-app-id');
    window.dispatchEvent(new Event('popstate'));
    const page = mountAistudioAppsWorkspaceDom();

    let calls = 0;
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        calls++;
        return 'ok';
      },
    };

    const preFresh = makeJsonlPre('fresh-1', 'list_projects', 1, { filter: 'demo-project' });
    page.chatPane.appendChild(preFresh);
    assert(renderFunctionCall(preFresh, { current: false }), 'fresh-1 rendered');
    await sleep(750);
    assert(calls === 1, `Shared /app/apps history and prior SPA runs must not block first tool on /apps/<id>, got ${calls}`);

    // Disable All blocks subsequent auto-execute and canAistudioAppsAutoExecute
    (window as any).__mcpToolEnablement = [];
    const probeEl = document.createElement('div');
    assert(canAistudioAppsAutoExecute(probeEl, 'work_on_project') === false, 'Disable All must block work_on_project');
    assert(canAistudioAppsAutoExecute(probeEl, 'get_tool_schema') === false, 'Disable All must block meta tools');

    const preDisabledAll = makeJsonlPre('disabled-all-1', 'work_on_project', 2, { project: 'demo-project' });
    page.chatPane.appendChild(preDisabledAll);
    assert(renderFunctionCall(preDisabledAll, { current: false }), 'disabled-all-1 rendered');
    await sleep(750);
    assert(calls === 1, `Disable All must prevent auto-execute, got ${calls}`);

    // Per-tool enable allows enabled tool, blocks disabled tool
    (window as any).__mcpToolEnablement = ['work_on_project'];
    assert(canAistudioAppsAutoExecute(probeEl, 'list_projects') === false, 'Disabled tool list_projects must stay blocked');
    assert(canAistudioAppsAutoExecute(probeEl, 'work_on_project') === true, 'Enabled tool work_on_project should pass');
  });

  // Test 9: Failed callTool execution persists in history while pre-flight !isReady() and context-invalid do not
  await runTest('/apps/<uuid> failed callTool persists history while pre-flight !isReady and context-invalid do not', async () => {
    window.__setMockPath('/apps/fail-history');
    const page = mountAistudioAppsWorkspaceDom();
    (window as any).__mcpAutomationState = {
      autoExecute: false,
      autoInsert: false,
      autoSubmit: false,
      autoDiscovery: false,
    };

    const preFail = makeJsonlPre('apps-fail-1', 'run_shell', 50, { command: 'exit 1' });
    const preNotReady = makeJsonlPre('apps-notready-1', 'run_shell', 51, { command: 'echo nr' });
    const preCtxInvalid = makeJsonlPre('apps-ctx-1', 'run_shell', 52, { command: 'echo ctx' });
    page.chatPane.append(preFail, preNotReady, preCtxInvalid);

    renderFunctionCall(preFail, { current: false });
    renderFunctionCall(preNotReady, { current: false });
    renderFunctionCall(preCtxInvalid, { current: false });

    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error('Command exited with status 1');
      },
    };
    const failBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="apps-fail-1"] .execute-button');
    assert(failBtn !== null, 'apps-fail-1 Run button must exist');
    failBtn!.click();
    await sleep(80);

    const rawHistory = JSON.parse(localStorage.getItem('mcp_url_based_function_history') || '{}');
    const bucket = rawHistory[window.location.href] || {};
    const failEntries = Object.values(bucket).filter((e: any) => e.functionName === 'run_shell' && e.callId === '50');
    assert(failEntries.length === 1, `Failed callTool call_id=50 must be persisted, got ${failEntries.length}`);

    // Pre-flight !isReady()
    (window as any).mcpClient = { isReady: () => false, callTool: async () => 'unused' };
    document.querySelector<HTMLButtonElement>('.function-block[data-block-id="apps-notready-1"] .execute-button')!.click();
    await sleep(80);
    const bucketAfterNr = (JSON.parse(localStorage.getItem('mcp_url_based_function_history') || '{}')[window.location.href]) || {};
    const nrEntries = Object.values(bucketAfterNr).filter((e: any) => e.callId === '51');
    assert(nrEntries.length === 0, `Pre-flight !isReady must not persist history, got ${nrEntries.length}`);

    // Extension context invalidated
    let ctxEvents = 0;
    const onCtx = () => ctxEvents++;
    document.addEventListener('mcp:tool-execution-complete', onCtx);
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error('Extension context invalidated.');
      },
    };
    document.querySelector<HTMLButtonElement>('.function-block[data-block-id="apps-ctx-1"] .execute-button')!.click();
    await sleep(80);
    document.removeEventListener('mcp:tool-execution-complete', onCtx);
    assert(ctxEvents === 0, `Context-invalid failure must emit 0 auto-delivery events, got ${ctxEvents}`);
    const bucketAfterCtx = (JSON.parse(localStorage.getItem('mcp_url_based_function_history') || '{}')[window.location.href]) || {};
    const ctxEntries = Object.values(bucketAfterCtx).filter((e: any) => e.callId === '52');
    assert(ctxEntries.length === 0, `Context-invalid failure must not persist history, got ${ctxEntries.length}`);
  });

  // Test 10: Remind chip flushes cleanly on /apps/<id> + cold-load /apps/<id> -> Playground route isolation
  await runTest('/apps/<uuid> Remind chip merge + cold-load /apps to Playground gate isolation', async () => {
    window.__setMockPath('/app/apps');
    initializeAistudioTurnGate();
    initializeAistudioAppsTurnGate();

    assert(isAistudioAppsHost() === true, 'On /app/apps, isAistudioAppsHost must be true');
    assert(isAistudioHost() === false, 'On /app/apps, Playground isAistudioHost must be false');

    window.__setMockPath('/apps/remind-app');
    window.dispatchEvent(new Event('popstate'));
    assert(isAistudioAppsHost() === true, 'On /apps/<id>, isAistudioAppsHost must be true');
    assert(isAistudioHost() === false, 'On /apps/<id>, Playground isAistudioHost must be false');

    const page = mountAistudioAppsWorkspaceDom();
    const ta = page.editor as HTMLTextAreaElement;
    const adapter = setupStoresAndAdapter();
    assert(adapter.isSupported() === true, 'Adapter must support /apps/remind-app');

    const reminder = generateInstructionReminder(
      [
        { name: 'webcodex.list_projects', schema: '{}', description: 'List projects.' },
        { name: 'webcodex.run_shell', schema: '{}', description: 'Run shell.' },
      ],
      false,
    );
    assert(reminder.length > 0 && reminder.length < 750, `Expected compact reminder < 750 chars, got ${reminder.length}`);

    const ok = await adapter.insertText(reminder, { source: 'instructions', label: 'MCP Reminder' });
    assert(ok === true, 'Remind chip should capture on /apps/<id>');
    ta.value = 'Continue building the chart view';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.getSendButton()!.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(500);
    assert(page.sentMessages.length === 1, `Expected 1 merged Remind send, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].startsWith('Continue building the chart view'), 'User draft should remain first');
    assert(page.sentMessages[0].includes('[MCP SuperAssistant reminder]'), 'Reminder body must be flushed');

    // SPA navigate from /apps/<id> to Playground /prompts/new_chat -> Playground gate active, Apps host false
    window.__setMockPath('/prompts/new_chat');
    window.dispatchEvent(new Event('popstate'));
    assert(isAistudioAppsHost() === false, 'After leaving /apps for Playground, isAistudioAppsHost must be false');
    assert(isAistudioHost() === true, 'After navigating from /apps to Playground, isAistudioHost must be true');
  });

  window.__testResults = results;
  window.__testsDone = true;
}

void main();

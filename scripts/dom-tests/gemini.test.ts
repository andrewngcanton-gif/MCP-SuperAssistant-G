// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import { GeminiAdapter } from '@src/plugins/adapters/gemini.adapter';
import { inputChips } from '@src/services/input-chips';
import { automationService } from '@src/services/automation.service';
import {
  createStalledIndicator,
  startStalledStreamDetection,
  stopStalledStreamDetection,
} from '@src/render_prescript/src/observer/stalledStreamHandler';
import {
  monitorNode,
  abruptlyEndedStreams,
  completedStreams,
  streamingObservers,
  streamingLastUpdated,
} from '@src/render_prescript/src/observer/streamObserver';
import { checkForUnprocessedFunctionCalls } from '@src/render_prescript/src/observer/mutationObserver';
import { useUIStore } from '@src/stores/ui.store';
import { useToolStore } from '@src/stores/tool.store';
import { useAdapterStore } from '@src/stores/adapter.store';
import { generateInstructionReminder } from '@src/components/sidebar/Instructions/instructionGeneratorCompact';
import { renderFunctionCall, renderedFunctionBlocks, processedElements } from '@src/render_prescript/src/renderer/functionBlock';
import { initializeGeminiTurnGate, resetGeminiTurnGateForTests } from '@src/render_prescript/src/provenance/geminiTurnGate';
import { getPreviousExecution } from '@src/render_prescript/src/mcpexecute/storage';

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

function mountGeminiDom(sendLabel = 'Send message') {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'input-area-container';
  const inputArea = document.createElement('div');
  inputArea.className = 'input-area';
  const editor = document.createElement('div');
  editor.className = 'ql-editor textarea new-input-ui';
  editor.setAttribute('contenteditable', 'true');
  Object.assign(editor.style, { width: '300px', height: '40px', display: 'block' });

  const btn = document.createElement('button');
  btn.type = 'button';
  Object.assign(btn.style, { width: '36px', height: '36px', display: 'inline-block' });

  const sentMessages: string[] = [];
  let stopMode = false;

  const syncBtn = () => {
    if (stopMode) {
      btn.className = 'stop-button';
      btn.setAttribute('aria-label', 'Stop generating');
      btn.removeAttribute('disabled');
      btn.removeAttribute('aria-disabled');
    } else {
      btn.className = 'send-button';
      btn.setAttribute('aria-label', sendLabel);
      if ((editor.textContent || '').trim()) {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
      } else {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
    }
  };

  editor.addEventListener('input', syncBtn);
  btn.addEventListener('click', () => {
    if (stopMode || btn.disabled) return;
    sentMessages.push(editor.textContent || '');
    editor.textContent = '';
    syncBtn();
  });

  syncBtn();
  inputArea.append(editor, btn);
  container.appendChild(inputArea);
  document.body.appendChild(container);

  return {
    editor,
    btn,
    sentMessages,
    setStop: (s: boolean) => {
      stopMode = s;
      syncBtn();
    },
  };
}

function setupGeminiAdapter(): GeminiAdapter {
  const adapter = new GeminiAdapter();
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
    availableTools: [{ name: 'run_shell', description: 'Run shell', schema: '{}' }],
    enabledTools: new Set(['run_shell']),
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

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    localStorage.clear();
    renderedFunctionBlocks.clear();
    inputChips.teardown();
    automationService.cleanup();
    stopStalledStreamDetection();
    abruptlyEndedStreams.clear();
    completedStreams.clear();
    streamingObservers.forEach(o => o.disconnect());
    streamingObservers.clear();
    streamingLastUpdated.clear();
    resetGeminiTurnGateForTests();
    await fn();
    results.push({ name, pass: true });
  } catch (err: any) {
    results.push({ name, pass: false, error: err?.stack || String(err) });
  } finally {
    delete (window as any).mcpClient;
    delete (window as any).__mcpAutomationState;
    inputChips.teardown();
    automationService.cleanup();
    stopStalledStreamDetection();
    resetGeminiTurnGateForTests();
  }
}

async function main() {
  window.__setMockHost('gemini.google.com');

  // Test 1: Stop control visible before flush -> waits cleanly without flushing until Stop clears, then clicks Chinese 发送提示 / 提交
  await runTest('Gemini submitForm waits for Stop to clear before flushing chips and clicks Chinese send label', async () => {
    for (const label of ['发送提示', '提交']) {
      inputChips.teardown();
      window.__setMockPath('/app/chat-stop-wait');
      const page = mountGeminiDom(label);
      const adapter = setupGeminiAdapter();

      await adapter.insertText('<function_result call_id="30">\nERROR: exit 1\n</function_result>', { source: 'tool-result' });
      page.setStop(true);

      setTimeout(() => page.setStop(false), 350);
      const sent = await adapter.submitForm();
      assert(sent === true, `Expected submitForm to succeed after Stop cleared (${label})`);
      assert(page.sentMessages.length === 1, `Expected 1 sent message (${label}), got ${page.sentMessages.length}`);
      assert(page.sentMessages[0].includes('call_id="30"'), 'Sent message should include flushed tool result');
    }
  });

  // Test 2: Aborts cleanly without sending or prematurely flushing chips if user edits or navigates while waiting on Stop
  await runTest('Gemini submitForm aborts cleanly on user edit or navigation while waiting on Stop', async () => {
    {
      window.__setMockPath('/app/chat-edit-abort');
      const page = mountGeminiDom();
      const adapter = setupGeminiAdapter();
      page.editor.textContent = 'initial';
      page.setStop(true);

      setTimeout(() => {
        page.editor.textContent = 'user typed something else';
        page.setStop(false);
      }, 200);
      const sent = await adapter.submitForm();
      assert(sent === false, 'Expected submitForm to abort on user edit while waiting on Stop');
      assert(page.sentMessages.length === 0, 'Edited draft must not be sent');
    }
    {
      window.__setMockPath('/app/chat-nav-1');
      const page = mountGeminiDom();
      const adapter = setupGeminiAdapter();
      await adapter.insertText('<function_result call_id="31">\nok\n</function_result>', { source: 'tool-result' });
      page.setStop(true);

      setTimeout(() => {
        window.__setMockPath('/app/chat-nav-2');
        page.setStop(false);
      }, 200);
      const sent = await adapter.submitForm();
      assert(sent === false, 'Expected submitForm to abort on navigation while waiting on Stop');
      assert(page.sentMessages.length === 0, 'Must not send into a different conversation');
      assert(!(page.editor.textContent || '').includes('call_id="31"'), 'Chip must not be prematurely flushed into editor before Stop clears');
    }
  });

  // Test 3: Quill whitespace / blank-line normalization after insertText does not abort submission
  await runTest('Gemini submitForm survives Quill whitespace normalization after insertText', async () => {
    window.__setMockPath('/app/chat-quill-ws');
    const page = mountGeminiDom();
    const adapter = setupGeminiAdapter();
    await adapter.insertText('<function_result call_id="32">\nLine A\n\nLine B\n</function_result>', { source: 'tool-result' });

    page.editor.addEventListener('input', () => {
      setTimeout(() => {
        page.editor.textContent = (page.editor.textContent || '').replace(/\n+/g, '  ');
      }, 60);
    }, { once: true });

    const sent = await adapter.submitForm();
    assert(sent === true, 'Expected submitForm to tolerate Quill whitespace normalization');
    assert(page.sentMessages.length === 1, 'Expected 1 sent message');
  });

  // Test 4: Post-flush transient Stop control waits until deadline instead of aborting on first tick
  await runTest('Gemini submitForm waits out transient post-flush Stop control and Quill normalization', async () => {
    window.__setMockPath('/app/chat-post-flush-stop');
    const page = mountGeminiDom();
    const adapter = setupGeminiAdapter();
    await adapter.insertText('<function_result call_id="33">\nResult body\n</function_result>', { source: 'tool-result' });

    page.editor.addEventListener('input', () => {
      page.setStop(true);
      page.editor.textContent = (page.editor.textContent || '').replace(/\n+/g, ' ');
      setTimeout(() => page.setStop(false), 250);
    }, { once: true });

    const sent = await adapter.submitForm();
    assert(sent === true, 'Expected submitForm to wait out post-flush transient Stop');
    assert(page.sentMessages.length === 1, 'Expected 1 sent message');
    assert(page.sentMessages[0].includes('Result body'), 'Message body preserved');
  });

  // Test 5: createStalledIndicator removes .spinner and streamObserver detects stalled -s1 multi-call segment
  await runTest('Truncated multi-call segment -s1 triggers stream-abruptly-ended and removes .spinner', async () => {
    document.body.innerHTML = '';
    startStalledStreamDetection();

    const pre = document.createElement('pre');
    pre.setAttribute('data-block-id', 'block-multi');
    pre.textContent = [
      '{"type":"function_call_start","name":"tool_a","call_id":1}',
      '{"type":"function_call_end","call_id":1}',
      '{"type":"function_call_start","name":"run_shell","call_id":2}',
      '{"type":"parameter","key":"command","value":"broken...',
    ].join('\n');

    const card0 = document.createElement('div');
    card0.className = 'function-block function-complete';
    card0.setAttribute('data-block-id', 'block-multi');

    const card1 = document.createElement('div');
    card1.className = 'function-block function-loading';
    card1.setAttribute('data-block-id', 'block-multi-s1');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    card1.appendChild(spinner);

    document.body.append(card0, card1, pre);
    monitorNode(pre, 'block-multi');

    await sleep(3500);

    assert(!card1.classList.contains('function-loading'), 'card1 should lose function-loading class');
    assert(card1.classList.contains('function-stalled'), 'card1 should gain function-stalled class');
    assert(card1.querySelector('.spinner') === null, 'card1 .spinner node must be removed');
    assert(card1.querySelector('.stalled-indicator') !== null, 'card1 should show stalled indicator');

    const manualCard = document.createElement('div');
    manualCard.className = 'function-block function-loading';
    manualCard.innerHTML = '<div class="spinner"></div>';
    createStalledIndicator('block-manual', manualCard, true);
    assert(manualCard.querySelector('.spinner') === null, 'createStalledIndicator must remove .spinner');
    assert(manualCard.classList.contains('function-stalled'), 'createStalledIndicator must add function-stalled');
  });

  // Test 6: Remind inserts lightweight MCP Reminder chip and flushes cleanly with user draft on submit
  await runTest('Gemini Remind chip inserts lightweight reminder and flushes with draft', async () => {
    window.__setMockPath('/app/chat-remind-chip');
    const page = mountGeminiDom();
    const adapter = setupGeminiAdapter();
    const reminder = generateInstructionReminder([
      { name: 'webcodex.list_projects', schema: '{}', description: 'List projects.' },
      { name: 'webcodex.run_shell', schema: '{}', description: 'Run shell.' },
      { name: 'webcodex.edit_project_files', schema: '{}', description: 'Edit files.' },
    ], false);
    assert(reminder.length > 0 && reminder.length < 750, `Expected compact reminder, got ${reminder.length} chars`);

    const ok = await adapter.insertText(reminder, { source: 'instructions', label: 'MCP Reminder' });
    assert(ok === true, 'Expected insertText for MCP Reminder to succeed');

    const sent = await adapter.submitForm();
    assert(sent === true, 'Expected submitForm to flush and send MCP Reminder');
    assert(page.sentMessages.length === 1, 'Expected 1 sent message');
    assert(page.sentMessages[0].includes('[MCP SuperAssistant reminder]'), 'Sent message must include reminder header');
  });

  const makeJsonlPre = (blockId: string, name: string, callId: number, command: string, complete = true): HTMLPreElement => {
    const pre = document.createElement('pre');
    pre.setAttribute('data-block-id', blockId);
    const lines = [
      JSON.stringify({ type: 'function_call_start', name, call_id: callId }),
      JSON.stringify({ type: 'parameter', key: 'command', value: command }),
    ];
    if (complete) {
      lines.push(JSON.stringify({ type: 'function_call_end', call_id: callId }));
    }
    pre.textContent = lines.join('\n');
    return pre;
  };

  // Test 7: Gemini historical-conversation replay gate
  await runTest('Gemini turn gate blocks historical cards across reload/hydration/navigation and allows current turn & live streams', async () => {
    window.__setMockPath('/app/chat-history');
    document.body.innerHTML = '';

    let autoExecCalls: Array<{ name: string; command: string }> = [];
    (window as any).__mcpAutomationState = {
      autoExecute: true,
      autoInsert: false,
      autoSubmit: false,
      autoDiscovery: true,
      autoExecuteDelay: 0,
    };
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async (name: string, args: any) => {
        autoExecCalls.push({ name, command: String(args?.command ?? '') });
        return 'ok';
      },
    };

    // Mount existing history BEFORE initializeGeminiTurnGate + render
    const oldTurn1 = document.createElement('model-response');
    const preOld1 = makeJsonlPre('hist-1', 'run_shell', 38, 'pnpm -F @extension/content-script type-check');
    oldTurn1.appendChild(preOld1);
    const userQuery1 = document.createElement('user-query');
    userQuery1.textContent = 'Earlier question';
    document.body.append(oldTurn1, userQuery1);

    initializeGeminiTurnGate();
    resetGeminiTurnGateForTests();

    assert(renderFunctionCall(preOld1, { current: false }), 'hist-1 should render');

    // Late-hydrated historical final response (including incremental partial->complete hydration WITHOUT Stop button)
    const lateHistTurn = document.createElement('model-response');
    const preLateHist = makeJsonlPre('hist-2', 'run_shell', 39, 'echo late-history', false);
    lateHistTurn.appendChild(preLateHist);
    document.body.appendChild(lateHistTurn);
    assert(renderFunctionCall(preLateHist, { current: false }), 'hist-2 partial should render');
    preLateHist.textContent = makeJsonlPre('hist-2', 'run_shell', 39, 'echo late-history', true).textContent;
    assert(renderFunctionCall(preLateHist, { current: false }), 'hist-2 complete should render');

    await sleep(750);
    assert(autoExecCalls.length === 0, `Historical Gemini cards must not auto-execute, got ${autoExecCalls.length}`);

    // Manual Run click still works on historical card, without dispatching auto-delivery events into chat
    let completionEvents = 0;
    const onComplete = () => {
      completionEvents++;
    };
    document.addEventListener('mcp:tool-execution-complete', onComplete);
    const manualBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="hist-1"] .execute-button');
    assert(manualBtn !== null, 'hist-1 must have manual Run button');
    manualBtn!.click();
    await sleep(50);
    document.removeEventListener('mcp:tool-execution-complete', onComplete);
    assert(autoExecCalls.length === 1 && autoExecCalls[0].command.includes('type-check'), 'Manual click on historical card must execute');
    assert(completionEvents === 0, `Manual Run on historical Gemini card must not auto-deliver, got ${completionEvents} event(s)`);

    // Navigate to /app (new chat), submit prompt (via trusted Enter), migrate /app -> /app/new-123
    autoExecCalls = [];
    window.__setMockPath('/app');
    const page = mountGeminiDom();
    const adapter = setupGeminiAdapter();
    page.editor.textContent = 'Run new task';
    const enterEv = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    page.editor.dispatchEvent(enterEv);

    window.__setMockPath('/app/new-123');
    const oldInsertedBeforeLatest = document.createElement('model-response');
    const prePrior = makeJsonlPre('prior-in-chat', 'run_shell', 40, 'echo prior-turn');
    oldInsertedBeforeLatest.appendChild(prePrior);
    const latestUserQuery = document.createElement('user-query');
    latestUserQuery.textContent = 'Run new task';
    const currentResponse = document.createElement('model-response');
    const preCurrent = makeJsonlPre('cur-1', 'run_shell', 41, 'echo current-turn');
    currentResponse.appendChild(preCurrent);
    document.body.append(oldInsertedBeforeLatest, latestUserQuery, currentResponse);

    renderFunctionCall(prePrior, { current: false });
    renderFunctionCall(preCurrent, { current: false });
    await sleep(750);
    assert(
      autoExecCalls.length === 1 && autoExecCalls[0].command === 'echo current-turn',
      `Only current-turn card should auto-execute, got ${JSON.stringify(autoExecCalls)}`,
    );

    // Navigating to a different conversation disarms the gate and blocks its cards
    autoExecCalls = [];
    window.__setMockPath('/app/other-456');
    const otherChatResponse = document.createElement('model-response');
    const preOther = makeJsonlPre('other-1', 'run_shell', 42, 'echo other-chat');
    otherChatResponse.appendChild(preOther);
    document.body.appendChild(otherChatResponse);
    renderFunctionCall(preOther, { current: false });
    await sleep(750);
    assert(autoExecCalls.length === 0, 'Cards in another conversation after navigation must not auto-execute');

    // Live-streaming regeneration (incomplete -> complete with visible Stop button) without composer send still auto-executes
    autoExecCalls = [];
    const regenStop = document.createElement('button');
    regenStop.className = 'stop-button';
    regenStop.setAttribute('aria-label', 'Stop generating');
    Object.assign(regenStop.style, { width: '36px', height: '36px', display: 'inline-block' });
    document.body.appendChild(regenStop);
    const regenResponse = document.createElement('model-response');
    const preRegen = makeJsonlPre('regen-1', 'run_shell', 43, 'echo live-regen', false);
    regenResponse.appendChild(preRegen);
    document.body.appendChild(regenResponse);
    renderFunctionCall(preRegen, { current: false });
    preRegen.textContent = makeJsonlPre('regen-1', 'run_shell', 43, 'echo live-regen', true).textContent;
    regenStop.remove();
    renderFunctionCall(preRegen, { current: false });
    await sleep(750);
    assert(
      autoExecCalls.length === 1 && autoExecCalls[0].command === 'echo live-regen',
      `Live streaming regeneration should auto-execute, got ${JSON.stringify(autoExecCalls)}`,
    );
    void adapter;
  });

  // Test 8: Failed mcpClient.callTool invocation is recorded in storeExecutedFunction while pre-flight !isReady() and context-invalid errors are not
  await runTest('Failed callTool execution is persisted in execution history while pre-flight !isReady and context-invalid are not', async () => {
    window.__setMockPath('/app/chat-fail-history');
    document.body.innerHTML = '';
    (window as any).__mcpAutomationState = {
      autoExecute: false,
      autoInsert: false,
      autoSubmit: false,
      autoDiscovery: false,
    };

    const preFail = makeJsonlPre('fail-1', 'run_shell', 50, 'echo fail-me');
    const preNotReady = makeJsonlPre('notready-1', 'run_shell', 51, 'echo not-ready');
    const preCtxInvalid = makeJsonlPre('ctxinvalid-1', 'run_shell', 52, 'echo ctx-invalid');
    document.body.append(preFail, preNotReady, preCtxInvalid);

    renderFunctionCall(preFail, { current: false });
    renderFunctionCall(preNotReady, { current: false });
    renderFunctionCall(preCtxInvalid, { current: false });

    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error('Command exited with status 1');
      },
    };
    const failBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="fail-1"] .execute-button');
    assert(failBtn !== null, 'fail-1 Run button must exist');
    failBtn!.click();
    await sleep(50);

    const failCard = document.querySelector('.function-block[data-block-id="fail-1"]');
    assert(failCard?.classList.contains('exec-error'), 'fail-1 should be marked exec-error');

    const recordedFail = getPreviousExecution('run_shell', '50', '');
    // Verify via storage key scan using actual computed signature
    const rawHistory = JSON.parse(localStorage.getItem('mcp_url_based_function_history') || '{}');
    const bucket = rawHistory[window.location.href] || {};
    const failEntries = Object.values(bucket).filter((e: any) => e.functionName === 'run_shell' && e.callId === '50');
    assert(failEntries.length === 1, `Expected failed call_id=50 to be stored in execution history, got ${failEntries.length}`);
    void recordedFail;

    let ctxEvents = 0;
    const onCtxComplete = () => {
      ctxEvents++;
    };
    document.addEventListener('mcp:tool-execution-complete', onCtxComplete);
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error('Extension context is invalid - cannot send message');
      },
    };
    const ctxBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="ctxinvalid-1"] .execute-button');
    assert(ctxBtn !== null, 'ctxinvalid-1 Run button must exist');
    ctxBtn!.click();
    await sleep(50);
    document.removeEventListener('mcp:tool-execution-complete', onCtxComplete);
    assert(ctxEvents === 0, `Context-invalid error must not dispatch completion event, got ${ctxEvents}`);

    (window as any).mcpClient = {
      isReady: () => false,
      callTool: async () => 'should not run',
    };
    const notReadyBtn = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="notready-1"] .execute-button');
    assert(notReadyBtn !== null, 'notready-1 Run button must exist');
    notReadyBtn!.click();
    await sleep(50);

    const rawAfter = JSON.parse(localStorage.getItem('mcp_url_based_function_history') || '{}');
    const bucketAfter = rawAfter[window.location.href] || {};
    const notReadyEntries = Object.values(bucketAfter).filter(
      (e: any) => e.functionName === 'run_shell' && (e.callId === '51' || e.callId === '52'),
    );
    assert(notReadyEntries.length === 0, 'Pre-flight !isReady and context-invalid exits must not be stored in execution history');
  });

  await runTest('Gemini mounts chip bar above grid .text-input-field so 3+ chips never shift or crush editor', async () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'input-area-container';
    Object.assign(container.style, { display: 'block', width: '760px' });

    const inputArea = document.createElement('div');
    inputArea.className = 'input-area';
    Object.assign(inputArea.style, { display: 'flex', flexDirection: 'column', width: '100%' });

    const textInputField = document.createElement('div');
    textInputField.className = 'text-input-field';
    Object.assign(textInputField.style, {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      width: '100%',
      alignItems: 'center',
    });

    const leading = document.createElement('div');
    leading.className = 'leading-actions-wrapper';
    Object.assign(leading.style, { width: '48px', height: '40px' });

    const textareaWrapper = document.createElement('div');
    textareaWrapper.className = 'text-input-field_textarea-wrapper';
    Object.assign(textareaWrapper.style, { minWidth: '0', width: '100%' });

    const editor = document.createElement('div');
    editor.className = 'ql-editor textarea new-input-ui';
    editor.setAttribute('contenteditable', 'true');
    Object.assign(editor.style, { display: 'block', width: '100%', minHeight: '40px' });
    textareaWrapper.appendChild(editor);

    const trailing = document.createElement('div');
    trailing.className = 'trailing-actions-wrapper';
    Object.assign(trailing.style, { width: '200px', height: '40px' });
    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.setAttribute('aria-label', 'Microphone');
    trailing.appendChild(micBtn);

    textInputField.append(leading, textareaWrapper, trailing);
    inputArea.appendChild(textInputField);
    container.appendChild(inputArea);
    document.body.appendChild(container);

    const adapter = setupGeminiAdapter();
    const baseline = editor.getBoundingClientRect();
    assert(baseline.width > 0 && baseline.height > 0, `Expected non-zero baseline editor box, got ${baseline.width}x${baseline.height}`);

    for (let i = 1; i <= 3; i++) {
      const ok = await adapter.insertText(`<function_result call_id="${i}">tool output payload ${i} ${'x'.repeat(240)}</function_result>`, {
        source: 'tool-result',
      });
      assert(ok, `insertText #${i} must succeed`);

      const chipHost = document.getElementById('mcp-input-chips-host');
      assert(chipHost !== null, `Chip host must exist after insert #${i}`);
      assert(
        chipHost!.parentElement === inputArea,
        `Chip host must mount in .input-area (not .text-input-field), got ${chipHost!.parentElement?.className}`,
      );

      const rect = editor.getBoundingClientRect();
      assert(
        Math.abs(rect.left - baseline.left) <= 1,
        `Editor left shifted after insert #${i}: baseline=${baseline.left}, got=${rect.left}`,
      );
      assert(
        rect.width > 0 && Math.abs(rect.width - baseline.width) <= 1,
        `Editor width changed after insert #${i}: baseline=${baseline.width}, got=${rect.width}`,
      );
      assert(rect.height > 0, `Editor height collapsed after insert #${i}: ${rect.height}`);
    }

    const chipHost = document.getElementById('mcp-input-chips-host');
    const renderedChips = chipHost?.shadowRoot?.querySelectorAll('.chip') ?? [];
    assert(renderedChips.length === 3, `Expected 3 rendered chips, got ${renderedChips.length}`);
    inputChips.teardown();
  });

  // Test 10: Multi-call JSONL completes Card 2 (-s1) even when Card 1 already has .function-complete
  await runTest('Multi-call JSONL renders final chunk of 2nd card even after 1st card already completed', async () => {
    document.body.innerHTML = '';

    const pre = document.createElement('pre');
    // Step 1: Call 1 partial -> initial render leaves Card 0 loading
    pre.textContent = [
      '{"type":"function_call_start","name":"webcodex.run_shell","call_id":1}',
      '{"type":"parameter","key":"project","value":"~p1"}',
    ].join('\n');
    document.body.appendChild(pre);

    assert(checkForUnprocessedFunctionCalls() === 1, 'Expected initial block to render');
    const assignedId = pre.getAttribute('data-block-id')!;
    const card0 = document.querySelector<HTMLElement>(`.function-block[data-block-id="${assignedId}"]`)!;
    assert(card0.classList.contains('function-loading'), 'Card 0 should start loading');

    // Step 2: Call 1 ends -> transitions Card 0 to .function-complete
    pre.textContent = [
      '{"type":"function_call_start","name":"webcodex.run_shell","call_id":1}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"command","value":"echo ok"}',
      '{"type":"function_call_end","call_id":1}',
    ].join('\n');
    assert(renderFunctionCall(pre, { current: false }) === true, 'Call 1 completion render should run');
    assert(card0.classList.contains('function-complete'), 'Card 0 should now have .function-complete');

    // Step 3: Call 2 starts (incomplete) -> creates Card 1 (-s1) in .function-loading
    pre.textContent = [
      '{"type":"function_call_start","name":"webcodex.run_shell","call_id":1}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"command","value":"echo ok"}',
      '{"type":"function_call_end","call_id":1}',
      '{"type":"function_call_start","name":"webcodex.read_files","call_id":2}',
      '{"type":"parameter","key":"project","value":"~p1"}',
    ].join('\n');
    assert(renderFunctionCall(pre, { current: false }) === true, 'Call 2 partial render should run');
    const card1 = document.querySelector<HTMLElement>(`.function-block[data-block-id="${assignedId}-s1"]`)!;
    assert(card1 !== null, 'Card 1 (-s1) must exist');
    assert(card1.classList.contains('function-loading'), 'Card 1 should start in function-loading');

    // Step 4: Call 2 final chunk (`items` + `function_call_end`) flips functionInfo.isComplete = true
    // while Card 0 ALREADY has .function-complete. Card 1 must NOT be skipped!
    pre.textContent = [
      '{"type":"function_call_start","name":"webcodex.run_shell","call_id":1}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"command","value":"echo ok"}',
      '{"type":"function_call_end","call_id":1}',
      '{"type":"function_call_start","name":"webcodex.read_files","call_id":2}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"items","value":[{"path":"detailed-design.md","start_line":1,"limit":50}]}',
      '{"type":"function_call_end","call_id":2}',
    ].join('\n');
    assert(renderFunctionCall(pre, { current: false }) === true, 'Call 2 completion render must NOT be skipped');
    assert(!card1.classList.contains('function-loading'), 'Card 1 must lose function-loading');
    assert(card1.classList.contains('function-complete'), 'Card 1 must gain function-complete');
    assert(card1.querySelector('.spinner') === null, 'Card 1 .spinner must be removed');
    assert(card1.querySelector('.execute-button') !== null, 'Card 1 must render Run button');
    assert(card1.textContent?.includes('detailed-design.md'), 'Card 1 must include final items parameter');
  });

  // Test 11: Structured MCP 400 / JSON-RPC errors mentioning `timeout_secs` stay verbatim while real timeouts stay friendly
  await runTest('Structured MCP 400 error containing timeout_secs is preserved verbatim while plain timeout shows friendly message', async () => {
    document.body.innerHTML = '';
    localStorage.clear();
    (window as any).__mcpAutomationSettings = {
      autoExecute: false,
      autoInsert: false,
      autoSubmit: false,
      autoDiscovery: true,
      autoExecuteDelay: 0,
    };

    const preA = document.createElement('pre');
    preA.setAttribute('data-block-id', 'err400-a');
    preA.textContent = [
      '{"type":"function_call_start","name":"webcodex.search_project_texts","call_id":101}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"queries","value":["bad"]}',
      '{"type":"function_call_end","call_id":101}',
    ].join('\n');
    document.body.appendChild(preA);
    assert(renderFunctionCall(preA, { current: false }) === true, 'preA should render');

    const schemaErr =
      'MCP error 400: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"invalid arguments for tool \'search_project_texts\': queries[0]: invalid value or type"}} Expected input_schema: {"timeout_secs":{"type":"integer"}}';
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error(schemaErr);
      },
    };

    const runBtnA = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="err400-a"] .execute-button');
    assert(runBtnA !== null, 'Card A must render Run button');
    runBtnA!.click();
    await sleep(60);

    const errTextA = document.querySelector('.function-block[data-block-id="err400-a"] .function-result-error')?.textContent || '';
    assert(errTextA.includes('MCP error 400'), `Expected MCP error 400 preserved, got: ${errTextA}`);
    assert(errTextA.includes('invalid arguments'), `Expected invalid arguments preserved, got: ${errTextA}`);
    assert(errTextA.includes('timeout_secs'), `Expected timeout_secs preserved, got: ${errTextA}`);
    assert(!errTextA.includes('Request timed out. Please try again.'), `Structured 400 must not be rewritten as timeout: ${errTextA}`);

    const preB = document.createElement('pre');
    preB.setAttribute('data-block-id', 'err400-b');
    preB.textContent = [
      '{"type":"function_call_start","name":"webcodex.run_shell","call_id":102}',
      '{"type":"parameter","key":"project","value":"~p1"}',
      '{"type":"parameter","key":"command","value":"echo ok"}',
      '{"type":"function_call_end","call_id":102}',
    ].join('\n');
    document.body.appendChild(preB);
    assert(renderFunctionCall(preB, { current: false }) === true, 'preB should render');

    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async () => {
        throw new Error('Request timeout after 30000ms');
      },
    };

    const runBtnB = document.querySelector<HTMLButtonElement>('.function-block[data-block-id="err400-b"] .execute-button');
    assert(runBtnB !== null, 'Card B must render Run button');
    runBtnB!.click();
    await sleep(60);

    const errTextB = document.querySelector('.function-block[data-block-id="err400-b"] .function-result-error')?.textContent || '';
    assert(errTextB.includes('Request timed out. Please try again.'), `Plain timeout must still map to friendly message, got: ${errTextB}`);
  });

  window.__testResults = results;
  window.__testsDone = true;
}

void main();

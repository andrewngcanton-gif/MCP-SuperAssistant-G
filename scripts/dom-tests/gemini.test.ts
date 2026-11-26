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
    inputChips.teardown();
    automationService.cleanup();
    stopStalledStreamDetection();
    abruptlyEndedStreams.clear();
    completedStreams.clear();
    streamingObservers.forEach(o => o.disconnect());
    streamingObservers.clear();
    streamingLastUpdated.clear();
    await fn();
    results.push({ name, pass: true });
  } catch (err: any) {
    results.push({ name, pass: false, error: err?.stack || String(err) });
  } finally {
    inputChips.teardown();
    automationService.cleanup();
    stopStalledStreamDetection();
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

  window.__testResults = results;
  window.__testsDone = true;
}

void main();

// Copyright (c) 2026 andrewngcanton-gif
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  __getAistudioGateStateForTests,
  __resetAistudioTurnGateForTests,
  findAistudioSendButton,
  getAistudioProvenance,
  initializeAistudioTurnGate,
  isAistudioSendButtonEnabled,
  registerAistudioInvocation,
  claimAistudioAutomaticInvocation,
  isAistudioDeliveryAuthorized,
} from '@src/render_prescript/src/provenance/aistudioTurnGate';
import { renderFunctionResult } from '@src/render_prescript/src/renderer/functionResult';
import { renderFunctionCall } from '@src/render_prescript/src/renderer/functionBlock';
import {
  generateContentSignature,
  getPreviousExecution,
  storeExecutedFunction,
} from '@src/render_prescript/src/mcpexecute/storage';
import { inputChips, isChipSubmitEnter } from '@src/services/input-chips';
import { AIStudioAdapter } from '@src/plugins/adapters/aistudio.adapter';
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

interface MockPage {
  ta: HTMLTextAreaElement;
  runBtn: HTMLButtonElement;
  sessionContent: HTMLDivElement;
  sentMessages: string[];
  setBusy: (busy: boolean) => void;
  appendUserTurn: (id: string, text: string, withComments?: boolean) => HTMLElement;
  appendModelTurn: (id: string, text: string, thought?: boolean) => { turn: HTMLElement; block: HTMLElement };
}

function mountAistudioDom(): MockPage {
  document.body.innerHTML = '';
  const sessionContent = document.createElement('div');
  sessionContent.className = 'chat-session-content';
  document.body.appendChild(sessionContent);

  const footer = document.createElement('footer');
  footer.className = 'ng-star-inserted';
  const promptBox = document.createElement('ms-prompt-box');
  const boxContainer = document.createElement('div');
  boxContainer.className = 'mat-mdc-tooltip-trigger prompt-box-container';

  const textareaRow = document.createElement('div');
  textareaRow.className = 'textarea-row ng-star-inserted';
  const textWrapper = document.createElement('div');
  textWrapper.className = 'text-wrapper ng-pristine';
  const ta = document.createElement('textarea');
  ta.className = 'cdk-textarea-autosize textarea';
  ta.setAttribute('aria-label', 'Enter a prompt');
  ta.setAttribute('placeholder', 'Start typing a prompt to see what our models can do');
  textWrapper.appendChild(ta);
  textareaRow.appendChild(textWrapper);

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'buttons-row';
  const btnWrapper = document.createElement('div');
  btnWrapper.className = 'button-wrapper panel-controls-trailing';
  const msRun = document.createElement('ms-run-button');
  msRun.className = 'composer-send-button';
  const runBtn = document.createElement('button');
  runBtn.type = 'submit';
  runBtn.className = 'mat-mdc-tooltip-trigger ctrl-enter-submits ms-button-primary';
  runBtn.textContent = 'Run  Ctrl  keyboard_return';
  runBtn.setAttribute('aria-disabled', 'true');
  msRun.appendChild(runBtn);
  btnWrapper.appendChild(msRun);
  buttonsRow.appendChild(btnWrapper);

  boxContainer.append(textareaRow, buttonsRow);
  promptBox.appendChild(boxContainer);
  footer.appendChild(promptBox);
  document.body.appendChild(footer);

  let isBusy = false;
  const sentMessages: string[] = [];

  const syncRunState = () => {
    if (isBusy) {
      runBtn.textContent = 'Stop';
      runBtn.setAttribute('aria-label', 'Stop');
      runBtn.removeAttribute('aria-disabled');
    } else {
      runBtn.textContent = 'Run  Ctrl  keyboard_return';
      runBtn.removeAttribute('aria-label');
      if (ta.value.trim()) runBtn.removeAttribute('aria-disabled');
      else runBtn.setAttribute('aria-disabled', 'true');
    }
  };

  ta.addEventListener('input', syncRunState);
  runBtn.addEventListener('click', () => {
    if (isBusy || runBtn.getAttribute('aria-disabled') === 'true') return;
    sentMessages.push(ta.value);
    ta.value = '';
    syncRunState();
  });

  const appendUserTurn = (id: string, text: string, withComments = false): HTMLElement => {
    const host = document.createElement('ms-chat-turn');
    host.id = id;
    const turn = document.createElement('div');
    turn.className = 'virtual-scroll-container user-prompt-container';
    turn.setAttribute('data-turn-role', 'User');
    const chunk = document.createElement('ms-text-chunk');
    if (withComments) chunk.appendChild(document.createComment('ng-container'));
    const inner = document.createElement('div');
    inner.textContent = text;
    chunk.appendChild(inner);
    if (withComments) chunk.appendChild(document.createComment('ng-end'));
    turn.appendChild(chunk);
    host.appendChild(turn);
    sessionContent.appendChild(host);
    return turn;
  };

  const appendModelTurn = (id: string, text: string, thought = false) => {
    const host = document.createElement('ms-chat-turn');
    host.id = id;
    if (thought) host.className = 'text-chunk-host thought-activity-host';
    const turn = document.createElement('div');
    turn.className = 'virtual-scroll-container model-prompt-container';
    turn.setAttribute('data-turn-role', 'Model');
    const chunk = document.createElement('ms-text-chunk');
    const block = document.createElement('div');
    block.className = 'function-block';
    block.textContent = text;
    chunk.appendChild(block);
    turn.appendChild(chunk);
    host.appendChild(turn);
    sessionContent.appendChild(host);
    return { turn, block };
  };

  return {
    ta,
    runBtn,
    sessionContent,
    sentMessages,
    setBusy: (b: boolean) => {
      isBusy = b;
      syncRunState();
    },
    appendUserTurn,
    appendModelTurn,
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
    ],
    enabledTools: new Set(['list_projects', 'work_on_project']),
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
    __resetAistudioTurnGateForTests();
    await fn();
    results.push({ name, pass: true });
  } catch (err: any) {
    results.push({ name, pass: false, error: err?.stack || String(err) });
  } finally {
    inputChips.teardown();
    automationService.cleanup();
    __resetAistudioTurnGateForTests();
  }
}

async function main() {
  window.__setMockHost('aistudio.google.com');
  const realDateNow = Date.now;
  let timeOffset = 0;
  Date.now = () => realDateNow() + timeOffset;

  const sampleInstructions = `[SuperAssistant tools — call by emitting a fenced code block:]\n<system>\nHOW TO CALL A TOOL\n\`\`\`jsonl\n{"type": "function_call_start", "name": "get_tool_schema", "call_id": 1}\n{"type": "function_call_end", "call_id": 1}\n\`\`\`\n</system>`;

  // Test 1: Run button click + instructions chip + collapsed newlines + >15s Thinking delay + Thoughts turn + Answer turn
  await runTest('Run click + instructions chip + 20s thinking + Thoughts/Answer turns', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/new_chat');
    const page = mountAistudioDom();
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    assert(findAistudioSendButton(page.ta) === page.runBtn, 'findAistudioSendButton should find real Run button');
    assert(!isAistudioSendButtonEnabled(page.runBtn), 'Run button should start disabled (aria-disabled=true)');

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    page.ta.value = '请用 list_projects 列出可用项目';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    assert(isAistudioSendButtonEnabled(page.runBtn), 'Run button should become enabled after typing');

    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(450);

    assert(page.sentMessages.length === 1, `Expected 1 merged send, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].includes('请用 list_projects 列出可用项目'), 'Sent message should include user draft');
    assert(page.sentMessages[0].includes('[SuperAssistant tools'), 'Sent message should include MCP instructions');
    assert(!page.sentMessages[0].includes('\n\n\n\n'), 'Should not produce quadruple newlines');

    const userTurn = page.appendUserTurn(
      'turn-745F08F6',
      page.sentMessages[0].replace(/\n\n/g, '\n'),
      true,
    );
    const chunk = userTurn.querySelector<HTMLElement>('ms-text-chunk')!;
    const renderedOk = renderFunctionResult(chunk, { current: false });
    assert(renderedOk, 'System message should fold into MCP SuperAssistant context card');
    chunk.appendChild(document.createComment('angular-after'));
    await sleep(20);

    window.__setMockPath('/prompts/1iRAwKVQJRLBPZ1Jx7RGYt72Fpb9LjubM');
    await sleep(20);

    timeOffset += 20000;
    page.appendModelTurn('turn-THOUGHTS-1', 'Checking Project Availability...', true);
    const { block } = page.appendModelTurn('turn-MODEL-1', 'get_tool_schema');

    const prov = getAistudioProvenance(block);
    assert(prov !== null, `Expected valid provenance after 20s thinking, state=${JSON.stringify(__getAistudioGateStateForTests())}`);
    assert(prov!.userTurnId === 'id:turn-745F08F6', `Unexpected userTurnId: ${prov!.userTurnId}`);
    assert(prov!.turnId === 'id:turn-MODEL-1', `Unexpected turnId: ${prov!.turnId}`);
  });

  // Test 2: Ctrl+Enter + plain Enter stays newline in ctrl-enter-submits mode + URL changes BEFORE user turn mounts + Markdown <hr>
  await runTest('Ctrl+Enter + plain Enter newline + URL before user turn + Markdown hr', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/new_chat');
    const page = mountAistudioDom();
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    page.ta.value = '请用 list_projects 列出可用项目';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));

    page.ta.dispatchEvent(makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await sleep(50);
    assert(page.sentMessages.length === 0, 'Plain Enter must not submit in ctrl-enter-submits mode');

    page.ta.dispatchEvent(makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })));
    await sleep(450);
    assert(page.sentMessages.length === 1, `Expected 1 Ctrl+Enter send, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].includes('[SuperAssistant tools'), 'Ctrl+Enter must include instructions');

    window.__setMockPath('/prompts/1abcDEF999');
    window.dispatchEvent(new Event('popstate'));
    await sleep(20);

    const formattedWithoutHr = page.sentMessages[0].replace(/\n---\n/g, '\n');
    page.appendUserTurn('turn-USER-CTRL', formattedWithoutHr, true);
    await sleep(20);

    timeOffset += 25000;
    const { block } = page.appendModelTurn('turn-MODEL-CTRL', 'get_tool_schema');
    const prov = getAistudioProvenance(block);
    assert(prov !== null, `Expected valid provenance after Ctrl+Enter + early URL change, state=${JSON.stringify(__getAistudioGateStateForTests())}`);
    assert(prov!.conversation.endsWith('/prompts/1abcDEF999'), `Expected migrated conversation, got ${prov!.conversation}`);
  });

  // Test 3: Two consecutive tool rounds + Stop->Run deferred submit + Tool result rendered BEFORE & AFTER turn validation
  await runTest('Two consecutive tool rounds + Stop->Run deferred auto-submit + both Tool result render orders', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/1roundTest');
    const page = mountAistudioDom();
    setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    page.ta.value = '请用 list_projects 列出可用项目';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    assert(page.sentMessages.length === 1, 'Initial prompt sent');
    page.appendUserTurn('turn-U1', '请用 list_projects 列出可用项目');
    await sleep(20);

    const { block: m1Block } = page.appendModelTurn('turn-M1', 'list_projects');
    const prov1 = getAistudioProvenance(m1Block);
    assert(prov1 !== null, 'Round 1 model turn provenance valid');
    const inv1 = claimAistudioAutomaticInvocation(prov1, '1');
    assert(!!inv1 && registerAistudioInvocation(prov1, '1', inv1), 'Round 1 invocation registered');

    page.setBusy(true);
    const result1 = '<function_result call_id="1">\n{"projects":[{"id":"proj-42"}]}\n</function_result>';
    document.dispatchEvent(new CustomEvent('mcp:tool-execution-complete', {
      detail: {
        result: result1,
        callId: '1',
        functionName: 'list_projects',
        skipAutoInsertCheck: false,
        provenance: prov1,
        invocationId: inv1,
      },
    }));

    await sleep(2300);
    assert(page.sentMessages.length === 1, 'Must NOT click Stop button while busy');
    assert(page.ta.value.includes('proj-42'), 'Tool result 1 should be flushed into textarea waiting for Run');

    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.setBusy(false);
    await sleep(400);
    assert(page.sentMessages.length === 2, `Expected deferred auto-submit to send result 1 once, got ${page.sentMessages.length}`);
    assert(page.sentMessages[1].includes('proj-42'), 'Sent message 2 should contain result 1');

    // ORDER A: Tool result card rendered BEFORE Round 2 provenance check
    const u2Turn = page.appendUserTurn('turn-U2', page.sentMessages[1]);
    const u2Chunk = u2Turn.querySelector<HTMLElement>('ms-text-chunk')!;
    assert(renderFunctionResult(u2Chunk, { current: false }), 'Tool result 1 folded into Tool result card');
    await sleep(20);

    const { block: m2Block } = page.appendModelTurn('turn-M2', 'work_on_project');
    const prov2 = getAistudioProvenance(m2Block);
    assert(prov2 !== null && prov2.userTurnId === 'id:turn-U2', `Round 2 (Order A) provenance failed: ${JSON.stringify(__getAistudioGateStateForTests())}`);
    const inv2 = claimAistudioAutomaticInvocation(prov2, '2');
    assert(!!inv2 && registerAistudioInvocation(prov2, '2', inv2), 'Round 2 invocation registered');

    const result2 = '<function_result call_id="2">\n{"status":"opened proj-42"}\n</function_result>';
    document.dispatchEvent(new CustomEvent('mcp:tool-execution-complete', {
      detail: {
        result: result2,
        callId: '2',
        functionName: 'work_on_project',
        skipAutoInsertCheck: false,
        provenance: prov2,
        invocationId: inv2,
      },
    }));
    await sleep(2400);
    assert(page.sentMessages.length === 3, `Expected Round 2 result auto-sent once, got ${page.sentMessages.length}`);
    assert(page.sentMessages[2].includes('opened proj-42'), 'Sent message 3 should contain result 2');

    // ORDER B: Provenance check runs BEFORE Tool result card is rendered
    const u3Turn = page.appendUserTurn('turn-U3', page.sentMessages[2]);
    const { block: m3Block } = page.appendModelTurn('turn-M3', 'list_projects');
    const prov3 = getAistudioProvenance(m3Block);
    assert(prov3 !== null && prov3.userTurnId === 'id:turn-U3', 'Round 3 (Order B, before card fold) provenance should pass');
    const u3Chunk = u3Turn.querySelector<HTMLElement>('ms-text-chunk')!;
    assert(renderFunctionResult(u3Chunk, { current: false }), 'Tool result 2 folded after provenance check');
    assert(getAistudioProvenance(m3Block)?.turnId === 'id:turn-M3', 'Provenance stays valid after card fold');
  });

  // Test 4: Historical conversation replay & unrelated archived turn rejection
  await runTest('Historical conversation replay and unrelated user turn stay blocked', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/1historical');
    const page = mountAistudioDom();
    setupStoresAndAdapter();
    page.appendUserTurn('turn-OLD-U1', 'old prompt');
    const { block: oldModelBlock } = page.appendModelTurn('turn-OLD-M1', 'list_projects');
    initializeAistudioTurnGate();
    await automationService.initialize();

    assert(getAistudioProvenance(oldModelBlock) === null, 'Historical card must have null provenance');

    page.ta.value = 'real new prompt';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    page.appendUserTurn('turn-ARCHIVED-U', 'completely unrelated archived message');
    const { block: archivedModelBlock } = page.appendModelTurn('turn-ARCHIVED-M', 'list_projects');
    await sleep(20);
    assert(getAistudioProvenance(archivedModelBlock) === null, 'Unrelated user turn must fail closed');
  });

  // Test 5: Cancel deferred submit on user edit
  await runTest('Cancel pending deferred submit on user edit and navigation', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/1cancelTest');
    const page = mountAistudioDom();
    setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    page.ta.value = 'start task';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    page.appendUserTurn('turn-CU1', 'start task');
    await sleep(20);
    const { block } = page.appendModelTurn('turn-CM1', 'list_projects');
    const prov = getAistudioProvenance(block)!;
    const inv = claimAistudioAutomaticInvocation(prov, '1')!;
    registerAistudioInvocation(prov, '1', inv);

    page.setBusy(true);
    document.dispatchEvent(new CustomEvent('mcp:tool-execution-complete', {
      detail: {
        result: '<function_result call_id="1">\n{"ok":true}\n</function_result>',
        callId: '1',
        functionName: 'list_projects',
        skipAutoInsertCheck: false,
        provenance: prov,
        invocationId: inv,
      },
    }));
    await sleep(2300);
    assert(page.sentMessages.length === 1, 'Deferred submit should be waiting while busy');

    page.ta.value += ' user edit';
    page.ta.dispatchEvent(makeTrustedEvent(new Event('input', { bubbles: true })));
    page.setBusy(false);
    await sleep(400);
    assert(page.sentMessages.length === 1, 'Edited draft must NOT be auto-submitted');
  });

  // Test 5b: Cancel pending deferred submit on conversation navigation and disabling autoSubmit
  await runTest('Cancel pending deferred submit on navigation and autoSubmit toggle off', async () => {
    for (const mode of ['nav', 'toggle'] as const) {
      inputChips.teardown();
      automationService.cleanup();
      __resetAistudioTurnGateForTests();
      timeOffset = 0;
      window.__setMockPath(`/prompts/1cancel_${mode}`);
      const page = mountAistudioDom();
      setupStoresAndAdapter();
      initializeAistudioTurnGate();
      await automationService.initialize();

      page.ta.value = `start ${mode}`;
      page.ta.dispatchEvent(new Event('input', { bubbles: true }));
      page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      page.appendUserTurn(`turn-U-${mode}`, `start ${mode}`);
      await sleep(20);
      const { block } = page.appendModelTurn(`turn-M-${mode}`, 'list_projects');
      const prov = getAistudioProvenance(block)!;
      const inv = claimAistudioAutomaticInvocation(prov, '1')!;
      registerAistudioInvocation(prov, '1', inv);

      page.setBusy(true);
      document.dispatchEvent(new CustomEvent('mcp:tool-execution-complete', {
        detail: {
          result: `<function_result call_id="1">\n{"mode":"${mode}"}\n</function_result>`,
          callId: '1',
          functionName: 'list_projects',
          skipAutoInsertCheck: false,
          provenance: prov,
          invocationId: inv,
        },
      }));
      await sleep(2300);
      assert(page.sentMessages.length === 1, `Deferred submit waiting (${mode})`);

      if (mode === 'nav') {
        window.__setMockPath('/prompts/1otherChat');
        window.dispatchEvent(new Event('popstate'));
      } else {
        useUIStore.setState(state => ({
          ...state,
          preferences: { ...state.preferences, autoSubmit: false },
        }));
      }
      page.setBusy(false);
      await sleep(400);
      assert(page.sentMessages.length === 1, `Must NOT send after ${mode}`);
    }
  });

  // Test 6: Gemini / non-AI-Studio Enter rule preserved
  await runTest('isChipSubmitEnter keeps plain-Enter rule for Gemini/other hosts', async () => {
    const plainEnter = { isTrusted: true, key: 'Enter', ctrlKey: false, shiftKey: false, metaKey: false, altKey: false, isComposing: false, keyCode: 13 };
    const ctrlEnter = { ...plainEnter, ctrlKey: true };
    const shiftEnter = { ...plainEnter, shiftKey: true };
    assert(isChipSubmitEnter(plainEnter) === true, 'Plain Enter accepted by default');
    assert(isChipSubmitEnter(ctrlEnter) === false, 'Ctrl+Enter rejected for Gemini/default hosts');
    assert(isChipSubmitEnter(ctrlEnter, { allowCtrl: true }) === true, 'Ctrl+Enter accepted when allowCtrl=true');
    assert(isChipSubmitEnter(shiftEnter, { allowCtrl: true }) === false, 'Shift+Enter always rejected');
    assert(isAistudioDeliveryAuthorized(null) === false, 'Null provenance rejected on AI Studio');
  });

  // Test 7: Plain Enter still submits when ctrl-enter-submits class is absent
  await runTest('AI Studio plain Enter still submits when ctrl-enter-submits class is absent', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/new_chat');
    const page = mountAistudioDom();
    page.runBtn.classList.remove('ctrl-enter-submits');
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    page.ta.value = 'enter submit mode test';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.ta.dispatchEvent(makeTrustedEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await sleep(450);
    assert(page.sentMessages.length === 1, `Expected 1 plain-Enter send when ctrl-enter-submits absent, got ${page.sentMessages.length}`);
    assert(page.sentMessages[0].includes('[SuperAssistant tools'), 'Plain-Enter send should include instructions');
  });

  // Test 8: Stale localStorage history on /prompts/new_chat must NOT block first-turn get_tool_schema auto-execution
  await runTest('Stale /prompts/new_chat localStorage history does not block get_tool_schema auto-execute', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/new_chat');
    const page = mountAistudioDom();
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    const params = { names: ['webcodex.list_projects'] };
    const sig = generateContentSignature('get_tool_schema', params);
    const key = `get_tool_schema:1:${sig}`;
    localStorage.setItem(
      'mcp_url_based_function_history',
      JSON.stringify({
        'https://aistudio.google.com/prompts/new_chat': {
          [key]: { functionName: 'get_tool_schema', callId: '1', contentSignature: sig, executedAt: Date.now(), params },
        },
      }),
    );

    assert(getPreviousExecution('get_tool_schema', '1', sig) === null, 'getPreviousExecution must ignore shared /prompts/new_chat bucket');
    storeExecutedFunction('get_tool_schema', '1', params, sig);

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    page.ta.value = '请用 list_projects 列出可用项目';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(450);
    assert(page.sentMessages.length === 1, 'Initial prompt sent');
    page.appendUserTurn('turn-U-NEWCHAT', page.sentMessages[0]);
    await sleep(20);

    let toolCalls = 0;
    (window as any).mcpClient = {
      isReady: () => true,
      callTool: async (name: string) => {
        toolCalls++;
        return `{"schema":"${name}"}`;
      },
    };

    const host = document.createElement('ms-chat-turn');
    host.id = 'turn-M-NEWCHAT';
    const turn = document.createElement('div');
    turn.setAttribute('data-turn-role', 'Model');
    const pre = document.createElement('pre');
    pre.textContent = [
      '{"type":"function_call_start","name":"get_tool_schema","call_id":1}',
      '{"type":"parameter","key":"names","value":["webcodex.list_projects"]}',
      '{"type":"function_call_end","call_id":1}',
    ].join('\n');
    turn.appendChild(pre);
    host.appendChild(turn);
    page.sessionContent.appendChild(host);

    const rendered = renderFunctionCall(pre, { current: false });
    assert(rendered, 'renderFunctionCall should render get_tool_schema card');
    await sleep(900);
    assert(toolCalls === 1, `Expected get_tool_schema to auto-execute once despite stale new_chat history, got ${toolCalls}`);
  });

  // Test 9: URL migrates /prompts/new_chat -> /prompts/<id> BETWEEN autoInsert and autoSubmit
  await runTest('First-send URL migration between autoInsert and autoSubmit still submits tool result once', async () => {
    timeOffset = 0;
    window.__setMockPath('/prompts/new_chat');
    const page = mountAistudioDom();
    const adapter = setupStoresAndAdapter();
    initializeAistudioTurnGate();
    await automationService.initialize();

    await adapter.insertText(sampleInstructions, { source: 'instructions' });
    page.ta.value = '请用 list_projects 列出可用项目';
    page.ta.dispatchEvent(new Event('input', { bubbles: true }));
    page.runBtn.dispatchEvent(makeTrustedEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await sleep(450);
    assert(page.sentMessages.length === 1, 'Prompt sent on new_chat');

    page.appendUserTurn('turn-U-MIG', page.sentMessages[0]);
    await sleep(20);
    const { block } = page.appendModelTurn('turn-M-MIG', 'get_tool_schema');
    const prov = getAistudioProvenance(block);
    assert(prov !== null, 'Model turn admitted on new_chat');
    const inv = claimAistudioAutomaticInvocation(prov, '1');
    assert(!!inv && registerAistudioInvocation(prov, '1', inv), 'Invocation registered');

    document.dispatchEvent(new CustomEvent('mcp:tool-execution-complete', {
      detail: {
        result: '<function_result call_id="1">\n{"schema":"list_projects_schema"}\n</function_result>',
        callId: '1',
        functionName: 'get_tool_schema',
        skipAutoInsertCheck: false,
        provenance: prov,
        invocationId: inv,
      },
    }));

    await sleep(300);
    window.__setMockPath('/prompts/1bhPgvQR5cvY_EES6JLegiIjDvX3K-v8m');
    window.dispatchEvent(new Event('popstate'));

    await sleep(2400);
    assert(page.sentMessages.length === 2, `Expected tool result to auto-submit after first-send URL migration, got ${page.sentMessages.length}`);
    assert(page.sentMessages[1].includes('list_projects_schema'), 'Submitted message should contain tool result');
  });

  Date.now = realDateNow;
  window.__testResults = results;
  window.__testsDone = true;
}

void main();

/**
 * Automation Service for MCP SuperAssistant
 * 
 * This service handles the automation features (auto insert, auto submit, auto execute)
 * that were previously part of the legacy adapter system. It integrates with the new
 * Zustand architecture and plugin-based adapter system.
 * 
 * Features:
 * - Auto Insert: Automatically insert function execution results into the current page
 * - Auto Submit: Automatically submit forms after auto-insertion
 * - Auto Execute: Log when tool execution is completed (extensible for future features)
 * 
 * The service listens for 'mcp:tool-execution-complete' events and performs actions
 * based on the current automation state from the user preferences store.
 */

import { useUserPreferences } from '../hooks/useStores';
import { useCurrentAdapter } from '../hooks/useAdapter';
import { eventBus } from '../events/event-bus';
import {
  abruptlyEndedStreams,
  completedStreams,
  streamingLastUpdated,
  streamingObservers,
} from '../render_prescript/src/observer/streamObserver';
import { preExistingIncompleteBlocks } from '../render_prescript/src/observer/stalledStreamHandler';
import {
  cancelAistudioSubmission,
  isAistudioHost,
  isAistudioProvenanceCurrent,
  type AistudioProvenance,
} from '../render_prescript/src/provenance/aistudioTurnGate';
import { createLogger } from '@extension/shared/lib/logger';

// Store references for accessing state outside React components

const logger = createLogger('AutomationService');

let storeRefs: {
  getUserPreferences: (() => Promise<any>) | null;
  getCurrentAdapterState: (() => Promise<any>) | null;
  getEnabledTools: (() => Promise<Set<string>>) | null;
} = {
  getUserPreferences: null,
  getCurrentAdapterState: null,
  getEnabledTools: null,
};

// Initialize store access functions
async function initializeStoreAccess() {
  try {
    // Store the store access functions for later use
    storeRefs.getUserPreferences = async () => {
      // Import dynamically to avoid circular dependencies
      const { useUIStore } = await import('../stores/ui.store');
      return useUIStore.getState().preferences;
    };

    storeRefs.getCurrentAdapterState = async () => {
      // Import dynamically to avoid circular dependencies
      const { useAdapterStore } = await import('../stores/adapter.store');
      const adapterState = useAdapterStore.getState();
      const activeAdapterRegistration = adapterState.getActiveAdapter();
      
      const plugin = activeAdapterRegistration?.plugin;
      
      return {
        plugin,
        // Bind methods to maintain proper 'this' context
        insertText: plugin?.insertText ? plugin.insertText.bind(plugin) : null,
        attachFile: plugin?.attachFile ? plugin.attachFile.bind(plugin) : null,
        submitForm: plugin?.submitForm ? plugin.submitForm.bind(plugin) : null,
        isReady: !!plugin && 
                activeAdapterRegistration.status === 'active' && 
                !adapterState.lastAdapterError
      };
    };

    storeRefs.getEnabledTools = async () => {
      const { useToolStore } = await import('../stores/tool.store');
      return new Set(useToolStore.getState().enabledTools);
    };

    logger.debug('[AutomationService] Store access functions initialized');
  } catch (error) {
    logger.error('[AutomationService] Error initializing store access:', error);
  }
}

// Type definitions for automation events
export interface ToolExecutionCompleteDetail {
  result?: string;
  isFileAttachment?: boolean;
  file?: File;
  fileName?: string;
  confirmationText?: string;
  skipAutoInsertCheck?: boolean;
  callId?: string;
  functionName?: string;
  /** AI Studio: proof that the card belongs to the current submission cycle. */
  provenance?: AistudioProvenance | null;
  manual?: boolean;
}

export interface AutomationState {
  autoInsert: boolean;
  autoSubmit: boolean;
  autoExecute: boolean;
  autoInsertDelay: number;
  autoSubmitDelay: number;
  autoExecuteDelay: number;
  autoDiscovery: boolean; // Auto-run discovery meta-tools (get_tool_schema/tool_lookup) even when autoExecute is off
}

/**
 * Automation Service Class
 * Handles all automation logic for MCP tool execution results
 */
export class AutomationService {
  private static instance: AutomationService | null = null;
  private isInitialized = false;
  private eventListener: ((event: Event) => void) | null = null;
  // Coalesced auto-submit: one message can produce N tool results (multi-call).
  // We submit ONCE after the whole batch settles instead of once per result.
  private pendingSubmitTimer: number | null = null;
  private submitDeferStart = 0;
  // Exact card IDs that produced a result in this batch. Sibling segments retain their own state.
  private submitBatchCardIds = new Set<string>();
  // Store subscriptions keep renderer-visible enablement/automation state synchronous with the UI.
  private storeUnsubscribers: Array<() => void> = [];
  // A cancelled effect must stay cancelled even if a setting/tool is toggled back on in the same
  // tick (e.g. Disable All then quick re-enable while an adapter is still polling).
  private cancelledContexts = new WeakSet<ToolExecutionCompleteDetail>();
  private activeEffects = new Map<ToolExecutionCompleteDetail, 'insert' | 'submit'>();
  private trackedContexts = new Set<ToolExecutionCompleteDetail>();

  // Private constructor for singleton pattern
  private constructor() {}

  /**
   * Get the singleton instance of AutomationService
   */
  public static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }

  /**
   * Initialize the automation service
   * Sets up event listeners and integrates with the store system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('[AutomationService] Already initialized, skipping');
      return;
    }

    logger.debug('[AutomationService] Initializing automation service');

    // Initialize store access functions
    await initializeStoreAccess();

    // Set up event listener for tool execution completion
    this.setupToolExecutionListener();

    // Listen for MCP state changes to update automation availability
    this.setupMCPStateListener();

    // Expose initial automation state to window for render_prescript access
    await this.setupStoreSubscriptions();
    await this.exposeAutomationStateToWindow();

    this.isInitialized = true;
    logger.debug('[AutomationService] Automation service initialized successfully');
  }

  /**
   * Clean up the automation service
   * Removes event listeners and cleans up resources
   */
  public cleanup(): void {
    if (!this.isInitialized) {
      return;
    }

    logger.debug('[AutomationService] Cleaning up automation service');

    // Remove DOM event listener
    if (this.eventListener) {
      document.removeEventListener('mcp:tool-execution-complete', this.eventListener);
      this.eventListener = null;
    }

    // Drop any delayed submit so a torn-down page cannot submit into a later conversation.
    if (this.pendingSubmitTimer !== null) {
      window.clearTimeout(this.pendingSubmitTimer);
      this.pendingSubmitTimer = null;
    }
    this.submitDeferStart = 0;
    this.submitBatchCardIds.clear();
    this.storeUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.storeUnsubscribers = [];
    this.activeEffects.clear();
    this.trackedContexts.clear();

    this.isInitialized = false;
    logger.debug('[AutomationService] Automation service cleaned up');
  }

  /**
   * Set up the main event listener for tool execution completion
   */
  private setupToolExecutionListener(): void {
    // Remove existing listener if any
    if (this.eventListener) {
      document.removeEventListener('mcp:tool-execution-complete', this.eventListener);
    }

    // Create new event listener
    this.eventListener = (event: Event) => {
      this.handleToolExecutionComplete(event as CustomEvent<ToolExecutionCompleteDetail>);
    };

    // Add event listener to document
    document.addEventListener('mcp:tool-execution-complete', this.eventListener);
    logger.debug('[AutomationService] Tool execution event listener registered');
  }

  /**
   * Keep the renderer's synchronous view of preferences/enablement in sync. Tool enablement must
   * be visible immediately (not after an async microtask) so Disable All can stop a queued click.
   */
  private async setupStoreSubscriptions(): Promise<void> {
    if (this.storeUnsubscribers.length > 0) return;
    try {
      const { useUIStore } = await import('../stores/ui.store');
      const { useToolStore } = await import('../stores/tool.store');

      const publishToolEnablement = (enabled: Set<string>) => {
        (window as any).__mcpToolEnablement = Array.from(enabled);
      };
      publishToolEnablement(useToolStore.getState().enabledTools);
      let previousEnabled = new Set(useToolStore.getState().enabledTools);
      let previousPreferences: any = useUIStore.getState().preferences;

      this.storeUnsubscribers.push(
        useUIStore.subscribe(state => {
          const preferences: any = state.preferences;
          if (previousPreferences?.autoInsert && !preferences?.autoInsert) this.cancelActiveEffects('insert');
          if (previousPreferences?.autoSubmit && !preferences?.autoSubmit) this.cancelActiveEffects('submit');
          previousPreferences = preferences;
          void this.exposeAutomationStateToWindow();
        }),
      );
      this.storeUnsubscribers.push(
        useToolStore.subscribe(state => {
          const disabledSomething = Array.from(previousEnabled).some(name => !state.enabledTools.has(name));
          if (disabledSomething && state.enabledTools.size === 0 && isAistudioHost()) cancelAistudioSubmission();
          if (disabledSomething) this.cancelActiveEffects();
          previousEnabled = new Set(state.enabledTools);
          publishToolEnablement(state.enabledTools);
          void this.exposeAutomationStateToWindow();
        }),
      );
    } catch (error) {
      logger.error('[AutomationService] Error setting up store subscriptions:', error);
    }
  }

  /**
   * Set up listener for MCP state changes
   */
  private setupMCPStateListener(): void {
    // Listen for MCP connection state changes via the event bus
    eventBus.on('connection:status-changed', ({ status }) => {
      logger.debug('[AutomationService] MCP connection status changed:', status);
      // Could add logic here to disable automation when MCP is disconnected
    });
  }

  /**
   * Main handler for tool execution completion events
   */
  private async handleToolExecutionComplete(event: CustomEvent<ToolExecutionCompleteDetail>): Promise<void> {
    if (!event.detail) {
      logger.warn('[AutomationService] Tool execution complete event received without detail');
      return;
    }

    const detail = event.detail;
    // Track the result from its arrival so a Disable All (or flag off) can cancel even an effect
    // that has not started its delay yet; a later re-enable cannot resurrect this context.
    this.trackedContexts.add(detail);
    logger.debug('[AutomationService] Tool execution complete event received:', detail);

    try {
      // Get current automation state from user preferences
      const automationState = await this.getAutomationState();
      
      if (!automationState) {
        logger.debug('[AutomationService] Could not get automation state, skipping automation');
        return;
      }

      // Update automation state on window for render_prescript access
      await this.exposeAutomationStateToWindow();

      if (!(await this.isEffectContextValid(detail, 'execute'))) {
        logger.debug('[AutomationService] Result is outside the current submission context; skipping automation');
        return;
      }

      logger.debug('[AutomationService] Current automation state:', automationState);

      // Handle Auto Execute (always run if enabled, independent of other actions)
      if (automationState.autoExecute) {
        this.handleAutoExecute(detail);
      }

      // Handle Auto Insert and Auto Submit logic
      // Skip auto-insert if skipAutoInsertCheck is true (for manual actions)
      const shouldAutoInsert = automationState.autoInsert && !detail.skipAutoInsertCheck;
      
      if (shouldAutoInsert) {
        const insertSuccess = await this.handleAutoInsert(detail);
        
        // Only proceed with auto submit if auto insert was successful
        // and auto submit is enabled. Coalesce so a multi-call batch submits once.
        if (insertSuccess && automationState.autoSubmit && (await this.isEffectContextValid(detail, 'submit'))) {
          this.scheduleCoalescedSubmit(detail, automationState.autoSubmitDelay);
        }
      } else {
        logger.debug('[AutomationService] Auto Insert disabled, skipping insert and submit actions');
      }

    } catch (error) {
      logger.error('[AutomationService] Error handling tool execution complete:', error);
    }
  }

  /**
   * Get current automation state from user preferences store
   */
  private async getAutomationState(): Promise<AutomationState | null> {
    try {
      // Access the user preferences using the store reference
      if (!storeRefs.getUserPreferences) {
        logger.error('[AutomationService] Store access not initialized');
        return null;
      }

      const preferences = await storeRefs.getUserPreferences();
      
      // Extract automation settings from preferences
      return {
        autoInsert: preferences.autoInsert || false,
        autoSubmit: preferences.autoSubmit || false,
        autoExecute: preferences.autoExecute || false,
        autoInsertDelay: preferences.autoInsertDelay || 0,
        autoSubmitDelay: preferences.autoSubmitDelay || 0,
        autoExecuteDelay: preferences.autoExecuteDelay || 0,
        autoDiscovery: preferences.autoDiscovery !== false, // Default true when unset
      };
    } catch (error) {
      logger.error('[AutomationService] Error getting automation state:', error);
      return null;
    }
  }

  private markContextCancelled(detail: ToolExecutionCompleteDetail): void {
    this.cancelledContexts.add(detail);
    this.activeEffects.delete(detail);
    this.trackedContexts.delete(detail);
  }

  private cancelActiveEffects(effect?: 'insert' | 'submit'): void {
    const affected = new Set<ToolExecutionCompleteDetail>(this.trackedContexts);
    for (const [detail, activeEffect] of Array.from(this.activeEffects.entries())) {
      if (!effect || activeEffect === effect) affected.add(detail);
    }
    for (const detail of affected) this.markContextCancelled(detail);
  }

  /**
   * AI Studio: every automatic effect (queued click, delayed insert, coalesced submit, adapter
   * send/fallback) must still belong to the current submission cycle, be enabled, and still have
   * its own automation flag on. A latched cancellation cannot be undone by a quick re-enable.
   * Other hosts retain their existing behavior.
   */
  private async isEffectContextValid(
    detail: ToolExecutionCompleteDetail,
    effect: 'insert' | 'submit' | 'execute',
  ): Promise<boolean> {
    if (this.cancelledContexts.has(detail)) return false;

    const preferences = await this.getAutomationState();
    if (!preferences) {
      this.markContextCancelled(detail);
      return false;
    }
    const flagOn =
      effect === 'insert'
        ? preferences.autoInsert
        : effect === 'submit'
          ? preferences.autoSubmit
          : true;
    if (!flagOn) {
      this.markContextCancelled(detail);
      return false;
    }

    if (!isAistudioHost()) return true;
    if (!isAistudioProvenanceCurrent(detail.provenance)) {
      this.markContextCancelled(detail);
      return false;
    }
    if (!detail.functionName) {
      this.markContextCancelled(detail);
      return false;
    }

    const enabledTools = await storeRefs.getEnabledTools?.();
    if (!enabledTools) {
      this.markContextCancelled(detail);
      return false;
    }
    const isMeta = detail.functionName === 'get_tool_schema' || detail.functionName === 'tool_lookup';
    if (isMeta) {
      const discoveryOn = preferences.autoDiscovery !== false && enabledTools.size > 0;
      if (!discoveryOn) {
        this.markContextCancelled(detail);
        return false;
      }
      return true;
    }
    if (!enabledTools.has(detail.functionName)) {
      this.markContextCancelled(detail);
      return false;
    }
    return true;
  }

  /** Synchronous variant for adapter polling loops, using the synchronously published state. */
  private isEffectContextValidSync(
    detail: ToolExecutionCompleteDetail,
    effect: 'insert' | 'submit',
  ): boolean {
    if (this.cancelledContexts.has(detail)) return false;

    const state = (window as any).__mcpAutomationState;
    const flagOn = effect === 'submit' ? state?.autoSubmit === true : state?.autoInsert === true;
    if (!flagOn) {
      this.markContextCancelled(detail);
      return false;
    }

    if (!isAistudioHost()) return true;
    if (!isAistudioProvenanceCurrent(detail.provenance)) {
      this.markContextCancelled(detail);
      return false;
    }
    if (!detail.functionName) {
      this.markContextCancelled(detail);
      return false;
    }

    const enabledTools = (window as any).__mcpToolEnablement as string[] | undefined;
    if (!Array.isArray(enabledTools)) {
      this.markContextCancelled(detail);
      return false;
    }
    const isMeta = detail.functionName === 'get_tool_schema' || detail.functionName === 'tool_lookup';
    if (isMeta) {
      const discoveryOn = state?.autoDiscovery === true && enabledTools.length > 0;
      if (!discoveryOn) {
        this.markContextCancelled(detail);
        return false;
      }
      return true;
    }
    if (!enabledTools.includes(detail.functionName)) {
      this.markContextCancelled(detail);
      return false;
    }
    return true;
  }

  /**
   * Handle Auto Execute functionality
   * Currently just logs the execution, but extensible for future features
   */
  private async handleAutoExecute(detail: ToolExecutionCompleteDetail): Promise<void> {
    const preferences = await storeRefs.getUserPreferences?.();
    const delay = preferences?.autoExecuteDelay || 0;

    if (delay > 0) {
      logger.debug(`Auto Execute: Waiting ${delay} seconds before execution`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    logger.debug('[AutomationService] Auto Execute: Tool execution completed', {
      functionName: detail.functionName,
      callId: detail.callId,
      hasResult: !!detail.result,
      isFileAttachment: detail.isFileAttachment,
      fileName: detail.fileName,
      appliedDelay: delay
    });

    // Emit event for potential future integrations
    // eventBus.emit('automation:execute-completed', {
    //   detail,
    //   timestamp: Date.now()
    // });
  }

  /**
   * Handle Auto Insert functionality
   * Inserts text or attaches files based on the execution result
   */
  private async handleAutoInsert(detail: ToolExecutionCompleteDetail): Promise<boolean> {
    this.activeEffects.set(detail, 'insert');
    try {
    const preferences = await storeRefs.getUserPreferences?.();
    const delay = preferences?.autoInsertDelay || 0;

    if (delay > 0) {
      logger.debug(`Auto Insert: Waiting ${delay} seconds before insertion`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    // Revalidate after the delay: the turn may have gone, the tool disabled, or the chat changed.
    const currentPreferences = await this.getAutomationState();
    if (!currentPreferences?.autoInsert) {
      logger.debug('[AutomationService] Auto insert cancelled: setting was turned off');
      return false;
    }
    if (!(await this.isEffectContextValid(detail, 'insert'))) {
      logger.debug('[AutomationService] Auto insert cancelled: context is no longer current');
      return false;
    }

    logger.debug('[AutomationService] Handling auto insert', { appliedDelay: delay });

    // Additional safety check: Don't auto-insert if skipAutoInsertCheck is true
    if (detail.skipAutoInsertCheck) {
      logger.debug('[AutomationService] Skipping auto insert due to skipAutoInsertCheck flag');
      return false;
    }

    try {
      // Get current adapter from the adapter hook
      if (!storeRefs.getCurrentAdapterState) {
        logger.error('[AutomationService] Adapter store access not initialized');
        return false;
      }

      const { plugin: activePlugin, insertText, attachFile, isReady } = await storeRefs.getCurrentAdapterState();

      if (!isReady || !activePlugin) {
        logger.warn('[AutomationService] No active adapter available for auto insert');
        return false;
      }

      logger.debug('[AutomationService] Using adapter for auto insert:', activePlugin.name);

      // Handle file attachment
      if (detail.isFileAttachment && detail.file && attachFile) {
        logger.debug('[AutomationService] Auto inserting file:', detail.file.name);
        
        try {
          const success = await attachFile(detail.file);
          
          if (success) {
            logger.debug('[AutomationService] File attached successfully via auto insert');
            
            // Optionally insert confirmation text if provided
            if (detail.confirmationText && insertText) {
              logger.debug('[AutomationService] Inserting file confirmation text');
              // Small delay to ensure file attachment is processed
              setTimeout(async () => {
                try {
                  const currentPreferences = await this.getAutomationState();
                  if (!currentPreferences?.autoInsert) return;
                  if (!(await this.isEffectContextValid(detail, 'insert'))) return;
                  await insertText(detail.confirmationText!, { source: 'tool-result' });
                } catch (error) {
                  logger.error('[AutomationService] Error inserting confirmation text:', error);
                }
              }, 100);
            }
            
            return true;
          } else {
            logger.warn('[AutomationService] File attachment failed');
            return false;
          }
        } catch (attachError) {
          logger.error('[AutomationService] Error calling attachFile method:', attachError);
          logger.error('[AutomationService] attachFile context info:', {
            hasAttachFile: !!attachFile,
            attachFileType: typeof attachFile,
            activePluginName: activePlugin?.name,
            fileName: detail.file?.name
          });
          return false;
        }
      }
      
      // Handle text insertion
      else if (detail.result && insertText) {
        logger.debug('[AutomationService] Auto inserting text result');
        
        try {
          const success = await insertText(detail.result, { source: 'tool-result' });
          
          if (success) {
            logger.debug('[AutomationService] Text inserted successfully via auto insert');
            return true;
          } else {
            logger.warn('[AutomationService] Text insertion failed');
            return false;
          }
        } catch (insertError) {
          logger.error('[AutomationService] Error calling insertText method:', insertError);
          logger.error('[AutomationService] insertText context info:', {
            hasInsertText: !!insertText,
            insertTextType: typeof insertText,
            activePluginName: activePlugin?.name
          });
          return false;
        }
      }
      
      // No valid insertion method found
      else {
        logger.warn('[AutomationService] No valid insertion method found for auto insert', {
          hasResult: !!detail.result,
          isFileAttachment: detail.isFileAttachment,
          hasFile: !!detail.file,
          hasInsertText: !!insertText,
          hasAttachFile: !!attachFile
        });
        return false;
      }

    } catch (error) {
      logger.error('[AutomationService] Error during auto insert:', error);
      return false;
    }
    } finally {
      this.activeEffects.delete(detail);
    }
  }

  /**
   * Coalesce auto-submit across a batch of tool results. Each result resets a
   * quiet-period timer; the submit fires only once nothing is still running,
   * queued, or streaming — so a message with several function calls produces a
   * single reply containing every <function_result> block.
   *
   * A page can carry old `.function-loading` cards whose completion transition was
   * missed. Those cards must not hold a later batch hostage, but a card that is
   * genuinely streaming now must still defer. Distinguish them with the renderer's
   * own batch/activity metadata rather than age-based guesswork:
   *  - the current result panel identifies its exact card (data-call-id -> data-block-id);
   *    sibling segments sharing a source need their own current-stream evidence;
   *  - a loading block is current while its renderer monitor still owns an attached, incomplete
   *    source (a paused token gap is fine), or it was created/updated during this batch;
   *  - pre-existing, abruptly-ended and completed blocks are historical/abandoned.
   */
  private scheduleCoalescedSubmit(detail: ToolExecutionCompleteDetail, autoSubmitDelay: number): void {
    if (this.pendingSubmitTimer !== null) {
      window.clearTimeout(this.pendingSubmitTimer);
      this.pendingSubmitTimer = null;
    } else {
      // First result of a new batch — start the hard-cap clock.
      this.submitDeferStart = Date.now();
      this.submitBatchCardIds.clear();
    }

    // Anchor the batch to the exact card that produced this result. The callId is supplied by
    // the renderer event; source-level identity is used separately for stream monitoring.
    const resultCardId = this.findCardIdForCall(detail.callId);
    if (resultCardId) this.submitBatchCardIds.add(resultCardId);

    const baseDelay = 1000 + (autoSubmitDelay || 0) * 1000;

    const check = async () => {
      const currentPreferences = await this.getAutomationState();
      if (!currentPreferences?.autoSubmit) {
        logger.debug('[AutomationService] Auto submit cancelled: setting was turned off');
        this.pendingSubmitTimer = null;
        this.submitBatchCardIds.clear();
        return;
      }
      if (!(await this.isEffectContextValid(detail, 'submit'))) {
        logger.debug('[AutomationService] Auto submit cancelled: context is no longer current');
        this.pendingSubmitTimer = null;
        this.submitBatchCardIds.clear();
        return;
      }

      const running = !!document.querySelector('.function-block.exec-running');
      const pending = ((window as any).__mcpExecPending || 0) > 0;
      // Only loading blocks with positive current-lifecycle evidence count. Historical/abandoned
      // loaders (pre-existing, abruptly ended, completed, or no live incomplete source) are ignored.
      const streaming = this.hasCurrentLoadingBlocks();

      // Expected-vs-done: a card is "done" once its result body is rendered.
      // Only count a panel toward "expected" if its block actually ENTERED execution
      // (exec-running/success/error or a *current* loading block). A deduped, never-run
      // card renders a panel that stays empty forever and carries none of those
      // classes; stale loading cards are filtered the same way. Historical cards with
      // bodies still count on both sides and cancel out, so no-skip is preserved.
      const panels = document.querySelectorAll('.function-results-panel[data-call-id]');
      let expected = 0;
      let done = 0;
      panels.forEach(p => {
        const hasBody = !!p.querySelector('.function-result-success, .function-result-error');
        const block = p.closest('.function-block');
        const currentLoading = !!block
          && block.classList.contains('function-loading')
          && this.isLoadingBlockCurrent(block);
        const active = !!block && (
          block.classList.contains('exec-running') ||
          block.classList.contains('exec-success') ||
          block.classList.contains('exec-error')
        );
        if (hasBody) done++;
        if (active || currentLoading || hasBody) expected++; // || hasBody keeps done <= expected invariant
      });
      const resultsPending = done < expected;

      // ponytail: hard cap so a stuck spinner / un-run manual card can't hold the reply hostage
      const deferredTooLong = Date.now() - this.submitDeferStart > 60000;

      if ((running || pending || streaming || resultsPending) && !deferredTooLong) {
        this.pendingSubmitTimer = window.setTimeout(check, 500);
        return;
      }

      this.pendingSubmitTimer = null;
      this.submitBatchCardIds.clear();
      void this.handleAutoSubmit(detail);
    };

    this.pendingSubmitTimer = window.setTimeout(check, baseDelay);
  }

  /** Base renderer block id for a card/segment id (`block-s1` -> `block`). */
  private getBlockBaseId(block: Element | null): string | null {
    const rawId = block?.getAttribute('data-block-id');
    return rawId ? rawId.replace(/-s\d+$/, '') : null;
  }

  /** Renderer block ids are `block-<createdAtMs>-<random>`; other ids have no creation time. */
  private getBlockCreatedAt(baseId: string): number | null {
    const match = /^block-(\d{10,})-/.exec(baseId);
    if (!match) return null;
    const createdAt = Number(match[1]);
    return Number.isFinite(createdAt) ? createdAt : null;
  }

  /** Exact renderer card that owns the result panel for this call. */
  private findCardIdForCall(callId?: string): string | null {
    if (!callId) return null;
    const panels = document.querySelectorAll<HTMLElement>('.function-results-panel[data-call-id]');
    for (const panel of Array.from(panels)) {
      if (panel.getAttribute('data-call-id') === callId) {
        return panel.closest('.function-block')?.getAttribute('data-block-id') ?? null;
      }
    }
    return null;
  }

  /**
   * True when a loading block is current work for this batch.
   * Current is established positively: batch membership, creation during this batch, a live
   * renderer monitor on an attached incomplete source, or activity after the batch began.
   * A paused stream (its timestamp can predate the first result) remains current as long as the
   * renderer still owns a live, incomplete source for it. Historical/abandoned cards are excluded
   * by their own markers (pre-existing, abruptly ended, completed) rather than by idle time.
   */
  private isLoadingBlockCurrent(block: Element): boolean {
    const baseId = this.getBlockBaseId(block);
    if (!baseId) return true;
    if (this.submitBatchCardIds.has(block.getAttribute('data-block-id') ?? '')) return true;

    // A block created during this batch is current work even before the observer records activity.
    const createdAt = this.getBlockCreatedAt(baseId);
    if (createdAt !== null && createdAt >= this.submitDeferStart) return true;

    if (this.hasLiveMonitoredIncompleteSource(baseId)) return true;

    if (preExistingIncompleteBlocks.has(baseId)) return false;
    if (abruptlyEndedStreams.has(baseId)) return false;
    if (completedStreams.has(baseId)) return false;

    // Activity after this batch began is positive current evidence. Absence of recent activity is
    // not proof of abandonment (the paused-stream case above), so it is never used negatively.
    const lastUpdated = streamingLastUpdated.get(baseId);
    return lastUpdated !== undefined && lastUpdated >= this.submitDeferStart;
  }

  /**
   * Positive current-stream evidence from the renderer lifecycle: the monitor exists for this
   * block, its source is still attached, the source still has unclosed call markup, and the
   * renderer has not marked the block completed or abruptly ended.
   */
  private hasLiveMonitoredIncompleteSource(baseId: string): boolean {
    if (!streamingObservers.has(baseId)) return false;
    if (completedStreams.has(baseId)) return false;
    if (abruptlyEndedStreams.has(baseId)) return false;
    if (!streamingLastUpdated.has(baseId)) return false;
    const source = this.findMonitoredSource(baseId);
    if (!source || !source.isConnected) return false;
    return this.isStreamMarkupIncomplete(source);
  }

  /** Source node the renderer's monitorNode attached to this block (attribute it owns). */
  private findMonitoredSource(baseId: string): HTMLElement | null {
    const monitored = document.querySelectorAll<HTMLElement>('[data-monitored-node]');
    for (const node of Array.from(monitored)) {
      if (node.getAttribute('data-monitored-node') === baseId) return node;
    }
    return null;
  }

  /** True while the source still carries unclosed function-call markup (XML or JSON stream). */
  private isStreamMarkupIncomplete(source: HTMLElement): boolean {
    const text = source.textContent ?? '';
    if (!text) return false;
    const openFunctionCalls = text.includes('<function_calls>') && !text.includes('</function_calls>');
    const openInvoke = text.includes('<invoke') && !text.includes('</invoke>');
    const parameterOpens = (text.match(/<parameter[^>]*>/g) || []).length;
    const parameterCloses = (text.match(/<\/parameter>/g) || []).length;
    const jsonStarts = (text.match(/function_call_start/g) || []).length;
    const jsonEnds = (text.match(/function_call_end/g) || []).length;
    return openFunctionCalls || openInvoke || parameterOpens > parameterCloses || jsonStarts > jsonEnds;
  }

  private hasCurrentLoadingBlocks(): boolean {
    const loadingBlocks = document.querySelectorAll<HTMLElement>('.function-block.function-loading');
    return Array.from(loadingBlocks).some(block => this.isLoadingBlockCurrent(block));
  }

  /**
   * Handle Auto Submit functionality
   * Submits the current form after auto insertion
   */
  private async handleAutoSubmit(detail: ToolExecutionCompleteDetail): Promise<boolean> {
    this.activeEffects.set(detail, 'submit');
    try {
    const preferences = await storeRefs.getUserPreferences?.();
    const delay = preferences?.autoSubmitDelay || 0;

    if (delay > 0) {
      logger.debug(`Auto Submit: Waiting ${delay} seconds before submission`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    if (!(await this.isEffectContextValid(detail, 'submit'))) {
      logger.debug('[AutomationService] Auto submit cancelled: context is no longer current');
      return false;
    }
    const currentPreferences = await this.getAutomationState();
    if (!currentPreferences?.autoSubmit) {
      logger.debug('[AutomationService] Auto submit cancelled: setting was turned off');
      return false;
    }

    logger.debug('[AutomationService] Handling auto submit', { appliedDelay: delay });

    try {
      // Get current adapter from the adapter hook
      if (!storeRefs.getCurrentAdapterState) {
        logger.error('[AutomationService] Adapter store access not initialized');
        return false;
      }

      const { plugin: activePlugin, submitForm, isReady } = await storeRefs.getCurrentAdapterState();

      if (!isReady || !activePlugin || !submitForm) {
        logger.warn('[AutomationService] No active adapter or submit capability available for auto submit');
        return false;
      }

      logger.debug('[AutomationService] Using adapter for auto submit:', activePlugin.name);

      // Add a small delay to ensure any prior insertion/attachment has settled in the UI
      await new Promise(resolve => setTimeout(resolve, 800));

      if (!(await this.isEffectContextValid(detail, 'submit'))) {
        logger.debug('[AutomationService] Auto submit cancelled after settle delay');
        return false;
      }
      const prefsBeforeClick = await this.getAutomationState();
      if (!prefsBeforeClick?.autoSubmit) {
        logger.debug('[AutomationService] Auto submit cancelled after settle delay: setting off');
        return false;
      }

      try {
        const success = await submitForm({
          canProceed: () => this.isEffectContextValidSync(detail, 'submit'),
        });
        
        if (success) {
          logger.debug('[AutomationService] Form submitted successfully via auto submit');
          return true;
        } else {
          logger.warn('[AutomationService] Form submission failed');
          return false;
        }
      } catch (submitError) {
        logger.error('[AutomationService] Error calling submitForm method:', submitError);
        logger.error('[AutomationService] submitForm context info:', {
          hasSubmitForm: !!submitForm,
          submitFormType: typeof submitForm,
          activePluginName: activePlugin?.name
        });
        return false;
      }

    } catch (error) {
      logger.error('[AutomationService] Error during auto submit:', error);
      return false;
    }
    } finally {
      this.activeEffects.delete(detail);
    }
  }

  /**
   * Check if automation service is initialized
   */
  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current automation state (public method for external access)
   */
  public async getCurrentAutomationState(): Promise<AutomationState | null> {
    return await this.getAutomationState();
  }

  /**
   * Force trigger automation for testing/debugging purposes
   */
  public async triggerTestAutomation(detail: ToolExecutionCompleteDetail): Promise<void> {
    logger.debug('[AutomationService] Triggering test automation');
    await this.handleToolExecutionComplete(new CustomEvent('mcp:tool-execution-complete', { detail }));
  }

  /**
   * Expose current automation state to window object for access by render_prescript
   */
  private async exposeAutomationStateToWindow(): Promise<void> {
    try {
      const automationState = await this.getAutomationState();
      if (automationState) {
        const enabledTools = await storeRefs.getEnabledTools?.();
        const windowState = {
          ...automationState,
          enabledTools: enabledTools ? Array.from(enabledTools) : [],
        };
        (window as any).__mcpAutomationState = windowState;
        if (enabledTools) (window as any).__mcpToolEnablement = Array.from(enabledTools);
        logger.debug('[AutomationService] Exposed automation state to window:', windowState);
      }
    } catch (error) {
      logger.error('[AutomationService] Error exposing automation state to window:', error);
    }
  }

  /**
   * Update automation state on window object when preferences change
   */
  public async updateAutomationStateOnWindow(): Promise<void> {
    await this.exposeAutomationStateToWindow();
  }
}

// Export singleton instance
export const automationService = AutomationService.getInstance();

// Export initialization function for easy setup
export async function initializeAutomationService(): Promise<void> {
  await automationService.initialize();
}

// Export cleanup function
export function cleanupAutomationService(): void {
  automationService.cleanup();
}

// Default export for convenience
export default automationService;

// Development utilities
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Expose automation service for debugging
  (window as any).__automationService = {
    service: automationService,
    getState: async () => await automationService.getCurrentAutomationState(),
    testAutoInsert: async (text: string) => {
      return automationService.triggerTestAutomation({
        result: text,
        isFileAttachment: false,
        skipAutoInsertCheck: false
      });
    },
    testAutoSubmit: async () => {
      return automationService.triggerTestAutomation({
        result: 'Test result for auto submit',
        isFileAttachment: false,
        skipAutoInsertCheck: true // Force insert so submit can run
      });
    },
    testFileAttachment: async (fileName: string = 'test.txt', content: string = 'Test file content') => {
      const file = new File([content], fileName, { type: 'text/plain' });
      return automationService.triggerTestAutomation({
        isFileAttachment: true,
        file,
        fileName,
        confirmationText: `File ${fileName} attached successfully`,
        skipAutoInsertCheck: false
      });
    }
  };
  
  logger.debug('[AutomationService] Debug utilities exposed on window.__automationService');
}

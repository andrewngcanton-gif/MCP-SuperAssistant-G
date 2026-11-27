import type { ConnectionType } from '../../../types/stores';
import SetupHelp from './SetupHelp';
import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useI18n, type MessageKey, type TranslationParams } from '@extension/shared';
import { useMcpCommunication } from '@src/hooks/useMcpCommunication';
import { useConnectionStatus, useServerConfig, useAvailableTools } from '../../../hooks';
import { logMessage } from '@src/utils/helpers';
import { eventBus } from '@src/events/event-bus';
import { Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('ServerStatus');

type StatusMsg = { key: MessageKey; params?: TranslationParams } | { raw: string } | null;

interface ServerStatusProps {
  status: string;
}

const ServerStatus: React.FC<ServerStatusProps> = ({ status: initialStatus }) => {
  const { t } = useI18n();
  // Use Zustand hooks for connection status and server config
  const {
    status: connectionStatus,
    isConnected,
    isReconnecting: storeIsReconnecting,
    error: connectionError
  } = useConnectionStatus();

  const { config: serverConfig, setConfig: setServerConfig } = useServerConfig();
  const { tools: availableTools } = useAvailableTools();

  // Local UI state
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastReconnectTime, setLastReconnectTime] = useState<string>('');
  const [serverUri, setServerUri] = useState<string>(serverConfig.uri || '');
  const [connectionType, setConnectionType] = useState<ConnectionType>(serverConfig.connectionType || 'sse');
  const [statusMsg, setStatusMsg] = useState<StatusMsg>(null);
  const statusMessage = statusMsg ? ('raw' in statusMsg ? statusMsg.raw : t(statusMsg.key, statusMsg.params)) : '';
  const [hasBackgroundError, setHasBackgroundError] = useState<boolean>(false);
  const [isEditingUri, setIsEditingUri] = useState<boolean>(false);
  const [isEditingConnectionType, setIsEditingConnectionType] = useState<boolean>(false);
  const [lastErrorMessage, setLastErrorMessage] = useState<string>('');
  const [configFetched, setConfigFetched] = useState<boolean>(false);

  // Animation states
  const [settingsAnimating, setSettingsAnimating] = useState(false);
  const [detailsAnimating, setDetailsAnimating] = useState(false);

  // Get communication methods with error handling (still needed for some operations)
  const communicationMethods = useMcpCommunication();

  // Use connection status from store, fallback to prop
  const status = connectionStatus || initialStatus || 'unknown';

  // Debug logging to track status changes
  useEffect(() => {
    logger.debug(`Status update - connectionStatus: ${connectionStatus}, initialStatus: ${initialStatus}, final: ${status}, isConnected: ${isConnected}`);
  }, [connectionStatus, initialStatus, status, isConnected]);

  // Destructure with fallbacks in case useBackgroundCommunication fails
  const forceReconnect = useCallback(async () => {
    try {
      if (!communicationMethods.forceReconnect) {
        throw new Error('Communication method unavailable');
      }
      return await communicationMethods.forceReconnect();
    } catch (error) {
      logMessage(`[ServerStatus] Force reconnect error: ${error instanceof Error ? error.message : String(error)}`);
      setHasBackgroundError(true);
      return false;
    }
  }, [communicationMethods]);

  // Get the last connection error from the background communication hook
  const backgroundConnectionError = communicationMethods.lastConnectionError || '';

  const refreshTools = useCallback(
    async (forceRefresh = false) => {
      try {
        if (!communicationMethods.refreshTools) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.refreshTools(forceRefresh);
      } catch (error) {
        logMessage(`[ServerStatus] Refresh tools error: ${error instanceof Error ? error.message : String(error)}`);
        setHasBackgroundError(true);
        return [];
      }
    },
    [communicationMethods],
  );

  const getServerConfig = useCallback(
    async () => {
      try {
        if (!communicationMethods.getServerConfig) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.getServerConfig();
      } catch (error) {
        logMessage(`[ServerStatus] Get server config error: ${error instanceof Error ? error.message : String(error)}`);
        setHasBackgroundError(true);
        throw error; // Don't fallback to default, let caller handle the error
      }
    },
    [communicationMethods],
  );

  const updateServerConfig = useCallback(
    async (config: { uri: string; connectionType: ConnectionType }) => {
      try {
        if (!communicationMethods.updateServerConfig) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.updateServerConfig(config);
      } catch (error) {
        logMessage(
          `[ServerStatus] Update server config error: ${error instanceof Error ? error.message : String(error)}`,
        );
        setHasBackgroundError(true);
        return false;
      }
    },
    [communicationMethods],
  );

  // Update server URI and connection type when config changes
  useEffect(() => {
    if (serverConfig.uri && !isEditingUri) {
      setServerUri(serverConfig.uri);
      logMessage(`[ServerStatus] Updated server URI from config: ${serverConfig.uri}`);
    }
    // Only update connection type from store if user is not actively editing it
    if (serverConfig.connectionType && !isEditingConnectionType) {
      setConnectionType(serverConfig.connectionType);
      logMessage(`[ServerStatus] Updated connection type from config: ${serverConfig.connectionType}`);
    }
  }, [serverConfig.uri, serverConfig.connectionType, isEditingUri, isEditingConnectionType]);

  // Force immediate connection status check on mount
  useEffect(() => {
    const checkImmediateStatus = async () => {
      if (communicationMethods.forceConnectionStatusCheck) {
        try {
          logMessage('[ServerStatus] Forcing immediate connection status check on mount');
          await communicationMethods.forceConnectionStatusCheck();
        } catch (error) {
          logMessage(`[ServerStatus] Immediate status check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    // Small delay to ensure everything is initialized
    const timeoutId = setTimeout(checkImmediateStatus, 100);
    return () => clearTimeout(timeoutId);
  }, []); // Run only once on mount

  // Update status message based on connection state from store
  useEffect(() => {
    // During reconnection, don't override the status message
    if (isReconnecting || storeIsReconnecting) {
      return;
    }

    if (hasBackgroundError) {
      setStatusMsg({ key: 'server.msgBackgroundUnavailable' });
    } else {
      switch (status) {
        case 'connected':
          setStatusMsg({ key: 'server.msgConnectedReady' });
          break;
        case 'disconnected':
          setStatusMsg({ key: 'server.msgUnavailable' });
          break;
        case 'error':
          setStatusMsg(connectionError ? { raw: connectionError } : { key: 'server.msgServiceError' });
          break;
        default:
          setStatusMsg({ key: 'server.msgCheckingStatus' });
      }
    }
  }, [status, connectionError, hasBackgroundError, isReconnecting, storeIsReconnecting, isConnected]);

  // Enhanced event bus integration for real-time status updates
  useEffect(() => {
    const unsubscribeCallbacks: (() => void)[] = [];

    // Listen for connection status changes from the event bus
    const unsubscribeConnection = eventBus.on('connection:status-changed', (data) => {
      logMessage(`[ServerStatus] Connection status event: ${data.status}${data.error ? ` (${data.error})` : ''}`);

      // Update local error state if there's an error
      if (data.error) {
        setLastErrorMessage(data.error);
      } else {
        setLastErrorMessage('');
      }

      // Update last reconnect time for successful connections
      if (data.status === 'connected') {
        setLastReconnectTime(new Date().toLocaleTimeString());
      }
    });
    unsubscribeCallbacks.push(unsubscribeConnection);

    // Listen for context bridge events
    const unsubscribeBridgeInvalidated = eventBus.on('context:bridge-invalidated', (data) => {
      logMessage(`[ServerStatus] Context bridge invalidated: ${data.error}`);
      setHasBackgroundError(true);
      setStatusMsg({ key: 'server.msgContextInvalidated', params: { error: data.error } });
    });
    unsubscribeCallbacks.push(unsubscribeBridgeInvalidated);

    const unsubscribeBridgeRestored = eventBus.on('context:bridge-restored', () => {
      logMessage('[ServerStatus] Context bridge restored');
      setHasBackgroundError(false);
      // Don't automatically reconnect here - let user decide
    });
    unsubscribeCallbacks.push(unsubscribeBridgeRestored);

    // Listen for heartbeat events to monitor connection health
    const unsubscribeHeartbeat = eventBus.on('connection:heartbeat', (data) => {
      // Update connection health indicator if needed
      logMessage(`[ServerStatus] Heartbeat received: ${data.timestamp}`);
    });
    unsubscribeCallbacks.push(unsubscribeHeartbeat);

    // Cleanup all event listeners
    return () => {
      unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Check for background communication issues
  useEffect(() => {
    const checkBackgroundAvailability = () => {
      const methodsAvailable = !!(
        typeof communicationMethods.forceReconnect === 'function' &&
        typeof communicationMethods.refreshTools === 'function' &&
        typeof communicationMethods.getServerConfig === 'function' &&
        typeof communicationMethods.updateServerConfig === 'function'
      );

      if (!methodsAvailable && !hasBackgroundError) {
        setHasBackgroundError(true);
        setStatusMsg({ key: 'server.msgBackgroundUnavailable' });
      } else if (methodsAvailable && hasBackgroundError) {
        // Background methods have become available again
        setHasBackgroundError(false);
      }
    };

    checkBackgroundAvailability();

    // Check less frequently to reduce excessive calls - reduced from 10s to 30s
    const intervalId = setInterval(checkBackgroundAvailability, 30000);
    return () => clearInterval(intervalId);
  }, [communicationMethods, hasBackgroundError]);

  useEffect(() => {
    // Only fetch server configuration on initial mount - don't refetch while user is editing
    const fetchInitialServerConfig = async () => {
      try {
        logMessage('[ServerStatus] Fetching initial server configuration from background storage');
        const config = await getServerConfig();
        if (config) {
          if (config.uri) {
            setServerUri(config.uri);
            logMessage(`[ServerStatus] Initial server URI loaded: ${config.uri}`);
          }
          if (config.connectionType) {
            setConnectionType(config.connectionType);
            logMessage(`[ServerStatus] Initial connection type loaded: ${config.connectionType}`);
          }
          setConfigFetched(true);
        } else {
          logMessage('[ServerStatus] No valid server configuration received from background storage');
          setServerUri(''); // Set empty string to indicate no config loaded
          setConfigFetched(true);
        }
      } catch (error) {
        logMessage(
          `[ServerStatus] Error fetching server config: ${error instanceof Error ? error.message : String(error)}`,
        );
        setServerUri(''); // Set empty string to indicate fetch failed
        setConfigFetched(true);
      }
    };

    // Fetch initial server configuration on mount only once
    if (
      communicationMethods &&
      typeof communicationMethods.getServerConfig === 'function' &&
      !configFetched &&
      !isEditingUri &&
      !isEditingConnectionType
    ) {
      fetchInitialServerConfig().catch(() => {
        logMessage('[ServerStatus] Failed to fetch server configuration');
        setServerUri(''); // Set empty string as last resort
      });
    }
  }, [communicationMethods, isEditingUri, isEditingConnectionType, configFetched, getServerConfig]); // Add configFetched dependency

  const handleReconnect = async () => {
    const startTime = Date.now();
    const minDisplayDuration = 1200; // Minimum display time for smooth UX

    try {
      logMessage('[ServerStatus] Reconnect button clicked');
      setIsReconnecting(true);
      setStatusMsg({ key: 'server.msgReconnecting' });

      // Check if we can connect to the background script first
      if (hasBackgroundError) {
        logMessage('[ServerStatus] Attempting to recover background connection');
        // Wait a bit to see if background services become available
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check again if background services are available
        if (!communicationMethods.forceReconnect) {
          throw new Error('Background services still unavailable');
        }

        // If we got here, background services have been restored
        setHasBackgroundError(false);
      }

      logMessage('[ServerStatus] Calling forceReconnect method');
      const success = await forceReconnect();
      logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

      // Update last reconnect time
      const now = new Date();
      setLastReconnectTime(now.toLocaleTimeString());

      // Ensure minimum display duration before updating final state
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        logMessage(`[ServerStatus] Waiting ${remainingTime}ms for smooth transition`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      // Set appropriate status message based on reconnection result
      if (success) {
        setStatusMsg({ key: 'server.msgReconnected' });
        logMessage('[ServerStatus] Reconnection successful, fetching fresh tool list');
        try {
          const tools = await refreshTools(true);
          logMessage(`[ServerStatus] Successfully fetched ${tools.length} tools after reconnection`);
        } catch (refreshError) {
          logMessage(
            `[ServerStatus] Error fetching tools after reconnection: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
        }
      } else {
        setStatusMsg({ key: 'server.msgReconnectFailed' });
      }
    } catch (error) {
      // Ensure minimum display time even for errors
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      logMessage(`[ServerStatus] Reconnection error: ${error instanceof Error ? error.message : String(error)}`);

      // Use the enhanced error message from the error object and store it
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastErrorMessage(errorMessage); // Store the detailed error message

      // Display the enhanced error message in the status
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        setStatusMsg({ key: 'server.msgError404' });
      } else if (errorMessage.includes('403')) {
        setStatusMsg({ key: 'server.msgError403' });
      } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        setStatusMsg({ key: 'server.msgError5xx' });
      } else if (errorMessage.includes('Connection refused') || errorMessage.includes('ECONNREFUSED')) {
        setStatusMsg({ key: 'server.msgConnRefused' });
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        setStatusMsg({ key: 'server.msgTimeout' });
      } else if (errorMessage.includes('ENOTFOUND')) {
        setStatusMsg({ key: 'server.msgHostNotFound' });
      } else {
        setStatusMsg({ key: 'server.msgConnFailed', params: { error: errorMessage } });
      }
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDetails = () => {
    setDetailsAnimating(true);
    setTimeout(() => {
      setShowDetails(!showDetails);
      setDetailsAnimating(false);
    }, 150);
    logMessage(`[ServerStatus] Details ${showDetails ? 'hidden' : 'shown'}, status: ${status}`);
  };

  const handleSettings = () => {
    setSettingsAnimating(true);
    setTimeout(() => {
      setShowSettings(!showSettings);
      setSettingsAnimating(false);
    }, 150);
    logMessage(`[ServerStatus] Settings ${showSettings ? 'hidden' : 'shown'}`);
  };

  const handleServerUriChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerUri(e.target.value);
    setIsEditingUri(true); // Mark as editing when user types
  };

  const handleServerUriFocus = () => {
    setIsEditingUri(true); // Mark as editing when user focuses the input
  };

  const handleServerUriBlur = () => {
    // Don't immediately clear editing flag - wait for save or cancel
  };

  const handleConnectionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConnectionType(e.target.value as ConnectionType);
    setIsEditingConnectionType(true); // Mark as editing when user changes
  };

  const handleConnectionTypeFocus = () => {
    setIsEditingConnectionType(true); // Mark as editing when user focuses the select
  };

  const handleConnectionTypeBlur = () => {
    // Don't immediately clear editing flag - wait for save or cancel
  };

  const handleSaveServerConfig = async () => {
    if (!communicationMethods.updateServerConfig || hasBackgroundError) {
      logMessage('[ServerStatus] Background communication not available');
      return;
    }

    // Set stable loading state and prevent rapid UI changes
    setIsReconnecting(true);
    setLastReconnectTime(new Date().toLocaleTimeString());

    // Use a single stable message throughout the process to prevent flickers
    setStatusMsg({ key: 'server.msgSavingConfig' });

    // Clear any existing error
    setLastErrorMessage('');

    // Track the start time to ensure minimum display duration
    const startTime = Date.now();
    const minDisplayDuration = 1500; // Minimum 1.5 seconds to prevent jitter

    try {
      logMessage(`[ServerStatus] Saving server URI: ${serverUri} with connection type: ${connectionType}`);

      // Update server config using Zustand store
      setServerConfig({ uri: serverUri, connectionType });

      // Also update via background communication for backward compatibility
      await updateServerConfig({ uri: serverUri, connectionType });
      logMessage('[ServerStatus] Server config updated successfully');

      // Clear the editing flags since we successfully saved
      setIsEditingUri(false);
      setIsEditingConnectionType(false);

      // Trigger reconnect
      const success = await forceReconnect();
      logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

      // Calculate remaining time to ensure minimum display duration
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        logMessage(`[ServerStatus] Waiting ${remainingTime}ms to prevent visual jitter`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      // Single final UI update to prevent flickers
      if (success) {
        setStatusMsg({ key: 'server.msgConnectedNew' });

        // Refresh tools silently without UI updates
        try {
          const tools = await refreshTools(true);
          logMessage(`[ServerStatus] Successfully refreshed ${tools.length} tools after server change`);
        } catch (refreshError) {
          logMessage(
            `[ServerStatus] Error refreshing tools: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
        }
      } else {
        setStatusMsg({ key: 'server.msgConnectNewFailed' });
      }

      // Close settings on success
      setShowSettings(false);
    } catch (error) {
      // Still ensure minimum display time even for errors
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastErrorMessage(errorMessage);
      setStatusMsg({ key: 'server.msgConfigFailed', params: { error: errorMessage } });
      logMessage(`[ServerStatus] Save config error: ${errorMessage}`);
      // Keep settings open on error
    } finally {
      // Always reset reconnecting state
      setIsReconnecting(false);
    }
  };

  // Determine status color and icon
  const getStatusInfo = () => {
    // Define base colors, assuming dark mode variants are handled by Tailwind prefixes
    const baseColors = {
      emerald: { text: 'text-emerald-500', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-900/20' },
      amber: { text: 'text-amber-500', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-900/20' },
      rose: { text: 'text-rose-500', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-900/20' },
      slate: { text: 'text-slate-500', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-900/20' },
    };

    // Determine status display
    const displayStatus = isReconnecting ? 'reconnecting' : status;

    switch (displayStatus) {
      case 'connected':
        return {
          color: baseColors.emerald.text,
          bgColor: cn(baseColors.emerald.bg, baseColors.emerald.darkBg),
          icon: <Icon name="check" className={baseColors.emerald.text} />,
          label: t('server.connected'),
        };
      case 'reconnecting':
        return {
          color: baseColors.amber.text,
          bgColor: cn(baseColors.amber.bg, baseColors.amber.darkBg),
          icon: <Icon name="refresh" className={cn(baseColors.amber.text, 'animate-spin')} />,
          label: t('server.reconnecting'),
        };
      case 'disconnected':
        return {
          color: baseColors.rose.text,
          bgColor: cn(baseColors.rose.bg, baseColors.rose.darkBg),
          icon: <Icon name="x" className={baseColors.rose.text} />,
          label: t('server.disconnected'),
        };
      case 'error':
        return {
          color: baseColors.rose.text,
          bgColor: cn(baseColors.rose.bg, baseColors.rose.darkBg),
          icon: <Icon name="info" className={baseColors.rose.text} />,
          label: t('server.error'),
        };
      default: // Unknown status
        return {
          color: baseColors.slate.text,
          bgColor: cn(baseColors.slate.bg, baseColors.slate.darkBg),
          icon: <Icon name="info" className={baseColors.slate.text} />,
          label: t('server.unknown'),
        };
    }
  };

  // Get status info based on current state (label reused by the details panel)
  const statusInfo = getStatusInfo();

  // Determine if we should show enhanced visual cues for disconnected/error states
  const isDisconnectedOrError = status === 'disconnected' || status === 'error';

  // Compact status presentation: a single dot + label + tool count
  const displayStatus = isReconnecting ? 'reconnecting' : status;
  const statusDotColor =
    displayStatus === 'connected'
      ? 'bg-emerald-500'
      : displayStatus === 'reconnecting'
        ? 'bg-amber-500'
        : displayStatus === 'disconnected' || displayStatus === 'error'
          ? 'bg-rose-500'
          : 'bg-slate-400';
  const statusLabel =
    displayStatus === 'connected'
      ? t('server.connected')
      : displayStatus === 'reconnecting'
        ? t('server.reconnectingEllipsis')
        : displayStatus === 'disconnected'
          ? t('server.disconnected')
          : displayStatus === 'error'
            ? t('server.error')
            : t('server.unknown');

  const iconButtonClass =
    'h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors duration-150 disabled:opacity-50';

  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', statusDotColor, isReconnecting && 'animate-pulse')} />
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{statusLabel}</span>
          {status === 'connected' && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {t('server.toolsCount', { count: availableTools.length })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={iconButtonClass}
            aria-label={t('server.reconnectTooltip')}
            title={t('server.reconnectTooltip')}>
            <Icon name="refresh" size="sm" className={cn(isReconnecting ? 'animate-spin' : '')} />
          </button>

          <button
            onClick={handleSettings}
            disabled={settingsAnimating}
            className={iconButtonClass}
            aria-label={t('server.settingsTooltip')}
            title={t('server.settingsTooltip')}>
            <Icon name="settings" size="sm" />
          </button>

          <button
            onClick={handleDetails}
            disabled={detailsAnimating}
            className={iconButtonClass}
            aria-label={t('server.detailsTooltip')}
            title={t('server.detailsTooltip')}>
            <Icon name="info" size="sm" />
          </button>
        </div>
      </div>

      {/* Single alert for disconnected/error states with detailed error message */}
      {isDisconnectedOrError && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50">
          <p className="text-xs text-rose-700 dark:text-rose-300">{statusMessage}</p>
          {(backgroundConnectionError || lastErrorMessage) && (
            <p className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80 break-words">
              {backgroundConnectionError || lastErrorMessage}
            </p>
          )}
        </div>
      )}

      {status === 'disconnected' && !hasBackgroundError && (
        <SetupHelp connectionType={connectionType} serverUri={serverUri} />
      )}

      {/* Background communication issue indicator */}
      {(hasBackgroundError || !communicationMethods.sendMessage) && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
          <div className="flex items-center gap-2">
            <div className="animate-spin w-3 h-3 border border-amber-500 border-t-transparent rounded-full"></div>
            <span className="text-xs text-amber-700 dark:text-amber-300">{t('server.msgCheckingStatus')}</span>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="mx-3 mb-3 animate-in slide-in-from-top-2 duration-200">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{t('server.configTitle')}</div>

              <div className="mb-4">
                <label htmlFor="connection-type" className="block mb-2 text-slate-600 dark:text-slate-400 font-medium">
                  {t('server.connectionType')}
                </label>
                <select
                  id="connection-type"
                  value={connectionType}
                  onChange={handleConnectionTypeChange}
                  onFocus={handleConnectionTypeFocus}
                  onBlur={handleConnectionTypeBlur}
                  className="w-full h-8 px-2 text-sm border border-slate-300 rounded-md bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="sse">{t('server.sseOption')}</option>
                  <option value="websocket">{t('server.websocketOption')}</option>
                  <option value="streamable-http">{t('server.streamableHttpOption')}</option>
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {connectionType === 'sse'
                    ? t('server.sseHint')
                    : connectionType === 'websocket'
                      ? t('server.websocketHint')
                      : t('server.streamableHttpHint')}
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="server-uri" className="block mb-2 text-slate-600 dark:text-slate-400 font-medium">
                  {t('server.serverUri')}
                </label>
                <input
                  id="server-uri"
                  type="text"
                  value={serverUri}
                  onChange={handleServerUriChange}
                  onFocus={handleServerUriFocus}
                  onBlur={handleServerUriBlur}
                  placeholder={connectionType === 'sse'
                    ? "http://localhost:3006/sse"
                    : connectionType === 'websocket'
                      ? "ws://localhost:3006/message"
                      : "http://localhost:3006/mcp"}
                  className="w-full h-8 px-2 text-sm border border-slate-300 rounded-md bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <summary className="text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer">{t('server.setupHelpSummary')}</summary>
                  <div className="mt-2 mb-2">
                    <strong>{t('server.proxyStartIntro')}</strong>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-md font-mono text-[11px] border border-slate-200 dark:border-slate-700 break-all">
                    npx @srbhptl39/mcp-superassistant-proxy@latest --config ./config.json --outputTransport {connectionType === 'sse' ? 'sse' : connectionType === 'websocket' ? 'ws' : 'streamableHttp'}
                  </div>
                  <div className="mt-2 text-xs">
                    <div className="mb-1">
                      {t('server.availableTransports')} <code>streamableHttp</code>, <code>sse</code>, <code>ws</code>
                    </div>
                    <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700">
                      <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">{t('server.publicEndpointsTitle')}</div>
                      <div className="text-slate-600 dark:text-slate-300 space-y-1">
                        <div>• {t('server.zapierEndpoint')}</div>
                        <div>• {t('server.composioEndpoint')}</div>
                        <div>• {t('server.customServersEndpoint')}</div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <strong>{t('server.websocketNotePrefix')}</strong> {t('server.websocketNote')}
                      </div>
                    </div>
                  </div>
                </details>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setShowSettings(false);
                    setIsEditingUri(false);
                    setIsEditingConnectionType(false);
                    // Reset to stored config when canceling
                    if (serverConfig.uri) {
                      setServerUri(serverConfig.uri);
                    }
                    if (serverConfig.connectionType) {
                      setConnectionType(serverConfig.connectionType);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-medium border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSaveServerConfig}
                  variant="default"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md save-button-stable"
                  disabled={hasBackgroundError || isReconnecting}>
                  {isReconnecting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('server.connecting')}
                    </div>
                  ) : (
                    t('server.saveAndReconnect')
                  )}
                </Button>
              </div>

              {hasBackgroundError && (
                <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                  <div className="flex items-center gap-2">
                    <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400" />
                    <p className="font-medium">{t('server.backgroundUnavailableBanner')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Details panel */}
      {showDetails && (
        <div className="mx-3 mb-3 animate-in slide-in-from-top-2 duration-200">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{t('server.detailsTitle')}</div>

              <div className="space-y-1">
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('server.statusLabel')}</span>
                  <span
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded font-medium',
                      status === 'connected'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    )}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="flex justify-between items-start py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('server.serverUriLabel')}</span>
                  <span className="text-right text-slate-600 dark:text-slate-300 max-w-[200px] break-all">
                    {serverUri || t('server.notConfigured')}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('server.connectionTypeLabel')}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {connectionType === 'websocket' ? 'WebSocket' : connectionType === 'streamable-http' ? 'Streamable HTTP' : 'SSE'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('server.lastUpdated')}</span>
                  <span className="text-slate-600 dark:text-slate-300">{new Date().toLocaleTimeString()}</span>
                </div>

                {lastReconnectTime && (
                  <div className="flex justify-between items-center py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{t('server.lastReconnect')}</span>
                    <span className="text-slate-600 dark:text-slate-300">{lastReconnectTime}</span>
                  </div>
                )}
              </div>

              {status === 'disconnected' && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <Icon name="info" size="sm" className="text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-medium mb-2">{t('server.troubleshootingTitle')}</p>
                      <ul className="list-disc ml-4 space-y-1 text-xs">
                        <li>{t('server.tipCheckRunning')}</li>
                        <li>{t('server.tipVerifyNetwork')}</li>
                        <li>{t('server.tipRestartServer')}</li>
                        <li>{t('server.tipUseReconnect')}</li>
                      </ul>
                      {/* Show detailed error in troubleshooting section - prefer background error */}
                      {(backgroundConnectionError || lastErrorMessage) && (
                        <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-800/50 rounded border border-amber-200 dark:border-amber-700">
                          <p className="font-medium text-xs mb-1">{t('server.lastError')}</p>
                          <p className="text-xs break-words">{backgroundConnectionError || lastErrorMessage}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {hasBackgroundError && (
                <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400 mt-0.5" />
                    <div>
                      <p className="font-medium mb-2">{t('server.commIssueTitle')}</p>
                      <ul className="list-disc ml-4 space-y-1 text-xs">
                        <li>{t('server.tipReloadPage')}</li>
                        <li>{t('server.tipRestartBrowser')}</li>
                        <li>{t('server.tipReinstall')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ServerStatus;

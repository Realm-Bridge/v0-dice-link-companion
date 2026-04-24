/**
 * QWebChannel Client for DLC
 * Handles communication with DLA via Qt's QWebChannel signal/slot pattern
 * Replaces WebSocket/WebRTC architecture with Qt embedded browser communication
 */

import { debugWebSocket, debugError } from "./debug.js";

// ============================================================================
// CONNECTION STATE
// ============================================================================

let isConnected = false;
let dlaInterface = null;
let connectionChangeCallbacks = [];

// Callback storage (same API as websocket-client.js)
let buttonSelectCallback = null;
let diceResultCallback = null;
let cancelCallback = null;
let rollResultCallback = null;
let diceTrayRollCallback = null;
let playerModeActionCallback = null;

// ============================================================================
// INITIALIZATION - Check for QWebChannel / DLA Interface
// ============================================================================

/**
 * Initialize QWebChannel connection with DLA
 * Called during Foundry ready hook
 * 
 * DLC initiates contact first (reversed messaging pattern):
 * 1. DLC checks if dlaInterface exists
 * 2. If it does, DLC sends "dlcReady" message to announce it's loaded
 * 3. DLA responds by establishing connection
 * 4. This avoids timing issues with events firing before listeners are ready
 * 
 * @returns {Promise<boolean>} True if connected to DLA
 */
export async function connect() {
  debugWebSocket("Initializing QWebChannel connection", {});
  console.log("[DLC] INIT: connect() called");
  console.log("[DLC] INIT: window.dlaInterface exists?", !!window.dlaInterface);
  
  // Check if dlaInterface is already available (DLA loaded first)
  if (window.dlaInterface) {
    console.log("[DLC] INIT: dlaInterface found immediately - announcing DLC is ready");
    return announceDLCReady(window.dlaInterface);
  }

  // If not available yet, wait briefly for it to appear
  console.log("[DLC] INIT: dlaInterface not yet available - waiting...");
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      console.log("[DLC] INIT: Checking for dlaInterface...", !!window.dlaInterface);
      if (window.dlaInterface) {
        clearInterval(checkInterval);
        console.log("[DLC] INIT: dlaInterface became available");
        const result = announceDLCReady(window.dlaInterface);
        resolve(result);
      }
    }, 100);

    // Timeout after 10 seconds - DLA probably not running
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!window.dlaInterface) {
        console.log("[DLC] QWebChannel: dlaInterface never appeared - DLA not running in embedded mode");
        debugWebSocket("DLA interface not available", { timeout: 10000 });
        resolve(false);
      }
    }, 10000);
  });
}

/**
 * Announce to DLA that DLC is ready and initialized
 * This triggers DLA to establish the connection
 * @param {Object} dlaIface - The dlaInterface object from DLA
 * @returns {Promise<boolean>} True if DLA acknowledged
 */
async function announceDLCReady(dlaIface) {
  try {
    console.log("[DLC] INIT: announceDLCReady() called");
    console.log("[DLC] INIT: dlaIface type:", typeof dlaIface);
    console.log("[DLC] INIT: dlaIface keys:", Object.keys(dlaIface));
    
    // Call the correct method on DLA interface to announce DLC is ready
    if (typeof dlaIface.dlcModuleInitialized === "function") {
      console.log("[DLC] INIT: dlcModuleInitialized is a function - calling it...");
      dlaIface.dlcModuleInitialized();
      console.log("[DLC] INIT: dlcModuleInitialized() called successfully");
    } else {
      console.error("[DLC] INIT: dlcModuleInitialized is NOT a function!");
      console.error("[DLC] INIT: Type of dlcModuleInitialized:", typeof dlaIface.dlcModuleInitialized);
      console.log("[DLC] INIT: Available keys on dlaInterface:", Object.keys(dlaIface));
      return false;
    }
    
    // Wait for DLA's acknowledgement via dlcModuleReady signal
    console.log("[DLC] INIT: Waiting for dlcModuleReady signal...");
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error("[DLC] INIT: dlcModuleReady signal TIMEOUT - DLA did not acknowledge");
        resolve(false);
      }, 5000);

      if (dlaIface.dlcModuleReady) {
        console.log("[DLC] INIT: dlcModuleReady signal found, connecting...");
        dlaIface.dlcModuleReady.connect(function(ackJson) {
          clearTimeout(timeout);
          console.log("[DLC] INIT: DLA acknowledged via dlcModuleReady signal!");
          console.log("[DLC] INIT: Acknowledgement data:", ackJson);
          
          // Setup the interface after DLA acknowledges
          const setupSuccess = setupDLAInterface(dlaIface);
          resolve(setupSuccess);
        });
      } else {
        clearTimeout(timeout);
        console.error("[DLC] INIT: dlcModuleReady signal NOT FOUND on dlaInterface!");
        resolve(false);
      }
    });
  } catch (error) {
    console.error("[DLC] INIT: Exception in announceDLCReady:", error);
    console.error("[DLC] INIT: Stack trace:", error.stack);
    debugError("Failed to announce DLC ready", error);
    return false;
  }
}

/**
 * Setup the DLA interface and connect all signal handlers
 * @param {Object} dlaIface - The dlaInterface object from DLA
 * @returns {boolean} True if setup successful
 */
function setupDLAInterface(dlaIface) {
  try {
    dlaInterface = dlaIface;
    isConnected = true;
    
    console.log("[DLC] QWebChannel: Setting up signal handlers");
    debugWebSocket("QWebChannel interface connected", {});

    // Connect signal handlers for all message types
    
    // Roll results
    if (dlaInterface.rollResultReady) {
      dlaInterface.rollResultReady.connect((result) => {
        console.log("[DLC] QWebChannel: Received rollResult signal");
        if (rollResultCallback) rollResultCallback(JSON.parse(result));
      });
    }

    // Roll cancelled - callback expects: (rollId)
    if (dlaInterface.rollCancelledReady) {
      dlaInterface.rollCancelledReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received rollCancelled signal");
        const message = JSON.parse(data);
        if (cancelCallback) {
          cancelCallback(message.id || message.originalRollId);
        }
      });
    }

    // Roll complete
    if (dlaInterface.rollCompleteReady) {
      dlaInterface.rollCompleteReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received rollComplete signal");
        // Handle roll complete (acknowledged receipt)
      });
    }

    // Dice result - callback expects: (rollId, results[])
    if (dlaInterface.diceResultReady) {
      dlaInterface.diceResultReady.connect((result) => {
        console.log("[DLC] QWebChannel: Received diceResult signal");
        const message = JSON.parse(result);
        if (diceResultCallback) {
          diceResultCallback(
            message.originalRollId || message.id,
            message.results || []
          );
        }
      });
    }

    // Button select - callback expects: (rollId, buttonClicked, configChanges)
    if (dlaInterface.buttonSelectReady) {
      dlaInterface.buttonSelectReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received buttonSelect signal");
        const message = JSON.parse(data);
        if (buttonSelectCallback) {
          buttonSelectCallback(
            message.id || message.originalRollId,
            message.button || "normal",
            message.configChanges || {}
          );
        }
      });
    }

    // Dice tray roll - callback expects: (formula, flavor)
    if (dlaInterface.diceTrayRollReady) {
      dlaInterface.diceTrayRollReady.connect((result) => {
        console.log("[DLC] QWebChannel: Received diceTrayRoll signal");
        const message = JSON.parse(result);
        if (diceTrayRollCallback) {
          diceTrayRollCallback(message.formula, message.flavor);
        }
      });
    }

    // Player modes update - callback expects: (data object)
    if (dlaInterface.playerModesUpdateReady) {
      dlaInterface.playerModesUpdateReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received playerModesUpdate signal");
        const message = JSON.parse(data);
        if (playerModeActionCallback) {
          playerModeActionCallback(message);
        }
      });
    }

    // Connection status
    if (dlaInterface.connectionStatusReady) {
      dlaInterface.connectionStatusReady.connect((status) => {
        console.log("[DLC] QWebChannel: Received connectionStatus signal:", status);
        handleConnectionStatusChange(status);
      });
    }

    // Notify all listeners that connection established
    notifyConnectionChange(true);
    return true;

  } catch (error) {
    console.error("[DLC] QWebChannel: Setup failed:", error);
    debugError("QWebChannel setup failed", error);
    isConnected = false;
    return false;
  }
}

/**
 * Handle connection status changes from DLA
 * @param {string} status - "connected", "disconnected", "error"
 */
function handleConnectionStatusChange(status) {
  const wasConnected = isConnected;
  
  console.log("[DLC] QWebChannel: handleConnectionStatusChange called with status:", status);
  console.log("[DLC] QWebChannel: Was connected before:", wasConnected);
  
  if (status === "connected") {
    isConnected = true;
  } else if (status === "disconnected" || status === "error") {
    isConnected = false;
  }

  console.log("[DLC] QWebChannel: Connection state after handling:", isConnected);
  
  if (wasConnected !== isConnected) {
    console.log("[DLC] QWebChannel: Connection state changed, notifying listeners");
    notifyConnectionChange(isConnected);
  }
}

/**
 * Notify all connection change callbacks
 * @param {boolean} connected - True if connected
 */
function notifyConnectionChange(connected) {
  connectionChangeCallbacks.forEach(callback => {
    try {
      callback(connected);
    } catch (error) {
      console.error("[DLC] QWebChannel: Callback error:", error);
    }
  });
}

// ============================================================================
// MESSAGE SENDING - Send data to DLA via QWebChannel
// ============================================================================

/**
 * Send roll request to DLA
 * @param {Object} data - Roll request data
 */
export function sendMessage(data) {
  console.log("[DLC] sendMessage called with data:", data);
  console.log("[DLC] Connection state - isConnected:", isConnected, "dlaInterface:", !!dlaInterface);
  
  if (!isConnected || !dlaInterface) {
    console.warn("[DLC] QWebChannel: Not connected, cannot send message", data);
    console.warn("[DLC] isConnected:", isConnected, "dlaInterface:", !!dlaInterface);
    debugError("QWebChannel not connected", { messageType: data.type });
    return;
  }

  try {
    const jsonData = JSON.stringify(data);
    console.log("[DLC] QWebChannel: Sending message type:", data.type);
    console.log("[DLC] QWebChannel: Full message data:", jsonData);

    if (data.type === "rollRequest" && dlaInterface.receiveRollRequest) {
      console.log("[DLC] QWebChannel: Calling receiveRollRequest...");
      dlaInterface.receiveRollRequest(jsonData);
      console.log("[DLC] QWebChannel: receiveRollRequest called successfully");
    } else if (data.type === "diceRequest" && dlaInterface.receiveDiceRequest) {
      console.log("[DLC] QWebChannel: Calling receiveDiceRequest...");
      dlaInterface.receiveDiceRequest(jsonData);
    } else if (data.type === "playerModesUpdate" && dlaInterface.receivePlayerModesUpdate) {
      console.log("[DLC] QWebChannel: Calling receivePlayerModesUpdate...");
      dlaInterface.receivePlayerModesUpdate(jsonData);
    } else {
      console.warn("[DLC] QWebChannel: Unknown message type or handler not available:", data.type);
      console.warn("[DLC] Available handlers - receiveRollRequest:", !!dlaInterface.receiveRollRequest, 
                   "receiveDiceRequest:", !!dlaInterface.receiveDiceRequest,
                   "receivePlayerModesUpdate:", !!dlaInterface.receivePlayerModesUpdate);
    }
  } catch (error) {
    console.error("[DLC] QWebChannel: Error sending message:", error);
    debugError("QWebChannel message send error", error);
  }
}

// ============================================================================
// CALLBACK REGISTRATION (same API as websocket-client.js)
// ============================================================================

export function setButtonSelectCallback(callback) {
  buttonSelectCallback = callback;
}

export function setDiceResultCallback(callback) {
  diceResultCallback = callback;
}

export function setCancelCallback(callback) {
  cancelCallback = callback;
}

export function setRollResultCallback(callback) {
  rollResultCallback = callback;
}

export function setDiceTrayRollCallback(callback) {
  diceTrayRollCallback = callback;
}

export function setPlayerModeActionCallback(callback) {
  playerModeActionCallback = callback;
}

export function onConnectionChange(callback) {
  connectionChangeCallbacks.push(callback);
}

// ============================================================================
// STATUS QUERIES
// ============================================================================

export function getConnectionStatus() {
  return isConnected;
}

export function disconnect() {
  // Clean disconnect from Qt
  isConnected = false;
  dlaInterface = null;
  notifyConnectionChange(false);
  console.log("[DLC] QWebChannel: Disconnected from DLA");
}

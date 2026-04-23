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
  
  // Check if dlaInterface is already available (DLA loaded first)
  if (window.dlaInterface) {
    console.log("[DLC] QWebChannel: dlaInterface found - announcing DLC is ready");
    return announceDLCReady(window.dlaInterface);
  }

  // If not available yet, wait briefly for it to appear
  console.log("[DLC] QWebChannel: dlaInterface not yet available - waiting...");
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.dlaInterface) {
        clearInterval(checkInterval);
        console.log("[DLC] QWebChannel: dlaInterface became available");
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
    console.log("[DLC] QWebChannel: Announcing DLC is ready to DLA");
    
    // Call the method on DLA interface to announce DLC is ready
    if (typeof dlaIface.dlcReady === "function") {
      dlaIface.dlcReady();
      console.log("[DLC] QWebChannel: dlcReady() called");
    } else if (typeof dlaIface.announceDLCReady === "function") {
      dlaIface.announceDLCReady();
      console.log("[DLC] QWebChannel: announceDLCReady() called");
    } else {
      console.log("[DLC] QWebChannel: No ready announcement method found, proceeding anyway");
    }
    
    // Wait a bit for DLA to respond
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Setup the interface
    return setupDLAInterface(dlaIface);
  } catch (error) {
    console.error("[DLC] QWebChannel: Error announcing DLC ready", error);
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

    // Roll cancelled
    if (dlaInterface.rollCancelledReady) {
      dlaInterface.rollCancelledReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received rollCancelled signal");
        if (cancelCallback) cancelCallback(JSON.parse(data));
      });
    }

    // Roll complete
    if (dlaInterface.rollCompleteReady) {
      dlaInterface.rollCompleteReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received rollComplete signal");
        // Handle roll complete (acknowledged receipt)
      });
    }

    // Dice result
    if (dlaInterface.diceResultReady) {
      dlaInterface.diceResultReady.connect((result) => {
        console.log("[DLC] QWebChannel: Received diceResult signal");
        if (diceResultCallback) diceResultCallback(JSON.parse(result));
      });
    }

    // Button select
    if (dlaInterface.buttonSelectReady) {
      dlaInterface.buttonSelectReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received buttonSelect signal");
        if (buttonSelectCallback) buttonSelectCallback(JSON.parse(data));
      });
    }

    // Dice tray roll
    if (dlaInterface.diceTrayRollReady) {
      dlaInterface.diceTrayRollReady.connect((result) => {
        console.log("[DLC] QWebChannel: Received diceTrayRoll signal");
        if (diceTrayRollCallback) diceTrayRollCallback(JSON.parse(result));
      });
    }

    // Player modes update
    if (dlaInterface.playerModesUpdateReady) {
      dlaInterface.playerModesUpdateReady.connect((data) => {
        console.log("[DLC] QWebChannel: Received playerModesUpdate signal");
        if (playerModeActionCallback) playerModeActionCallback(JSON.parse(data));
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
  
  if (status === "connected") {
    isConnected = true;
  } else if (status === "disconnected" || status === "error") {
    isConnected = false;
  }

  if (wasConnected !== isConnected) {
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
  if (!isConnected || !dlaInterface) {
    console.warn("[DLC] QWebChannel: Not connected, cannot send message", data);
    debugError("QWebChannel not connected", { messageType: data.type });
    return;
  }

  try {
    const jsonData = JSON.stringify(data);
    console.log("[DLC] QWebChannel: Sending message type:", data.type);

    if (data.type === "rollRequest" && dlaInterface.receiveRollRequest) {
      dlaInterface.receiveRollRequest(jsonData);
    } else if (data.type === "diceRequest" && dlaInterface.receiveDiceRequest) {
      dlaInterface.receiveDiceRequest(jsonData);
    } else if (data.type === "playerModesUpdate" && dlaInterface.receivePlayerModesUpdate) {
      dlaInterface.receivePlayerModesUpdate(jsonData);
    } else {
      console.warn("[DLC] QWebChannel: Unknown message type or handler not available:", data.type);
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

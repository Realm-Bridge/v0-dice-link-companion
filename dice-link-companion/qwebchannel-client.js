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
 * @returns {Promise<boolean>} True if connected to DLA
 */
export async function connect() {
  debugWebSocket("Initializing QWebChannel connection", {});
  
  // Check if dlaInterface is already available
  if (window.dlaInterface) {
    console.log("[DLC] QWebChannel: dlaInterface found immediately");
    return setupDLAInterface(window.dlaInterface);
  }

  // If not available, wait for dlaInterfaceReady event
  console.log("[DLC] QWebChannel: Waiting for dlaInterfaceReady event...");
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("[DLC] QWebChannel: dlaInterfaceReady event timeout - DLA not running");
      debugWebSocket("DLA interface not available", { timeout: 10000 });
      resolve(false);
    }, 10000);

    // Listen for the dlaInterfaceReady event from DLA
    window.addEventListener("dlaInterfaceReady", (event) => {
      clearTimeout(timeout);
      console.log("[DLC] QWebChannel: dlaInterfaceReady event received");
      const result = setupDLAInterface(window.dlaInterface);
      resolve(result);
    }, { once: true });
  });
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

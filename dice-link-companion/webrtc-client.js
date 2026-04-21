/**
 * WebRTC Client Module - Dice Link Companion
 * Handles WebRTC Data Channel communication with DLA
 * Provides same API surface as websocket-client.js for compatibility
 * 
 * Uses browser-as-offerer pattern for Chrome compatibility
 * Implements manual signaling via HTTP copy-paste handshake
 */

import { debugWebSocket, debugError } from "./debug.js";
import { 
  DICE_LINK_APP_HOST, 
  DICE_LINK_APP_PORT,
  MODULE_ID
} from "./constants.js";
import { showOfferDialog, closeHandshakeDialog } from "./webrtc-handshake-dialog.js";

// ============================================================================
// STATE
// ============================================================================

let peerConnection = null;
let dataChannel = null;
let isConnected = false;
let isConnecting = false;
let messageQueue = [];
let connectionListeners = [];

// Store for connection state tracking
let lastError = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEBRTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] }
  ]
};

const DATA_CHANNEL_CONFIG = {
  ordered: true,
  maxRetransmits: 3
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initiate WebRTC connection to DLA
 * Browser acts as offerer, generates SDP offer
 * @returns {Promise<boolean>} True if connection initiated successfully
 */
export async function connect() {
  if (isConnecting || (peerConnection && peerConnection.connectionState !== "failed" && peerConnection.connectionState !== "closed")) {
    debugWebSocket("Connection already in progress or connected", { 
      isConnecting, 
      state: peerConnection?.connectionState 
    });
    return isConnected;
  }

  try {
    isConnecting = true;
    connectionAttempts++;
    
    debugWebSocket("Starting WebRTC connection", { 
      hostname: window.location.hostname,
      attempt: connectionAttempts
    });

    // Initialize peer connection with STUN servers
    peerConnection = new RTCPeerConnection({ iceServers: WEBRTC_CONFIG.iceServers });

    // Set up connection state monitoring
    peerConnection.onconnectionstatechange = () => {
      handleConnectionStateChange(peerConnection.connectionState);
    };

    peerConnection.onicecandidateerror = (event) => {
      debugError("ICE candidate error", { error: event.errorText });
    };

    // Create data channel BEFORE generating offer
    dataChannel = peerConnection.createDataChannel("dlc-data", DATA_CHANNEL_CONFIG);
    setupDataChannel(dataChannel);

    // Generate SDP offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    debugWebSocket("SDP offer generated", { 
      sdpLength: offer.sdp.length,
      offerReady: true
    });

    // Display offer to user for copy-paste handshake
    await displayOfferAndWaitForAnswer(peerConnection.localDescription);

    return true;

  } catch (error) {
    lastError = error;
    debugError("WebRTC connection failed", error);
    isConnecting = false;
    cleanupConnection();
    return false;
  }
}

/**
 * Automated test connection - bypasses copy/paste, sends offer directly via fetch
 * This tests whether the issue is in copy/paste handling or WebRTC setup
 * @returns {Promise<boolean>} True if connection successful
 */
export async function connectAutomated() {
  if (isConnecting || (peerConnection && peerConnection.connectionState !== "failed" && peerConnection.connectionState !== "closed")) {
    debugWebSocket("Connection already in progress or connected", { 
      isConnecting, 
      state: peerConnection?.connectionState 
    });
    return isConnected;
  }

  try {
    isConnecting = true;
    connectionAttempts++;
    
    console.log("[DLC] AUTOMATED TEST: Starting WebRTC connection (no copy/paste)");
    debugWebSocket("Starting AUTOMATED WebRTC connection", { 
      hostname: window.location.hostname,
      attempt: connectionAttempts
    });

    // Initialize peer connection with STUN servers
    peerConnection = new RTCPeerConnection({ iceServers: WEBRTC_CONFIG.iceServers });
    console.log("[DLC] AUTOMATED TEST: PeerConnection created");

    // Set up connection state monitoring
    peerConnection.onconnectionstatechange = () => {
      console.log("[DLC] AUTOMATED TEST: Connection state changed to:", peerConnection.connectionState);
      handleConnectionStateChange(peerConnection.connectionState);
    };

    peerConnection.onicecandidateerror = (event) => {
      console.log("[DLC] AUTOMATED TEST: ICE candidate error:", event.errorText);
      debugError("ICE candidate error", { error: event.errorText });
    };

    // Create data channel BEFORE generating offer
    dataChannel = peerConnection.createDataChannel("dlc-data", DATA_CHANNEL_CONFIG);
    setupDataChannel(dataChannel);
    console.log("[DLC] AUTOMATED TEST: Data channel created");

    // Generate SDP offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("[DLC] AUTOMATED TEST: Offer created, SDP length:", offer.sdp.length);

    // Wait for ICE gathering to complete (important!)
    await waitForIceGatheringComplete();
    
    // Get the complete offer with ICE candidates
    const completeOffer = peerConnection.localDescription.sdp;
    console.log("[DLC] AUTOMATED TEST: Complete offer with ICE, length:", completeOffer.length);

    // Send offer directly to DLA via fetch (no copy/paste)
    console.log("[DLC] AUTOMATED TEST: Sending offer to http://127.0.0.1:8765/api/receive-offer");
    const response = await fetch(`http://127.0.0.1:${DICE_LINK_APP_PORT}/api/receive-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer: completeOffer })
    });

    if (!response.ok) {
      throw new Error(`DLA returned error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("[DLC] AUTOMATED TEST: Received answer from DLA");
    console.log("[DLC] AUTOMATED TEST: Answer SDP length:", result.answer.length);
    console.log("[DLC] AUTOMATED TEST: First 100 chars:", result.answer.substring(0, 100));
    console.log("[DLC] AUTOMATED TEST: First 50 bytes:", Array.from(result.answer.substring(0, 50)).map(c => c.charCodeAt(0)));

    // Set the answer directly (no textarea normalization needed)
    const answerDescription = new RTCSessionDescription({
      type: "answer",
      sdp: result.answer
    });

    console.log("[DLC] AUTOMATED TEST: Calling setRemoteDescription...");
    await peerConnection.setRemoteDescription(answerDescription);
    console.log("[DLC] AUTOMATED TEST: setRemoteDescription succeeded!");
    console.log("[DLC] AUTOMATED TEST: Connection state:", peerConnection.connectionState);
    console.log("[DLC] AUTOMATED TEST: ICE connection state:", peerConnection.iceConnectionState);

    isConnecting = false;
    return true;

  } catch (error) {
    console.error("[DLC] AUTOMATED TEST: Connection failed:", error);
    lastError = error;
    debugError("Automated WebRTC connection failed", error);
    isConnecting = false;
    cleanupConnection();
    return false;
  }
}

/**
 * Wait for ICE gathering to complete
 * @returns {Promise<void>}
 */
function waitForIceGatheringComplete() {
  return new Promise((resolve) => {
    if (peerConnection.iceGatheringState === "complete") {
      resolve();
      return;
    }
    
    const checkState = () => {
      if (peerConnection.iceGatheringState === "complete") {
        peerConnection.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };
    
    peerConnection.addEventListener("icegatheringstatechange", checkState);
    
    // Timeout after 5 seconds
    setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", checkState);
      console.log("[DLC] AUTOMATED TEST: ICE gathering timeout, proceeding anyway");
      resolve();
    }, 5000);
  });
}

/**
 * Disconnect from WebRTC peer
 * Closes data channel and peer connection
 */
export function disconnect() {
  debugWebSocket("Disconnecting WebRTC", {});

  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  isConnected = false;
  isConnecting = false;
  notifyConnectionListeners(false);
}

/**
 * Send a message through the WebRTC data channel
 * Queues message if not yet connected
 * @param {Object} message - Message to send
 */
export function sendMessage(message) {
  if (isConnected && dataChannel && dataChannel.readyState === "open") {
    try {
      const payload = JSON.stringify(message);
      dataChannel.send(payload);
      debugWebSocket("Message sent", { type: message.type });
    } catch (error) {
      debugError("Failed to send message", error);
      messageQueue.push(message);
    }
  } else {
    debugWebSocket("Message queued (not connected)", { type: message.type });
    messageQueue.push(message);
  }
}

/**
 * Get current connection status
 * @returns {Object} Connection status object
 */
export function getConnectionStatus() {
  return {
    isConnected,
    isConnecting,
    peerConnectionState: peerConnection?.connectionState || "closed",
    dataChannelState: dataChannel?.readyState || "closed",
    lastError,
    queuedMessages: messageQueue.length
  };
}

/**
 * Register callback for connection state changes
 * @param {Function} callback - Called with boolean: true (connected) or false (disconnected)
 */
export function onConnectionChange(callback) {
  connectionListeners.push(callback);
  // Immediately call with current state
  callback(isConnected);
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Handle data channel events
 * @param {RTCDataChannel} channel - The data channel
 */
function setupDataChannel(channel) {
  channel.onopen = () => {
    debugWebSocket("Data channel opened", { label: channel.label });
    isConnected = true;
    isConnecting = false;
    connectionAttempts = 0;
    notifyConnectionListeners(true);
    flushMessageQueue();
  };

  channel.onclose = () => {
    debugWebSocket("Data channel closed", {});
    isConnected = false;
    notifyConnectionListeners(false);
  };

  channel.onerror = (error) => {
    debugError("Data channel error", { error: error.message });
  };

  channel.onmessage = (event) => {
    handleMessage(event.data);
  };
}

/**
 * Handle peer connection state changes
 * @param {string} state - New connection state
 */
function handleConnectionStateChange(state) {
  debugWebSocket("Peer connection state changed", { state });

  switch (state) {
    case "connected":
      debugWebSocket("Peer connection established", {});
      break;
    case "disconnected":
      isConnected = false;
      notifyConnectionListeners(false);
      break;
    case "failed":
      debugError("Peer connection failed", { attemptCount: connectionAttempts });
      isConnecting = false;
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        scheduleReconnect();
      }
      break;
    case "closed":
      isConnected = false;
      isConnecting = false;
      notifyConnectionListeners(false);
      break;
  }
}

/**
 * Display SDP offer to user and wait for answer via copy-paste
 * @param {RTCSessionDescription} localDescription - The SDP offer
 */
async function displayOfferAndWaitForAnswer(localDescription) {
  debugWebSocket("Waiting for user to provide SDP answer", {});

  // Format SDP with CRLF line endings as required
  const formattedOffer = localDescription.sdp.replace(/\n/g, "\r\n");

  // Show user a dialog to copy offer and paste answer
  return new Promise((resolve, reject) => {
    showOfferDialog(formattedOffer, async (rawAnswerSDP) => {
      try {
        // STEP 1: Log the raw answer SDP BEFORE any processing
        console.log("[DLC] Raw answer SDP from user paste:");
        console.log(rawAnswerSDP);
        console.log("[DLC] Raw answer SDP length:", rawAnswerSDP.length);
        console.log("[DLC] First 200 chars:", rawAnswerSDP.substring(0, 200));
        console.log("[DLC] First 50 bytes:", Array.from(rawAnswerSDP.substring(0, 50)).map(c => c.charCodeAt(0)));
        
        // STEP 2: Normalize line endings to CRLF as required by RFC 8866
        // Textareas convert CRLF to LF, but WebRTC requires CRLF
        const answerSDP = rawAnswerSDP.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
        console.log("[DLC] Normalized answer SDP length:", answerSDP.length);
        
        debugWebSocket("Received answer SDP from user", { rawLength: rawAnswerSDP.length, normalizedLength: answerSDP.length });
        
        // STEP 3: Create RTCSessionDescription with the normalized answer
        console.log("[DLC] Creating RTCSessionDescription with normalized answer...");
        const answerDescription = new RTCSessionDescription({
          type: "answer",
          sdp: answerSDP  // Use normalized SDP with CRLF line endings
        });
        
        // STEP 3: Log the RTCSessionDescription object
        console.log("[DLC] RTCSessionDescription object:", answerDescription);
        console.log("[DLC] Answer description type:", answerDescription.type);
        console.log("[DLC] Answer description SDP length:", answerDescription.sdp.length);
        
        // STEP 4: Set as remote description with detailed error logging
        try {
          console.log("[DLC] Calling setRemoteDescription with answer...");
          await peerConnection.setRemoteDescription(answerDescription);
          console.log("[DLC] setRemoteDescription succeeded!");
          console.log("[DLC] Connection state:", peerConnection.connectionState);
          console.log("[DLC] ICE connection state:", peerConnection.iceConnectionState);
          
          debugWebSocket("Remote description set successfully", {});
          
          // Connection will be established when ICE completes
          // The data channel onopen event will fire when ready
          resolve(true);
        } catch (setRemoteError) {
          console.error("[DLC] setRemoteDescription failed:", setRemoteError);
          console.error("[DLC] Error name:", setRemoteError.name);
          console.error("[DLC] Error message:", setRemoteError.message);
          console.error("[DLC] Full error object:", setRemoteError);
          
          debugError("Failed to set remote description", setRemoteError);
          reject(setRemoteError);
        }
      } catch (error) {
        console.error("[DLC] Unexpected error in answer processing:", error);
        debugError("Failed to process answer SDP", error);
        reject(error);
      }
    });
  });
}

/**
 * Process incoming message from data channel
 * @param {string} data - JSON string message
 */
function handleMessage(data) {
  try {
    const message = JSON.parse(data);
    debugWebSocket("Message received", { type: message.type });

    // Route message based on type
    // This will be expanded in Phase 5 with actual handlers
    switch (message.type) {
      case "connected":
        debugWebSocket("DLA confirmed connection", {});
        break;
      case "error":
        debugError("DLA error message", { error: message.error });
        break;
      default:
        debugWebSocket("Unhandled message type", { type: message.type });
    }

  } catch (error) {
    debugError("Failed to parse message", error);
  }
}

/**
 * Flush queued messages
 */
function flushMessageQueue() {
  if (messageQueue.length === 0) return;

  debugWebSocket("Flushing message queue", { count: messageQueue.length });

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    sendMessage(message);
  }
}

/**
 * Notify all registered listeners of connection state change
 * @param {boolean} connected - True if connected, false if disconnected
 */
function notifyConnectionListeners(connected) {
  connectionListeners.forEach(callback => {
    try {
      callback(connected);
    } catch (error) {
      debugError("Connection listener callback error", error);
    }
  });
}

/**
 * Clean up connection resources
 */
function cleanupConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    debugError("Max reconnection attempts reached", { attempts: connectionAttempts });
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);
  debugWebSocket("Scheduling reconnect", { delay, attempt: connectionAttempts });

  setTimeout(() => {
    connect();
  }, delay);
}

// ============================================================================
// CALLBACK REGISTRATION (matching websocket-client.js API)
// ============================================================================

// Callback storage
let buttonSelectCallback = null;
let diceResultCallback = null;
let cancelCallback = null;
let rollResultCallback = null;
let diceTrayRollCallback = null;
let playerModeActionCallback = null;

/**
 * Set callback for button selection messages from DLA
 * @param {Function} callback 
 */
export function setButtonSelectCallback(callback) {
  buttonSelectCallback = callback;
}

/**
 * Set callback for dice result messages from DLA
 * @param {Function} callback 
 */
export function setDiceResultCallback(callback) {
  diceResultCallback = callback;
}

/**
 * Set callback for cancel messages from DLA
 * @param {Function} callback 
 */
export function setCancelCallback(callback) {
  cancelCallback = callback;
}

/**
 * Set callback for roll result messages from DLA
 * @param {Function} callback 
 */
export function setRollResultCallback(callback) {
  rollResultCallback = callback;
}

/**
 * Set callback for dice tray roll messages from DLA
 * @param {Function} callback 
 */
export function setDiceTrayRollCallback(callback) {
  diceTrayRollCallback = callback;
}

/**
 * Set callback for player mode action messages from DLA
 * @param {Function} callback 
 */
export function setPlayerModeActionCallback(callback) {
  playerModeActionCallback = callback;
}

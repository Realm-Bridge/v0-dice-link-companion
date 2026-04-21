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
  // This is a placeholder - actual UI implementation depends on Foundry integration
  return new Promise((resolve, reject) => {
    // Phase 1 checkpoint: Placeholder for UI dialog
    // Will be implemented with Foundry dialog system
    debugWebSocket("Phase 1 checkpoint: UI dialog needed for offer/answer exchange", {});
    
    // For testing, we'll need to implement this in Phase 2
    reject(new Error("Phase 1: UI dialog not yet implemented"));
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

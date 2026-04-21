/**
 * WebRTC Handshake Dialog Module
 * Manages the UI for the offer/answer copy-paste handshake flow
 * Browser-as-offerer pattern: DLC creates offer, sends to DLA, receives answer
 */

import { DICE_LINK_APP_HOST, DICE_LINK_APP_PORT } from "./constants.js";
import { debugWebSocket, debugError } from "./debug.js";

// Global reference to active handshake state
let activeHandshakeDialog = null;

/**
 * Display dialog showing the SDP offer for user to copy
 * @param {string} offerSDP - The SDP offer from browser peer connection
 * @param {function} onAnswerReceived - Callback when user has pasted answer
 */
export function showOfferDialog(offerSDP, onAnswerReceived) {
  debugWebSocket("Showing offer dialog for user to copy");

  const dialogHTML = `
    <div class="webrtc-handshake-dialog">
      <div class="webrtc-handshake-header">
        <h2>Connect to Dice Link App - Step 1 of 2</h2>
        <p>Copy the connection offer below and paste it into the Dice Link App</p>
      </div>

      <div class="webrtc-offer-section">
        <label>Your Connection Offer:</label>
        <textarea 
          id="webrtc-offer-textarea" 
          class="webrtc-offer-textarea" 
          readonly
        >${offerSDP}</textarea>
        <button id="webrtc-copy-offer-btn" class="webrtc-copy-btn">
          Copy Offer
        </button>
      </div>

      <div class="webrtc-divider">
        <span>After copying, return with the DLA response</span>
      </div>

      <div class="webrtc-answer-section">
        <label>Paste the Dice Link App's Response:</label>
        <textarea 
          id="webrtc-answer-textarea" 
          class="webrtc-answer-textarea" 
          placeholder="Paste the answer here..."
        ></textarea>
        <button id="webrtc-paste-answer-btn" class="webrtc-paste-answer-btn">
          Paste and Connect
        </button>
        <button id="webrtc-cancel-handshake-btn" class="webrtc-cancel-btn">
          Cancel
        </button>
      </div>

      <div class="webrtc-status">
        <p id="webrtc-handshake-status"></p>
      </div>
    </div>
  `;

  // Create a simple dialog element
  const dialogContainer = document.createElement("div");
  dialogContainer.id = "webrtc-handshake-dialog-container";
  dialogContainer.innerHTML = dialogHTML;
  document.body.appendChild(dialogContainer);

  activeHandshakeDialog = dialogContainer;

  // Attach event listeners
  const copyBtn = document.getElementById("webrtc-copy-offer-btn");
  const pasteBtn = document.getElementById("webrtc-paste-answer-btn");
  const cancelBtn = document.getElementById("webrtc-cancel-handshake-btn");
  const offerTextarea = document.getElementById("webrtc-offer-textarea");
  const answerTextarea = document.getElementById("webrtc-answer-textarea");
  const statusElement = document.getElementById("webrtc-handshake-status");

  copyBtn.addEventListener("click", () => {
    offerTextarea.select();
    document.execCommand("copy");
    statusElement.textContent = "✓ Offer copied to clipboard";
    statusElement.classList.add("success");
    debugWebSocket("User copied offer to clipboard");
  });

  pasteBtn.addEventListener("click", () => {
    const answer = answerTextarea.value.trim();
    if (!answer) {
      statusElement.textContent = "Please paste the answer first";
      statusElement.classList.add("error");
      return;
    }

    debugWebSocket("User pasted answer, validating...");
    closeHandshakeDialog();
    onAnswerReceived(answer);
  });

  cancelBtn.addEventListener("click", () => {
    debugWebSocket("User cancelled handshake");
    closeHandshakeDialog();
  });
}

/**
 * Close the active handshake dialog
 */
export function closeHandshakeDialog() {
  if (activeHandshakeDialog) {
    activeHandshakeDialog.remove();
    activeHandshakeDialog = null;
    debugWebSocket("Handshake dialog closed");
  }
}

/**
 * Update handshake status message in dialog
 * @param {string} message - Status message to display
 * @param {string} type - "success", "error", or "info"
 */
export function updateHandshakeStatus(message, type = "info") {
  if (!activeHandshakeDialog) return;

  const statusElement = document.getElementById("webrtc-handshake-status");
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = `${type}`;
  }
}

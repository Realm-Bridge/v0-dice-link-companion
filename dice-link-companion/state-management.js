/**
 * State Management Module - dice-link-companion
 * Version 1.0.6.100 - Removed duplicate getCollapsedSections/setCollapsedSections (now only in settings.js)
 * 
 * Manages transient in-memory state for the panel UI
 * Keeps track of: pending roll requests, dialog references, dice entries, panel dialogs
 * 
 * NOTE: Persistent UI state (collapsed sections) is now managed exclusively by settings.js
 */

import { SETTING_DEFAULTS } from "./constants.js";

// ============================================================================
// STATE VARIABLES
// ============================================================================

let pendingRollRequest = null;
let hasRequestedThisSession = false;
let currentPanelDialog = null;
let pendingDiceEntry = null;
let diceEntryCancelled = false;
let mirroredDialog = null;
let collapsedSections = { ...SETTING_DEFAULTS.collapsedSections };

// State change listeners
const mirroredDialogListeners = [];

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get the pending roll request
 * @returns {Object|null} The pending roll request or null
 */
export function getPendingRollRequest() {
  return pendingRollRequest;
}

/**
 * Get session request flag
 * @returns {boolean} Whether player has requested this session
 */
export function getHasRequestedThisSession() {
  return hasRequestedThisSession;
}

/**
 * Get the currently open panel dialog
 * @returns {Object|null} The panel dialog or null
 */
export function getCurrentPanelDialog() {
  return currentPanelDialog;
}

/**
 * Get pending dice entry
 * @returns {Object|null} The pending dice entry or null
 */
export function getPendingDiceEntry() {
  return pendingDiceEntry;
}

/**
 * Get dice entry cancelled state
 * @returns {boolean} Whether dice entry was cancelled
 */
export function getDiceEntryCancelled() {
  return diceEntryCancelled;
}

/**
 * Get the mirrored dialog reference
 * @returns {Object|null} The mirrored dialog or null
 */
export function getMirroredDialog() {
  return mirroredDialog;
}

/**
 * Get the mirrored dialog (if one is currently being mirrored)
 * @returns {Object|null} The mirrored dialog object or null
 */
export function getMirroredDialog() {
  return mirroredDialog;
}

/**
 * Set session request flag
 * @param {boolean} value - Whether player has requested this session
 */
export function setHasRequestedThisSession(value) {
  hasRequestedThisSession = value;
}

/**
 * Set the currently open panel dialog
 * @param {Object|null} value - The panel dialog to set
 */
export function setCurrentPanelDialog(value) {
  currentPanelDialog = value;
}

/**
 * Set pending dice entry
 * @param {Object|null} value - The dice entry to set
 */
export function setPendingDiceEntry(value) {
  pendingDiceEntry = value;
}

/**
 * Set dice entry cancelled state
 * @param {boolean} value - Whether dice entry was cancelled
 */
export function setDiceEntryCancelled(value) {
  diceEntryCancelled = value;
}

/**
 * Set the mirrored dialog reference
 * Notifies all registered listeners when value changes
 * @param {Object|null} value - The mirrored dialog to set
 */
export function setMirroredDialog(value) {
  mirroredDialog = value;
  // Notify all listeners of the state change
  for (const listener of mirroredDialogListeners) {
    try {
      listener(value);
    } catch (e) {
      console.error("Dice Link | Error in mirroredDialog listener:", e);
    }
  }
}

/**
 * Clear all application state
 * Used when session ends or panel closes
 */
export function clearAllState() {
  pendingRollRequest = null;
  hasRequestedThisSession = false;
  currentPanelDialog = null;
  pendingDiceEntry = null;
  diceEntryCancelled = false;
  mirroredDialog = null;
}

/**
 * Reset only UI state (keep session state)
 * Used when panel refreshes
 */
export function resetUIState() {
  currentPanelDialog = null;
  pendingDiceEntry = null;
  diceEntryCancelled = false;
}

/**
 * Check if any pending operations exist
 * @returns {boolean} True if there are pending operations
 */
export function hasPendingOperations() {
  return pendingRollRequest !== null || pendingDiceEntry !== null;
}

// ============================================================================
// STATE LISTENERS
// ============================================================================

/**
 * Register a listener for mirroredDialog state changes
 * @param {Function} callback - Called with new value when mirroredDialog changes
 * @returns {Function} Unsubscribe function
 */
export function onMirroredDialogChange(callback) {
  mirroredDialogListeners.push(callback);
  return () => {
    const index = mirroredDialogListeners.indexOf(callback);
    if (index > -1) {
      mirroredDialogListeners.splice(index, 1);
    }
  };
}

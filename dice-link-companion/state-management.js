/**
 * State Management Module - dice-link-companion
 * Version 1.0.7.0 - Added resolver state for new RollResolver approach
 * 
 * Manages transient in-memory state for the panel UI
 * Keeps track of: pending roll requests, dialog references, dice entries, panel dialogs, resolver
 * 
 * NOTE: Persistent UI state (collapsed sections) is now managed exclusively by settings.js
 */

// ============================================================================
// STATE VARIABLES
// ============================================================================

let pendingRollRequest = null;
let hasRequestedThisSession = false;
let currentPanelDialog = null;
let pendingDiceEntry = null;
let diceEntryCancelled = false;
let mirroredDialog = null;

// Resolver state (v1.0.7.0) - for showing ALL dice at once
let activeResolver = null;
let resolverDiceTerms = null;

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
 * Get the active resolver
 * @returns {Object|null} The active RollResolver or null
 */
export function getActiveResolver() {
  return activeResolver;
}

/**
 * Get the resolver dice terms (all dice needing values)
 * @returns {Array|null} Array of dice term info or null
 */
export function getResolverDiceTerms() {
  return resolverDiceTerms;
}

// ============================================================================
// SETTERS
// ============================================================================

/**
 * Set the pending roll request
 * @param {Object|null} value - The roll request to set
 */
export function setPendingRollRequest(value) {
  pendingRollRequest = value;
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
 * Set the active resolver
 * @param {Object|null} value - The RollResolver to set
 */
export function setActiveResolver(value) {
  activeResolver = value;
}

/**
 * Set the resolver dice terms
 * @param {Array|null} value - Array of dice term info
 */
export function setResolverDiceTerms(value) {
  resolverDiceTerms = value;
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
  activeResolver = null;
  resolverDiceTerms = null;
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

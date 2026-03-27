/**
 * State Management Module - Dice Link Companion
 * Version 1.0.6.73 - Phase 2: Dependency Resolution
 * 
 * Centralizes all application state variables and provides clean getter/setter interfaces.
 * This module has zero dependencies beyond constants.js
 * 
 * State managed here:
 * - pendingRollRequest: Current roll dialog being processed
 * - currentPanelDialog: Currently open DLC panel
 * - hasRequestedThisSession: Session tracking for player requests
 * - pendingDiceEntry: Manual dice entry in progress
 * - diceEntryCancelled: Manual dice entry cancellation state
 * - mirroredDialog: Reference to intercepted native dialog
 * - collapsedSections: UI panel collapse state
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
 * Get collapsed sections state
 * @returns {Object} Current collapsed sections state
 */
export function getCollapsedSections() {
  return { ...collapsedSections };
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
 * @param {Object|null} value - The mirrored dialog to set
 */
export function setMirroredDialog(value) {
  mirroredDialog = value;
}

/**
 * Set collapsed sections state
 * @param {Object} value - The collapsed sections state
 */
export function setCollapsedSections(value) {
  collapsedSections = { ...value };
}

// ============================================================================
// COMPOUND OPERATIONS
// ============================================================================

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
  collapsedSections = { ...SETTING_DEFAULTS.collapsedSections };
}

/**
 * Reset only UI state (keep session state)
 * Used when panel refreshes
 */
export function resetUIState() {
  currentPanelDialog = null;
  pendingDiceEntry = null;
  diceEntryCancelled = false;
  collapsedSections = { ...SETTING_DEFAULTS.collapsedSections };
}

/**
 * Check if any pending operations exist
 * @returns {boolean} True if there are pending operations
 */
export function hasPendingOperations() {
  return pendingRollRequest !== null || pendingDiceEntry !== null;
}

/**
 * Settings Helpers Module - dice-link-companion
 * Version 1.0.6.99
 * 
 * Handles Foundry core permission management for manual rolls.
 * Extracted from main.mjs for cleaner module boundaries.
 */

import { ROLE_NAMES } from "./constants.js";

/**
 * Get current manual rolls permissions for each role
 * @returns {Object} Permission state for each role (1-4)
 */
export function getManualRollsPermissions() {
  try {
    const permissions = game.settings.get("core", "permissions") || {};
    const roles = permissions.MANUAL_ROLLS || [];
    return {
      1: roles.includes(1),
      2: roles.includes(2),
      3: roles.includes(3),
      4: true  // GM always has permission
    };
  } catch (e) {
    return { 1: false, 2: false, 3: false, 4: true };
  }
}

/**
 * Set manual rolls permission for a specific role
 * @param {number} role - Role ID (1-4)
 * @param {boolean} enabled - Whether to enable or disable
 * @returns {Promise<boolean>} Success status
 */
export async function setManualRollsPermission(role, enabled) {
  try {
    // Save current dice config before changing permissions (Foundry can reset it)
    let currentDiceConfig = null;
    if (enabled) {
      try {
        currentDiceConfig = game.settings.get("core", "diceConfiguration") || {};
      } catch (e) {}
    }
    
    const permissions = game.settings.get("core", "permissions") || {};
    let roles = permissions.MANUAL_ROLLS || [];
    roles = [...roles];
    
    if (enabled && !roles.includes(role)) {
      roles.push(role);
    } else if (!enabled && roles.includes(role)) {
      roles = roles.filter(r => r !== role);
    }
    
    roles.sort((a, b) => a - b);
    const newPermissions = { ...permissions, MANUAL_ROLLS: roles };
    await game.settings.set("core", "permissions", newPermissions);
    
    // Restore dice config if we saved it
    if (enabled && currentDiceConfig && Object.keys(currentDiceConfig).length > 0) {
      try {
        await game.settings.set("core", "diceConfiguration", currentDiceConfig);
      } catch (e) {}
    }
    
    return true;
  } catch (e) {
    ui.notifications.error(`Failed to update permission for ${ROLE_NAMES[role]}.`);
    return false;
  }
}

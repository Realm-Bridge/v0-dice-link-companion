/**
 * Dice Link Companion - Settings Module
 * Handles all game.settings registration
 */

export const MODULE_ID = "dice-link-companion";

/**
 * Register core settings during the "init" hook.
 * These settings are available immediately when Foundry loads.
 */
export function registerCoreSettings() {
  // Global override setting - controls whether all players are forced to a mode
  game.settings.register(MODULE_ID, "globalOverride", {
    scope: "world",
    config: false,
    type: String,
    default: "individual"
  });

  // Pending approval requests storage
  game.settings.register(MODULE_ID, "pendingRequests", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // UI collapsed sections state - persists across panel refreshes
  game.settings.register(MODULE_ID, "collapsedSections", {
    scope: "client",
    config: false,
    type: Object,
    default: {
      rollRequest: false,
      globalOverride: true,
      playerModes: true,
      permissions: true,
      videoFeed: true,
      pending: false,
      topRow: false
    }
  });
}

/**
 * Register per-user player mode settings during the "ready" hook.
 * This runs after users are loaded so we can iterate over them.
 */
export function registerPlayerModeSettings() {
  console.log("[v0] registerPlayerModeSettings called, users:", game.users?.size);
  for (const user of game.users) {
    const key = `playerMode_${user.id}`;
    const fullKey = `${MODULE_ID}.${key}`;
    console.log("[v0] Checking setting:", fullKey, "exists:", game.settings.settings.has(fullKey));
    if (!game.settings.settings.has(fullKey)) {
      try {
        game.settings.register(MODULE_ID, key, {
          scope: "world",
          config: false,
          type: String,
          default: "digital"
        });
        console.log("[v0] Registered setting:", fullKey);
      } catch (e) {
        console.error("[v0] Failed to register setting:", fullKey, e);
      }
    }
  }
  console.log("[v0] registerPlayerModeSettings complete");
}

/**
 * Get a setting value
 * @param {string} key - The setting key
 * @returns {*} The setting value
 */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Set a setting value
 * @param {string} key - The setting key
 * @param {*} value - The value to set
 */
export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/**
 * Get the current player's mode
 * @returns {string} "manual" or "digital"
 */
export function getPlayerMode(userId = game.user.id) {
  const key = `playerMode_${userId}`;
  // Check if setting exists before trying to get it
  if (!game.settings.settings.has(`${MODULE_ID}.${key}`)) {
    // Setting not registered yet, return default
    return "digital";
  }
  try {
    return getSetting(key) || "digital";
  } catch (e) {
    // Fallback if setting somehow fails
    return "digital";
  }
}

/**
 * Set a player's mode
 * @param {string} userId - The user ID
 * @param {string} mode - "manual" or "digital"
 */
export async function setPlayerMode(userId, mode) {
  return setSetting(`playerMode_${userId}`, mode);
}

/**
 * Get the global override setting
 * @returns {string} "individual", "forceAllManual", or "forceAllDigital"
 */
export function getGlobalOverride() {
  return getSetting("globalOverride");
}

/**
 * Set the global override
 * @param {string} value - The override value
 */
export async function setGlobalOverride(value) {
  return setSetting("globalOverride", value);
}

/**
 * Get pending approval requests
 * @returns {Array} Array of pending request objects
 */
export function getPendingRequests() {
  return getSetting("pendingRequests") || [];
}

/**
 * Set pending approval requests
 * @param {Array} requests - Array of pending request objects
 */
export async function setPendingRequests(requests) {
  return setSetting("pendingRequests", requests);
}

/**
 * Get collapsed sections state
 * @returns {Object} Current collapsed sections state
 */
export function getCollapsedSections() {
  const defaults = {
    rollRequest: false,
    globalOverride: true,
    playerModes: true,
    permissions: true,
    videoFeed: true,
    pending: false,
    topRow: false
  };
  
  try {
    const saved = getSetting("collapsedSections");
    if (!saved) return defaults;
    
    // Merge with defaults to ensure all keys exist
    return { ...defaults, ...saved };
  } catch (e) {
    // Setting not registered yet
    return defaults;
  }
}

/**
 * Set collapsed sections state
 * @param {Object} sections - The collapsed sections state
 */
export async function setCollapsedSections(sections) {
  return setSetting("collapsedSections", sections);
}

/**
 * Check if the current user is in manual dice mode.
 * Respects global overrides from the GM.
 * @returns {boolean} true if user should use manual dice
 */
export function isUserInManualMode() {
  const globalOverride = getGlobalOverride();
  if (globalOverride === "forceAllManual") return true;
  if (globalOverride === "forceAllDigital") return false;
  const myMode = getPlayerMode();
  return myMode === "manual";
}

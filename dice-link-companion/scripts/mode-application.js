/**
 * Mode Application Module - dice-link-companion
 * 
 * Handles applying manual/digital dice modes to the Foundry dice fulfillment system.
 * These functions control whether players use our custom panel UI or Foundry's digital dice.
 */

/**
 * Apply manual dice mode using our custom dice-link fulfillment method.
 * This routes all dice rolls through our panel UI for player input.
 */
async function applyManualDice() {
  // Use our custom "dice-link" fulfillment method instead of "manual"
  // This uses our DiceLinkResolver which shows our panel UI
  if (CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment.defaultMethod = "dice-link";
    if (CONFIG.Dice.fulfillment.dice) {
      CONFIG.Dice.fulfillment.dice.d4 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d6 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d8 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d10 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d12 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d20 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d100 = "dice-link";
    }
  }
  
  console.log("[Dice Link] Applied dice-link fulfillment method for manual mode");
}

/**
 * Apply digital dice mode - removes our custom fulfillment method.
 * Players will see Foundry's standard digital dice animation.
 */
async function applyDigitalDice() {
  // Remove our fulfillment method, restore digital dice
  if (CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment.defaultMethod = "";
    if (CONFIG.Dice.fulfillment.dice) {
      CONFIG.Dice.fulfillment.dice.d4 = "";
      CONFIG.Dice.fulfillment.dice.d6 = "";
      CONFIG.Dice.fulfillment.dice.d8 = "";
      CONFIG.Dice.fulfillment.dice.d10 = "";
      CONFIG.Dice.fulfillment.dice.d12 = "";
      CONFIG.Dice.fulfillment.dice.d20 = "";
      CONFIG.Dice.fulfillment.dice.d100 = "";
    }
  }
  
  // Also try to reset the user's core dice configuration setting
  // This is what Foundry's Configure Dice menu sets
  try {
    const diceConfig = game.settings.get("core", "diceConfiguration");
    if (diceConfig && typeof diceConfig === "object") {
      // Check if any dice are set to manual or dice-link
      let needsUpdate = false;
      const newConfig = {...diceConfig};
      for (const key of Object.keys(newConfig)) {
        if (newConfig[key] === "manual" || newConfig[key] === "dice-link") {
          newConfig[key] = "";
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        await game.settings.set("core", "diceConfiguration", newConfig);
        console.log("[Dice Link] Reset core diceConfiguration to digital");
      }
    }
  } catch (e) {
    // Setting may not exist or be inaccessible - that's OK
    console.log("[Dice Link] Could not reset core diceConfiguration:", e.message);
  }
  
  console.log("[Dice Link] Removed dice-link fulfillment, restored digital dice");
}

/**
 * Check if the current user is in manual dice mode.
 * Respects global overrides from the GM.
 * @returns {boolean} true if user should use manual dice
 */
function isUserInManualMode() {
  // This is defined in main.mjs but needs to be here for completeness
  // We'll use the helper functions from settings module
  // For now, this will be called from main.mjs where it has access to those functions
  const getGlobalOverride = window.diceLink?.getGlobalOverride;
  const getPlayerMode = window.diceLink?.getPlayerMode;
  
  if (!getGlobalOverride || !getPlayerMode) {
    console.warn("[Dice Link] isUserInManualMode: settings functions not available");
    return false;
  }
  
  const globalOverride = getGlobalOverride();
  if (globalOverride === "forceAllManual") return true;
  if (globalOverride === "forceAllDigital") return false;
  const myMode = getPlayerMode();
  return myMode === "manual";
}

export {
  applyManualDice,
  applyDigitalDice,
  isUserInManualMode
};

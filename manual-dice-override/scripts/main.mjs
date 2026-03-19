/**
 * Manual Dice Override Module for Foundry VTT v13
 * 
 * When activated: Overrides all dice to use manual input
 * When deactivated: Restores original digital roll settings
 */

const MODULE_ID = "manual-dice-override";

// Store original dice fulfillment settings
let originalFulfillmentSettings = null;
let originalDefaultMethod = null;

/**
 * Save the current dice fulfillment configuration
 */
function saveOriginalSettings() {
  if (originalFulfillmentSettings === null) {
    // Deep clone the current dice fulfillment settings
    originalFulfillmentSettings = foundry.utils.deepClone(CONFIG.Dice.fulfillment.dice);
    originalDefaultMethod = CONFIG.Dice.fulfillment.defaultMethod;
    
    console.log(`${MODULE_ID} | Saved original dice fulfillment settings`);
  }
}

/**
 * Override all dice to manual input
 */
function enableManualDice() {
  saveOriginalSettings();
  
  // Set the default method to manual
  CONFIG.Dice.fulfillment.defaultMethod = "manual";
  
  // Override each configured die type to manual
  const diceTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
  
  for (const die of diceTypes) {
    if (!CONFIG.Dice.fulfillment.dice[die]) {
      CONFIG.Dice.fulfillment.dice[die] = {};
    }
    CONFIG.Dice.fulfillment.dice[die].method = "manual";
  }
  
  // Also save to user settings for persistence across sessions
  const currentSettings = game.settings.get("core", "diceConfiguration") || {};
  const newSettings = foundry.utils.deepClone(currentSettings);
  
  for (const die of diceTypes) {
    if (!newSettings[die]) {
      newSettings[die] = {};
    }
    newSettings[die].method = "manual";
  }
  
  // Set default method in settings
  newSettings.defaultMethod = "manual";
  
  game.settings.set("core", "diceConfiguration", newSettings);
  
  console.log(`${MODULE_ID} | Manual dice input ENABLED for all dice types`);
  ui.notifications.info("Manual Dice Override: Manual input enabled for all dice");
}

/**
 * Restore original dice fulfillment settings (digital roll)
 */
function disableManualDice() {
  if (originalFulfillmentSettings === null) {
    // If no saved settings, set to digital (empty/default)
    CONFIG.Dice.fulfillment.defaultMethod = "";
    
    const diceTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
    for (const die of diceTypes) {
      if (CONFIG.Dice.fulfillment.dice[die]) {
        CONFIG.Dice.fulfillment.dice[die].method = "";
      }
    }
    
    // Clear the core settings
    game.settings.set("core", "diceConfiguration", {});
  } else {
    // Restore saved settings
    CONFIG.Dice.fulfillment.dice = foundry.utils.deepClone(originalFulfillmentSettings);
    CONFIG.Dice.fulfillment.defaultMethod = originalDefaultMethod || "";
    
    // Restore core settings
    const restoredSettings = foundry.utils.deepClone(originalFulfillmentSettings);
    restoredSettings.defaultMethod = originalDefaultMethod || "";
    game.settings.set("core", "diceConfiguration", restoredSettings);
  }
  
  console.log(`${MODULE_ID} | Manual dice input DISABLED - restored digital roll`);
  ui.notifications.info("Manual Dice Override: Restored to digital roll");
}

/**
 * Module initialization
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Manual Dice Override module`);
  
  // Register module setting for enable/disable toggle
  game.settings.register(MODULE_ID, "enabled", {
    name: "MANUAL_DICE_OVERRIDE.Settings.Enabled.Name",
    hint: "MANUAL_DICE_OVERRIDE.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      if (value) {
        enableManualDice();
      } else {
        disableManualDice();
      }
    }
  });
});

/**
 * Apply settings once the game is ready
 */
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module ready`);
  
  // Check if the module should be enabled
  const isEnabled = game.settings.get(MODULE_ID, "enabled");
  
  if (isEnabled) {
    enableManualDice();
  } else {
    console.log(`${MODULE_ID} | Module is disabled - using default dice settings`);
  }
});

/**
 * Handle module deactivation via Module Management
 * This hook fires when the user disables the module
 */
Hooks.once("closeModuleManagement", () => {
  // Check if our module is being disabled
  const activeModules = game.modules.filter(m => m.active);
  const isStillActive = activeModules.some(m => m.id === MODULE_ID);
  
  if (!isStillActive) {
    disableManualDice();
  }
});

// Export functions for external use if needed
globalThis.ManualDiceOverride = {
  enable: enableManualDice,
  disable: disableManualDice,
  isEnabled: () => game.settings.get(MODULE_ID, "enabled")
};

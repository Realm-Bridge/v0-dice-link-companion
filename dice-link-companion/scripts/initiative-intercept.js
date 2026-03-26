/**
 * Initiative Interception Module
 * Handles special case for initiative rolls which bypass the fulfillment system
 */

import { isUserInManualMode } from "./settings.js";

/**
 * Setup initiative interception
 * Initiative rolls bypass the fulfillment system, so we need special handling
 */
export function setupInitiativeInterception() {
  console.log("[Dice Link] Setting up initiative interception...");
  
  // Hook into dnd5e's POST-roll initiative hook
  // This fires AFTER the initiative roll is made with random values
  // If in manual mode, we replace the roll results with user-entered values
  Hooks.on("dnd5e.rollInitiative", (roll, combatants) => {
    console.log("[Dice Link] dnd5e.rollInitiative hook fired");
    
    if (!isUserInManualMode()) {
      console.log("[Dice Link] Digital mode - keeping auto-rolled initiative");
      return true;
    }
    
    console.log("[Dice Link] Manual mode - will prompt for manual initiative after dialog closes");
    // Mark these combatants so we can intercept their updates
    combatants.forEach(c => c._needsManualInitiative = true);
  });
  
  // For manual initiative, we use the combatant update hook
  // After initiative is rolled, we can detect it and prompt for correction
  Hooks.on("updateCombatant", async (combatant, changes, options, userId) => {
    if (changes.initiative !== undefined && userId === game.user.id && combatant._needsManualInitiative) {
      console.log("[Dice Link] Combatant initiative updated:", combatant.name, "to", changes.initiative);
      
      if (isUserInManualMode() && !combatant._manualInitiativeSet) {
        console.log("[Dice Link] Manual mode - prompting for manual initiative entry");
        combatant._needsManualInitiative = false;
        combatant._manualInitiativeSet = true;
        
        // Show a prompt to allow manual entry
        await promptManualInitiative(combatant, changes.initiative);
      }
    }
  });
}

/**
 * Prompt user to enter manual initiative value
 * Requires access to global state: pendingRollRequest, collapsedSections
 * Requires callback: refreshPanel()
 */
async function promptManualInitiative(combatant, autoRolledValue) {
  // Get the necessary functions from global namespace
  const refreshPanel = window.diceLink?.refreshPanel;
  
  if (!refreshPanel) {
    console.error("[Dice Link] refreshPanel not available for initiative prompt");
    return;
  }
  
  // We need to set pendingRollRequest in main.mjs's scope
  // This is a limitation of the current module structure
  // For now, use a temporary flag that main.mjs can check
  window.diceLink._pendingInitiativePrompt = {
    combatant,
    autoRolledValue
  };
  
  // Show our dice entry UI for initiative
  return new Promise((resolve) => {
    // This will be intercepted by main.mjs which has access to pendingRollRequest
    // and can properly set it up with all the needed callbacks
    window.diceLink._initiativeResolver = resolve;
  });
}

export { promptManualInitiative };

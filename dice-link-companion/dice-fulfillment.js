/**
 * Dice Fulfillment Module - dice-link-companion
 * Version 1.0.7.0
 * 
 * Handles Foundry VTT dice fulfillment integration using a custom RollResolver.
 * Uses Foundry's _evaluateModifiers() and term.total for ALL dice modifiers.
 * 
 * v1.0.7.0 - MAJOR CHANGE: Switched from handler to resolver approach
 *            This allows showing ALL dice at once instead of one-at-a-time.
 */

import { ASYNC_OPERATION_DELAY_MS } from "./constants.js";
import { debugResolver, debugResolverState, debugFulfillment, debugError } from "./debug.js";
import {
  getPendingRollRequest,
  setPendingRollRequest,
  getPendingDiceEntry,
  setPendingDiceEntry,
  getDiceEntryCancelled,
  setDiceEntryCancelled,
  getMirroredDialog,
  getActiveResolver,
  getResolverDiceTerms
} from "./state-management.js";
import {
  getCollapsedSections,
  setCollapsedSections
} from "./settings.js";
import { refreshPanel } from "./dice-panel.js";
import { DiceLinkResolver } from "./roll-resolver.js";

// ============================================================================
// DICE FULFILLMENT SETUP
// ============================================================================

/**
 * Setup the Dice Link fulfillment method.
 * Instead of using a resolver, we hook directly into Roll.awaitFulfillment() 
 * to intercept manual rolls and show our panel UI.
 */
export function setupDiceFulfillment() {
  debugResolverState("setup_fulfillment_starting", {});
  
  // Hook into Roll.awaitFulfillment to intercept manual fulfillment
  const originalAwaitFulfillment = Roll.prototype.awaitFulfillment;
  
  Roll.prototype.awaitFulfillment = async function() {
    debugFulfillment("Roll.awaitFulfillment called, checking fulfillment method");
    
    // Check if user has manual fulfillment enabled
    const fulfillmentMethod = CONFIG.Dice.fulfillment.defaultMethod;
    debugFulfillment("Current fulfillment method:", fulfillmentMethod);
    
    // If it's our method, use our custom panel UI
    if (fulfillmentMethod === "dice-link") {
      return diceLinkAwaitFulfillment.call(this);
    }
    
    // Otherwise use Foundry's default
    return originalAwaitFulfillment.call(this);
  };
  
  debugResolverState("setup_fulfillment_complete", { fulfillmentHooked: true });
}

/**
 * Custom fulfillment flow that shows all dice in our panel
 */
async function diceLinkAwaitFulfillment() {
  debugFulfillment("diceLinkAwaitFulfillment called");
  
  // Check if there are any unfulfilled dice
  if (this.fulfillable.size === 0) {
    debugFulfillment("No unfulfilled dice, returning");
    return;
  }
  
  // Build array of all dice that need values
  const diceNeeded = [];
  const termMap = new Map(); // Track term id -> term for later registration
  
  for (const [id, {term, method}] of this.fulfillable) {
    debugResolver("Processing term:", { termId: id, type: term.type, faces: term.faces, number: term.number });
    
    if (term.faces) {
      const count = term.number || 1;
      for (let i = 0; i < count; i++) {
        diceNeeded.push({
          termId: id,
          term: term,
          type: `d${term.faces}`,
          faces: term.faces,
          index: i,
          count: count
        });
      }
      if (!termMap.has(id)) {
        termMap.set(id, term);
      }
    }
  }
  
  debugResolverState("dice_array_built", { totalDice: diceNeeded.length });
  
  if (diceNeeded.length === 0) {
    debugResolver("No dice to resolve");
    return;
  }
  
  // Store the dice and roll reference in state for the panel to access
  setResolverDiceTerms(diceNeeded);
  setActiveResolver({ 
    roll: this, 
    termMap,
    submitResults: async (values) => {
      debugFulfillment("Submitting dice results:", values);
      
      // Group values by term
      const termValues = new Map();
      for (let i = 0; i < diceNeeded.length; i++) {
        const dieInfo = diceNeeded[i];
        const value = values[i];
        
        if (!termValues.has(dieInfo.termId)) {
          termValues.set(dieInfo.termId, []);
        }
        termValues.get(dieInfo.termId).push(value);
      }
      
      // Inject values into the roll's dice terms
      for (const [termId, dieValues] of termValues) {
        const term = termMap.get(termId);
        if (term && term.faces) {
          debugResolver("Setting results for term:", { termId, values: dieValues });
          
          // Set results on the term
          term.results = dieValues.map(val => ({
            result: val,
            active: true
          }));
          
          // Mark as evaluated
          term._evaluated = true;
          
          // Apply modifiers if any
          if (term.modifiers?.length > 0 && typeof term._evaluateModifiers === "function") {
            term._evaluateModifiers();
          }
        }
      }
      
      // Mark the roll as evaluated
      this._evaluated = true;
      
      debugFulfillment("Roll fulfillment complete");
    }
  });
  
  // Expand roll request section in panel
  const currentCollapsed = getCollapsedSections();
  currentCollapsed.rollRequest = false;
  setCollapsedSections(currentCollapsed);
  refreshPanel();
  
  // Wait for panel to submit results
  return new Promise((resolve, reject) => {
    // Store the resolve callback so the panel can call it when user submits
    const pendingEntry = {
      resolve,
      reject,
      diceNeeded
    };
    
    // Store in a global to be accessible from panel
    window.diceLinkPendingEntry = pendingEntry;
    
    // Set timeout for cancellation
    const timeout = setTimeout(() => {
      reject(new Error("Roll fulfillment timeout"));
    }, 300000); // 5 minute timeout
    
    // Override resolve to clear timeout
    const originalResolve = resolve;
    const wrappedResolve = () => {
      clearTimeout(timeout);
      originalResolve();
    };
    
    window.diceLinkPendingEntry.resolve = wrappedResolve;
  });
}

// ============================================================================
// DICE TRAY ROLL - Uses Foundry's Native Fulfillment System
// ============================================================================

/**
 * Execute a dice tray roll using Foundry's native fulfillment system.
 * When user is in manual mode, Foundry will use our DiceLinkResolver.
 * 
 * v1.0.7.3 - Simplified to use Foundry's native Roll.evaluate()
 *            Our resolver handles showing all dice at once in our panel
 */
export async function executeDiceTrayRollManually(formula, flavorText, html) {
  debugFulfillment("executeDiceTrayRollManually called with formula:", formula);
  
  try {
    // Create and evaluate the roll - Foundry handles fulfillment via our resolver
    const roll = new Roll(formula);
    
    debugFulfillment("Roll created, calling evaluate()");
    debugFulfillment("CONFIG.Dice.fulfillment:", CONFIG.Dice.fulfillment);
    debugFulfillment("CONFIG.Dice.fulfillment.methods:", CONFIG.Dice.fulfillment.methods);
    debugFulfillment("CONFIG.Dice.fulfillment.methods['dice-link']:", CONFIG.Dice.fulfillment.methods["dice-link"]);
    debugFulfillment("CONFIG.Dice.fulfillment.dice.d20:", CONFIG.Dice.fulfillment.dice.d20);
    debugFulfillment("CONFIG.Dice.fulfillment.defaultMethod:", CONFIG.Dice.fulfillment.defaultMethod);
    debugFulfillment("Roll.RESOLVERS:", Roll.RESOLVERS);
    
    // evaluate() will trigger Foundry's fulfillment system
    // If user is in manual mode, our DiceLinkResolver should be used
    await roll.evaluate();
    
    debugFulfillment("Roll evaluated, total:", roll.total);
    
    // Send to chat
    await roll.toMessage({ 
      speaker: ChatMessage.getSpeaker(), 
      flavor: flavorText 
    });
    
    return "success";
  } catch (e) {
    debugError("Roll error:", e.message);
    if (e.message.includes("cancelled")) {
      return "cancelled";
    }
    throw e;
  }
}

// ============================================================================
// MIRRORED DIALOG SUBMISSION
// ============================================================================

/**
 * Apply user choices to the mirrored dialog and submit it
 */
export async function submitMirroredDialog(userChoice) {
  const dialogRef = getMirroredDialog();
  if (!dialogRef) {
    debugError("No mirrored dialog to submit");
    return;
  }
  
  const { app, html, data: formData } = dialogRef;
  
  // Normalize html to a DOM element
  let element;
  if (html instanceof jQuery) {
    element = html[0];
  } else if (html?.element) {
    element = html.element;
  } else if (html instanceof HTMLElement) {
    element = html;
  } else {
    element = formData.element;
  }
  
  if (!element) {
    debugError("Could not find dialog element to submit");
    return;
  }
  
  try {
    // Apply user choices to form inputs in the hidden dialog
    if (userChoice.formValues) {
      for (const [name, value] of Object.entries(userChoice.formValues)) {
        const input = element.querySelector(`input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`);
        if (input) {
          if (input.type === "checkbox") {
            input.checked = value;
          } else {
            input.value = value;
          }
          // Trigger change event for form validation
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    
    // Find the button that matches the user's choice
    // userChoice.buttonLabel contains the label they clicked (e.g., "Advantage", "Normal", "Disadvantage")
    let targetButton = null;
    
    if (userChoice.buttonLabel) {
      // Find button with matching label
      targetButton = formData.buttons.find(btn => 
        btn.label.toLowerCase().trim() === userChoice.buttonLabel.toLowerCase().trim()
      );
    }
    
    // Fallback: try to find any submit-like button
    if (!targetButton) {
      targetButton = formData.buttons.find(btn => 
        btn.label.toLowerCase().includes("ok") || 
        btn.label.toLowerCase().includes("roll") ||
        btn.label.toLowerCase().includes("submit") ||
        btn.label.toLowerCase().includes("normal")
      );
    }
    
    if (targetButton?.element) {

      // Make dialog visible temporarily so click works
      element.style.display = "block";
      
      // Click the button
      targetButton.element.click();
      
      // Small delay to let the click process
      await new Promise(resolve => setTimeout(resolve, ASYNC_OPERATION_DELAY_MS));
      
      // The dialog should close itself after the button click
      // But hide it just in case
      if (element.style.display !== "none") {
        element.style.display = "none";
      }
    } else {
      debugError("Could not find target button:", userChoice.buttonLabel);
    }
  } catch (e) {
    debugError("Error submitting mirrored dialog:", e);
  }
}

// ============================================================================
// FULFILLMENT MODE APPLICATION
// ============================================================================

/**
 * Apply Dice Link fulfillment to all dice for manual mode users.
 * Called when user is set to manual mode.
 */
export function applyDiceLinkFulfillment() {
  // Dynamically get available dice types from Foundry's configuration
  // This adapts to any custom dice Foundry supports (d4, d6, d8, d10, d12, d20, d100, etc.)
  const diceTypes = Object.keys(CONFIG.Dice.terms).filter(term => {
    // Filter to only dice terms (matches d4, d6, d8, d10, etc.)
    return /^d\d+$/.test(term) && CONFIG.Dice.terms[term];
  });
  
  for (const die of diceTypes) {
    CONFIG.Dice.fulfillment.dice[die] = "dice-link";
  }
  
  CONFIG.Dice.fulfillment.defaultMethod = "dice-link";
  debugResolverState("apply_dice_link_fulfillment", { diceTypesCount: diceTypes.length });
}

/**
 * Remove Dice Link fulfillment from all dice (return to digital).
 * Called when user switches to digital mode.
 */
export function removeDiceLinkFulfillment() {
  // Remove our fulfillment method from all dice
  const diceTypes = Object.keys(CONFIG.Dice.terms).filter(term => {
    return /^d\d+$/.test(term) && CONFIG.Dice.terms[term];
  });
  
  for (const die of diceTypes) {
    delete CONFIG.Dice.fulfillment.dice[die];
  }
  
  CONFIG.Dice.fulfillment.defaultMethod = "";
  debugResolverState("remove_dice_link_fulfillment", { diceTypesCount: diceTypes.length });
}

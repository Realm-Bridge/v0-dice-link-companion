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
 * Registers our custom resolver with Foundry's dice system.
 * Using interactive: true with a resolver shows ALL dice at once.
 */
export function setupDiceFulfillment() {
  debugResolverState("setup_fulfillment_starting", {});
  
  // Create a callback handler for resolver state changes
  const onResolverStateChange = (state) => {
    debugResolverState("resolver_state_change", { state });
    // When resolver is ready or complete, refresh the panel
    if (state === 'resolver_ready' || state === 'resolver_complete' || state === 'resolver_cancelled') {
      refreshPanel();
    }
  };
  
  // Register our custom fulfillment method with a resolver class
  // Using interactive: true with resolver ensures we get ALL dice at once
  CONFIG.Dice.fulfillment.methods["dice-link"] = {
    label: "Dice Link Companion",
    icon: "fa-dice-d20",
    interactive: true,
    resolver: DiceLinkResolver,
    resolverOptions: {
      onStateChange: onResolverStateChange
    }
  };
  
  debugResolverState("setup_fulfillment_complete", { methodRegistered: true });
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

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
import { debugResolver, debugResolverState } from "./debug.js";
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
// DICE TRAY MANUAL ROLL
// ============================================================================

/**
 * Execute a dice tray roll manually - collect ALL values at once BEFORE rolling
 * Returns "cancelled" if user cancels, otherwise completes the roll
 * 
 * v1.0.7.2 - Fixed to show ALL dice at once instead of one-at-a-time
 */
export async function executeDiceTrayRollManually(formula, flavorText, html) {
  // Parse the formula to find dice terms
  const roll = new Roll(formula);
  
  // We need to identify all dice in the formula and collect manual values
  // Parse dice patterns like 2d20kh, 1d6, 3d8, etc.
  const dicePattern = /(\d*)d(\d+)(kh\d*|kl\d*)?/gi;
  const diceTerms = [];
  let match;
  
  while ((match = dicePattern.exec(formula)) !== null) {
    const count = parseInt(match[1]) || 1;
    const faces = parseInt(match[2]);
    const modifier = match[3] || ""; // kh, kl, etc.
    diceTerms.push({ count, faces, modifier, fullMatch: match[0] });
  }
  
  if (diceTerms.length === 0) {
    // No dice in formula, just evaluate as-is (probably just modifiers)
    await roll.evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker(), flavor: flavorText });
    return "success";
  }
  
  // Build array of ALL dice needed for entry at once
  const allDiceNeeded = [];
  let dieIndex = 0;
  for (const term of diceTerms) {
    for (let i = 0; i < term.count; i++) {
      allDiceNeeded.push({
        type: `d${term.faces}`,
        faces: term.faces,
        index: dieIndex,
        termIndex: diceTerms.indexOf(term),
        dieInTerm: i
      });
      dieIndex++;
    }
  }
  
  // Reset cancellation flag
  setDiceEntryCancelled(false);
  
  // Collect ALL values at once
  const allValues = await waitForAllDiceTrayEntries(allDiceNeeded);
  
  if (allValues === null || getDiceEntryCancelled()) {
    return "cancelled";
  }
  
  // Group values by term for injection
  const collectedValues = [];
  let valueIdx = 0;
  for (const term of diceTerms) {
    const termValues = [];
    for (let i = 0; i < term.count; i++) {
      termValues.push(allValues[valueIdx]);
      valueIdx++;
    }
    collectedValues.push({ term, values: termValues });
  }
  
  // Create the roll with the original formula, then inject our values
  const finalRoll = new Roll(formula);
  
  // Parse the roll to get the terms
  finalRoll.terms; // This triggers term parsing
  
  // Now inject our collected values into the dice terms
  let termValueIndex = 0;
  for (const term of finalRoll.terms) {
    if (term.faces) { // It's a dice term
      // Find the matching collected values
      const collected = collectedValues[termValueIndex];
      if (collected) {
        // Set the results on this term
        term.results = collected.values.map((val, idx) => ({
          result: val,
          active: true
        }));
        
        // Mark the term as evaluated so its total getter works
        term._evaluated = true;
        
        // Use Foundry's _evaluateModifiers() to handle ALL modifiers (kh, kl, dh, dl, r, x, cs, etc.)
        // This ensures we support all Foundry dice notation without maintaining our own modifier logic
        if (term.modifiers?.length > 0 && typeof term._evaluateModifiers === "function") {
          term._evaluateModifiers();
        }
        
        termValueIndex++;
      }
    }
  }
  
  // Mark the Roll as evaluated
  finalRoll._evaluated = true;
  
  // Calculate total - use each term's total property which handles all modifier types correctly
  let total = 0;
  for (const term of finalRoll.terms) {
    if (term.faces && term.results) {
      // term.total handles counting modifiers (cs, cf) and keep/drop (kh, kl, dh, dl) correctly
      total += term.total;
    } else if (term.number !== undefined) {
      // Numeric term (modifier like +5)
      total += term.number;
    } else if (term.operator === "-") {
      // Subtraction operator - negate the next numeric term
      // This is handled by the NumericTerm having a negative number
    }
  }
  finalRoll._total = total;
  
  // Send to chat
  await finalRoll.toMessage({ 
    speaker: ChatMessage.getSpeaker(), 
    flavor: flavorText 
  });
  
  return "success";
}

/**
 * Wait for ALL dice tray entries at once - shows all dice inputs simultaneously
 * Returns array of values or null if cancelled
 */
async function waitForAllDiceTrayEntries(allDiceNeeded) {
  if (getDiceEntryCancelled()) {
    return null;
  }
  
  return new Promise((resolve) => {
    // Store resolver so panel can call it when user submits ALL values
    setPendingDiceEntry({
      allDiceNeeded,
      resolve,
      isDiceTray: true,
      isMultipleDice: true
    });
    
    // Show dice entry UI with ALL dice at once
    setPendingRollRequest({
      title: "Enter Dice Results",
      subtitle: `${allDiceNeeded.length} dice to enter`,
      isFulfillment: true,
      isDiceTray: true,
      isAllAtOnce: true,
      step: "diceEntry",
      diceNeeded: allDiceNeeded,
      onComplete: (values) => {
        if (Array.isArray(values) && values.length === allDiceNeeded.length) {
          const numericValues = values.map(v => parseInt(v));
          setPendingDiceEntry(null);
          setPendingRollRequest(null);
          refreshPanel();
          resolve(numericValues);
        }
      },
      onCancel: () => {
        setPendingDiceEntry(null);
        setPendingRollRequest(null);
        refreshPanel();
        resolve(null);
      }
    });
    
    const currentCollapsed = getCollapsedSections();
    currentCollapsed.rollRequest = false;
    setCollapsedSections(currentCollapsed);
    refreshPanel();
  });
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
    console.error("[Dice Link] No mirrored dialog to submit");
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
    console.error("[Dice Link] Could not find dialog element to submit");
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
      console.error("[Dice Link] Could not find target button:", userChoice.buttonLabel);
    }
  } catch (e) {
    console.error("[Dice Link] Error submitting mirrored dialog:", e);
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

/**
 * Dice Fulfillment Module - dice-link-companion
 * Version 1.0.6.109
 * 
 * Handles Foundry VTT dice fulfillment integration and manual dice entry.
 * This module registers our custom fulfillment method and manages the dice entry workflow.
 * Uses Foundry's _evaluateModifiers() and term.total for ALL dice modifiers including count successes.
 */

import { ASYNC_OPERATION_DELAY_MS } from "./constants.js";
import { debug } from "./debug.js";
import {
  getPendingRollRequest,
  setPendingRollRequest,
  getPendingDiceEntry,
  setPendingDiceEntry,
  getDiceEntryCancelled,
  setDiceEntryCancelled,
  getMirroredDialog
} from "./state-management.js";
import {
  getCollapsedSections,
  setCollapsedSections
} from "./settings.js";
import { refreshPanel } from "./dice-panel.js";

debug("dice-fulfillment.js: All imports complete");

// ============================================================================
// DICE FULFILLMENT SETUP
// ============================================================================

/**
 * Setup the Dice Link fulfillment method.
 * Registers our custom method with Foundry's dice system.
 * We use a non-interactive handler that waits for our panel UI.
 */
export function setupDiceFulfillment() {
  // Register our custom fulfillment method with a handler function
  // Using a handler (non-interactive) instead of a resolver ensures we control the UI
  CONFIG.Dice.fulfillment.methods["dice-link"] = {
    label: "Dice Link Companion",
    icon: "fa-dice-d20",
    interactive: false,
    handler: diceLinkFulfillmentHandler
  };
  debug("setupDiceFulfillment: Registered dice-link fulfillment method");
}

/**
 * Handler function for dice-link fulfillment.
 * According to Foundry's API, this is called ONCE PER DIE, not once per term.
 * For 2d20kh, it will be called twice - once for each d20.
 * We return a single number each time.
 */
export async function diceLinkFulfillmentHandler(term, index) {
  // Get the denomination (d4, d6, d8, d10, d12, d20, d100)
  const faces = term.faces;
  const denomination = `d${faces}`;
  const count = term.number || 1;
  
  // Index tells us which die in the term we're fulfilling (0-based)
  // Make sure index is a number - sometimes Foundry passes an object or other type
  let dieIndex = 0;
  if (typeof index === "number") {
    dieIndex = index;
  } else if (typeof index === "object" && index !== null && typeof index.index === "number") {
    dieIndex = index.index;
  }
  const dieNumber = dieIndex + 1;
  
  // Reset cancellation flag on first die of a new roll
  if (dieNumber === 1) {
    setDiceEntryCancelled(false);
  }
  
  // Wait for user to enter this single die result
  const result = await waitForDiceResult(denomination, faces, dieNumber, count);
  
  // Handle null result (cancelled) - throw error to abort the roll
  if (result === null) {
    throw new Error("Roll cancelled by user");
  }
  
  return result;
}

// ============================================================================
// DICE ENTRY UI
// ============================================================================

/**
 * Wait for user to enter a die result via our panel UI.
 */
async function waitForDiceResult(denomination, faces, dieNumber, totalDice) {
  // Check if entry was cancelled (from a previous die in the same roll)
  if (getDiceEntryCancelled()) {
    return null; // Return null to trigger abort
  }
  
  return new Promise((resolve) => {
    // Store the resolver so our panel can call it when user enters a value
    setPendingDiceEntry({
      denomination,
      faces,
      dieNumber,
      totalDice,
      resolve
    });
    
    // Update our panel to show dice entry UI
    showDiceEntryUI(denomination, faces, dieNumber, totalDice);
  });
}

/**
 * Show the dice entry UI in our panel
 */
function showDiceEntryUI(denomination, faces, dieNumber, totalDice) {
  // Set up a pending roll request for dice entry
  setPendingRollRequest({
    title: `Enter ${denomination} Result`,
    subtitle: `Die ${dieNumber} of ${totalDice}`,
    isFulfillment: true,
    step: "diceEntry",
    diceNeeded: [{
      type: denomination,
      faces: faces,
      index: dieNumber - 1,
      count: 1
    }],
    onComplete: (values) => {
      const currentDiceEntry = getPendingDiceEntry();
      if (currentDiceEntry && Array.isArray(values) && values.length > 0) {
        const numericValue = parseInt(values[0]);
        currentDiceEntry.resolve(numericValue);
        setPendingDiceEntry(null);
        setPendingRollRequest(null);
        refreshPanel();
      }
    }
  });
  
  // Expand roll request section and refresh panel
  const currentCollapsed = getCollapsedSections();
  currentCollapsed.rollRequest = false;
  setCollapsedSections(currentCollapsed);
  refreshPanel();
}

// ============================================================================
// DICE TRAY MANUAL ROLL
// ============================================================================

/**
 * Execute a dice tray roll manually - collect values BEFORE rolling
 * Returns "cancelled" if user cancels, otherwise completes the roll
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
  
  // Collect values for all dice
  const collectedValues = [];
  let totalDice = diceTerms.reduce((sum, t) => sum + t.count, 0);
  let currentDie = 0;
  
  // Reset cancellation flag
  setDiceEntryCancelled(false);
  
  for (const term of diceTerms) {
    const termValues = [];
    for (let i = 0; i < term.count; i++) {
      currentDie++;
      
      if (getDiceEntryCancelled()) {
        return "cancelled";
      }
      
      const value = await waitForDiceTrayEntry(`d${term.faces}`, term.faces, currentDie, totalDice);
      
      if (value === null || getDiceEntryCancelled()) {
        return "cancelled";
      }
      
      termValues.push(value);
    }
    collectedValues.push({ term, values: termValues });
  }
  
  // Create the roll with the original formula, then inject our values
  const finalRoll = new Roll(formula);
  
  // Parse the roll to get the terms
  finalRoll.terms; // This triggers term parsing
  
  // Now inject our collected values into the dice terms
  let valueIndex = 0;
  for (const term of finalRoll.terms) {
    if (term.faces) { // It's a dice term
      // Find the matching collected values
      const collected = collectedValues[valueIndex];
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
        
        valueIndex++;
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
 * Wait for dice tray manual entry (similar to waitForDiceResult but for dice tray)
 */
async function waitForDiceTrayEntry(denomination, faces, dieNumber, totalDice) {
  if (getDiceEntryCancelled()) {
    return null;
  }
  
  return new Promise((resolve) => {
    setPendingDiceEntry({
      denomination,
      faces,
      dieNumber,
      totalDice,
      resolve,
      isDiceTray: true
    });
    
    // Show dice entry UI
    setPendingRollRequest({
      title: `Enter ${denomination} Result`,
      subtitle: `Die ${dieNumber} of ${totalDice}`,
      isFulfillment: true,
      isDiceTray: true,
      step: "diceEntry",
      diceNeeded: [{
        type: denomination,
        faces: faces,
        index: dieNumber - 1,
        count: 1
      }],
      onComplete: (values) => {
        if (Array.isArray(values) && values.length > 0) {
          const numericValue = parseInt(values[0]);
          setPendingDiceEntry(null);
          setPendingRollRequest(null);
          window.diceLink?.refreshPanel?.();
          resolve(numericValue);
        }
      }
    });
    
    const currentCollapsed = getCollapsedSections();
    currentCollapsed.rollRequest = false;
    setCollapsedSections(currentCollapsed);
    window.diceLink?.refreshPanel?.();
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
  debug("applyDiceLinkFulfillment: Applied dice-link fulfillment to all dice");
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
  debug("removeDiceLinkFulfillment: Removed dice-link fulfillment from all dice");
}

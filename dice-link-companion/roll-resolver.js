/**
 * Roll Resolver Module - dice-link-companion
 * Version 1.0.7.0
 * 
 * Custom RollResolver that extends Foundry's RollResolver to show ALL dice at once
 * in our panel UI, rather than one-at-a-time with individual dialogs.
 * 
 * Key differences from handler approach:
 * - Receives ALL unfulfilled dice terms at once via this.fulfillable
 * - Shows our custom UI in the DLC panel with all dice inputs
 * - Submits all values together when user clicks Submit
 */

import { debug } from "./debug.js";
import {
  setActiveResolver,
  getActiveResolver,
  setResolverDiceTerms,
  getResolverDiceTerms
} from "./state-management.js";
import {
  getCollapsedSections,
  setCollapsedSections
} from "./settings.js";

// Use window.diceLink.refreshPanel to avoid circular dependency with dice-panel.js
function refreshPanel() {
  if (window.diceLink?.refreshPanel) {
    window.diceLink.refreshPanel();
  }
}

/**
 * Custom RollResolver that integrates with our panel UI
 * Instead of showing Foundry's default manual entry dialog, we show
 * dice inputs in our panel and let users enter all values at once.
 */
export class DiceLinkResolver extends foundry.applications.dice.RollResolver {
  
  /** @override */
  static DEFAULT_OPTIONS = {
    ...foundry.applications.dice.RollResolver.DEFAULT_OPTIONS,
    id: "dice-link-resolver",
    window: {
      title: "Dice Link Resolver"
    }
  };

  constructor(roll, options = {}) {
    super(roll, options);
    console.log("[v0] DiceLinkResolver constructor called with roll:", roll);
  }

  /**
   * Override awaitFulfillment to use our panel UI instead of Foundry's dialog
   * @override
   */
  async awaitFulfillment() {
    console.log("[v0] DiceLinkResolver.awaitFulfillment called");
    console.log("[v0] this.fulfillable:", this.fulfillable);
    
    // Build array of all dice that need values
    const diceNeeded = [];
    
    // fulfillable is a Map of term id -> {term, method}
    for (const [id, {term, method}] of this.fulfillable) {
      console.log("[v0] Processing term:", term, "method:", method);
      
      // Only process dice terms with faces
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
      }
    }
    
    console.log("[v0] diceNeeded array:", diceNeeded);
    
    if (diceNeeded.length === 0) {
      console.log("[v0] No dice needed, returning");
      return;
    }
    
    // Store resolver reference and dice terms in state
    setActiveResolver(this);
    setResolverDiceTerms(diceNeeded);
    
    // Expand roll request section and refresh panel to show dice inputs
    const currentCollapsed = getCollapsedSections();
    currentCollapsed.rollRequest = false;
    setCollapsedSections(currentCollapsed);
    refreshPanel();
    
    // Wait for user to submit values via panel
    return new Promise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
      console.log("[v0] Waiting for user to submit dice values...");
    });
  }

  /**
   * Called by dice-panel.js when user clicks Submit
   * Applies all user-entered values to the dice terms
   */
  submitResults(values) {
    console.log("[v0] DiceLinkResolver.submitResults called with values:", values);
    
    const diceTerms = getResolverDiceTerms();
    if (!diceTerms || diceTerms.length !== values.length) {
      console.error("[v0] Mismatch between dice terms and values");
      this._rejectPromise?.(new Error("Value count mismatch"));
      return;
    }
    
    // Group values by term
    const termValues = new Map();
    for (let i = 0; i < diceTerms.length; i++) {
      const dieInfo = diceTerms[i];
      const value = values[i];
      
      if (!termValues.has(dieInfo.termId)) {
        termValues.set(dieInfo.termId, []);
      }
      termValues.get(dieInfo.termId).push(value);
    }
    
    // Register results with Foundry's Roll system
    for (const [termId, dieValues] of termValues) {
      console.log("[v0] Registering result for termId:", termId, "values:", dieValues);
      
      // Use Roll.registerResult to fulfill the dice
      // This is the Foundry-native way to submit manual dice results
      try {
        foundry.dice.Roll.registerResult(termId, dieValues);
      } catch (e) {
        console.error("[v0] Error registering result:", e);
      }
    }
    
    // Clear state
    setActiveResolver(null);
    setResolverDiceTerms(null);
    refreshPanel();
    
    // Resolve the promise to complete the roll
    this._resolvePromise?.();
  }

  /**
   * Called when user cancels the roll
   */
  cancel() {
    console.log("[v0] DiceLinkResolver.cancel called");
    
    setActiveResolver(null);
    setResolverDiceTerms(null);
    refreshPanel();
    
    this._rejectPromise?.(new Error("Roll cancelled by user"));
  }

  /**
   * Override render to NOT show Foundry's dialog - we use our panel instead
   * @override
   */
  async _renderHTML(context, options) {
    console.log("[v0] DiceLinkResolver._renderHTML called - returning empty (using panel UI)");
    // Return empty - we don't want Foundry's dialog, we use our panel
    const wrapper = document.createElement("div");
    wrapper.style.display = "none";
    return wrapper;
  }
}

/**
 * Get the DiceLinkResolver class for registration
 */
export function getDiceLinkResolverClass() {
  return DiceLinkResolver;
}

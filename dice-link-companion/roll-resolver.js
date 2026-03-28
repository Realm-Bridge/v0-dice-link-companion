/**
 * Roll Resolver Module - dice-link-companion
 * Version 1.0.7.0
 * 
 * Custom RollResolver that extends Foundry's RollResolver to show ALL dice at once
 * in our panel UI, rather than one-at-a-time with individual dialogs.
 * 
 * Uses callback pattern for panel refresh to avoid circular dependencies.
 */

import { debugResolver, debugResolverState } from "./debug.js";
import {
  setActiveResolver,
  setResolverDiceTerms,
  getResolverDiceTerms
} from "./state-management.js";
import {
  getCollapsedSections,
  setCollapsedSections
} from "./settings.js";

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
    // Store callback for panel refresh - passed in via options to avoid circular dependency
    this.onStateChangeCallback = options.onStateChange || null;
    debugResolverState("created", { rolls: roll ? 1 : 0, hasCallback: !!this.onStateChangeCallback });
  }

  /**
   * Override awaitFulfillment to use our panel UI instead of Foundry's dialog
   * @override
   */
  async awaitFulfillment() {
    debugResolverState("awaitFulfillment_called", { fulfillableCount: this.fulfillable.size });
    
    // Build array of all dice that need values
    const diceNeeded = [];
    
    // fulfillable is a Map of term id -> {term, method}
    for (const [id, {term, method}] of this.fulfillable) {
      debugResolver("Processing term:", { termId: id, type: term.type, faces: term.faces, method });
      
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
    
    debugResolverState("dice_array_built", { totalDice: diceNeeded.length });
    
    if (diceNeeded.length === 0) {
      debugResolver("No dice needed - returning");
      return;
    }
    
    // Store resolver reference and dice terms in state
    setActiveResolver(this);
    setResolverDiceTerms(diceNeeded);
    
    // Expand roll request section
    const currentCollapsed = getCollapsedSections();
    currentCollapsed.rollRequest = false;
    setCollapsedSections(currentCollapsed);
    
    // Notify panel that resolver is ready - use callback instead of direct call
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('resolver_ready');
    }
    
    debugResolverState("waiting_for_user_input", {});
    
    // Wait for user to submit values via panel
    return new Promise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
    });
  }

  /**
   * Called by dice-panel.js when user clicks Submit
   * Applies all user-entered values to the dice terms
   */
  submitResults(values) {
    debugResolverState("submit_results", { valuesCount: values.length });
    
    const diceTerms = getResolverDiceTerms();
    if (!diceTerms || diceTerms.length !== values.length) {
      debugResolver("Error: Value count mismatch", { expected: diceTerms?.length, received: values.length });
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
      debugResolver("Registering results for term:", { termId, values: dieValues });
      
      // Use Roll.registerResult to fulfill the dice
      // This is the Foundry-native way to submit manual dice results
      try {
        foundry.dice.Roll.registerResult(termId, dieValues);
      } catch (e) {
        debugResolver("Error registering result:", e.message);
      }
    }
    
    // Clear state
    setActiveResolver(null);
    setResolverDiceTerms(null);
    
    // Notify panel that resolver is complete
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('resolver_complete');
    }
    
    debugResolverState("submission_successful", {});
    
    // Resolve the promise to complete the roll
    this._resolvePromise?.();
  }

  /**
   * Called when user cancels the roll
   */
  cancel() {
    debugResolverState("cancel_called", {});
    
    setActiveResolver(null);
    setResolverDiceTerms(null);
    
    // Notify panel that resolver was cancelled
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('resolver_cancelled');
    }
    
    this._rejectPromise?.(new Error("Roll cancelled by user"));
  }

  /**
   * Override render to NOT show Foundry's dialog - we use our panel instead
   * @override
   */
  async _renderHTML(context, options) {
    debugResolver("_renderHTML called - suppressing Foundry dialog");
    // Return empty - we don't want Foundry's dialog, we use our panel
    const wrapper = document.createElement("div");
    wrapper.style.display = "none";
    return wrapper;
  }
}

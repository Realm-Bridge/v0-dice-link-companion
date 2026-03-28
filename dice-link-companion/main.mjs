/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.6.92
 * 
 * A player-GM dice mode management system with dialog mirroring.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 * 
 * LAST KNOWN GOOD VERSION: 1.0.6.53 - Stable after failed UI extraction
 * 
 * v1.0.6.92 - Fixed: dice-panel.js import error (getPendingRequests from settings.js not state-management.js)
 * v1.0.6.91 - Phase 5 Step 5.1: Extracted dice-panel.js (panel listeners, refreshPanel, openPanel)
 * v1.0.6.89 - Phase 3 COMPLETE: Added state listener system (onMirroredDialogChange), removed window.diceLink coupling
 * v1.0.6.83 - Phase 3 IN PROGRESS: Created ui-templates.js, added import (generate functions removal deferred)
 * v1.0.6.82 - Phase 3 START: Extracted ui-templates.js with all 6 generate functions (615 lines)
 * v1.0.6.81 - Phase 2 COMPLETE: Fixed remaining pendingRollRequest button handler references
 * v1.0.6.76 - Fixed: Restored local state variables (state-management.js for external modules only)
 * v1.0.6.75 - Fixed: Resolved import conflicts after Phase 2 extraction
 * v1.0.6.74 - Phase 2: Extracted state-management.js for dependency resolution
 * v1.0.6.73 - Phase 1: Extracted constants.js and types.js for foundation setup
 * v1.0.6.72 - Optimized: Reduced async operation delays from 100ms to 40ms, unified into single constant
 * v1.0.6.71 - Fixed: Restored updatePanelWithMirroredDialog (was needed, not duplicate)
 * v1.0.6.70 - Removed duplicate dialog mirroring functions that were dead code (~289 lines)
 */

import { 
  MODULE_ID,
  ASYNC_OPERATION_DELAY_MS
} from "./constants.js";

import { 
  registerCoreSettings, 
  registerPlayerModeSettings,
  getSetting,
  setSetting,
  getPlayerMode,
  setPlayerMode,
  getGlobalOverride,
  setGlobalOverride,
  getPendingRequests,
  setPendingRequests,
  isUserInManualMode,
  getCollapsedSections,
  setCollapsedSections
} from "./settings.js";

import { 
  getPendingRollRequest,
  getHasRequestedThisSession,
  getCurrentPanelDialog,
  getPendingDiceEntry,
  getDiceEntryCancelled,
  getMirroredDialog,
  setPendingRollRequest,
  setHasRequestedThisSession,
  setCurrentPanelDialog,
  setPendingDiceEntry,
  setDiceEntryCancelled,
  setMirroredDialog,
  clearAllState,
  resetUIState,
  hasPendingOperations,
  onMirroredDialogChange
} from "./state-management.js";

import { 
  createApprovalChatMessage,
  setupChatButtonHandlers
} from "./approval.js";

import {
  setupSocketListeners,
  playerRequestManual,
  playerSwitchToDigital
} from "./socket.js";

import {
  applyManualDice,
  applyDigitalDice
} from "./mode-application.js";

import {
  setupDialogMirroring
} from "./dialog-mirroring.js";

import {
  debug,
  debugState
} from "./debug.js";

import {
  parseDiceFromFormula,
  executeRollWithValues
} from "./dice-parsing.js";

import {
  generateDiceTrayHTML,
  generateRollRequestSection,
  generatePendingRollHTML,
  generateGMPanelContent,
  generatePlayerPanelContent,
  generateMirroredDialogHTML
} from "./ui-templates.js";

import {
  refreshPanel,
  openPanel as openPanelBase,
  attachGMPanelListeners,
  attachPlayerPanelListeners
} from "./dice-panel.js";

const REALM_BRIDGE_URL = "https://realmbridge.co.uk";
const LOGO_URL = "modules/dice-link-companion/assets/logo-header.png";
const LOGO_SQUARE_URL = "modules/dice-link-companion/assets/logo-square.png";

// ============================================================================
// PERMISSIONS HELPERS
// ============================================================================

const ROLE_NAMES = {
  1: "Player",
  2: "Trusted Player",
  3: "Assistant GM",
  4: "GM"
};

function getManualRollsPermissions() {
  try {
    const permissions = game.settings.get("core", "permissions") || {};
    const roles = permissions.MANUAL_ROLLS || [];
    return {
      1: roles.includes(1),
      2: roles.includes(2),
      3: roles.includes(3),
      4: true
    };
  } catch (e) {
    return { 1: false, 2: false, 3: false, 4: true };
  }
}

async function setManualRollsPermission(role, enabled) {
  try {
    let currentDiceConfig = null;
    if (enabled) {
      try {
        currentDiceConfig = game.settings.get("core", "diceConfiguration") || {};
      } catch (e) {}
    }
    
    const permissions = game.settings.get("core", "permissions") || {};
    let roles = permissions.MANUAL_ROLLS || [];
    roles = [...roles];
    
    if (enabled && !roles.includes(role)) {
      roles.push(role);
    } else if (!enabled && roles.includes(role)) {
      roles = roles.filter(r => r !== role);
    }
    
    roles.sort((a, b) => a - b);
    const newPermissions = { ...permissions, MANUAL_ROLLS: roles };
    await game.settings.set("core", "permissions", newPermissions);
    
    if (enabled && currentDiceConfig && Object.keys(currentDiceConfig).length > 0) {
      try {
        await game.settings.set("core", "diceConfiguration", currentDiceConfig);
      } catch (e) {}
    }
    
    return true;
  } catch (e) {
    ui.notifications.error(`Failed to update permission for ${ROLE_NAMES[role]}.`);
    return false;
  }
}

// ============================================================================
// CUSTOM APPLICATION CLASS (ApplicationV2 for Foundry V13+)
// ============================================================================

const { ApplicationV2 } = foundry.applications.api;

class DiceLinkCompanionApp extends ApplicationV2 {
  constructor(isGM, options = {}) {
    super(options);
    this._isGM = isGM;
  }

  static DEFAULT_OPTIONS = {
    id: "dice-link-companion-panel",
    classes: ["dlc-dialog"],
    position: {
      width: 480,
      height: "auto"
    },
    window: {
      title: "Dice Link Companion",
      resizable: true,
      minimizable: true
    }
  };

  get title() {
    return "Dice Link Companion";
  }

  get isGM() {
    return this._isGM;
  }

  async _prepareContext(options) {
    return {};
  }

  async _renderHTML(context, options) {
    const content = this._isGM ? generateGMPanelContent() : generatePlayerPanelContent();
    const wrapper = document.createElement("div");
    wrapper.classList.add("window-content");
    wrapper.innerHTML = content;
    return wrapper;
  }

  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    const html = this.element;
    const $html = $(html);
    
    if (this._isGM) {
      attachGMPanelListeners($html);
    } else {
      attachPlayerPanelListeners($html);
    }
  }

  async close(options = {}) {
    setCurrentPanelDialog(null);
    return super.close(options);
  }

  setPosition(options = {}) {
    if (!options.width) {
      options.width = this._isGM ? 480 : 390;
    }
    return super.setPosition(options);
  }
}

// UI Template functions now imported from ui-templates.js
// Panel functions now imported from dice-panel.js

// Wrapper for openPanel that provides the DiceLinkCompanionApp class
function openPanel() {
  openPanelBase(DiceLinkCompanionApp);
}

// ============================================================================
// SCENE CONTROLS - D20 BUTTON
// ============================================================================

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens?.tools) return;

  controls.tokens.tools.diceLinkCompanion = {
    name: "diceLinkCompanion",
    title: "Dice Link Companion",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: true,
    order: 100,
    onChange: () => {
      openPanel();
    }
  };
});

// ============================================================================
// INITIALIZATION - Moved to end of file for complete setup
// ============================================================================

// ============================================================================
// DIALOG MIRRORING SYSTEM - v1.0.6.0 Architecture
// Hide native dialogs and replicate them in our panel for system-agnostic control
// ============================================================================

// Dialog mirroring moved to dialog-mirroring.js module

/**
  * Handle dialog render - check if it's a roll dialog and mirror it
  */

/**
 * Handle mirrored dialog state change - called via state listener when setMirroredDialog is invoked
 * This replaces the old window.diceLink.updatePanelWithMirroredDialog pattern
 * @param {Object} dialogData - The full dialog data object from setMirroredDialog
 */
function handleMirroredDialogChange(dialogData) {
  const { app, html, data: formData } = dialogData;
  
  // Clear previous pending roll request
  setPendingRollRequest(null);
  
  // Create new pending roll request with mirrored dialog data
  setPendingRollRequest({
    title: formData.title,
    subtitle: formData.formula,
    formula: formData.formula,
    isMirroredDialog: true,
    mirrorData: formData,
    onComplete: async (userChoice) => {
      if (userChoice === "cancel") {
        // Close the native dialog
        const dialogRef = getMirroredDialog();
        if (dialogRef?.app) {
          dialogRef.app.close();
        }
        setMirroredDialog(null);
        setPendingRollRequest(null);
        refreshPanel();
        return;
      }
      
      // Apply user choices to the hidden dialog and submit it
      await submitMirroredDialog(userChoice);
      
      setMirroredDialog(null);
      setPendingRollRequest(null);
      refreshPanel();
    }
  });
  
  // Expand the roll request section and refresh panel
  const currentCollapsed = getCollapsedSections();
  currentCollapsed.rollRequest = false;
  setCollapsedSections(currentCollapsed);
  
  const panelDialog = getCurrentPanelDialog();
  const panelIsOpen = panelDialog && panelDialog.rendered;
  if (!panelIsOpen) {
    openPanel();
  } else {
    refreshPanel();
  }
}

/**
 * Apply user choices to the mirrored dialog and submit it
 */
async function submitMirroredDialog(userChoice) {
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


/**
 * Custom RollResolver that integrates with our Dice Link panel.
 * This resolver shows our UI instead of Foundry's default manual entry dialog.
 */
  /**
	 * Setup the Dice Link fulfillment method.
 * Registers our custom method with Foundry's dice system.
 * We use a non-interactive handler that waits for our panel UI.
 */
function setupDiceFulfillment() {
  // Register our custom fulfillment method with a handler function
  // Using a handler (non-interactive) instead of a resolver ensures we control the UI
  CONFIG.Dice.fulfillment.methods["dice-link"] = {
    label: "Dice Link Companion",
    icon: "fa-dice-d20",
    interactive: false,
    handler: diceLinkFulfillmentHandler
  };
}

/**
 * Handler function for dice-link fulfillment.
 * According to Foundry's API, this is called ONCE PER DIE, not once per term.
 * For 2d20kh, it will be called twice - once for each d20.
 * We return a single number each time.
 */
async function diceLinkFulfillmentHandler(term, index) {
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
 * Reset the dice tray UI
 */
function resetDiceTray(html, diceCounts) {
  Object.keys(diceCounts).forEach(k => diceCounts[k] = 0);
  html.find(".dlc-die-count").text("0").hide();
  html.find(".dlc-dice-modifier").text("0");
  html.find(".dlc-dice-formula-input").val("/r ");
  html.find(".dlc-dice-adv-btn").text("ADV/DIS").removeClass("dlc-adv-active dlc-dis-active");
}

/**
 * Execute a dice tray roll manually - collect values BEFORE rolling
 * Returns "cancelled" if user cancels, otherwise completes the roll
 */
async function executeDiceTrayRollManually(formula, flavorText, html) {
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
        
        // Handle kh/kl modifiers - mark inactive dice
        if (term.modifiers?.length > 0) {
          const modifier = term.modifiers.find(m => m.startsWith("kh") || m.startsWith("kl"));
          if (modifier) {
            const keepCount = parseInt(modifier.slice(2)) || 1;
            const sorted = [...term.results].sort((a, b) => 
              modifier.startsWith("kh") ? b.result - a.result : a.result - b.result
            );
            // Mark dice that should be dropped as inactive
            const keptResults = sorted.slice(0, keepCount);
            for (const r of term.results) {
              r.active = keptResults.includes(r);
            }
          }
        }
        
        valueIndex++;
      }
    }
  }
  
  // Mark as evaluated and calculate total
  finalRoll._evaluated = true;
  
  // Calculate the total manually since we bypassed normal evaluation
  let total = 0;
  for (const term of finalRoll.terms) {
    if (term.faces && term.results) {
      // Dice term - sum active results only
      for (const r of term.results) {
        if (r.active) {
          total += r.result;
        }
      }
    } else if (term.number !== undefined) {
      // Numeric term (modifier)
      total += term.number;
    } else if (term.operator === "+") {
      // Plus operator - continue adding
    } else if (term.operator === "-") {
      // For minus, we need to negate the next term
      // This is handled by Foundry's term evaluation, but for simple cases
      // we can check if the term is a NumericTerm with negative sign
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
          refreshPanel();
          resolve(numericValue);
        }
      }
    });
    
    const currentCollapsed = getCollapsedSections();
    currentCollapsed.rollRequest = false;
    setCollapsedSections(currentCollapsed);
    refreshPanel();
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

/**
 * Apply Dice Link fulfillment to all dice for manual mode users.
 * Called when user is set to manual mode.
 */
function applyDiceLinkFulfillment() {
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
}

/**
 * Remove Dice Link fulfillment (restore default digital).
 * Called when user is set to digital mode.
 */
function removeDiceLinkFulfillment() {
  // Dynamically get available dice types from Foundry's configuration
  // This adapts to any custom dice Foundry supports
  const diceTypes = Object.keys(CONFIG.Dice.terms).filter(term => {
    // Filter to only dice terms (matches d4, d6, d8, d10, etc.)
    return /^d\d+$/.test(term) && CONFIG.Dice.terms[term];
  });
  
  for (const die of diceTypes) {
    CONFIG.Dice.fulfillment.dice[die] = "";
  }
  
  CONFIG.Dice.fulfillment.defaultMethod = "";
}

// ============================================================================
// ROLL INTERCEPTION
// ============================================================================
// isUserInManualMode is imported from settings.js

/**
 * Execute a roll directly using Foundry's Roll API.
 * This bypasses dnd5e/midi-qol hooks and is used as a fallback.
 */
// ============================================================================
// CUSTOM RESOLVER CLASS (for dialog mirroring approach)
// ============================================================================
// MIDI-QOL NOTE
// midi-qol interception removed - dice fulfillment system handles all rolls automatically
// Roll interception also removed - dialog mirroring handles all roll dialogs automatically
// ============================================================================
// INITIALIZATION HOOKS
// ============================================================================

/**
 * Initialize the module - register core settings and hooks
 */
Hooks.once("init", async () => {
  // Register core settings (world-scoped, available immediately)
  registerCoreSettings();
});

/**
 * Ready hook - set up UI and active features when game is ready
 */
Hooks.once("ready", async () => {
  try {
    // Register per-user settings FIRST - wait for completion
    registerPlayerModeSettings();
    
    // Give settings time to register before hooks fire
    await new Promise(resolve => setTimeout(resolve, ASYNC_OPERATION_DELAY_MS));
    
    // Collapsed sections are now managed by settings.js - no need to load here
    
    // Setup socket listeners
    setupSocketListeners();
    
    // Setup UI and handlers (dialog mirroring hooks fire after this)
    setupChatButtonHandlers();
    setupDialogMirroring();
    setupDiceFulfillment();
    
    // Expose core functions on global namespace for modules and dice-panel.js to use
    window.diceLink = window.diceLink || {};
    window.diceLink.refreshPanel = refreshPanel;
    window.diceLink.applyManualDice = applyManualDice;
    window.diceLink.applyDigitalDice = applyDigitalDice;
    window.diceLink.isUserInManualMode = isUserInManualMode;
    window.diceLink.playerRequestManual = playerRequestManual;
    window.diceLink.playerSwitchToDigital = playerSwitchToDigital;
    window.diceLink.getPlayerMode = getPlayerMode;
    window.diceLink.getGlobalOverride = getGlobalOverride;
    window.diceLink.executeDiceTrayRollManually = executeDiceTrayRollManually;
    
    // Register state listener for mirrored dialog changes (replaces window.diceLink.updatePanelWithMirroredDialog)
    onMirroredDialogChange((dialogData) => {
      if (dialogData && dialogData.data) {
        handleMirroredDialogChange(dialogData);
      }
    });

    // Apply initial dice mode based on settings
    const globalOverride = getGlobalOverride();
    
    if (globalOverride === "forceAllManual") {
      applyManualDice();
    } else if (globalOverride === "forceAllDigital") {
      applyDigitalDice();
    } else {
      const myMode = getPlayerMode();
      if (myMode === "manual") {
        applyManualDice();
      } else {
        applyDigitalDice();
      }
    }
  } catch (error) {
    console.error("[Dice Link] ERROR in ready hook:", error);
    console.error("[Dice Link] Stack trace:", error.stack);
  }
});

// ============================================================================
// PUBLIC API
// ============================================================================

globalThis.DiceLinkCompanion = {
  openPanel,
  applyManual: applyManualDice,
  applyDigital: applyDigitalDice,
  requestManual: playerRequestManual,
  switchToDigital: playerSwitchToDigital
};

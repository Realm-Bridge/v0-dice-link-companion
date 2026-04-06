/**
 * Dice Link Companion - Foundry VTT v13
 * A player-GM dice mode management system with dialog mirroring.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 */

import {
  MODULE_ID,
  MODULE_VERSION,
  REALM_BRIDGE_URL,
  LOGO_URL,
  LOGO_SQUARE_URL,
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
  setupDialogMirroring,
  handleMirroredDialogChange
} from "./dialog-mirroring.js";

import {
  debug,
  debugState,
  debugError
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

import {
  setupDiceFulfillment,
  executeDiceTrayRollManually,
  submitMirroredDialog,
  applyDiceLinkFulfillment,
  removeDiceLinkFulfillment
} from "./dice-fulfillment.js";

import {
  getManualRollsPermissions,
  setManualRollsPermission
} from "./settings-helpers.js";

import {
  connect as connectToDLA,
  disconnect as disconnectFromDLA,
  getConnectionStatus as getDLAConnectionStatus,
  onConnectionChange as onDLAConnectionChange,
  sendRollRequest,
  sendDiceRequest,
  setButtonSelectCallback,
  setDiceResultCallback,
  setRollResultCallback,
  getPendingDiceRequest,
  clearPendingDiceRequest,
  extractRollDataForDLA
} from "./websocket-client.js";

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
      minimizable: true,
      positioned: true,
      contentClasses: ["dlc-window-content-constrained"]
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
    
    // Defer positioning until element is fully rendered and attached to DOM
    // Use requestAnimationFrame to ensure browser has painted the element
    requestAnimationFrame(() => {
      if (this.element?.offsetParent) {  // Check element is in DOM and visible
        this.setPosition({ height: "auto", width: "auto" });
      }
    });
  }

  async close(options = {}) {
    setCurrentPanelDialog(null);
    return super.close(options);
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
// INITIALIZATION
// ============================================================================

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
    
    // Register state listener for mirrored dialog changes
    onMirroredDialogChange((dialogData) => {
      if (dialogData && dialogData.data) {
        handleMirroredDialogChange(dialogData, submitMirroredDialog, refreshPanel, openPanel);
        
        // Also send to Dice Link App if connected
        if (getDLAConnectionStatus()) {
          const rollData = extractRollDataForDLA(dialogData);
          debug("Sending roll request to Dice Link App", rollData);
          sendRollRequest(rollData);
        }
      }
    });
    
    // Setup Dice Link App WebSocket connection
    debug("Attempting to connect to Dice Link App...");
    connectToDLA();
    
    // Handle connection status changes
    onDLAConnectionChange((connected) => {
      debug("Dice Link App connection status:", connected ? "connected" : "disconnected");
      if (connected) {
        ui.notifications?.info("Connected to Dice Link App");
      }
    });
    
    // ========================================================================
    // PHASE A: Button Selection from DLA
    // User clicked a button (Advantage/Normal/Disadvantage) in DLA.
    // We apply config changes and click the hidden Foundry dialog button.
    // This triggers Foundry to process and show its dice resolver.
    // ========================================================================
    setButtonSelectCallback((rollId, buttonClicked, configChanges) => {
      debug("Phase A: Button selection from DLA", { rollId, buttonClicked, configChanges });
      
      if (buttonClicked === "cancel") {
        // Handle cancellation
        const dialogRef = getMirroredDialog();
        if (dialogRef?.app) {
          dialogRef.app.close();
        }
        setMirroredDialog(null);
        setPendingRollRequest(null);
        refreshPanel();
        return;
      }
      
      // Apply config changes to the hidden dialog if any
      const dialogRef = getMirroredDialog();
      if (dialogRef && configChanges && Object.keys(configChanges).length > 0) {
        const originalHtml = dialogRef.html instanceof jQuery ? dialogRef.html : $(dialogRef.html);
        for (const [name, value] of Object.entries(configChanges)) {
          const input = originalHtml.find(`[name="${name}"]`);
          if (input.length > 0) {
            input.val(value);
            input[0].dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
      
      // Store the rollId for Phase B correlation
      const pendingRoll = getPendingRollRequest();
      if (pendingRoll) {
        pendingRoll.dlaRollId = rollId;
        pendingRoll.buttonClicked = buttonClicked;
      }
      
      // Click the button on the hidden Foundry dialog
      // This triggers Foundry to process the roll and show dice resolver
      if (buttonClicked && dialogRef?.data?.buttons) {
        debug("Clicking hidden dialog button:", buttonClicked);
        submitMirroredDialog({ buttonLabel: buttonClicked });
      }
    });
    
    // ========================================================================
    // PHASE B: Dice Results from DLA
    // User rolled dice and submitted results in DLA.
    // We inject these values into Foundry's dice resolver.
    // ========================================================================
    setDiceResultCallback((rollId, results) => {
      debug("Phase B: Dice results from DLA", { rollId, results });
      
      // Find the current dice resolver dialog
      const dialogRef = getMirroredDialog();
      if (!dialogRef) {
        debug("No mirrored dialog found for dice results");
        return;
      }
      
      // Get the element to inject dice values into
      let element;
      if (dialogRef.html instanceof jQuery) {
        element = dialogRef.html[0];
      } else if (dialogRef.html?.element) {
        element = dialogRef.html.element;
      } else if (dialogRef.html instanceof HTMLElement) {
        element = dialogRef.html;
      } else if (dialogRef.data?.element) {
        element = dialogRef.data.element;
      }
      
      if (!element) {
        debug("Could not find dialog element for dice injection");
        return;
      }
      
      // Inject dice values into the resolver inputs
      // Foundry's RollResolver has inputs with data-die attribute
      for (const result of results) {
        const dieType = result.type?.toLowerCase(); // e.g., "d20"
        const value = result.value;
        
        // Find input for this die type
        const inputs = element.querySelectorAll(`input[data-die="${dieType}"], input[name*="${dieType}"]`);
        for (const input of inputs) {
          // Only fill empty inputs
          if (!input.value) {
            input.value = value;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("input", { bubbles: true }));
            debug("Injected dice value:", { dieType, value, input: input.name });
            break; // Only fill one input per result
          }
        }
      }
      
      // After injecting all values, submit the resolver
      // Small delay to let the UI update
      setTimeout(() => {
        const submitBtn = element.querySelector('button[type="submit"], button[data-action="submit"], .dialog-button.submit');
        if (submitBtn) {
          debug("Clicking resolver submit button");
          submitBtn.click();
        } else {
          // Try clicking any OK/Submit button
          const okBtn = Array.from(element.querySelectorAll('button')).find(btn => 
            btn.textContent?.toLowerCase().includes('ok') || 
            btn.textContent?.toLowerCase().includes('submit')
          );
          if (okBtn) {
            debug("Clicking resolver OK button");
            okBtn.click();
          }
        }
        
        // Clear state
        clearPendingDiceRequest();
        setMirroredDialog(null);
        setPendingRollRequest(null);
        refreshPanel();
      }, 50);
    });
    
    // Legacy handler for backward compatibility
    setRollResultCallback((rollId, results, configChanges, buttonClicked) => {
      debug("Legacy roll result from DLA (using two-phase handlers instead)", { rollId, buttonClicked });
      // Forward to Phase A handler if results are empty (button select only)
      // Otherwise this is a combined message from older DLA version
      if (!results || results.length === 0) {
        // Just button selection
        setButtonSelectCallback && setButtonSelectCallback(rollId, buttonClicked, configChanges);
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
    debugError("ERROR in ready hook:", error);
    debugError("Stack trace:", error.stack);
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
  switchToDigital: playerSwitchToDigital,
  // Dice Link App connection
  connectToDLA,
  disconnectFromDLA,
  getDLAConnectionStatus
};

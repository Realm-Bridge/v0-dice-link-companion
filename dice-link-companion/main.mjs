/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.7.1 - Bug Fix: Restored missing debugState function
 * 
 * A player-GM dice mode management system with dialog mirroring.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 * 
 * v1.0.7.1 - BUG FIX: Restored missing debugState function that was preventing module load
 * v1.0.7.0 - MAJOR: Switched from handler to resolver approach for dice fulfillment
 *            Now shows ALL dice at once instead of one-at-a-time
 *            Created roll-resolver.js with custom DiceLinkResolver class
 * v1.0.6.110 - STABLE CHECKPOINT: Ready for Phase 6 UI Cleanup
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
  setupDialogMirroring,
  handleMirroredDialogChange
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

const REALM_BRIDGE_URL = "https://realmbridge.co.uk";
const LOGO_URL = "modules/dice-link-companion/assets/logo-header.png";
const LOGO_SQUARE_URL = "modules/dice-link-companion/assets/logo-square.png";

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
    window.diceLink.setManualRollsPermission = setManualRollsPermission;
    
    // Register state listener for mirrored dialog changes (replaces window.diceLink.updatePanelWithMirroredDialog)
    onMirroredDialogChange((dialogData) => {
      if (dialogData && dialogData.data) {
        handleMirroredDialogChange(dialogData, submitMirroredDialog, refreshPanel, openPanel);
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

/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.6.98
 * 
 * A player-GM dice mode management system with dialog mirroring.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 * 
 * LAST KNOWN GOOD VERSION: 1.0.6.53 - Stable after failed UI extraction
 * 
 * v1.0.6.98 - Fixed: video-feed.js now imports LOGO_SQUARE_URL from constants.js instead of hardcoded URL
 * v1.0.6.97 - Phase 5 Step 5.3: Created video-feed.js, deduplicated video feed HTML in ui-templates.js
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

import {
  setupDiceFulfillment,
  executeDiceTrayRollManually,
  submitMirroredDialog,
  applyDiceLinkFulfillment,
  removeDiceLinkFulfillment
} from "./dice-fulfillment.js";

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

// submitMirroredDialog moved to dice-fulfillment.js


// Dice fulfillment functions moved to dice-fulfillment.js

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
    window.diceLink.setManualRollsPermission = setManualRollsPermission;
    
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

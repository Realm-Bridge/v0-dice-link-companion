/**
 * Dice Panel Module - dice-link-companion
 * Version 1.0.6.95
 * 
 * Handles panel lifecycle (open, close, refresh) and all panel event listeners.
 * This is the primary UI orchestration module.
 */

import { MODULE_ID, ROLE_NAMES, ASYNC_OPERATION_DELAY_MS } from "./constants.js";
import { debug, debugState } from "./debug.js";
import {
  getCollapsedSections,
  setCollapsedSections,
  getPendingRollRequest,
  setPendingRollRequest,
  getCurrentPanelDialog,
  setCurrentPanelDialog,
  getPendingDiceEntry,
  setPendingDiceEntry,
  getDiceEntryCancelled,
  setDiceEntryCancelled,
  getMirroredDialog,
  setMirroredDialog
} from "./state-management.js";
import {
  setGlobalOverride,
  getGlobalOverride,
  setPlayerMode,
  getPlayerMode,
  isUserInManualMode,
  getPendingRequests,
  setPendingRequests
} from "./settings.js";
import { applyManualDice, applyDigitalDice } from "./mode-application.js";
import { createApprovalChatMessage } from "./approval.js";
import { playerRequestManual, playerSwitchToDigital } from "./socket.js";
import { generateGMPanelContent, generatePlayerPanelContent } from "./ui-templates.js";

debug("dice-panel.js: All imports complete");

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

/**
 * Refresh the panel content without recreating the dialog
 */
export function refreshPanel() {
  const panelDialog = getCurrentPanelDialog();
  if (panelDialog && panelDialog.rendered) {
    const isGM = panelDialog.isGM;
    const newContent = isGM ? generateGMPanelContent() : generatePlayerPanelContent();
    
    // ApplicationV2 returns HTMLElement, not jQuery - wrap in jQuery for compatibility
    const $element = $(panelDialog.element);
    const contentElement = $element.find(".window-content");
    contentElement.html(newContent);
    
    if (isGM) {
      attachGMPanelListeners($element);
    } else {
      attachPlayerPanelListeners($element);
    }

    // Recalculate dialog height to fit content after collapse/expand
    panelDialog.setPosition({ height: "auto" });
  }
}

/**
 * Open the DLC panel (or bring to front if already open)
 * @param {Function} DiceLinkCompanionApp - The Application class to instantiate
 */
export function openPanel(DiceLinkCompanionApp) {
  debug("openPanel called");
  const panelDialog = getCurrentPanelDialog();
  debugState("getCurrentPanelDialog returned", panelDialog);
  // If panel already exists and is rendered, just bring it to front - don't recreate
  if (panelDialog && panelDialog.rendered) {
    debug("Panel exists and rendered, bringing to top");
    panelDialog.bringToTop();
    return;
  }
  
  // If panel exists but not rendered, close it first
  if (panelDialog) {
    debug("Panel exists but not rendered, closing first");
    try {
      panelDialog.close();
    } catch (e) {
      // Ignore errors from closing
    }
  }

  debug("Creating new panel dialog");
  const isGM = game.user.isGM;
  const newPanelDialog = new DiceLinkCompanionApp(isGM);
  debug("Setting currentPanelDialog");
  setCurrentPanelDialog(newPanelDialog);
  debug("Rendering panel");
  newPanelDialog.render(true);
}

// ============================================================================
// PANEL LISTENERS
// ============================================================================

/**
 * Attach all event listeners for the GM panel
 */
export function attachGMPanelListeners(html) {
  // Collapse/expand sections
  html.find(".dlc-section-header").click(function() {
    const section = $(this).data("section");
    const currentCollapsed = getCollapsedSections();
    if (section && currentCollapsed.hasOwnProperty(section)) {
      currentCollapsed[section] = !currentCollapsed[section];
      // Save collapsed state to settings
      setCollapsedSections(currentCollapsed);
      refreshPanel();
    }
  });

  // Role permission toggles
  html.find(".dlc-role-toggle").change(async function() {
    const role = parseInt($(this).data("role"));
    const enabled = $(this).is(":checked");
    const success = await window.diceLink.setManualRollsPermission(role, enabled);
    if (success) {
      ui.notifications.info(`Manual rolls ${enabled ? 'enabled' : 'disabled'} for ${ROLE_NAMES[role]}.`);
    }
    refreshPanel();
  });

  // Refresh button
  html.find(".dlc-refresh-btn").click(function() {
    refreshPanel();
    ui.notifications.info("Panel refreshed.");
  });

  // Global override - All Manual toggle
  html.find(".dlc-override-manual").change(async function() {
    const checked = $(this).is(":checked");
    if (checked) {
      await setGlobalOverride("forceAllManual");
      applyManualDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllManual" });
      ui.notifications.info("Forced all to manual dice.");
    } else {
      await setGlobalOverride("individual");
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "individual" });
      ui.notifications.info("Set to individual control.");
    }
    refreshPanel();
  });

  // Global override - All Digital toggle
  html.find(".dlc-override-digital").change(async function() {
    const checked = $(this).is(":checked");
    if (checked) {
      await setGlobalOverride("forceAllDigital");
      applyDigitalDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllDigital" });
      ui.notifications.info("Forced all to digital dice.");
    } else {
      await setGlobalOverride("individual");
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "individual" });
      ui.notifications.info("Set to individual control.");
    }
    refreshPanel();
  });

  // GM mode toggle (switch style)
  html.find(".dlc-gm-mode-toggle").change(async function() {
    const isManual = $(this).is(":checked");
    const newMode = isManual ? "manual" : "digital";
    
    await setPlayerMode(game.user.id, newMode);
    
    if (newMode === "manual") {
      applyManualDice();
      ui.notifications.info("Your dice: Manual");
    } else {
      applyDigitalDice();
      ui.notifications.info("Your dice: Digital");
    }
    refreshPanel();
  });

  // Approve buttons
  html.find(".dlc-panel-approve").click(async function() {
    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);
    if (!player) return;
    
    await setPlayerMode(playerId, "manual");
    
    let pending = getPendingRequests();
    pending = pending.filter(req => req.playerId !== playerId);
    await setPendingRequests(pending);
    
    // Clear chat buttons for this player across ALL chat messages
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request approved</em>');
    });

    game.socket.emit(`module.${MODULE_ID}`, {
      action: "applyMode",
      playerId: playerId,
      mode: "manual"
    });
    
    await createApprovalChatMessage(playerId, player.name, true);
    ui.notifications.info(`Approved manual dice for ${player.name}.`);
    refreshPanel();
  });

  // Deny buttons
  html.find(".dlc-panel-deny").click(async function() {
    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);
    if (!player) return;
    
    let pending = getPendingRequests();
    pending = pending.filter(req => req.playerId !== playerId);
    await setPendingRequests(pending);

    // Clear chat buttons for this player across ALL chat messages
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request denied</em>');
    });
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "requestDenied",
      playerId: playerId
    });
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
    refreshPanel();
  });

  // Revoke buttons
  html.find(".dlc-panel-revoke").click(async function() {
    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);
    if (!player) return;
    
    await setPlayerMode(playerId, "digital");
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "revokeMode",
      playerId: playerId
    });
    
    ui.notifications.info(`Revoked manual dice for ${player.name}.`);
    refreshPanel();
  });

  // Attach dice tray listeners (shared with player panel)
  attachDiceTrayListeners(html);
}

/**
 * Attach all event listeners for the Player panel
 */
export function attachPlayerPanelListeners(html) {
  // Collapse/expand sections
  html.find(".dlc-section-header").click(function() {
    const section = $(this).data("section");
    const currentCollapsed = getCollapsedSections();
    if (section && currentCollapsed.hasOwnProperty(section)) {
      currentCollapsed[section] = !currentCollapsed[section];
      // Save collapsed state to settings
      setCollapsedSections(currentCollapsed);
      refreshPanel();
    }
  });

  // Request manual button
  html.find(".dlc-player-request").click(function() {
    playerRequestManual();
    refreshPanel();
  });

  // Switch to digital button
  html.find(".dlc-player-digital").click(function() {
    playerSwitchToDigital();
    refreshPanel();
  });

  // Attach dice tray listeners (shared with GM panel)
  attachDiceTrayListeners(html);
}

// ============================================================================
// DICE TRAY LISTENERS (shared between GM and Player panels)
// ============================================================================

/**
 * Attach dice tray event listeners - shared between GM and Player panels
 */
export function attachDiceTrayListeners(html) {
  // Track dice counts for badges
  const diceCounts = { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 };
  let currentModifier = 0;
  let advMode = "normal"; // "normal", "advantage", "disadvantage"

  // Dice button left-click - add to formula
  html.find(".dlc-dice-btn").click(function() {
    const die = $(this).data("die");
    diceCounts[die]++;
    
    // Update badge
    const countEl = $(this).find(".dlc-die-count");
    countEl.text(diceCounts[die]).show();
    
    // Rebuild formula
    updateDiceFormula(html, diceCounts, currentModifier);
  });
  
  // Dice button right-click - remove from formula
  html.find(".dlc-dice-btn").on("contextmenu", function(e) {
    e.preventDefault(); // Prevent browser context menu
    const die = $(this).data("die");
    
    if (diceCounts[die] > 0) {
      diceCounts[die]--;
      
      // Update badge
      const countEl = $(this).find(".dlc-die-count");
      if (diceCounts[die] > 0) {
        countEl.text(diceCounts[die]).show();
      } else {
        countEl.text("").hide();
      }
      
      // Rebuild formula
      updateDiceFormula(html, diceCounts, currentModifier);
    }
  });

  // Modifier buttons
  html.find(".dlc-dice-minus").click(function() {
    currentModifier--;
    html.find(".dlc-dice-modifier").text(currentModifier >= 0 ? currentModifier : currentModifier);
    updateDiceFormula(html, diceCounts, currentModifier);
  });

  html.find(".dlc-dice-plus").click(function() {
    currentModifier++;
    html.find(".dlc-dice-modifier").text(currentModifier >= 0 ? currentModifier : currentModifier);
    updateDiceFormula(html, diceCounts, currentModifier);
  });

  // Advantage/Disadvantage toggle
  html.find(".dlc-dice-adv-btn").click(function() {
    if (advMode === "normal") {
      advMode = "advantage";
      $(this).text("ADV").addClass("dlc-adv-active");
    } else if (advMode === "advantage") {
      advMode = "disadvantage";
      $(this).text("DIS").removeClass("dlc-adv-active").addClass("dlc-dis-active");
    } else {
      advMode = "normal";
      $(this).text("ADV/DIS").removeClass("dlc-dis-active");
    }
  });

  // Roll button - needs access to dice fulfillment functions
  // We use a callback pattern here since executeDiceTrayRollManually is in dice-fulfillment.js
  html.find(".dlc-dice-roll-btn").click(async function() {
    let formula = html.find(".dlc-dice-formula-input").val().replace(/^\/r\s*/, "").trim();
    if (!formula) {
      ui.notifications.warn("Enter a dice formula first.");
      return;
    }
    
    // Apply advantage/disadvantage to d20 rolls
    if (advMode === "advantage") {
      formula = formula.replace(/(\d*)d20/gi, (match, count) => {
        const num = parseInt(count) || 1;
        return `${num * 2}d20kh`;
      });
    } else if (advMode === "disadvantage") {
      formula = formula.replace(/(\d*)d20/gi, (match, count) => {
        const num = parseInt(count) || 1;
        return `${num * 2}d20kl`;
      });
    }
    
    const flavorText = advMode !== "normal" 
      ? `Manual Dice Roll (${advMode === "advantage" ? "Advantage" : "Disadvantage"})` 
      : "Manual Dice Roll";
    
    // Check mode and execute roll
    if (isUserInManualMode()) {
      try {
        // Call the global dice fulfillment function exposed by main.mjs
        const result = await window.diceLink.executeDiceTrayRollManually(formula, flavorText, html);
        if (result === "cancelled") {
          return;
        }
        resetDiceTray(html, diceCounts);
        advMode = "normal";
      } catch (e) {
        console.error("[Dice Link] Manual roll error:", e);
        ui.notifications.error("Invalid dice formula.");
      }
      return;
    }
    
    // Digital mode - normal roll
    try {
      const roll = new Roll(formula);
      await roll.evaluate();
      
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker(),
        flavor: flavorText
      });
      
      resetDiceTray(html, diceCounts);
      advMode = "normal";
    } catch (e) {
      ui.notifications.error("Invalid dice formula.");
    }
  });

  // ============================================================================
  // PENDING ROLL ACTION LISTENERS
  // ============================================================================

  // Mirrored Dialog Button Clicks (v1.0.6.0)
  html.find(".dlc-dialog-btn").click(async function() {
    const currentRollRequest = getPendingRollRequest();
    if (!currentRollRequest || !currentRollRequest.isMirroredDialog) {
      return;
    }
    
    const buttonLabel = $(this).data("button");
    
    // Gather form values from mirrored dialog
    const formValues = {};
    html.find(".dlc-mirrored-dialog input, .dlc-mirrored-dialog select").each(function() {
      const $input = $(this);
      const name = $input.attr("name");
      if (name) {
        if ($input.attr("type") === "checkbox") {
          formValues[name] = $input.is(":checked");
        } else {
          formValues[name] = $input.val();
        }
      }
    });
    
    // Call onComplete with the form values and button label
    if (currentRollRequest.onComplete) {
      currentRollRequest.onComplete({
        buttonLabel,
        formValues
      });
    }
  });

  // Advantage / Normal / Disadvantage buttons (Step 1: Configuration)
  html.find(".dlc-roll-action-btn[data-roll-mode]").click(async function() {
    const currentRollRequest = getPendingRollRequest();
    if (!currentRollRequest) {
      return;
    }
    const rollMode = $(this).data("roll-mode");
    const bonus = html.find(".dlc-situational-bonus").val()?.trim() || "";

    // Build the user choice object
    const userChoice = {
      advantage: rollMode === "advantage",
      disadvantage: rollMode === "disadvantage",
      critical: rollMode === "critical",
      situationalBonus: bonus || null
    };

    // Call the onComplete callback to resolve the Promise and proceed with the roll
    if (currentRollRequest.onComplete) {
      currentRollRequest.onComplete(userChoice);
    }
  });
  
  // Submit Dice Results button (Step 2: Dice Entry)
  html.find(".dlc-submit-dice-btn").click(async function() {
    const currentRollRequest = getPendingRollRequest();
    if (!currentRollRequest || !currentRollRequest.isFulfillment) {
      return;
    }
    
    // Gather dice values from inputs
    const diceResults = [];
    html.find(".dlc-dice-value-input").each(function() {
      const value = parseInt($(this).val()) || 0;
      const faces = parseInt($(this).data("die-faces")) || 20;
      // Clamp to valid range
      const clampedValue = Math.max(1, Math.min(faces, value));
      diceResults.push(clampedValue);
    });
    
    // Call the onComplete callback with the dice results array directly
    if (currentRollRequest.onComplete) {
      currentRollRequest.onComplete(diceResults);
    }
  });

  // Cancel roll button
  html.find(".dlc-roll-cancel-btn").click(function() {
    // Set cancellation flag to prevent further dice prompts
    setDiceEntryCancelled(true);
    
    // Handle dice entry cancellation
    const currentDiceEntry = getPendingDiceEntry();
    if (currentDiceEntry) {
      // Resolve with null to signal cancellation
      currentDiceEntry.resolve(null);
      setPendingDiceEntry(null);
    }
    
    const currentRollRequest = getPendingRollRequest();
    if (currentRollRequest?.onComplete) {
      currentRollRequest.onComplete("cancel");
    }
    
    setPendingRollRequest(null);
    refreshPanel();
    ui.notifications.info("Roll cancelled.");
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update the dice formula input based on current dice counts and modifier
 */
function updateDiceFormula(html, diceCounts, modifier) {
  const parts = [];
  const dieOrder = [20, 12, 10, 8, 6, 4, 100]; // Common dice order
  
  for (const die of dieOrder) {
    if (diceCounts[die] > 0) {
      parts.push(`${diceCounts[die]}d${die}`);
    }
  }
  
  let formula = parts.join("+");
  if (modifier !== 0) {
    formula += modifier > 0 ? `+${modifier}` : `${modifier}`;
  }
  
  html.find(".dlc-dice-formula-input").val(`/r ${formula}`);
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

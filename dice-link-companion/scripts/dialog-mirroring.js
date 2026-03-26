/**
 * Dialog Mirroring Module
 * Handles suppressing dnd5e roll dialogs and mirroring them to our panel UI
 * Version 1.0.6.35
 */

import { getPlayerMode, getGlobalOverride } from "./settings.js";

let mirroredDialog = null;

/**
 * Setup dialog mirroring - hook into ApplicationV2 and Dialog renders
 * Exported for use in main.mjs
 */
export function setupDialogMirroring() {
  console.log("[Dice Link] Setting up dialog mirroring...");
  
  // Hook into ApplicationV2 renders (dnd5e 4.x+ uses these)
  // Only log when it's actually a roll dialog to reduce console spam
  Hooks.on("renderApplication", (app, html, data) => {
    if (isRollDialog(app)) {
      console.log("[Dice Link] Roll dialog detected via renderApplication:", app.title);
    }
    handleDialogRender(app, html, data);
  });
  
  // Also try the legacy Dialog hook for backwards compatibility
  Hooks.on("renderDialog", (app, html, data) => {
    if (isRollDialog(app)) {
      console.log("[Dice Link] Roll dialog detected via renderDialog:", app.title);
    }
    handleDialogRender(app, html, data);
  });
  
  // Try specific dnd5e roll configuration dialog hooks
  Hooks.on("renderRollConfigurationDialog", (app, html, data) => {
    console.log("[Dice Link] Roll dialog via renderRollConfigurationDialog:", app.title);
    handleDialogRender(app, html, data);
  });
  
  // Generic hook for any application render - cast wide net
  Hooks.on("renderApplicationV2", (app, html, data) => {
    if (isRollDialog(app)) {
      console.log("[Dice Link] Roll dialog detected via renderApplicationV2:", app.title);
    }
    handleDialogRender(app, html, data);
  });
  
  // Hook into dnd5e initiative configuration
  // Initiative bypasses the fulfillment system, so we need special handling
  Hooks.on("dnd5e.preConfigureInitiative", (config, dialog, message) => {
    console.log("[Dice Link] Initiative pre-configure hook triggered");
    const isManual = isUserInManualMode();
    if (isManual) {
      console.log("[Dice Link] Setting initiative to use manual fulfillment");
    }
  });
  
  // Also hook into the roll itself to intercept initiative
  Hooks.on("dnd5e.preRollInitiative", (actor, roll) => {
    console.log("[Dice Link] Initiative pre-roll hook triggered for:", actor?.name);
    const isManual = isUserInManualMode();
    if (isManual) {
      console.log("[Dice Link] Manual mode active for initiative");
    }
  });
}

/**
 * Check if the current user is in manual dice mode
 * Respects global overrides from the GM
 */
function isUserInManualMode() {
  const globalOverride = getGlobalOverride();
  if (globalOverride === "forceAllManual") return true;
  if (globalOverride === "forceAllDigital") return false;
  const myMode = getPlayerMode();
  return myMode === "manual";
}

/**
 * Handle dialog render - check if it's a roll dialog and mirror it
 */
function handleDialogRender(app, html, data) {
  if (!isUserInManualMode()) {
    return;
  }
  
  // Check if this is a roll dialog we should mirror
  if (isRollDialog(app)) {
    const title = (app.title || "").toLowerCase();
    
    // Hide the native dialog element
    const htmlElement = html instanceof jQuery ? html[0] : html;
    const elementToHide = htmlElement?.style ? htmlElement : html?.element;
    
    // Roll Resolution dialogs are handled by our DiceLinkResolver - just hide them
    if (title.includes("roll resolution") || title.includes("resolver")) {
      console.log("[Dice Link] Hiding Roll Resolution dialog - handled by our resolver");
      if (elementToHide?.style) {
        elementToHide.style.display = "none";
      }
      return;
    }
    
    console.log("[Dice Link] Detected roll dialog:", app.title);
    
    // Hide the native dialog
    if (elementToHide?.style) {
      elementToHide.style.display = "none";
    }
    
    // Extract dialog data and mirror it to our panel
    mirrorDialogToPanel(app, html, data);
  }
}

/**
 * Check if an application is a roll dialog we should mirror
 * Be SPECIFIC - only target dnd5e roll configuration dialogs, not other modules
 */
function isRollDialog(app) {
  if (!app) return false;
  
  // Get identifiers for this dialog
  const className = app.constructor?.name?.toLowerCase() || "";
  const appId = (app.id || "").toLowerCase();
  const dialogTitle = (app.title || "").toLowerCase();
  
  // EXCLUDE known third-party module dialogs by checking EXACT patterns
  const excludedPatterns = [
    "monks-tokenbar",      // Monk's Token Bar
    "tokenbar",            // Generic token bar references
    "contested",           // Contested rolls from Monk's
    "request-roll",        // Monk's request roll dialog
    "lmrtfy",              // Let Me Roll That For You module
    "gm-screen",           // GM Screen module
    "popout",              // Popout module windows
    "compendium",          // Compendium browsers
    "settings",            // Settings windows
    "filepicker",          // File pickers
    "journal",             // Journal entries
    "actor-sheet",         // Actor sheets
    "item-sheet"           // Item sheets
  ];
  
  // Check if this is an excluded dialog - check in full identifier string
  const fullId = `${className} ${appId} ${dialogTitle}`;
  if (excludedPatterns.some(pattern => fullId.includes(pattern))) {
    console.log(`[Dice Link] Excluding dialog: ${pattern} found in ${fullId}`);
    return false;
  }
  
  // Check app constructor name for SPECIFIC dnd5e roll dialog classes
  const rollDialogClasses = [
    "rollconfigurationdialog",    // dnd5e roll configuration
    "d20roll",                     // D20 roll dialogs
    "damageroll",                  // Damage roll dialogs
    "rollresolver",               // Foundry roll resolver
    "baseconfigurationdialog"     // dnd5e base config
  ];
  
  if (rollDialogClasses.some(cls => className.includes(cls))) {
    console.log(`[Dice Link] Matched roll dialog class: ${className}`);
    return true;
  }
  
  // For title-based matching, check for dnd5e ability/skill checks
  // These typically have format like "Ability Name (Skill Name) Check" or just "Ability Name Check"
  const abilityNames = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  const skillNames = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", 
                      "insight", "intimidation", "investigation", "medicine", "nature", "perception", 
                      "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
  
  const hasAbility = abilityNames.some(ability => dialogTitle.includes(ability));
  const hasSkill = skillNames.some(skill => dialogTitle.includes(skill));
  const isCheckDialog = dialogTitle.includes("check");
  const isSaveDialog = dialogTitle.includes("saving") || dialogTitle.includes("save");
  const isAttackDialog = dialogTitle.includes("attack");
  const isDamageDialog = dialogTitle.includes("damage");
  const isInitiativeDialog = dialogTitle.includes("initiative");
  const isDeathSaveDialog = dialogTitle.includes("death") && dialogTitle.includes("sav");
  const isConcentrationSave = dialogTitle.includes("concentration") && isSaveDialog;
  
  // Match dnd5e roll dialogs by title patterns
  if (hasAbility && isCheckDialog) {
    console.log(`[Dice Link] Matched ability check by title: ${dialogTitle}`);
    return true;
  }
  if (hasSkill && isCheckDialog) {
    console.log(`[Dice Link] Matched skill check by title: ${dialogTitle}`);
    return true;
  }
  if ((hasAbility || dialogTitle.includes("ability")) && (isSaveDialog || isCheckDialog)) {
    console.log(`[Dice Link] Matched ability save/check by title: ${dialogTitle}`);
    return true;
  }
  if (isAttackDialog) {
    console.log(`[Dice Link] Matched attack dialog by title: ${dialogTitle}`);
    return true;
  }
  if (isDamageDialog) {
    console.log(`[Dice Link] Matched damage dialog by title: ${dialogTitle}`);
    return true;
  }
  if (isInitiativeDialog) {
    console.log(`[Dice Link] Matched initiative dialog by title: ${dialogTitle}`);
    return true;
  }
  if (isDeathSaveDialog) {
    console.log(`[Dice Link] Matched death save dialog by title: ${dialogTitle}`);
    return true;
  }
  if (isConcentrationSave) {
    console.log(`[Dice Link] Matched concentration save by title: ${dialogTitle}`);
    return true;
  }
  
  return false;
}

/**
 * Extract data from native dialog and mirror to our panel
 */
function mirrorDialogToPanel(app, html, data) {
  try {
    // Extract form data from the hidden dialog
    const formData = extractDialogFormData(app, html);
    
    if (!formData) {
      return;
    }
    
    console.log("[Dice Link] Mirroring dialog:", formData.title);
    
    // Store the dialog reference and data
    mirroredDialog = {
      app,
      html,
      data: formData,
      timestamp: Date.now()
    };
    
    // Update our panel to show the mirrored dialog UI
    // Pass the full dialog reference so main.mjs can access app/html for submission
    window.diceLink?.updatePanelWithMirroredDialog?.(formData, app, html);
    
  } catch (e) {
    console.error("[Dice Link] Error mirroring dialog:", e);
  }
}

/**
 * Extract relevant form data from the native dialog
 */
function extractDialogFormData(app, html) {
  // Normalize html to a DOM element (could be jQuery, HTMLElement, or ApplicationV2 structure)
  let element;
  if (html instanceof jQuery) {
    element = html[0];
  } else if (html?.element) {
    // ApplicationV2 structure
    element = html.element;
  } else if (html instanceof HTMLElement) {
    element = html;
  } else {
    // Try to get from app
    element = app?.element?.[0] || app?.element || document.querySelector(`[data-appid="${app?.appId}"]`);
  }
  
  if (!element) {
    console.log("[Dice Link] Could not find dialog element");
    return null;
  }
  
  console.log("[Dice Link] Extracting form data from element:", element);
  
  const data = {
    title: app.title || app.options?.title || "Roll",
    buttons: [], // Buttons in the dialog (OK, Cancel, etc)
    inputs: {},  // Form inputs (checkboxes, selects, etc)
    formula: "", // Dice formula if visible
    element: element // Keep reference to the element
  };
  
  // Extract buttons - look for all button types
  const buttonElements = element.querySelectorAll("button, [data-action]");
  for (const btn of buttonElements) {
    const label = btn.textContent?.trim() || btn.dataset?.action || "";
    if (label && !btn.classList.contains("close") && !btn.classList.contains("header-control")) {
      data.buttons.push({
        label: label,
        element: btn,
        dataset: btn.dataset,
        action: btn.dataset?.action
      });
    }
  }
  
  // Extract form inputs
  const inputs = element.querySelectorAll("input, select, textarea");
  for (const input of inputs) {
    const name = input.name || input.id;
    if (name) {
      data.inputs[name] = {
        type: input.type,
        value: input.value,
        checked: input.checked,
        element: input,
        options: input.tagName === "SELECT" 
          ? Array.from(input.options).map(opt => ({ value: opt.value, label: opt.text }))
          : null
      };
    }
  }
  
  // Try to extract formula from various possible locations
  const formulaSelectors = "[data-formula], .formula, .dice-formula, .roll-formula, .dice-result";
  const formulaElement = element.querySelector(formulaSelectors);
  if (formulaElement) {
    data.formula = formulaElement.textContent.trim();
  }
  
  // Only log button count to avoid console spam
  console.log("[Dice Link] Extracted form data with", data.buttons.length, "buttons for:", data.title);
  
  return data;
}

/**
 * Get the currently mirrored dialog reference
 */
export function getMirroredDialog() {
  return mirroredDialog;
}

/**
 * Clear the mirrored dialog reference
 */
export function clearMirroredDialog() {
  mirroredDialog = null;
}

/**
 * Dialog Mirroring Module
 * Handles suppressing dnd5e roll dialogs and mirroring them to our panel UI
 * Version 1.0.6.99 - Added handleMirroredDialogChange (moved from main.mjs)
 */

import { getPlayerMode, getGlobalOverride, getCollapsedSections, setCollapsedSections } from "./settings.js";
import { debug, debugError } from "./debug.js";
import { getMirroredDialog, setMirroredDialog, getPendingRollRequest, setPendingRollRequest, getCurrentPanelDialog } from "./state-management.js";

/**
 * Setup dialog mirroring - hook into ApplicationV2 and Dialog renders
 * Exported for use in main.mjs
 */
export function setupDialogMirroring() {
  // Hook into ApplicationV2 renders (dnd5e 4.x+ uses these)
  Hooks.on("renderApplication", (app, html, data) => {
    handleDialogRender(app, html, data);
  });
  
  // Also try the legacy Dialog hook for backwards compatibility
  Hooks.on("renderDialog", (app, html, data) => {
    handleDialogRender(app, html, data);
  });
  
  // Try specific dnd5e roll configuration dialog hooks
  Hooks.on("renderRollConfigurationDialog", (app, html, data) => {
    handleDialogRender(app, html, data);
  });
  
  // Generic hook for any application render - cast wide net
  Hooks.on("renderApplicationV2", (app, html, data) => {
    handleDialogRender(app, html, data);
  });
}

/**
 * Check if the current user is in manual dice mode
 * Respects global overrides from the GM
 * Defensive: returns false if settings not ready yet
 */
function isUserInManualMode() {
  try {
    const globalOverride = getGlobalOverride();
    if (globalOverride === "forceAllManual") return true;
    if (globalOverride === "forceAllDigital") return false;
    const myMode = getPlayerMode();
    return myMode === "manual";
  } catch (e) {
    // Settings not ready yet, default to digital mode
    debug("isUserInManualMode: settings not ready, defaulting to false");
    return false;
  }
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
      if (elementToHide?.style) {
        elementToHide.style.display = "none";
      }
      return;
    }
    
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
    "monks-tokenbar",
    "tokenbar",
    "contested",
    "request-roll",
    "lmrtfy",
    "gm-screen",
    "popout",
    "compendium",
    "settings",
    "filepicker",
    "journal",
    "actor-sheet",
    "item-sheet"
  ];
  
  // Check if this is an excluded dialog
  const fullId = `${className} ${appId} ${dialogTitle}`;
  if (excludedPatterns.some(pattern => fullId.includes(pattern))) {
    return false;
  }
  
  // Check app constructor name for SPECIFIC dnd5e roll dialog classes
  const rollDialogClasses = [
    "rollconfigurationdialog",
    "d20roll",
    "damageroll",
    "rollresolver",
    "baseconfigurationdialog"
  ];
  
  if (rollDialogClasses.some(cls => className.includes(cls))) {
    return true;
  }
  
  // For title-based matching, check for dnd5e ability/skill checks
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
  if (hasAbility && isCheckDialog) return true;
  if (hasSkill && isCheckDialog) return true;
  if ((hasAbility || dialogTitle.includes("ability")) && (isSaveDialog || isCheckDialog)) return true;
  if (isAttackDialog) return true;
  if (isDamageDialog) return true;
  if (isInitiativeDialog) return true;
  if (isDeathSaveDialog) return true;
  if (isConcentrationSave) return true;
  
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
    
    // Store the dialog reference and data in state management
    // The state listener in main.mjs will automatically handle panel updates
    setMirroredDialog({
      app,
      html,
      data: formData,
      timestamp: Date.now()
    });
    
  } catch (e) {
    debugError("Error mirroring dialog:", e);
  }
}

/**
 * Extract relevant form data from the native dialog
 */
function extractDialogFormData(app, html) {
  // Normalize html to a DOM element
  let element;
  if (html instanceof jQuery) {
    element = html[0];
  } else if (html?.element) {
    element = html.element;
  } else if (html instanceof HTMLElement) {
    element = html;
  } else {
    element = app?.element?.[0] || app?.element || document.querySelector(`[data-appid="${app?.appId}"]`);
  }
  
  if (!element) {
    return null;
  }
  
  const data = {
    title: app.title || app.options?.title || "Roll",
    buttons: [],
    inputs: {},
    formula: "",
    element: element
  };
  
  // Extract buttons
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
  
  // Try to extract formula
  const formulaSelectors = "[data-formula], .formula, .dice-formula, .roll-formula, .dice-result";
  const formulaElement = element.querySelector(formulaSelectors);
  if (formulaElement) {
    data.formula = formulaElement.textContent.trim();
  }
  
  return data;
}

/**
 * Handle mirrored dialog state change - called via state listener when setMirroredDialog is invoked
 * This replaces the old window.diceLink.updatePanelWithMirroredDialog pattern
 * @param {Object} dialogData - The full dialog data object from setMirroredDialog
 * @param {Function} submitMirroredDialog - Function to submit the mirrored dialog (from dice-fulfillment.js)
 * @param {Function} refreshPanel - Function to refresh the panel UI
 * @param {Function} openPanel - Function to open the panel if not already open
 */
export function handleMirroredDialogChange(dialogData, submitMirroredDialog, refreshPanel, openPanel) {
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

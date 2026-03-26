/**
 * Panel Management Module - Dice Link Companion
 * Handles opening and refreshing the main UI panel
 */

// Reference to the current panel dialog instance
let currentPanelDialog = null;

/**
 * Refresh the current panel with updated content
 * Called whenever state changes to update the displayed information
 */
function refreshPanel() {
  if (currentPanelDialog && currentPanelDialog.rendered) {
    const isGM = currentPanelDialog.isGM;
    const newContent = isGM ? generateGMPanelContent() : generatePlayerPanelContent();
    
    // ApplicationV2 returns HTMLElement, not jQuery - wrap in jQuery for compatibility
    const $element = $(currentPanelDialog.element);
    const contentElement = $element.find(".window-content");
    contentElement.html(newContent);
    
    if (isGM) {
      attachGMPanelListeners($element);
    } else {
      attachPlayerPanelListeners($element);
    }

    // Recalculate dialog height to fit content after collapse/expand
    currentPanelDialog.setPosition({ height: "auto" });
  }
}

/**
 * Open the Dice Link Companion panel
 * If panel is already open, brings it to front
 */
function openPanel() {
  // If panel already exists and is rendered, just bring it to front - don't recreate
  if (currentPanelDialog && currentPanelDialog.rendered) {
    currentPanelDialog.bringToTop();
    return;
  }
  
  // If panel exists but not rendered, close it first
  if (currentPanelDialog) {
    try {
      currentPanelDialog.close();
    } catch (e) {
      // Ignore errors from closing
    }
  }

  const isGM = game.user.isGM;
  currentPanelDialog = new DiceLinkCompanionApp(isGM);
  currentPanelDialog.render(true);
}

/**
 * Get reference to current panel dialog
 */
function getCurrentPanelDialog() {
  return currentPanelDialog;
}

/**
 * Set the current panel dialog reference
 * Called internally when panel is created/destroyed
 */
function setCurrentPanelDialog(dialog) {
  currentPanelDialog = dialog;
}

export { refreshPanel, openPanel, getCurrentPanelDialog, setCurrentPanelDialog };

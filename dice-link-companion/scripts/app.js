/**
 * Dice Link Companion App Module
 * Defines the DiceLinkCompanionApp class (ApplicationV2) and manages panel state
 */

const { ApplicationV2 } = foundry.applications.api;

// Track the currently open panel dialog
let currentPanelDialog = null;

/**
 * Dice Link Companion Panel Application
 * Custom ApplicationV2 for displaying the GM/Player control panels
 */
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
    // Content generator is passed from main.mjs via this.contentGenerator
    const content = this.contentGenerator ? this.contentGenerator() : "";
    const wrapper = document.createElement("div");
    wrapper.classList.add("window-content");
    wrapper.innerHTML = content;
    return wrapper;
  }

  _replaceHTML(result, content, options) {
    // Clear and replace the content
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    // Get the HTML element (not jQuery in V2)
    const html = this.element;
    
    // Wrap in jQuery for compatibility with existing listener code
    const $html = $(html);
    
    // Listener attachment is delegated to main.mjs via callback
    if (this.attachListeners) {
      this.attachListeners($html);
    }
  }

  async close(options = {}) {
    currentPanelDialog = null;
    return super.close(options);
  }

  setPosition(options = {}) {
    // Adjust width based on GM/player
    if (!options.width) {
      options.width = this._isGM ? 480 : 390;
    }
    return super.setPosition(options);
  }
}

// Export for use in main.mjs
export { DiceLinkCompanionApp, currentPanelDialog };

// Export a getter/setter for managing currentPanelDialog state
export function getCurrentPanelDialog() {
  return currentPanelDialog;
}

export function setCurrentPanelDialog(dialog) {
  currentPanelDialog = dialog;
}

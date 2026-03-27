/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.6.76
 * 
 * A player-GM dice mode management system with dialog mirroring.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 * 
 * LAST KNOWN GOOD VERSION: 1.0.6.53 - Stable after failed UI extraction
 * 
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
  getMirroredDialog as getMirroredDialogState,
  setPendingRollRequest,
  setHasRequestedThisSession,
  setCurrentPanelDialog,
  setPendingDiceEntry,
  setDiceEntryCancelled,
  setMirroredDialog as setMirroredDialogState,
  clearAllState,
  resetUIState,
  hasPendingOperations
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
  parseDiceFromFormula,
  executeRollWithValues
} from "./dice-parsing.js";

const REALM_BRIDGE_URL = "https://realmbridge.co.uk";
const LOGO_URL = "modules/dice-link-companion/assets/logo-header.png";
const LOGO_SQUARE_URL = "modules/dice-link-companion/assets/logo-square.png";

// ============================================================================
// LOCAL STATE VARIABLES
// These are used directly throughout main.mjs for performance.
// State-management.js provides the centralized getters/setters for external modules.
// ============================================================================

// Track if player has already requested this session
let hasRequestedThisSession = false;

// Track any pending intercepted roll request
let pendingRollRequest = null;

// Track the currently open panel dialog
let currentPanelDialog = null;

// Dice entry state
let pendingDiceEntry = null;
let diceEntryCancelled = false;

// Collapsed sections state - will be loaded from settings during ready hook
let collapsedSections = {
  rollRequest: false,
  globalOverride: true,
  playerModes: true,
  permissions: true,
  videoFeed: true,
  pending: false,
  topRow: false
};

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
    currentPanelDialog = null;
    return super.close(options);
  }

  setPosition(options = {}) {
    if (!options.width) {
      options.width = this._isGM ? 480 : 390;
    }
    return super.setPosition(options);
  }
}

// ============================================================================
// ROLL REQUEST SECTION
// ============================================================================

function generateDiceTrayHTML() {
  return `
    <div class="dlc-dice-tray">
      <div class="dlc-dice-formula-row">
        <input type="text" class="dlc-dice-formula-input" placeholder="/r 1d20" value="/r ">
      </div>
      <div class="dlc-dice-buttons-row">
        ${[4, 6, 8, 10, 12, 20, 100].map(die => `
          <button type="button" class="dlc-dice-btn" data-die="${die}" title="d${die}">
            <span class="dlc-die-icon">d${die}</span>
            <span class="dlc-die-count" style="display:none;">0</span>
          </button>
        `).join('')}
      </div>
      <div class="dlc-dice-controls-row">
        <button type="button" class="dlc-dice-mod-btn dlc-dice-minus" title="Decrease modifier">−</button>
        <span class="dlc-dice-modifier">0</span>
        <button type="button" class="dlc-dice-mod-btn dlc-dice-plus" title="Increase modifier">+</button>
        <button type="button" class="dlc-dice-adv-btn" data-mode="normal" title="Toggle Advantage/Disadvantage">ADV/DIS</button>
        <button type="button" class="dlc-dice-roll-btn dlc-btn-success" title="Roll dice">Roll</button>
      </div>
    </div>
  `;
}

function generatePendingRollHTML(roll) {
  if (roll.isMirroredDialog && roll.mirrorData) {
    return generateMirroredDialogHTML(roll.mirrorData);
  }
  
  if (roll.isFulfillment && roll.diceNeeded) {
    const diceInputs = roll.diceNeeded.map((die, index) => {
      const faces = die.faces || parseInt((die.type || "d20").replace("d", "")) || 20;
      const dieLabel = die.type || `d${faces}`;
      return `
        <div class="dlc-dice-input-row">
          <label class="dlc-dice-label">${dieLabel}</label>
          <input type="number" 
                 class="dlc-dice-value-input" 
                 data-die-index="${index}" 
                 data-die-faces="${faces}"
                 min="1" 
                 max="${faces}" 
                 placeholder="1-${faces}">
        </div>
      `;
    }).join('');
    
    return `
      <div class="dlc-pending-roll dlc-dice-entry-step">
        <div class="dlc-pending-roll-header">
          <h4 class="dlc-pending-roll-title">${roll.title || "Enter Dice Results"}</h4>
          ${roll.subtitle ? `<p class="dlc-pending-roll-subtitle">${roll.subtitle}</p>` : ''}
        </div>
        <div class="dlc-dice-inputs">
          ${diceInputs}
        </div>
        <div class="dlc-pending-roll-actions">
          <button type="button" class="dlc-roll-action-btn dlc-submit-dice-btn dlc-btn-success">SUBMIT RESULTS</button>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dlc-pending-roll dlc-config-step">
      <div class="dlc-pending-roll-header">
        <h4 class="dlc-pending-roll-title">${roll.title}</h4>
        ${roll.subtitle ? `<p class="dlc-pending-roll-subtitle">${roll.subtitle}</p>` : ''}
      </div>
      <div class="dlc-pending-roll-formula">
        <span class="dlc-pending-formula-text">${roll.formula}</span>
        <span class="dlc-pending-formula-label">Formula</span>
      </div>
      ${roll.situationalBonus !== undefined ? `
      <div class="dlc-pending-roll-bonus">
        <input type="text" class="dlc-dice-formula-input dlc-situational-bonus" placeholder="Situational Bonus?" value="${roll.situationalBonus || ''}">
      </div>
      ` : ''}
      ${roll.abilityOptions ? `
      <div class="dlc-pending-roll-config">
        <div class="dlc-config-row">
          <label>Ability</label>
          <span class="dlc-config-value">${roll.abilityOptions}</span>
        </div>
      </div>
      ` : ''}
      <div class="dlc-pending-roll-actions">
        ${roll.hasAdvantage ? `<button type="button" class="dlc-roll-action-btn dlc-roll-advantage" data-roll-mode="advantage">Advantage</button>` : ''}
        <button type="button" class="dlc-roll-action-btn dlc-roll-normal" data-roll-mode="normal">Normal</button>
        ${roll.hasDisadvantage ? `<button type="button" class="dlc-roll-action-btn dlc-roll-disadvantage" data-roll-mode="disadvantage">Disadvantage</button>` : ''}
        ${roll.hasCritical ? `<button type="button" class="dlc-roll-action-btn dlc-roll-critical" data-roll-mode="critical">Critical</button>` : ''}
      </div>
    </div>
  `;
}

function generateRollRequestSection(mode, globalOverride) {
  let effectiveMode = mode;
  if (globalOverride === "forceAllManual") effectiveMode = "manual";
  else if (globalOverride === "forceAllDigital") effectiveMode = "digital";

  if (effectiveMode !== "manual") return '';

  const hasPending = pendingRollRequest !== null;
  const sectionClass = `dlc-section dlc-roll-request-section${hasPending ? ' dlc-roll-request-pending' : ''}`;

  return `
    <div class="${sectionClass} ${collapsedSections.rollRequest ? 'collapsed' : ''}">
      <div class="dlc-section-header" data-section="rollRequest">
        <span class="dlc-collapse-btn">${collapsedSections.rollRequest ? '+' : '−'}</span>
        <h3><i class="fas fa-dice-d20"></i> Roll Request${hasPending ? ' <span class="dlc-pending-badge">PENDING</span>' : ''}</h3>
        ${hasPending ? '<button type="button" class="dlc-roll-cancel-btn dlc-header-cancel-btn">Cancel Roll</button>' : ''}
      </div>
      <div class="dlc-section-content">
        ${hasPending ? generatePendingRollHTML(pendingRollRequest) : generateDiceTrayHTML()}
      </div>
    </div>
  `;
}

// ============================================================================
// GM MANAGEMENT PANEL
// ============================================================================

function generateGMPanelContent() {
  const globalOverride = getGlobalOverride();
  const pendingRequests = getPendingRequests();
  const gmMode = getPlayerMode();
  const rolePermissions = getManualRollsPermissions();

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = getPlayerMode(user.id);
    const isPending = pendingRequests.some(req => req.playerId === user.id);
    
    // Determine effective mode based on global override
    let effectiveMode = storedMode;
    if (globalOverride === "forceAllManual") {
      effectiveMode = "manual";
    } else if (globalOverride === "forceAllDigital") {
      effectiveMode = "digital";
    }
    
    players.push({
      id: user.id,
      name: user.name,
      mode: effectiveMode,
      storedMode: storedMode,
      isPending: globalOverride === "individual" ? isPending : false,
      canRevoke: globalOverride === "individual" && storedMode === "manual"
    });
  }

  return `
    <div class="dlc-panel">
      <!-- Header with Logo -->
      <div class="dlc-header">
        <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-logo-link" title="Visit Realm Bridge">
          <img src="${LOGO_URL}" alt="Realm Bridge" class="dlc-logo" onerror="this.style.display='none'">
        </a>
      </div>

      <!-- Top Row: Permissions | Global Override | GM Mode (Collapsible) -->
      <div class="dlc-section dlc-top-section ${collapsedSections.topRow ? 'collapsed' : ''}" style="margin: 12px 12px 0 12px;">
        <div class="dlc-section-header" data-section="topRow">
          <span class="dlc-collapse-btn">${collapsedSections.topRow ? '+' : '−'}</span>
          <h3><i class="fas fa-cog"></i> Settings</h3>
        </div>
        <div class="dlc-section-content">
          <div class="dlc-top-row">
        <!-- Permissions -->
        <div class="dlc-mini-section">
          <h4>Permissions</h4>
          <div class="dlc-role-toggles">
            ${[1, 2, 3].map(role => `
              <div class="dlc-toggle-row">
                <label class="dlc-switch">
                  <input type="checkbox" class="dlc-role-toggle" data-role="${role}" ${rolePermissions[role] ? 'checked' : ''}>
                  <span class="dlc-slider"></span>
                </label>
                <span class="dlc-toggle-label">${ROLE_NAMES[role]}</span>
              </div>
            `).join('')}
            <div class="dlc-toggle-row dlc-disabled">
              <label class="dlc-switch">
                <input type="checkbox" checked disabled>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">GM <em>(always)</em></span>
            </div>
          </div>
        </div>

        <!-- Global Override -->
        <div class="dlc-mini-section dlc-mini-compact">
          <h4>Override</h4>
          <div class="dlc-role-toggles">
            <div class="dlc-toggle-row">
              <label class="dlc-switch">
                <input type="checkbox" class="dlc-override-manual" ${globalOverride === 'forceAllManual' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">Manual</span>
            </div>
            <div class="dlc-toggle-row">
              <label class="dlc-switch">
                <input type="checkbox" class="dlc-override-digital" ${globalOverride === 'forceAllDigital' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">Digital</span>
            </div>
          </div>
        </div>

        <!-- GM Mode -->
        <div class="dlc-mini-section dlc-mini-compact">
          <h4>Your Mode</h4>
          <div class="dlc-role-toggles">
            <div class="dlc-toggle-row">
              <label class="dlc-switch dlc-gm-mode-switch">
                <input type="checkbox" class="dlc-gm-mode-toggle" ${gmMode === 'manual' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">${gmMode === 'manual' ? 'Manual' : 'Digital'}</span>
            </div>
            <button type="button" class="dlc-refresh-icon-btn dlc-refresh-btn" title="Refresh Panel" style="margin-top: 4px;">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>

      <!-- Bottom Sections -->
      <div class="dlc-bottom-sections">
        ${pendingRequests.length > 0 ? `
          <!-- Pending Requests -->
          <div class="dlc-section dlc-pending-section">
            <div class="dlc-section-header" data-section="pending">
              <span class="dlc-collapse-btn">${collapsedSections.pending ? '+' : '−'}</span>
              <h3><i class="fas fa-clock"></i> Pending Requests (${pendingRequests.length})</h3>
            </div>
            <div class="dlc-section-content">
              <div class="dlc-pending-list">
                ${pendingRequests.map(req => `
                  <div class="dlc-pending-item">
                    <span class="dlc-pending-name">${req.playerName}</span>
                    <div class="dlc-player-actions">
                      <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-success dlc-panel-approve" data-player-id="${req.playerId}">
                        <i class="fas fa-check"></i> Approve
                      </button>
                      <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-danger dlc-panel-deny" data-player-id="${req.playerId}">
                        <i class="fas fa-times"></i> Deny
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Player Modes -->
        <div class="dlc-section ${collapsedSections.playerModes ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="playerModes">
            <span class="dlc-collapse-btn">${collapsedSections.playerModes ? '+' : '−'}</span>
            <h3><i class="fas fa-users"></i> Player Modes</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-mode-legend">
              <span class="dlc-legend-item"><span class="dlc-mode-dot digital"></span>Digital</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot manual"></span>Manual</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot pending"></span>Pending</span>
              <span class="dlc-legend-item"><span class="dlc-revoke-dot"></span>Revoke</span>
            </div>
            ${players.length > 0 ? `
              <div class="dlc-players-grid">
                ${players.map(player => `
                  <div class="dlc-player-card${player.canRevoke ? ' dlc-player-card-revokable' : ''}">
                    <div class="dlc-player-info">
                      <span class="dlc-mode-dot ${player.isPending ? 'pending' : player.mode}"></span>
                      <span class="dlc-player-name">${player.name}</span>
                    </div>
                    ${player.canRevoke ? `
                      <button type="button" class="dlc-revoke-corner dlc-panel-revoke" data-player-id="${player.id}" title="Revoke manual dice">
                        <i class="fas fa-times"></i>
                      </button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : '<p class="dlc-no-players">No players connected.</p>'}
          </div>
        </div>

        ${generateRollRequestSection(gmMode, "individual")}

        <!-- Video Feed Placeholder -->
        <div class="dlc-section ${collapsedSections.videoFeed ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="videoFeed">
            <span class="dlc-collapse-btn">${collapsedSections.videoFeed ? '+' : '−'}</span>
            <h3><i class="fas fa-video"></i> Video Feed</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-video-feed">
              <div class="dlc-video-grid">
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Coming Soon</span></div>
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Future Feature</span></div>
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Stay Tuned</span></div>
                <div class="dlc-video-cell">
                  <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-video-logo-link" title="Visit Realm Bridge">
                    <img src="${LOGO_SQUARE_URL}" alt="Realm Bridge" class="dlc-video-logo" onerror="this.parentElement.innerHTML='<span class=dlc-video-placeholder>Realm Bridge</span>'">
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PLAYER PANEL
// ============================================================================

function generatePlayerPanelContent() {
  const globalOverride = getGlobalOverride();
  const pendingRequests = getPendingRequests();
  const myMode = getPlayerMode();
  const myPending = pendingRequests.some(req => req.playerId === game.user.id);

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = getPlayerMode(user.id);
    const isPendingRaw = pendingRequests.some(req => req.playerId === user.id);
    let effectiveMode = storedMode;
    if (globalOverride === "forceAllManual") effectiveMode = "manual";
    else if (globalOverride === "forceAllDigital") effectiveMode = "digital";
    const isPending = globalOverride === "individual" ? isPendingRaw : false;
    players.push({
      id: user.id,
      name: user.name,
      mode: effectiveMode,
      isPending,
      isSelf: user.id === game.user.id
    });
  }

  const canRequest = !myPending && myMode === "digital" && globalOverride === "individual";
  const canSwitchToDigital = myMode === "manual" && globalOverride !== "forceAllManual";
  
  const otherPlayers = players.filter(p => !p.isSelf);
  const selfPlayer = players.find(p => p.isSelf);

  return `
    <div class="dlc-panel dlc-player-panel">
      <!-- Header with Logo -->
      <div class="dlc-header">
        <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-logo-link" title="Visit Realm Bridge">
          <img src="${LOGO_URL}" alt="Realm Bridge" class="dlc-logo" onerror="this.style.display='none'">
        </a>
      </div>

      <!-- Bottom Sections -->
      <div class="dlc-bottom-sections" style="padding-top: 12px;">
        <!-- Player Modes - Two Column Layout -->
        <div class="dlc-section ${collapsedSections.playerModes ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="playerModes">
            <span class="dlc-collapse-btn">${collapsedSections.playerModes ? '+' : '−'}</span>
            <h3><i class="fas fa-users"></i> Player Modes</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-mode-legend">
              <span class="dlc-legend-item"><span class="dlc-mode-dot digital"></span>Digital</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot manual"></span>Manual</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot pending"></span>Pending</span>
            </div>
            <div class="dlc-players-grid">
              ${canRequest ? `
                <button type="button" class="dlc-player-card dlc-player-action-card dlc-btn-success dlc-player-request">
                  <i class="fas fa-dice"></i> Request Manual
                </button>
              ` : ''}
              ${myPending ? `
                <div class="dlc-player-card dlc-player-pending-card">
                  <i class="fas fa-clock"></i> Awaiting GM
                </div>
              ` : ''}
              ${canSwitchToDigital ? `
                <button type="button" class="dlc-player-card dlc-player-action-card dlc-btn-secondary dlc-player-digital">
                  <i class="fas fa-desktop"></i> To Digital
                </button>
              ` : ''}
              ${selfPlayer ? `
                <div class="dlc-player-card dlc-player-card-self">
                  <div class="dlc-player-info">
                    <span class="dlc-mode-dot ${selfPlayer.isPending ? 'pending' : selfPlayer.mode}"></span>
                    <span class="dlc-player-name">${selfPlayer.name}</span>
                    <span class="dlc-self-indicator">(You)</span>
                  </div>
                </div>
              ` : ''}
              ${otherPlayers.map(player => `
                <div class="dlc-player-card">
                  <div class="dlc-player-info">
                    <span class="dlc-mode-dot ${player.isPending ? 'pending' : player.mode}"></span>
                    <span class="dlc-player-name">${player.name}</span>
                  </div>
                </div>
              `).join('')}
            </div>
            ${globalOverride !== "individual" ? `
              <p class="dlc-no-players" style="margin-top: 10px;">
                <i class="fas fa-lock"></i> GM has set global override: ${globalOverride === "forceAllManual" ? "All Manual" : "All Digital"}
              </p>
            ` : ''}
          </div>
        </div>

        ${generateRollRequestSection(myMode, globalOverride)}

        <!-- Video Feed Placeholder -->
        <div class="dlc-section ${collapsedSections.videoFeed ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="videoFeed">
            <span class="dlc-collapse-btn">${collapsedSections.videoFeed ? '+' : '−'}</span>
            <h3><i class="fas fa-video"></i> Video Feed</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-video-feed">
              <div class="dlc-video-grid">
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Coming Soon</span></div>
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Future Feature</span></div>
                <div class="dlc-video-cell"><span class="dlc-video-placeholder">Stay Tuned</span></div>
                <div class="dlc-video-cell">
                  <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-video-logo-link" title="Visit Realm Bridge">
                    <img src="${LOGO_SQUARE_URL}" alt="Realm Bridge" class="dlc-video-logo" onerror="this.parentElement.innerHTML='<span class=dlc-video-placeholder>Realm Bridge</span>'">
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PANEL LISTENERS
// ============================================================================

function attachGMPanelListeners(html) {
  // Collapse/expand sections
  html.find(".dlc-section-header").click(function() {
    const section = $(this).data("section");
    if (section && collapsedSections.hasOwnProperty(section)) {
      collapsedSections[section] = !collapsedSections[section];
      // Save collapsed state to settings
      setCollapsedSections(collapsedSections);
      refreshPanel();
    }
  });

  // Role permission toggles
  html.find(".dlc-role-toggle").change(async function() {
    const role = parseInt($(this).data("role"));
    const enabled = $(this).is(":checked");
    const success = await setManualRollsPermission(role, enabled);
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

function attachPlayerPanelListeners(html) {
  // Collapse/expand sections
  html.find(".dlc-section-header").click(function() {
    const section = $(this).data("section");
    if (section && collapsedSections.hasOwnProperty(section)) {
      collapsedSections[section] = !collapsedSections[section];
      // Save collapsed state to settings
      setCollapsedSections(collapsedSections);
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

function attachDiceTrayListeners(html) {
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

  // Roll button
  html.find(".dlc-dice-roll-btn").click(async function() {
    let formula = html.find(".dlc-dice-formula-input").val().replace(/^\/r\s*/, "").trim();
    if (!formula) {
      ui.notifications.warn("Enter a dice formula first.");
      return;
    }
    
    // Apply advantage/disadvantage to d20 rolls
    if (advMode === "advantage") {
      // Replace 1d20 with 2d20kh (keep highest - kh alone means keep 1)
      formula = formula.replace(/(\d*)d20/gi, (match, count) => {
        const num = parseInt(count) || 1;
        return `${num * 2}d20kh`;
      });
    } else if (advMode === "disadvantage") {
      // Replace 1d20 with 2d20kl (keep lowest - kl alone means keep 1)
      formula = formula.replace(/(\d*)d20/gi, (match, count) => {
        const num = parseInt(count) || 1;
        return `${num * 2}d20kl`;
      });
    }
    
    // Add flavor text for advantage/disadvantage
    const flavorText = advMode !== "normal" 
      ? `Manual Dice Roll (${advMode === "advantage" ? "Advantage" : "Disadvantage"})` 
      : "Manual Dice Roll";
    
    // In manual mode, we need to collect dice values BEFORE rolling
    // so that cancel actually prevents the roll
    if (isUserInManualMode()) {
      try {
        const result = await executeDiceTrayRollManually(formula, flavorText, html);
        if (result === "cancelled") {
          return; // Don't reset, let user try again or modify
        }
        // Reset the dice tray on success
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
      
      // Reset the dice tray
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
    if (!pendingRollRequest || !pendingRollRequest.isMirroredDialog) {
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
    if (pendingRollRequest.onComplete) {
      pendingRollRequest.onComplete({
        buttonLabel,
        formValues
      });
    }
  });

  // Advantage / Normal / Disadvantage buttons (Step 1: Configuration)
  html.find(".dlc-roll-action-btn[data-roll-mode]").click(async function() {
    if (!pendingRollRequest) {
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
    if (pendingRollRequest.onComplete) {
      pendingRollRequest.onComplete(userChoice);
    }
  });
  
  // Submit Dice Results button (Step 2: Dice Entry)
  html.find(".dlc-submit-dice-btn").click(async function() {
    if (!pendingRollRequest || !pendingRollRequest.isFulfillment) {
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
    if (pendingRollRequest.onComplete) {
      pendingRollRequest.onComplete(diceResults);
    }
  });

  // Cancel roll button
  html.find(".dlc-roll-cancel-btn").click(function() {
    // Set cancellation flag to prevent further dice prompts
    diceEntryCancelled = true;
    
    // Handle dice entry cancellation
    if (pendingDiceEntry) {
      // Resolve with null to signal cancellation
      pendingDiceEntry.resolve(null);
      pendingDiceEntry = null;
    }
    
    if (pendingRollRequest?.onComplete) {
      pendingRollRequest.onComplete("cancel");
    }
    
    pendingRollRequest = null;
    refreshPanel();
    ui.notifications.info("Roll cancelled.");
  });
}

// Helper to update the dice formula input
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

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

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
 * Update our panel to display the mirrored dialog UI
 * Called from dialog-mirroring.js via window.diceLink.updatePanelWithMirroredDialog()
 */
function updatePanelWithMirroredDialog(formData, app, html) {
  // Clear previous pending roll request
  pendingRollRequest = null;
  
  // Store the mirrored dialog reference for submitMirroredDialog to use
  setMirroredDialog({
    app,
    html,
    data: formData,
    timestamp: Date.now()
  });
  
  // Create new pending roll request with mirrored dialog data
  pendingRollRequest = {
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
        pendingRollRequest = null;
        refreshPanel();
        return;
      }
      
      // Apply user choices to the hidden dialog and submit it
      await submitMirroredDialog(userChoice);
      
      setMirroredDialog(null);
      pendingRollRequest = null;
      refreshPanel();
    }
  };
  
  // Expand the roll request section and refresh panel
  collapsedSections.rollRequest = false;
  
  const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
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
 * Generate HTML for mirrored dialog UI in our panel
 */
function generateMirroredDialogHTML(mirrorData) {
  if (!mirrorData) {
    return "";
  }
  
  let html = `
    <div class="dlc-mirrored-dialog">
      <div class="dlc-dialog-title">${mirrorData.title}</div>
      <div class="dlc-dialog-content">
  `;
  
  // Show formula if available
  if (mirrorData.formula) {
    html += `
      <div class="dlc-dialog-formula">
        <span class="dlc-label">Formula</span>
        <span class="dlc-value">${mirrorData.formula}</span>
      </div>
    `;
  }
  
  // Generate input fields for form inputs
  html += `<div class="dlc-dialog-inputs">`;
  
  for (const [name, input] of Object.entries(mirrorData.inputs)) {
    if (input.type === "checkbox") {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-checkbox-label">
            <input type="checkbox" name="${name}" ${input.checked ? "checked" : ""}>
            <span>${name}</span>
          </label>
        </div>
      `;
    } else if (input.type === "select" || input.options) {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-label">${name}</label>
          <select name="${name}" class="dlc-select-input">
      `;
      if (input.options) {
        for (const opt of input.options) {
          html += `<option value="${opt.value}" ${opt.value === input.value ? "selected" : ""}>${opt.label}</option>`;
        }
      }
      html += `</select></div>`;
    } else {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-label">${name}</label>
          <input type="text" name="${name}" class="dlc-text-input" value="${input.value}">
        </div>
      `;
    }
  }
  
  html += `</div>`;
  
  // Generate buttons
  html += `<div class="dlc-dialog-buttons">`;
  for (const btn of mirrorData.buttons) {
    html += `
      <button type="button" class="dlc-dialog-btn" data-button="${btn.label}">
        ${btn.label}
      </button>
    `;
  }
  html += `</div>`;
  
  html += `</div></div>`;
  
  return html;
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
    diceEntryCancelled = false;
  }
  
  // Wait for user to enter this single die result
  const result = await waitForDiceResult(denomination, faces, dieNumber, count);
  
  // Handle null result (cancelled) - throw error to abort the roll
  if (result === null) {
    throw new Error("Roll cancelled by user");
  }
  
  return result;
}

// pendingDiceEntry and diceEntryCancelled declared at top of file

/**
 * Wait for user to enter a die result via our panel UI.
 */
async function waitForDiceResult(denomination, faces, dieNumber, totalDice) {
  // Check if entry was cancelled (from a previous die in the same roll)
  if (diceEntryCancelled) {
    return null; // Return null to trigger abort
  }
  
  return new Promise((resolve) => {
    // Store the resolver so our panel can call it when user enters a value
    pendingDiceEntry = {
      denomination,
      faces,
      dieNumber,
      totalDice,
      resolve
    };
    
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
  diceEntryCancelled = false;
  
  for (const term of diceTerms) {
    const termValues = [];
    for (let i = 0; i < term.count; i++) {
      currentDie++;
      
      if (diceEntryCancelled) {
        return "cancelled";
      }
      
      const value = await waitForDiceTrayEntry(`d${term.faces}`, term.faces, currentDie, totalDice);
      
      if (value === null || diceEntryCancelled) {
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
  if (diceEntryCancelled) {
    return null;
  }
  
  return new Promise((resolve) => {
    pendingDiceEntry = {
      denomination,
      faces,
      dieNumber,
      totalDice,
      resolve,
      isDiceTray: true
    };
    
    // Show dice entry UI
    pendingRollRequest = {
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
          pendingDiceEntry = null;
          pendingRollRequest = null;
          refreshPanel();
          resolve(numericValue);
        }
      }
    };
    
    collapsedSections.rollRequest = false;
    refreshPanel();
  });
}

/**
 * Show the dice entry UI in our panel
 */
function showDiceEntryUI(denomination, faces, dieNumber, totalDice) {
  // Set up a pending roll request for dice entry
  pendingRollRequest = {
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
      if (pendingDiceEntry && Array.isArray(values) && values.length > 0) {
        const numericValue = parseInt(values[0]);
        pendingDiceEntry.resolve(numericValue);
        pendingDiceEntry = null;
        pendingRollRequest = null;
        refreshPanel();
      }
    }
  };
  
  // Expand roll request section and refresh panel
  collapsedSections.rollRequest = false;
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
    
    // Load collapsed sections state from settings
    collapsedSections = getCollapsedSections();
    
    // Setup socket listeners
    setupSocketListeners();
    
    // Setup UI and handlers (dialog mirroring hooks fire after this)
    setupChatButtonHandlers();
    setupDialogMirroring();
    setupDiceFulfillment();
    
    // Expose refreshPanel and other core functions on global namespace for modules to use
    window.diceLink = window.diceLink || {};
    window.diceLink.refreshPanel = refreshPanel;
    window.diceLink.applyManualDice = applyManualDice;
    window.diceLink.applyDigitalDice = applyDigitalDice;
    window.diceLink.isUserInManualMode = isUserInManualMode;
    window.diceLink.playerRequestManual = playerRequestManual;
    window.diceLink.playerSwitchToDigital = playerSwitchToDigital;
    window.diceLink.getPlayerMode = getPlayerMode;
    window.diceLink.getGlobalOverride = getGlobalOverride;
    window.diceLink.updatePanelWithMirroredDialog = updatePanelWithMirroredDialog;

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

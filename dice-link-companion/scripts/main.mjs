/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.4.30
 * 
 * A player-GM dice mode management system with approval workflow.
 * Branded for Realm Bridge - https://realmbridge.co.uk
 */

const MODULE_ID = "dice-link-companion";
const REALM_BRIDGE_URL = "https://realmbridge.co.uk";
const LOGO_URL = "modules/dice-link-companion/assets/logo-header.png";
const LOGO_SQUARE_URL = "modules/dice-link-companion/assets/logo-square.png";

// Track if player has already requested this session
let hasRequestedThisSession = false;

// Track any pending intercepted roll request
let pendingRollRequest = null;
// { title, subtitle, formula, config, dialog, onComplete }

// Track collapsed sections state
const collapsedSections = {
  topRow: true, // Settings section (Permissions, Global Override, GM Mode)
  pending: true,
  playerModes: true,
  rollRequest: false, // Roll Request section - starts expanded
  videoFeed: true // Start collapsed
};

// ============================================================================
// DICE CONFIGURATION - Using Foundry v13 core settings
// ============================================================================

async function applyManualDice() {
  let currentConfig = {};
  try {
    currentConfig = game.settings.get("core", "diceConfiguration") || {};
  } catch (e) {}
  
  const newConfig = {
    ...currentConfig,
    d4: "manual",
    d6: "manual", 
    d8: "manual",
    d10: "manual",
    d12: "manual",
    d20: "manual",
    d100: "manual"
  };
  
  if (CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment.defaultMethod = "manual";
    if (CONFIG.Dice.fulfillment.dice) {
      CONFIG.Dice.fulfillment.dice.d4 = "manual";
      CONFIG.Dice.fulfillment.dice.d6 = "manual";
      CONFIG.Dice.fulfillment.dice.d8 = "manual";
      CONFIG.Dice.fulfillment.dice.d10 = "manual";
      CONFIG.Dice.fulfillment.dice.d12 = "manual";
      CONFIG.Dice.fulfillment.dice.d20 = "manual";
      CONFIG.Dice.fulfillment.dice.d100 = "manual";
    }
  }
  
  if (game.user.isGM) {
    try {
      await game.settings.set("core", "diceConfiguration", newConfig);
    } catch (e) {}
  }
}

async function applyDigitalDice() {
  const newConfig = {
    d4: "",
    d6: "",
    d8: "",
    d10: "",
    d12: "",
    d20: "",
    d100: ""
  };
  
  if (CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment.defaultMethod = "";
    if (CONFIG.Dice.fulfillment.dice) {
      CONFIG.Dice.fulfillment.dice.d4 = "";
      CONFIG.Dice.fulfillment.dice.d6 = "";
      CONFIG.Dice.fulfillment.dice.d8 = "";
      CONFIG.Dice.fulfillment.dice.d10 = "";
      CONFIG.Dice.fulfillment.dice.d12 = "";
      CONFIG.Dice.fulfillment.dice.d20 = "";
      CONFIG.Dice.fulfillment.dice.d100 = "";
    }
  }
  
  if (game.user.isGM) {
    try {
      await game.settings.set("core", "diceConfiguration", newConfig);
    } catch (e) {}
  }
}

// ============================================================================
// CHAT MESSAGE HELPERS
// ============================================================================

async function createRequestChatMessage(playerId, playerName) {
  const gmContent = `
    <div class="dice-link-request">
      <p><strong>${playerName}</strong> is requesting manual dice mode.</p>
      <div class="dlc-chat-buttons">
        <button type="button" class="dlc-chat-btn dlc-chat-approve" data-player-id="${playerId}">
          <i class="fas fa-check"></i> Approve
        </button>
        <button type="button" class="dlc-chat-btn dlc-chat-deny" data-player-id="${playerId}">
          <i class="fas fa-times"></i> Deny
        </button>
      </div>
    </div>
  `;

  await ChatMessage.create({
    content: gmContent,
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  const playerContent = `
    <div class="dice-link-result" style="border-left: 4px solid #7c3aed; padding: 10px;">
      <p>Your request for manual dice has been sent to the GM.</p>
    </div>
  `;

  await ChatMessage.create({
    content: playerContent,
    whisper: [playerId]
  });
}

async function createApprovalChatMessage(playerId, playerName, approved) {
  const status = approved ? "APPROVED" : "DENIED";
  const color = approved ? "#10b981" : "#ef4444";
  
  const content = `
    <div class="dice-link-result" style="border-left: 4px solid ${color}; padding: 10px;">
      <p><strong>${playerName}</strong>'s request for manual dice has been <strong style="color: ${color};">${status}</strong>.</p>
    </div>
  `;

  await ChatMessage.create({
    content,
    whisper: [playerId, ...game.users.filter(u => u.isGM).map(u => u.id)]
  });
}

// ============================================================================
// CHAT BUTTON HANDLERS
// ============================================================================

function setupChatButtonHandlers() {
  $(document).on("click", ".dlc-chat-approve", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!game.user.isGM) {
      ui.notifications.error("Only GMs can approve requests.");
      return;
    }

    const $btn = $(this);
    const $container = $btn.closest(".dice-link-request");
    const playerId = $btn.data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Remove buttons from ALL chat messages for this player
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request approved</em>');
    });

    await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
    
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "applyMode",
      playerId: playerId,
      mode: "manual"
    });
    
    await createApprovalChatMessage(playerId, player.name, true);
    ui.notifications.info(`Approved manual dice for ${player.name}.`);
    refreshPanel();
  });

  $(document).on("click", ".dlc-chat-deny", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!game.user.isGM) {
      ui.notifications.error("Only GMs can deny requests.");
      return;
    }

    const $btn = $(this);
    const $container = $btn.closest(".dice-link-request");
    const playerId = $btn.data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Remove buttons from ALL chat messages for this player
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request denied</em>');
    });

    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "requestDenied",
      playerId: playerId
    });
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
    refreshPanel();
  });
}

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

function setupSocketListeners() {
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    if (game.user.isGM && data.action === "playerRequestManual") {
      let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
      
      if (!pending.some(req => req.playerId === data.playerId)) {
        pending.push({ playerId: data.playerId, playerName: data.playerName });
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
      }

      await createRequestChatMessage(data.playerId, data.playerName);
      ui.notifications.warn(`${data.playerName} requested manual dice mode.`);
      refreshPanel();
    }

    if (game.user.isGM && data.action === "playerSwitchToDigital") {
      await game.settings.set(MODULE_ID, `playerMode_${data.playerId}`, "digital");
      refreshPanel();
    } else if (data.action === "playerSwitchToDigital") {
      // Another player switched to digital, refresh our panel to see the update
      refreshPanel();
    }

    if (data.action === "applyMode" && data.playerId === game.user.id) {
      if (data.mode === "manual") {
        applyManualDice();
        hasRequestedThisSession = false;
        ui.notifications.info("Manual dice mode activated!");
      } else {
        applyDigitalDice();
        ui.notifications.info("Digital dice mode activated!");
      }
      refreshPanel();
    } else if (data.action === "applyMode") {
      // Another player's mode changed, refresh our panel to see the update
      refreshPanel();
    }

    if (data.action === "globalOverride") {
      if (data.mode === "forceAllManual") {
        applyManualDice();
        ui.notifications.info("GM has forced manual dice for everyone.");
      } else if (data.mode === "forceAllDigital") {
        applyDigitalDice();
        ui.notifications.info("GM has forced digital dice for everyone.");
      } else if (data.mode === "individual") {
        // Revert to player's own stored mode
        const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        if (myMode === "manual") {
          applyManualDice();
        } else {
          applyDigitalDice();
        }
        ui.notifications.info("GM has returned to individual control.");
      }
      refreshPanel();
    }

    if (data.action === "revokeMode" && data.playerId === game.user.id) {
      applyDigitalDice();
      hasRequestedThisSession = false;
      ui.notifications.warn("GM has revoked your manual dice mode.");
      refreshPanel();
    } else if (data.action === "revokeMode") {
      // Another player's mode was revoked, refresh our panel to see the update
      refreshPanel();
    }

    if (data.action === "requestDenied" && data.playerId === game.user.id) {
      hasRequestedThisSession = false;
    }
  });
}

// ============================================================================
// PLAYER FUNCTIONS
// ============================================================================

function playerRequestManual() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    ui.notifications.warn("Manual dice is already globally forced by the GM.");
    return;
  }
  if (globalOverride === "forceAllDigital") {
    ui.notifications.warn("Digital dice is globally forced by the GM. Cannot request manual.");
    return;
  }

  if (hasRequestedThisSession) {
    ui.notifications.warn("You have already sent a request. Please wait for GM response.");
    return;
  }

  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerRequestManual",
    playerId: game.user.id,
    playerName: game.user.name
  });

  hasRequestedThisSession = true;
  ui.notifications.info("Manual dice request sent to GM.");
}

function playerSwitchToDigital() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    ui.notifications.warn("Manual dice is globally forced by the GM. Cannot switch to digital.");
    return;
  }

  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerSwitchToDigital",
    playerId: game.user.id
  });

  applyDigitalDice();
  hasRequestedThisSession = false;
  ui.notifications.info("Switched to digital dice.");
}

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
    // Clear and replace the content
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    // Get the HTML element (not jQuery in V2)
    const html = this.element;
    
    // Wrap in jQuery for compatibility with existing listener code
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
    // Adjust width based on GM/player
    if (!options.width) {
      options.width = this._isGM ? 480 : 390;
    }
    return super.setPosition(options);
  }
}

// ============================================================================
// ROLL REQUEST SECTION (shared between GM and Player panels)
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
  return `
    <div class="dlc-pending-roll">
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
      <div class="dlc-pending-roll-footer">
        <button type="button" class="dlc-roll-cancel-btn">Cancel Roll</button>
      </div>
    </div>
  `;
}

function generateRollRequestSection(mode, globalOverride) {
  // Determine effective mode
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

let currentPanelDialog = null;

function generateGMPanelContent() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  const pendingRequests = game.settings.get(MODULE_ID, "pendingRequests") || [];
  const gmMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
  const rolePermissions = getManualRollsPermissions();

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = game.settings.get(MODULE_ID, `playerMode_${user.id}`) || "digital";
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
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  const pendingRequests = game.settings.get(MODULE_ID, "pendingRequests") || [];
  const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
  const myPending = pendingRequests.some(req => req.playerId === game.user.id);

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = game.settings.get(MODULE_ID, `playerMode_${user.id}`) || "digital";
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
      await game.settings.set(MODULE_ID, "globalOverride", "forceAllManual");
      applyManualDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllManual" });
      ui.notifications.info("Forced all to manual dice.");
    } else {
      await game.settings.set(MODULE_ID, "globalOverride", "individual");
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "individual" });
      ui.notifications.info("Set to individual control.");
    }
    refreshPanel();
  });

  // Global override - All Digital toggle
  html.find(".dlc-override-digital").change(async function() {
    const checked = $(this).is(":checked");
    if (checked) {
      await game.settings.set(MODULE_ID, "globalOverride", "forceAllDigital");
      applyDigitalDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllDigital" });
      ui.notifications.info("Forced all to digital dice.");
    } else {
      await game.settings.set(MODULE_ID, "globalOverride", "individual");
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "individual" });
      ui.notifications.info("Set to individual control.");
    }
    refreshPanel();
  });

  // GM mode toggle (switch style)
  html.find(".dlc-gm-mode-toggle").change(async function() {
    const isManual = $(this).is(":checked");
    const newMode = isManual ? "manual" : "digital";
    
    await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
    
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
    
    await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
    
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
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
    
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);

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
    
    await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "digital");
    
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

  // Dice button clicks - add to formula
  html.find(".dlc-dice-btn").click(function() {
    const die = $(this).data("die");
    diceCounts[die]++;
    
    // Update badge
    const countEl = $(this).find(".dlc-die-count");
    countEl.text(diceCounts[die]).show();
    
    // Rebuild formula
    updateDiceFormula(html, diceCounts, currentModifier);
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
    const formula = html.find(".dlc-dice-formula-input").val().replace(/^\/r\s*/, "").trim();
    if (!formula) {
      ui.notifications.warn("Enter a dice formula first.");
      return;
    }
    
    try {
      const roll = new Roll(formula);
      await roll.evaluate();
      await roll.toChat({
        speaker: ChatMessage.getSpeaker(),
        flavor: "Manual Dice Roll"
      });
      
      // Reset the dice tray
      Object.keys(diceCounts).forEach(k => diceCounts[k] = 0);
      currentModifier = 0;
      html.find(".dlc-die-count").text("0").hide();
      html.find(".dlc-dice-modifier").text("0");
      html.find(".dlc-dice-formula-input").val("/r ");
    } catch (e) {
      ui.notifications.error("Invalid dice formula.");
    }
  });

  // ============================================================================
  // PENDING ROLL ACTION LISTENERS
  // ============================================================================

  // Advantage / Normal / Disadvantage buttons
  html.find(".dlc-roll-action-btn").click(async function() {
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

  // Cancel roll button
  html.find(".dlc-roll-cancel-btn").click(function() {
    if (pendingRollRequest?.onComplete) {
      pendingRollRequest.onComplete("cancel");
    } else {
      pendingRollRequest = null;
      refreshPanel();
    }
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
// INITIALIZATION
// ============================================================================

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "globalOverride", {
    scope: "world",
    config: false,
    type: String,
    default: "individual"
  });

  game.settings.register(MODULE_ID, "pendingRequests", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
});

Hooks.once("ready", () => {
  for (const user of game.users) {
    const key = `playerMode_${user.id}`;
    if (!game.settings.settings.has(`${MODULE_ID}.${key}`)) {
      game.settings.register(MODULE_ID, key, {
        scope: "world",
        config: false,
        type: String,
        default: "digital"
      });
    }
  }

  setupSocketListeners();
  setupChatButtonHandlers();
  setupRollInterception();
  setupMidiQolInterception();  // Add midi-qol specific hooks if available

  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    applyManualDice();
  } else if (globalOverride === "forceAllDigital") {
    applyDigitalDice();
  } else {
    const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    if (myMode === "manual") {
      applyManualDice();
    }
  }
});

// ============================================================================
// ROLL INTERCEPTION
// ============================================================================

function isUserInManualMode() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  if (globalOverride === "forceAllManual") return true;
  if (globalOverride === "forceAllDigital") return false;
  const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
  return myMode === "manual";
}

/**
 * Execute a roll directly using Foundry's Roll API.
 * This bypasses dnd5e/midi-qol hooks and is used as a fallback.
 */
async function executeDirectRoll(actor, formula, flavor, opts = {}) {
  try {
    let rollFormula = formula;
    let rollMode = "normal";
    
    // Handle advantage/disadvantage by modifying the d20 portion
    if (opts.advantage && !opts.disadvantage) {
      rollFormula = formula.replace("1d20", "2d20kh");
      rollMode = "advantage";
    } else if (opts.disadvantage && !opts.advantage) {
      rollFormula = formula.replace("1d20", "2d20kl");
      rollMode = "disadvantage";
    }
    
    // Handle critical for damage rolls (double dice)
    if (opts.critical) {
      // Double all dice in the formula (e.g., 2d6 + 3 becomes 4d6 + 3)
      rollFormula = rollFormula.replace(/(\d+)d(\d+)/g, (match, num, sides) => {
        return `${parseInt(num) * 2}d${sides}`;
      });
      rollMode = "critical";
    }
    
    // Add situational bonus if provided
    if (opts.situationalBonus) {
      rollFormula += ` + ${opts.situationalBonus}`;
    }
    
    // Create and evaluate the roll
    const roll = new Roll(rollFormula);
    await roll.evaluate();
    
    // Build the flavor text with mode indicator
    const modeText = rollMode === "advantage" ? " (Advantage)" : 
                    rollMode === "disadvantage" ? " (Disadvantage)" :
                    rollMode === "critical" ? " (Critical)" : "";
    const fullFlavor = `${flavor}${modeText}`;
    
    // Send to chat
    await roll.toChat({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: fullFlavor,
      rollMode: game.settings.get("core", "rollMode")
    });
    
    return true;
  } catch (e) {
    console.error("[v0] Error executing direct roll:", e);
    ui.notifications.error("Failed to execute roll.");
    return false;
  }
}

/**
 * Main interception function for all roll types.
 * Cancels the roll, shows our UI, then directly executes the roll with user's choices.
 * This approach bypasses the hook system entirely for the final roll execution.
 */
function interceptRoll(title, subtitle, formula, config, dialog, options = {}) {
  if (!isUserInManualMode()) {
    return true;
  }

  // Store everything needed for the pending roll
  pendingRollRequest = {
    title,
    subtitle,
    formula,
    config,        // Keep reference to original config
    dialog,
    situationalBonus: "",
    hasAdvantage: options.hasAdvantage !== false,
    hasDisadvantage: options.hasDisadvantage !== false,
    hasCritical: options.hasCritical || false,
    abilityOptions: options.abilityOptions || null,
    // Callback when user makes a choice
    onComplete: async (userChoice) => {
      if (userChoice === "cancel") {
        pendingRollRequest = null;
        refreshPanel();
        ui.notifications.info("Roll cancelled.");
        return;
      }
      
      pendingRollRequest = null;
      refreshPanel();
      
      // Instead of re-triggering through actor methods (which causes hook loops),
      // directly create and execute the roll, then send to chat
      try {
        // Build the roll formula
        let rollFormula = formula;
        
        // Handle advantage/disadvantage for d20 rolls
        if (userChoice.advantage || userChoice.disadvantage) {
          // Replace 1d20 with 2d20kh1 (advantage) or 2d20kl1 (disadvantage)
          if (rollFormula.includes("1d20")) {
            if (userChoice.advantage) {
              rollFormula = rollFormula.replace("1d20", "2d20kh1");
            } else if (userChoice.disadvantage) {
              rollFormula = rollFormula.replace("1d20", "2d20kl1");
            }
          }
        }
        
        // Add situational bonus
        if (userChoice.situationalBonus) {
          rollFormula += ` + ${userChoice.situationalBonus}`;
        }
        
        // Get actor for speaker
        const actor = config?.subject?.parent || config?.subject || game.user.character;
        
        // Build flavor text
        let flavor = title;
        if (subtitle && subtitle !== "Unknown") {
          flavor = `${title} - ${subtitle}`;
        }
        if (userChoice.advantage) {
          flavor += " (Advantage)";
        } else if (userChoice.disadvantage) {
          flavor += " (Disadvantage)";
        }
        
        // Create and evaluate the roll
        const roll = new Roll(rollFormula);
        await roll.evaluate();
        
        // Send to chat
        await roll.toChat({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: flavor,
          rollMode: game.settings.get("core", "rollMode")
        });
        
      } catch (e) {
        console.error("[v0] Error executing roll:", e);
        ui.notifications.error("Failed to execute roll");
      }
    },
    ...options
  };

  // Auto-open panel and expand the roll request section
  collapsedSections.rollRequest = false;
  
  // Check if panel is open and rendered
  const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
  
  if (!panelIsOpen) {
    openPanel();
  } else {
    refreshPanel();
  }

  // Return false to CANCEL this roll - we'll re-trigger it after user input
  return false;
}

/**
 * Helper to register a hook with fallback for V2 hook names
 * dnd5e 4.x uses hooks like "dnd5e.preRollSkillV2"
 * Older versions use "dnd5e.preRollSkill"
 */
function registerRollHook(v2HookName, v1HookName, callback) {
  // Register V2 hook (dnd5e 4.x+)
  Hooks.on(v2HookName, callback);
}

function setupRollInterception() {
  // Always register hooks - the interceptRoll function checks isUserInManualMode() dynamically
  // This allows mode changes at runtime without reloading

  registerRollHook("dnd5e.preRollSkillV2", "dnd5e.preRollSkill", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    const skillId = config?.skill || "";
    const skillLabel = CONFIG.DND5E?.skills?.[skillId]?.label || skillId;
    const abilityId = config?.ability || "";
    const abilityLabel = CONFIG.DND5E?.abilities?.[abilityId]?.label || abilityId;
    
    const skillData = actor?.system?.skills?.[skillId];
    const modifier = skillData?.total ?? 0;
    const formula = modifier >= 0 ? `1d20 + ${modifier}` : `1d20 - ${Math.abs(modifier)}`;
    
    return interceptRoll(
      `${skillLabel} Check`,
      actorName,
      formula,
      config,
      dialog,
      { 
        abilityOptions: abilityLabel, 
        hasAdvantage: true, 
        hasDisadvantage: true,
        // dnd5e 5.x: rollSkill takes options object with skill ID inside
        rollMethod: (opts) => actor.rollSkill({ skill: skillId, ability: abilityId, ...opts }),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // ABILITY CHECKS
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollAbilityTestV2", "dnd5e.preRollAbilityTest", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    const abilityId = config?.ability || "";
    const abilityLabel = CONFIG.DND5E?.abilities?.[abilityId]?.label || abilityId;
    
    const abilityMod = actor?.system?.abilities?.[abilityId]?.mod || 0;
    const formula = abilityMod >= 0 ? `1d20 + ${abilityMod}` : `1d20 - ${Math.abs(abilityMod)}`;
    
    return interceptRoll(
      `${abilityLabel} Check`,
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        // dnd5e 5.x: rollAbilityTest takes options object with ability ID inside
        rollMethod: (opts) => actor.rollAbilityTest({ ability: abilityId, ...opts }),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // SAVING THROWS
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollAbilitySaveV2", "dnd5e.preRollAbilitySave", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    const abilityId = config?.ability || "";
    const abilityLabel = CONFIG.DND5E?.abilities?.[abilityId]?.label || abilityId;
    
    const saveData = actor?.system?.abilities?.[abilityId]?.save;
    const modifier = saveData?.total ?? 0;
    const formula = modifier >= 0 ? `1d20 + ${modifier}` : `1d20 - ${Math.abs(modifier)}`;
    
    return interceptRoll(
      `${abilityLabel} Saving Throw`,
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        // dnd5e 5.x: rollAbilitySave takes options object with ability ID inside
        rollMethod: (opts) => actor.rollAbilitySave({ ability: abilityId, ...opts }),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // DEATH SAVES
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollDeathSaveV2", "dnd5e.preRollDeathSave", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    
    return interceptRoll(
      "Death Saving Throw",
      actorName,
      "1d20",
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        rollMethod: (opts) => actor.rollDeathSave(opts),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // ATTACK ROLLS
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollAttackV2", "dnd5e.preRollAttack", (config, dialog, ...rest) => {
    // Skip if midi-qol is active - it has its own hooks that preserve workflow
    if (game.modules.get("midi-qol")?.active) {
      return true;
    }
    
    const item = config?.subject;
    const actor = item?.parent;
    const actorName = actor?.name || "Unknown";
    const itemName = item?.name || "Attack";
    
    const attackBonus = item?.labels?.toHit || "";
    const formula = attackBonus ? `1d20 ${attackBonus}` : "1d20";
    
    return interceptRoll(
      `${itemName} Attack`,
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        rollMethod: (opts) => item.rollAttack(opts),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // DAMAGE ROLLS
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollDamageV2", "dnd5e.preRollDamage", (config, dialog, ...rest) => {
    // Skip if midi-qol is active - it has its own hooks that preserve workflow
    if (game.modules.get("midi-qol")?.active) {
      return true;
    }
    
    const item = config?.subject;
    const actor = item?.parent;
    const actorName = actor?.name || "Unknown";
    const itemName = item?.name || "Damage";
    
    const damageFormula = item?.labels?.damage || item?.system?.damage?.parts?.[0]?.[0] || "1d6";
    
    return interceptRoll(
      `${itemName} Damage`,
      actorName,
      damageFormula,
      config,
      dialog,
      { 
        hasAdvantage: false, 
        hasDisadvantage: false, 
        hasCritical: true,
        rollMethod: (opts) => item.rollDamage(opts),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // HIT DICE
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollHitDieV2", "dnd5e.preRollHitDie", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    
    const classes = actor?.classes || {};
    const firstClass = Object.values(classes)[0];
    const hitDie = firstClass?.system?.hitDice || "d8";
    const conMod = actor?.system?.abilities?.con?.mod || 0;
    const formula = conMod >= 0 ? `1${hitDie} + ${conMod}` : `1${hitDie} - ${Math.abs(conMod)}`;
    
    return interceptRoll(
      "Hit Die",
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: false, 
        hasDisadvantage: false,
        rollMethod: (opts) => actor.rollHitDie(opts),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // INITIATIVE
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollInitiativeV2", "dnd5e.preRollInitiative", (config, dialog, ...rest) => {
    const actor = config?.subject;
    const actorName = actor?.name || "Unknown";
    
    const initMod = actor?.system?.attributes?.init?.total ?? actor?.system?.abilities?.dex?.mod ?? 0;
    const formula = initMod >= 0 ? `1d20 + ${initMod}` : `1d20 - ${Math.abs(initMod)}`;
    
    return interceptRoll(
      "Initiative",
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        rollMethod: (opts) => actor.rollInitiative({ createCombatants: true, rerollInitiative: true, ...opts }),
        rollArgs: {}
      }
    );
  });

  // -------------------------------------------------------------------------
  // TOOL CHECKS
  // -------------------------------------------------------------------------
  registerRollHook("dnd5e.preRollToolCheckV2", "dnd5e.preRollToolCheck", (config, dialog, ...rest) => {
    const tool = config?.subject;
    const actor = tool?.parent;
    const actorName = actor?.name || "Unknown";
    const toolName = tool?.name || "Tool";
    
    const prof = tool?.system?.proficient || 0;
    const abilityId = tool?.system?.ability || "int";
    const abilityMod = actor?.system?.abilities?.[abilityId]?.mod || 0;
    const profBonus = actor?.system?.attributes?.prof || 0;
    const modifier = abilityMod + (prof * profBonus);
    const formula = modifier >= 0 ? `1d20 + ${modifier}` : `1d20 - ${Math.abs(modifier)}`;
    
    return interceptRoll(
      `${toolName} Check`,
      actorName,
      formula,
      config,
      dialog,
      { 
        hasAdvantage: true, 
        hasDisadvantage: true,
        // dnd5e 5.x: tool checks use item.rollToolCheck with options object
        rollMethod: (opts) => tool.rollToolCheck ? tool.rollToolCheck(opts) : actor.rollToolCheck({ tool: tool.id, ...opts }),
        rollArgs: {}
      }
    );
  });

}

// ============================================================================
// MIDI-QOL SPECIFIC INTERCEPTION
// ============================================================================

/**
 * Setup midi-qol specific hooks for attack and damage rolls.
 * Midi-qol's workflow hooks allow us to modify the workflow in-place,
 * which preserves the connection between attack rolls and the attack card.
 */
function setupMidiQolInterception() {
  // Only setup if midi-qol is active
  if (!game.modules.get("midi-qol")?.active) {
    console.log("[Dice Link] midi-qol not active, skipping midi-qol hooks");
    return;
  }
  
  console.log("[Dice Link] Setting up midi-qol workflow hooks");
  
  // Flag to track if we're waiting for user input
  let midiPendingWorkflow = null;
  
  /**
   * Intercept midi-qol attack rolls
   * The workflow object is "live" - modifications affect the roll
   */
  Hooks.on("midi-qol.preAttackRoll", (workflow) => {
    if (!isUserInManualMode()) return true;
    
    const item = workflow.item;
    const actor = workflow.actor;
    const actorName = actor?.name || "Unknown";
    const itemName = item?.name || "Attack";
    
    // Calculate attack formula
    const attackBonus = item?.labels?.toHit || "+0";
    const formula = `1d20 ${attackBonus}`;
    
    // Store workflow for later modification
    midiPendingWorkflow = workflow;
    
    // Create pending roll request
    pendingRollRequest = {
      title: `${itemName} Attack`,
      subtitle: actorName,
      formula,
      isMidiQol: true,
      workflow,
      situationalBonus: "",
      hasAdvantage: true,
      hasDisadvantage: true,
      hasCritical: false,
      onComplete: (userChoice) => {
        if (userChoice === "cancel") {
          pendingRollRequest = null;
          midiPendingWorkflow = null;
          refreshPanel();
          // Abort the midi-qol workflow
          workflow.aborted = true;
          ui.notifications.info("Roll cancelled.");
          return;
        }
        
        // Modify the workflow's roll options directly
        // This is the key to keeping the roll connected to midi's workflow
        if (userChoice.advantage) {
          workflow.advantage = true;
          workflow.rollOptions.advantage = true;
        }
        if (userChoice.disadvantage) {
          workflow.disadvantage = true;
          workflow.rollOptions.disadvantage = true;
        }
        
        // Add situational bonus if provided
        if (userChoice.situationalBonus) {
          if (!workflow.rollOptions.parts) workflow.rollOptions.parts = [];
          workflow.rollOptions.parts.push(userChoice.situationalBonus);
        }
        
        pendingRollRequest = null;
        midiPendingWorkflow = null;
        refreshPanel();
        
        // Continue the workflow - it will use our modified options
        workflow.attackRollComplete = false;
      }
    };
    
    // Open/refresh panel
    collapsedSections.rollRequest = false;
    const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
    if (!panelIsOpen) {
      openPanel();
    } else {
      refreshPanel();
    }
    
    // Don't cancel - let midi-qol proceed, but we've set up our UI
    // The issue is midi-qol doesn't wait for our input...
    // We need to return false to pause, then resume the workflow
    return false;
  });
  
  /**
   * Intercept midi-qol damage rolls
   */
  Hooks.on("midi-qol.preDamageRoll", (workflow) => {
    if (!isUserInManualMode()) return true;
    
    const item = workflow.item;
    const actor = workflow.actor;
    const actorName = actor?.name || "Unknown";
    const itemName = item?.name || "Damage";
    
    const damageFormula = item?.labels?.damage || "1d6";
    
    midiPendingWorkflow = workflow;
    
    pendingRollRequest = {
      title: `${itemName} Damage`,
      subtitle: actorName,
      formula: damageFormula,
      isMidiQol: true,
      workflow,
      situationalBonus: "",
      hasAdvantage: false,
      hasDisadvantage: false,
      hasCritical: true,
      onComplete: (userChoice) => {
        if (userChoice === "cancel") {
          pendingRollRequest = null;
          midiPendingWorkflow = null;
          refreshPanel();
          workflow.aborted = true;
          ui.notifications.info("Roll cancelled.");
          return;
        }
        
        // Apply critical if selected
        if (userChoice.critical) {
          workflow.isCritical = true;
          workflow.rollOptions.critical = true;
        }
        
        // Add situational bonus
        if (userChoice.situationalBonus) {
          if (!workflow.rollOptions.parts) workflow.rollOptions.parts = [];
          workflow.rollOptions.parts.push(userChoice.situationalBonus);
        }
        
        pendingRollRequest = null;
        midiPendingWorkflow = null;
        refreshPanel();
      }
    };
    
    collapsedSections.rollRequest = false;
    const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
    if (!panelIsOpen) {
      openPanel();
    } else {
      refreshPanel();
    }
    
    return false;
  });
}

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

/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.6.15
 * 
 * A player-GM dice mode management system with dialog mirroring.
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
  // Use our custom "dice-link" fulfillment method instead of "manual"
  // This uses our DiceLinkResolver which shows our panel UI
  if (CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment.defaultMethod = "dice-link";
    if (CONFIG.Dice.fulfillment.dice) {
      CONFIG.Dice.fulfillment.dice.d4 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d6 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d8 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d10 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d12 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d20 = "dice-link";
      CONFIG.Dice.fulfillment.dice.d100 = "dice-link";
    }
  }
  
  console.log("[Dice Link] Applied dice-link fulfillment method for manual mode");
}

async function applyDigitalDice() {
  // Remove our fulfillment method, restore digital dice
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
  
  // Also try to reset the user's core dice configuration setting
  // This is what Foundry's Configure Dice menu sets
  try {
    const diceConfig = game.settings.get("core", "diceConfiguration");
    if (diceConfig && typeof diceConfig === "object") {
      // Check if any dice are set to manual or dice-link
      let needsUpdate = false;
      const newConfig = {...diceConfig};
      for (const key of Object.keys(newConfig)) {
        if (newConfig[key] === "manual" || newConfig[key] === "dice-link") {
          newConfig[key] = "";
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        await game.settings.set("core", "diceConfiguration", newConfig);
        console.log("[Dice Link] Reset core diceConfiguration to digital");
      }
    }
  } catch (e) {
    // Setting may not exist or be inaccessible - that's OK
    console.log("[Dice Link] Could not reset core diceConfiguration:", e.message);
  }
  
  console.log("[Dice Link] Removed dice-link fulfillment, restored digital dice");
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
  // MIRRORED DIALOG - Replicate native dialog UI
  if (roll.isMirroredDialog && roll.mirrorData) {
    return generateMirroredDialogHTML(roll.mirrorData);
  }
  
  // STEP 2: Dice Entry (isFulfillment = true)
  if (roll.isFulfillment && roll.diceNeeded) {
    const diceInputs = roll.diceNeeded.map((die, index) => {
      // die.type is e.g. "d20", die.faces is the number of faces
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
        <div class="dlc-pending-roll-footer">
          <button type="button" class="dlc-roll-cancel-btn">Cancel Roll</button>
        </div>
      </div>
    `;
  }
  
  // STEP 1: Configuration (advantage/disadvantage/normal)
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
      await roll.toMessage({
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
    
    console.log("[Dice Link] Mirrored dialog button clicked:", buttonLabel, formValues);
    
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
    // Handle dice entry cancellation
    if (pendingDiceEntry) {
      // Resolve with 0 to abort the handler (it will return early)
      pendingDiceEntry.resolve(0);
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
  setupDiceFulfillment();  // Register as a dice fulfillment method
  setupDialogMirroring(); // Mirror native dialogs to our panel (v1.0.6.0)
  setupRollInterception();
  setupMidiQolInterception();  // Add midi-qol specific hooks if available
  setupInitiativeInterception();  // Special handling for initiative (bypasses fulfillment)

  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    applyManualDice();
  } else if (globalOverride === "forceAllDigital") {
    applyDigitalDice();
  } else {
    const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    if (myMode === "manual") {
      applyManualDice();
    } else {
      // IMPORTANT: Also apply digital dice settings on startup to clear any manual fulfillment
      applyDigitalDice();
    }
  }
});

// ============================================================================
// DIALOG MIRRORING SYSTEM - v1.0.6.0 Architecture
// Hide native dialogs and replicate them in our panel for system-agnostic control
// ============================================================================

// Store currently mirrored dialog data
let mirroredDialog = null;

/**
 * Detect when a dialog is about to render and mirror it to our panel.
 * Works with any system that uses Foundry dialogs (both legacy Dialog and ApplicationV2).
 */
function setupDialogMirroring() {
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
    if (isUserInManualMode()) {
      // Mark this roll to use our fulfillment
      console.log("[Dice Link] Setting initiative to use manual fulfillment");
    }
  });
  
  // Also hook into the roll itself to intercept initiative
  Hooks.on("dnd5e.preRollInitiative", (actor, roll) => {
    console.log("[Dice Link] Initiative pre-roll hook triggered for:", actor?.name);
    if (isUserInManualMode()) {
      console.log("[Dice Link] Manual mode active for initiative");
    }
  });
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
 */
function isRollDialog(app) {
  if (!app) return false;
  
  // Check app constructor name for known roll dialog classes
  const className = app.constructor?.name?.toLowerCase() || "";
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
  
  // Check app title for roll-related keywords
  const dialogTitle = (app.title || "").toLowerCase();
  const rollDialogKeywords = [
    "attack", "damage", "skill", "ability", "save", "saving", "death",
    "initiative", "hit die", "hit dice", "tool", "check", "roll",
    "concentration", "throw", "test"
  ];
  
  return rollDialogKeywords.some(keyword => dialogTitle.includes(keyword));
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
    updatePanelWithMirroredDialog(formData);
    
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
 * Update our panel to display the mirrored dialog UI
 */
function updatePanelWithMirroredDialog(formData) {
  // Clear previous pending roll request
  pendingRollRequest = null;
  
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
        if (mirroredDialog?.app) {
          mirroredDialog.app.close();
        }
        mirroredDialog = null;
        pendingRollRequest = null;
        refreshPanel();
        return;
      }
      
      // Apply user choices to the hidden dialog and submit it
      await submitMirroredDialog(userChoice);
      
      mirroredDialog = null;
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
  
  // Log to confirm dialog is showing
  console.log("[Dice Link] Panel updated with mirrored dialog:", formData.title);
}

/**
 * Apply user choices to the mirrored dialog and submit it
 */
async function submitMirroredDialog(userChoice) {
  if (!mirroredDialog) {
    console.error("[Dice Link] No mirrored dialog to submit");
    return;
  }
  
  const { app, html, data: formData } = mirroredDialog;
  
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
      console.log("[Dice Link] Clicking button in hidden dialog:", targetButton.label);
      
      // Make dialog visible temporarily so click works
      element.style.display = "block";
      
      // Click the button
      targetButton.element.click();
      
      // Small delay to let the click process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // The dialog should close itself after the button click
      // But hide it just in case
      if (element.style.display !== "none") {
        element.style.display = "none";
      }
    } else {
      console.error("[Dice Link] Could not find target button:", userChoice.buttonLabel);
      console.log("[Dice Link] Available buttons:", formData.buttons.map(b => b.label));
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
class DiceLinkResolver extends foundry.applications.dice.RollResolver {
  
  static DEFAULT_OPTIONS = {
    ...foundry.applications.dice.RollResolver.DEFAULT_OPTIONS,
    id: "dice-link-resolver",
    classes: ["dlc-resolver"],
    window: {
      title: "Dice Link - Enter Results"
    }
  };
  
  /**
   * Override to NOT render the default Foundry UI.
   * Instead, we show our panel's dice entry UI.
   */
  async _renderHTML(context, options) {
    // Don't render Foundry's UI - we use our panel instead
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<div class="dlc-resolver-placeholder" style="display:none;"></div>`;
    return wrapper;
  }
  
  /**
   * Override awaitFulfillment to use our panel UI
   */
  async awaitFulfillment() {
    console.log("[Dice Link] DiceLinkResolver.awaitFulfillment() called");
    const roll = this.roll;
    const fulfillable = this.fulfillable;
    
    console.log("[Dice Link] fulfillable.size:", fulfillable.size);
    
    if (fulfillable.size === 0) {
      console.log("[Dice Link] No fulfillable dice, returning early");
      return;
    }
    
    // Build list of dice needed from fulfillable terms
    const diceNeeded = [];
    for (const [term, config] of fulfillable) {
      for (let i = 0; i < term.number; i++) {
        diceNeeded.push({
          faces: term.faces,
          termId: config.id,
          dieIndex: i,
          method: config.method
        });
      }
    }
    
    console.log("[Dice Link] Resolver awaiting fulfillment for dice:", diceNeeded);
    
    // Show our panel UI and wait for user input
    const results = await this._showDiceLinkPanel(roll.formula, diceNeeded);
    
    if (results === null) {
      // User cancelled - throw to abort
      throw new Error("Roll cancelled by user");
    }
    
    // Register results with Foundry's system
    let resultIndex = 0;
    for (const [term, config] of fulfillable) {
      for (let i = 0; i < term.number; i++) {
        const value = results[resultIndex];
        if (value !== undefined && value !== null) {
          // Use the static method to register the result
          Roll.registerResult(config.method, `d${term.faces}`, value);
        }
        resultIndex++;
      }
    }
  }
  
  /**
   * Show our panel's dice entry UI and return a promise that resolves with results
   */
  _showDiceLinkPanel(formula, diceNeeded) {
    return new Promise((resolve) => {
      pendingDiceFulfillment = {
        formula,
        diceNeeded,
        resolve
      };
      
      // Update the pending roll request to show dice input UI
      pendingRollRequest = {
        title: "Roll Dice",
        subtitle: formula,
        formula: formula,
        diceNeeded: diceNeeded,
        isFulfillment: true,
        step: "diceEntry",
        situationalBonus: "",
        hasAdvantage: false,
        hasDisadvantage: false,
        hasCritical: false,
        onComplete: (userChoice) => {
          pendingDiceFulfillment = null;
          pendingRollRequest = null;
          refreshPanel();
          
          if (userChoice === "cancel") {
            resolve(null);
            return;
          }
          
          // userChoice.diceResults should be array of values
          resolve(userChoice.diceResults || []);
        }
      };
      
      // Open/refresh the panel
      collapsedSections.rollRequest = false;
      const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
      if (!panelIsOpen) {
        openPanel();
      } else {
        refreshPanel();
      }
    });
  }
}

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
  
  console.log("[Dice Link] Custom fulfillment method registered with handler");
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
  const dieNumber = (index !== undefined ? index : 0) + 1;
  
  console.log("[Dice Link] Handler called for", denomination, "- die", dieNumber, "of", count);
  
  // Wait for user to enter this single die result
  const result = await waitForDiceResult(denomination, faces, dieNumber, count);
  
  console.log("[Dice Link] Returning result:", result);
  return result;
}

// Store for pending dice entry
let pendingDiceEntry = null;

/**
 * Wait for user to enter a die result via our panel UI.
 */
async function waitForDiceResult(denomination, faces, dieNumber, totalDice) {
  console.log("[Dice Link] Waiting for", denomination, "result (die", dieNumber, "of", totalDice, ")");
  
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
        console.log("[Dice Link] Dice entry completed with value:", numericValue);
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
  const diceTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
  
  for (const die of diceTypes) {
    CONFIG.Dice.fulfillment.dice[die] = "dice-link";
  }
  
  CONFIG.Dice.fulfillment.defaultMethod = "dice-link";
  console.log("[Dice Link] Applied dice-link fulfillment to all dice");
}

/**
 * Remove Dice Link fulfillment (restore default digital).
 * Called when user is set to digital mode.
 */
function removeDiceLinkFulfillment() {
  const diceTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
  
  for (const die of diceTypes) {
    CONFIG.Dice.fulfillment.dice[die] = "";
  }
  
  CONFIG.Dice.fulfillment.defaultMethod = "";
  console.log("[Dice Link] Removed dice-link fulfillment, restored digital");
}

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
    await roll.toMessage({
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

// Store pending configuration to pass to dice fulfillment
let pendingRollConfig = null;

/**
 * Parse dice from a formula string to determine what dice inputs we need
 * Returns array of {faces, count} for each dice type
 */
function parseDiceFromFormula(formula) {
  const diceNeeded = [];
  // Match patterns like 2d20, 1d8, 4d6, etc.
  const diceRegex = /(\d+)d(\d+)/gi;
  let match;
  
  while ((match = diceRegex.exec(formula)) !== null) {
    const count = parseInt(match[1]) || 1;
    const faces = parseInt(match[2]) || 20;
    
    // Add individual dice entries
    for (let i = 0; i < count; i++) {
      diceNeeded.push({ faces, index: diceNeeded.length });
    }
  }
  
  return diceNeeded;
}

/**
 * Execute a roll with user-provided dice values
 */
async function executeRollWithValues(formula, diceResults, title, subtitle, rollConfig, originalConfig) {
  try {
    // Create the roll
    const roll = new Roll(formula);
    
    // We need to manually set the dice results before evaluation
    // Parse the roll to get terms
    await roll.evaluate({ allowInteractive: false });
    
    // Now we need to replace the random results with user values
    let resultIndex = 0;
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.DiceTerm) {
        for (let i = 0; i < term.results.length; i++) {
          if (diceResults[resultIndex] !== undefined) {
            term.results[i].result = diceResults[resultIndex];
          }
          resultIndex++;
        }
        // Recalculate the term's total
        term._evaluateModifiers();
      }
    }
    
    // Recalculate the roll total
    roll._total = roll._evaluateTotal();
    
    // Build flavor text
    let flavor = title;
    if (subtitle && subtitle !== "Unknown") {
      flavor = `${title} - ${subtitle}`;
    }
    if (rollConfig?.advantage) {
      flavor += " (Advantage)";
    } else if (rollConfig?.disadvantage) {
      flavor += " (Disadvantage)";
    }
    
    // Get actor for speaker
    const actor = originalConfig?.subject?.parent || originalConfig?.subject || game.user.character;
    
    // Send to chat
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavor,
      rollMode: game.settings.get("core", "rollMode")
    });
    
  } catch (e) {
    console.error("[Dice Link] Error executing roll with values:", e);
    ui.notifications.error("Failed to execute roll.");
  }
}

/**
 * STEP 1: Configuration Interception
 * Shows our UI for Advantage/Disadvantage/Normal selection and situational bonuses.
 * After user makes their choice, we apply it to the config and re-trigger the roll.
 * The dice fulfillment (Step 2) will then handle getting the actual dice values.
 */
/**
 * LEGACY - Kept for reference but no longer used in v1.0.6.0
 * This was the old approach that cancelled and re-triggered rolls.
 * Now replaced by setupDialogMirroring() which is system-agnostic.
 */
function interceptRoll(title, subtitle, formula, config, dialog, options = {}) {
  // DEPRECATED - See setupDialogMirroring() instead
  return true;
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
  // v1.0.6.0: With dialog mirroring, we don't need complex roll hooks.
  // The setupDialogMirroring() function automatically detects and mirrors all roll dialogs.
  // These hooks are now just pass-through to let the system proceed normally.
  
  registerRollHook("dnd5e.preRollSkillV2", "dnd5e.preRollSkill", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollAbilityTestV2", "dnd5e.preRollAbilityTest", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollAbilitySaveV2", "dnd5e.preRollAbilitySave", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollDeathSaveV2", "dnd5e.preRollDeathSave", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollAttackV2", "dnd5e.preRollAttack", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollDamageV2", "dnd5e.preRollDamage", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollHitDieV2", "dnd5e.preRollHitDie", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollInitiativeV2", "dnd5e.preRollInitiative", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });

  registerRollHook("dnd5e.preRollToolCheckV2", "dnd5e.preRollToolCheck", (config, dialog, ...rest) => {
    // Dialog mirroring handles this - just pass through
    return true;
  });
}

// ============================================================================
// MIDI-QOL SPECIFIC INTERCEPTION
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
// INITIATIVE INTERCEPTION
// Initiative rolls bypass the fulfillment system, so we need special handling
// ============================================================================

function setupInitiativeInterception() {
  console.log("[Dice Link] Setting up initiative interception...");
  
  // Hook into dnd5e's pre-roll initiative hook
  // This fires before the initiative roll is made
  Hooks.on("dnd5e.preRollInitiative", async (actor, roll) => {
    console.log("[Dice Link] preRollInitiative hook for:", actor?.name);
    
    if (!isUserInManualMode()) {
      console.log("[Dice Link] Digital mode - allowing normal initiative");
      return true; // Let normal roll proceed
    }
    
    console.log("[Dice Link] Manual mode - intercepting initiative roll");
    // For now, we log this - full implementation would prompt for manual entry
    // The challenge is that this hook can't easily be made async to wait for user input
    return true;
  });
  
  // For manual initiative, we can use the combatant update hook
  // After initiative is rolled, we can detect it and prompt for correction
  Hooks.on("updateCombatant", (combatant, changes, options, userId) => {
    if (changes.initiative !== undefined && userId === game.user.id) {
      console.log("[Dice Link] Combatant initiative updated:", combatant.name, "to", changes.initiative);
      
      if (isUserInManualMode() && !combatant._manualInitiativeSet) {
        console.log("[Dice Link] Manual mode - initiative was auto-rolled, prompting for manual entry");
        // Show a prompt to allow manual override
        promptManualInitiative(combatant, changes.initiative);
      }
    }
  });
}

/**
 * Prompt user to enter manual initiative value
 */
async function promptManualInitiative(combatant, autoRolledValue) {
  // Show our dice entry UI for initiative
  return new Promise((resolve) => {
    pendingRollRequest = {
      title: `Initiative: ${combatant.name}`,
      subtitle: `Auto-rolled: ${autoRolledValue} - Enter your d20 result`,
      isFulfillment: true,
      step: "diceEntry",
      diceNeeded: [{
        type: "d20",
        faces: 20,
        index: 0,
        count: 1
      }],
      onComplete: async (values) => {
        if (Array.isArray(values) && values.length > 0) {
          const manualD20 = parseInt(values[0]);
          console.log("[Dice Link] Manual initiative d20:", manualD20);
          
          // Calculate the new initiative with the manual roll
          // Initiative = d20 + dex mod + any bonuses
          // We need to extract the modifier from the auto-rolled value
          const actor = combatant.actor;
          const initBonus = actor?.system?.attributes?.init?.total || 0;
          const newInitiative = manualD20 + initBonus;
          
          console.log("[Dice Link] Setting initiative to:", newInitiative, "(d20:", manualD20, "+ bonus:", initBonus, ")");
          
          // Mark this combatant so we don't re-prompt
          combatant._manualInitiativeSet = true;
          
          // Update the combatant's initiative
          await combatant.update({ initiative: newInitiative });
          
          combatant._manualInitiativeSet = false;
          ui.notifications.info(`${combatant.name} initiative set to ${newInitiative}`);
        }
        
        pendingRollRequest = null;
        refreshPanel();
        resolve();
      }
    };
    
    collapsedSections.rollRequest = false;
    refreshPanel();
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

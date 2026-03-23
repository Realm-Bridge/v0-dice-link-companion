/**
 * Dice Link Companion - Foundry VTT v13
 * Version 1.0.2.7
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

// Track collapsed sections state
const collapsedSections = {
  topRow: false, // Settings section (Permissions, Global Override, GM Mode)
  pending: false,
  playerModes: false,
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

    $container.find(".dlc-chat-btn").prop("disabled", true).addClass("dlc-btn-disabled");
    $container.find(".dlc-chat-buttons").html('<em>Request approved</em>');

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

    $container.find(".dlc-chat-btn").prop("disabled", true).addClass("dlc-btn-disabled");
    $container.find(".dlc-chat-buttons").html('<em>Request denied</em>');

    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "requestDenied",
      playerId: playerId
    });
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
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
    }

    if (data.action === "globalOverride") {
      if (data.mode === "forceAllManual") {
        applyManualDice();
        ui.notifications.info("GM has forced manual dice for everyone.");
      } else if (data.mode === "forceAllDigital") {
        applyDigitalDice();
        ui.notifications.info("GM has forced digital dice for everyone.");
      }
      refreshPanel();
    }

    if (data.action === "revokeMode" && data.playerId === game.user.id) {
      applyDigitalDice();
      hasRequestedThisSession = false;
      ui.notifications.warn("GM has revoked your manual dice mode.");
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
        <div class="dlc-mini-section">
          <h4>Global Override</h4>
          <div class="dlc-three-way-container">
            <div class="dlc-three-way-switch">
              <button type="button" class="dlc-three-way-option ${globalOverride === 'individual' ? 'active individual' : ''}" data-value="individual">
                Individual
              </button>
              <button type="button" class="dlc-three-way-option ${globalOverride === 'forceAllManual' ? 'active force-manual' : ''}" data-value="forceAllManual">
                All Manual
              </button>
              <button type="button" class="dlc-three-way-option ${globalOverride === 'forceAllDigital' ? 'active force-digital' : ''}" data-value="forceAllDigital">
                All Digital
              </button>
            </div>
            <div class="dlc-override-status">
              ${globalOverride === 'individual' ? 'Players control their own mode' : 
                globalOverride === 'forceAllManual' ? 'All forced to manual dice' : 
                'All forced to digital dice'}
            </div>
          </div>
        </div>

        <!-- GM Mode -->
        <div class="dlc-mini-section">
          <h4>Your Dice Mode</h4>
          <div class="dlc-gm-toggle">
            <div class="dlc-mode-switch">
              <button type="button" class="dlc-mode-option ${gmMode === 'digital' ? 'active digital' : ''}" data-mode="digital">
                <i class="fas fa-desktop"></i> Digital
              </button>
              <button type="button" class="dlc-mode-option ${gmMode === 'manual' ? 'active manual' : ''}" data-mode="manual">
                <i class="fas fa-dice"></i> Manual
              </button>
            </div>
            <button type="button" class="dlc-btn dlc-btn-secondary dlc-refresh-btn" style="margin-top: 8px; width: 100%;">
              <i class="fas fa-sync-alt"></i> Refresh Panel
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
            ${players.length > 0 ? `
              <div class="dlc-players-grid">
                ${players.map(player => `
                  <div class="dlc-player-card">
                    <div class="dlc-player-info">
                      <span class="dlc-player-name">${player.name}</span>
                      <span class="dlc-mode-badge ${player.isPending ? 'pending' : player.mode}">${player.isPending ? 'Pending' : player.mode}</span>
                    </div>
                    <div class="dlc-player-actions">
                      ${player.canRevoke ? `
                        <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-warning dlc-panel-revoke" data-player-id="${player.id}">
                          Revoke
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="dlc-no-players">No players connected.</p>'}
          </div>
        </div>

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
    const mode = game.settings.get(MODULE_ID, `playerMode_${user.id}`) || "digital";
    const isPending = pendingRequests.some(req => req.playerId === user.id);
    players.push({
      id: user.id,
      name: user.name,
      mode,
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
            <div class="dlc-player-split-layout">
              <!-- Left: Self Player Status -->
              <div class="dlc-player-self-section">
                ${selfPlayer ? `
                  <div class="dlc-player-card dlc-player-card-self">
                    <div class="dlc-player-info">
                      <span class="dlc-player-name">${selfPlayer.name}</span>
                      <span class="dlc-self-indicator">(You)</span>
                      <span class="dlc-mode-badge ${selfPlayer.isPending ? 'pending' : selfPlayer.mode}">${selfPlayer.isPending ? 'Pending' : selfPlayer.mode}</span>
                    </div>
                    <div class="dlc-player-actions">
                      ${canRequest ? `
                        <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-success dlc-player-request">
                          <i class="fas fa-dice"></i> Request Manual
                        </button>
                      ` : ''}
                      ${myPending ? `
                        <span class="dlc-mode-badge pending">Awaiting GM</span>
                      ` : ''}
                      ${canSwitchToDigital ? `
                        <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-secondary dlc-player-digital">
                          <i class="fas fa-desktop"></i> Switch to Digital
                        </button>
                      ` : ''}
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Right: Other Players Status (2 columns) -->
              <div class="dlc-player-others-section">
                ${otherPlayers.length > 0 ? `
                  <div class="dlc-players-grid dlc-other-players-grid">
                    ${otherPlayers.map(player => `
                      <div class="dlc-player-card">
                        <div class="dlc-player-info">
                          <span class="dlc-player-name">${player.name}</span>
                          <span class="dlc-mode-badge ${player.isPending ? 'pending' : player.mode}">${player.isPending ? 'Pending' : player.mode}</span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : '<p class="dlc-no-players">No other players connected.</p>'}
              </div>
            </div>
            ${globalOverride !== "individual" ? `
              <p class="dlc-no-players" style="margin-top: 10px;">
                <i class="fas fa-lock"></i> GM has set global override: ${globalOverride === "forceAllManual" ? "All Manual" : "All Digital"}
              </p>
            ` : ''}
          </div>
        </div>

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

  // Global override 3-way switch
  html.find(".dlc-three-way-option").click(async function() {
    const newValue = $(this).data("value");
    await game.settings.set(MODULE_ID, "globalOverride", newValue);
    
    if (newValue === "forceAllManual") {
      applyManualDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllManual" });
      ui.notifications.info("Forced all to manual dice.");
    } else if (newValue === "forceAllDigital") {
      applyDigitalDice();
      game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllDigital" });
      ui.notifications.info("Forced all to digital dice.");
    } else {
      ui.notifications.info("Set to individual control.");
    }
    refreshPanel();
  });

  // GM mode toggle
  html.find(".dlc-mode-option").click(async function() {
    const newMode = $(this).data("mode");
    const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    
    if (newMode !== currentMode) {
      await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
      
      if (newMode === "manual") {
        applyManualDice();
        ui.notifications.info("Your dice: Manual");
      } else {
        applyDigitalDice();
        ui.notifications.info("Your dice: Digital");
      }
      refreshPanel();
    }
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
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

function refreshPanel() {
  if (currentPanelDialog && currentPanelDialog.rendered) {
    const isGM = game.user.isGM;
    const newContent = isGM ? generateGMPanelContent() : generatePlayerPanelContent();
    const contentElement = currentPanelDialog.element.find(".dialog-content");
    contentElement.html(newContent);
    
    if (isGM) {
      attachGMPanelListeners(currentPanelDialog.element);
    } else {
      attachPlayerPanelListeners(currentPanelDialog.element);
    }

    // Recalculate dialog height to fit content after collapse/expand
    currentPanelDialog.setPosition({ height: "auto" });
  }
}

function openPanel() {
  if (currentPanelDialog && currentPanelDialog.rendered) {
    currentPanelDialog.close();
  }

  const isGM = game.user.isGM;
  const content = isGM ? generateGMPanelContent() : generatePlayerPanelContent();

  currentPanelDialog = new Dialog({
    title: "Dice Link Companion",
    content,
    buttons: {},
    default: "close",
    render: (html) => {
      // Add custom class to dialog for styling
      html.closest(".app").addClass("dlc-dialog");
      
      if (isGM) {
        attachGMPanelListeners(html);
      } else {
        attachPlayerPanelListeners(html);
      }
    },
    close: () => {
      currentPanelDialog = null;
    }
  }, {
    width: isGM ? 660 : 560,
    height: "auto",
    resizable: true
  });
  
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
// PUBLIC API
// ============================================================================

globalThis.DiceLinkCompanion = {
  openPanel,
  applyManual: applyManualDice,
  applyDigital: applyDigitalDice,
  requestManual: playerRequestManual,
  switchToDigital: playerSwitchToDigital
};

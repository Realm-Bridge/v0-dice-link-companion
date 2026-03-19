/**
 * Dice Link Companion - Foundry VTT v13
 * 
 * A player-GM dice mode management system with approval workflow.
 */

const MODULE_ID = "dice-link-companion";

// Track if player has already requested this session
let hasRequestedThisSession = false;

// ============================================================================
// DICE CONFIGURATION - Using Foundry v13 core settings
// ============================================================================

/**
 * Apply manual dice mode by updating the core diceConfiguration setting.
 * This is the same setting that Foundry's Configure Dice UI modifies.
 */
async function applyManualDice() {
  // Get current dice configuration from core settings (if accessible)
  let currentConfig = {};
  try {
    currentConfig = game.settings.get("core", "diceConfiguration") || {};
  } catch (e) {
    // Could not read core diceConfiguration, using empty object
  }
  
  // Build new configuration with all dice set to manual
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
  
  // Update the live CONFIG object immediately
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
  
  // Only GMs can update core settings
  if (game.user.isGM) {
    try {
      await game.settings.set("core", "diceConfiguration", newConfig);
    } catch (e) {
      // Failed to save core diceConfiguration
    }
  }
}

/**
 * Apply digital dice mode by clearing the dice configuration.
 */
async function applyDigitalDice() {
  // Build empty configuration (digital/default)
  const newConfig = {
    d4: "",
    d6: "",
    d8: "",
    d10: "",
    d12: "",
    d20: "",
    d100: ""
  };
  
  // Update the live CONFIG object immediately
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
  
  // Only GMs can update core settings
  if (game.user.isGM) {
    try {
      await game.settings.set("core", "diceConfiguration", newConfig);
    } catch (e) {
      // Failed to clear core diceConfiguration
    }
  }
}

// ============================================================================
// CHAT MESSAGE HELPERS
// ============================================================================

async function createRequestChatMessage(playerId, playerName) {
  // Message for GM with buttons
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

  // Message for player (no buttons)
  const playerContent = `
    <div class="dice-link-result" style="border-left: 4px solid #6C5CE7; padding: 10px;">
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
  const color = approved ? "#27AE60" : "#E74C3C";
  
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
  // Use document-level delegation for chat buttons
  $(document).on("click", ".dlc-chat-approve", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!game.user.isGM) {
      ui.notifications.error("Only GMs can approve requests.");
      return;
    }

    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Update setting
    await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
    
    // Clear from pending
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    // Send socket to player
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

    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Clear from pending
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
  });
}

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

function setupSocketListeners() {
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    // GM receives player request for manual
    if (game.user.isGM && data.action === "playerRequestManual") {
      
      let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
      
      if (!pending.some(req => req.playerId === data.playerId)) {
        pending.push({ playerId: data.playerId, playerName: data.playerName });
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
      }

      await createRequestChatMessage(data.playerId, data.playerName);
      ui.notifications.warn(`${data.playerName} requested manual dice mode.`);
    }

    // GM receives player switch to digital
    if (game.user.isGM && data.action === "playerSwitchToDigital") {
      await game.settings.set(MODULE_ID, `playerMode_${data.playerId}`, "digital");
    }

    // Player receives mode application
    if (data.action === "applyMode" && data.playerId === game.user.id) {
      
      if (data.mode === "manual") {
        applyManualDice();
        hasRequestedThisSession = false; // Reset so they can toggle again
        ui.notifications.info("Manual dice mode activated!");
      } else {
        applyDigitalDice();
        ui.notifications.info("Digital dice mode activated!");
      }
    }

    // Global override
    if (data.action === "globalOverride") {
      
      if (data.mode === "forceAllManual") {
        applyManualDice();
        ui.notifications.info("GM has forced manual dice for everyone.");
      } else if (data.mode === "forceAllDigital") {
        applyDigitalDice();
        ui.notifications.info("GM has forced digital dice for everyone.");
      }
    }

    // Revoke
    if (data.action === "revokeMode" && data.playerId === game.user.id) {
      applyDigitalDice();
      hasRequestedThisSession = false;
      ui.notifications.warn("GM has revoked your manual dice mode.");
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

  // Send socket to GM only - no setting updates
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

  // Send socket to GM to update setting
  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerSwitchToDigital",
    playerId: game.user.id
  });

  // Apply locally
  applyDigitalDice();
  hasRequestedThisSession = false;
  ui.notifications.info("Switched to digital dice.");
}

// ============================================================================
// GM MANAGEMENT PANEL
// ============================================================================

// Store reference to current dialog for live refresh
let currentPanelDialog = null;

/**
 * Role levels in Foundry VTT:
 * 1 = Player
 * 2 = Trusted Player  
 * 3 = Assistant GM
 * 4 = GM (always has permission, disableGM: true)
 * 
 * The permission key is MANUAL_ROLLS (not MANUAL_DICE_ROLL)
 */
const ROLE_NAMES = {
  1: "Player",
  2: "Trusted Player",
  3: "Assistant GM",
  4: "GM"
};

/**
 * Get which roles have MANUAL_ROLLS permission enabled.
 * Returns an object { 1: true/false, 2: true/false, 3: true/false, 4: true/false }
 */
function getManualRollsPermissions() {
  try {
    const permissions = game.settings.get("core", "permissions") || {};
    const roles = permissions.MANUAL_ROLLS || [];
    return {
      1: roles.includes(1),
      2: roles.includes(2),
      3: roles.includes(3),
      4: true // GM always has permission (disableGM: true means can't be turned off)
    };
  } catch (e) {
    return { 1: false, 2: false, 3: false, 4: true };
  }
}

/**
 * Set MANUAL_ROLLS permission for a specific role.
 */
async function setManualRollsPermission(role, enabled) {
  try {
    const permissions = game.settings.get("core", "permissions") || {};
    let roles = permissions.MANUAL_ROLLS || [];
    
    // Make a copy to avoid mutation issues
    roles = [...roles];
    
    if (enabled && !roles.includes(role)) {
      roles.push(role);
    } else if (!enabled && roles.includes(role)) {
      roles = roles.filter(r => r !== role);
    }
    
    // Sort for consistency
    roles.sort((a, b) => a - b);
    
    permissions.MANUAL_ROLLS = roles;
    await game.settings.set("core", "permissions", permissions);
    return true;
  } catch (e) {
    ui.notifications.error(`Failed to update manual rolls permission for role ${role}.`);
    return false;
  }
}

function generatePanelContent() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  const pendingRequests = game.settings.get(MODULE_ID, "pendingRequests") || [];
  const gmMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
  const rolePermissions = getManualRollsPermissions();

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const mode = game.settings.get(MODULE_ID, `playerMode_${user.id}`) || "digital";
    players.push({
      id: user.id,
      name: user.name,
      mode,
      hasPending: pendingRequests.some(req => req.playerId === user.id),
      canRevoke: mode === "manual"
    });
  }

  // Check if any non-GM role has permission
  const anyRoleEnabled = rolePermissions[1] || rolePermissions[2] || rolePermissions[3];

  return `
    <div class="dlc-panel">
      <div class="dlc-section dlc-permission-section ${anyRoleEnabled ? 'dlc-permission-ok' : 'dlc-permission-warning'}">
        <h3>Manual Roll Permissions</h3>
        <p class="dlc-permission-note">
          Enable "Make Manual Rolls" permission for each user role. Required for players to use this module.
        </p>
        
        <div class="dlc-role-toggles">
          <div class="dlc-toggle-row">
            <label class="dlc-switch">
              <input type="checkbox" class="dlc-role-toggle" data-role="1" ${rolePermissions[1] ? 'checked' : ''}>
              <span class="dlc-slider"></span>
            </label>
            <span class="dlc-toggle-label">Player</span>
          </div>
          
          <div class="dlc-toggle-row">
            <label class="dlc-switch">
              <input type="checkbox" class="dlc-role-toggle" data-role="2" ${rolePermissions[2] ? 'checked' : ''}>
              <span class="dlc-slider"></span>
            </label>
            <span class="dlc-toggle-label">Trusted Player</span>
          </div>
          
          <div class="dlc-toggle-row">
            <label class="dlc-switch">
              <input type="checkbox" class="dlc-role-toggle" data-role="3" ${rolePermissions[3] ? 'checked' : ''}>
              <span class="dlc-slider"></span>
            </label>
            <span class="dlc-toggle-label">Assistant GM</span>
          </div>
          
          <div class="dlc-toggle-row dlc-disabled">
            <label class="dlc-switch">
              <input type="checkbox" checked disabled>
              <span class="dlc-slider"></span>
            </label>
            <span class="dlc-toggle-label">GM <em>(always enabled)</em></span>
          </div>
        </div>
      </div>

      <div class="dlc-section">
        <h3>Global Override</h3>
        <div class="dlc-row">
          <select id="dlc-global-override" class="dlc-select">
            <option value="individual" ${globalOverride === "individual" ? "selected" : ""}>Individual Control</option>
            <option value="forceAllManual" ${globalOverride === "forceAllManual" ? "selected" : ""}>Force All Manual</option>
            <option value="forceAllDigital" ${globalOverride === "forceAllDigital" ? "selected" : ""}>Force All Digital</option>
          </select>
          <button type="button" id="dlc-apply-global" class="dlc-button dlc-apply-btn">Apply</button>
        </div>
      </div>

      <div class="dlc-section">
        <h3>Your Mode: <span class="dlc-mode-badge ${gmMode}">${gmMode === "manual" ? "Manual" : "Digital"}</span></h3>
        <button type="button" id="dlc-toggle-own" class="dlc-button">Toggle Your Dice Mode</button>
      </div>

      ${pendingRequests.length > 0 ? `
        <div class="dlc-section dlc-pending">
          <h3>Pending Requests (${pendingRequests.length})</h3>
          ${pendingRequests.map(req => `
            <div class="dlc-player-row">
              <span>${req.playerName}</span>
              <div class="dlc-buttons">
                <button type="button" class="dlc-btn-small dlc-panel-approve" data-player-id="${req.playerId}">Approve</button>
                <button type="button" class="dlc-btn-small dlc-panel-deny" data-player-id="${req.playerId}">Deny</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="dlc-section">
        <h3>Player Modes</h3>
        ${players.length > 0 ? players.map(player => `
          <div class="dlc-player-row">
            <span>${player.name}: <span class="dlc-mode-badge ${player.mode}">${player.mode === "manual" ? "Manual" : "Digital"}</span></span>
            <div class="dlc-buttons">
              ${player.canRevoke ? `<button type="button" class="dlc-btn-small dlc-panel-revoke" data-player-id="${player.id}">Revoke</button>` : ""}
            </div>
          </div>
        `).join("") : "<p>No players connected.</p>"}
      </div>

      <div class="dlc-section dlc-refresh-section">
        <button type="button" id="dlc-refresh-panel" class="dlc-button dlc-refresh-btn">
          <i class="fas fa-sync-alt"></i> Refresh Panel
        </button>
      </div>
    </div>
  `;
}

function attachPanelListeners(html) {
  // Individual role permission toggles
  html.find(".dlc-role-toggle").change(async function() {
    const role = parseInt($(this).data("role"));
    const enabled = $(this).is(":checked");
    const success = await setManualRollsPermission(role, enabled);
    if (success) {
      const roleName = ROLE_NAMES[role] || `Role ${role}`;
      ui.notifications.info(
        enabled
          ? `Manual rolls enabled for ${roleName}.`
          : `Manual rolls disabled for ${roleName}.`
      );
    }
    refreshPanel();
  });

  // Refresh panel
  html.find("#dlc-refresh-panel").click(() => {
    refreshPanel();
  });

  // Apply Global Override
  html.find("#dlc-apply-global").click(async () => {
    const newValue = html.find("#dlc-global-override").val();
    
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

  // Toggle GM's own mode
  html.find("#dlc-toggle-own").click(async () => {
    const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    const newMode = currentMode === "manual" ? "digital" : "manual";
    
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

  // Panel approve buttons
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

  // Panel deny buttons
  html.find(".dlc-panel-deny").click(async function() {
    const playerId = $(this).data("player-id");
    const player = game.users.get(playerId);
    
    if (!player) return;
    
    let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
    pending = pending.filter(req => req.playerId !== playerId);
    await game.settings.set(MODULE_ID, "pendingRequests", pending);
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
    
    refreshPanel();
  });

  // Panel revoke buttons
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

function refreshPanel() {
  if (currentPanelDialog && currentPanelDialog.rendered) {
    // Update the content in place
    const newContent = generatePanelContent();
    const contentElement = currentPanelDialog.element.find(".dialog-content");
    contentElement.html(newContent);
    attachPanelListeners(currentPanelDialog.element);
  }
}

function openManagementPanel() {
  // Close existing panel if open
  if (currentPanelDialog && currentPanelDialog.rendered) {
    currentPanelDialog.close();
  }

  const content = generatePanelContent();

  currentPanelDialog = new Dialog({
    title: "Dice Link Companion",
    content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Close"
      }
    },
    default: "close",
    render: (html) => {
      attachPanelListeners(html);
    },
    close: () => {
      currentPanelDialog = null;
    }
  });
  
  currentPanelDialog.render(true);
}

// ============================================================================
// SCENE CONTROLS - D20 BUTTON
// ============================================================================

Hooks.on("getSceneControlButtons", (controls) => {
  // v13: controls is a Record object
  if (!controls.tokens?.tools) return;

  const isGM = game.user.isGM;
  
  // Use button: true with onChange for v13 (NOT onClick)
  controls.tokens.tools.diceLinkCompanion = {
    name: "diceLinkCompanion",
    title: isGM ? "Dice Link Companion" : "Request/Toggle Dice Mode",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: true,
    order: 100,
    onChange: () => {
      if (isGM) {
        openManagementPanel();
      } else {
        // Check player's current mode
        const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        if (playerMode === "manual") {
          playerSwitchToDigital();
        } else {
          playerRequestManual();
        }
      }
    }
  };
});

// ============================================================================
// INITIALIZATION
// ============================================================================

Hooks.once("init", () => {
  // Register world-scoped settings
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
  // Register player mode settings for all users
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

  // Setup listeners
  setupSocketListeners();
  setupChatButtonHandlers();

  // Apply current mode on load
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
  openPanel: openManagementPanel,
  applyManual: applyManualDice,
  applyDigital: applyDigitalDice,
  requestManual: playerRequestManual,
  switchToDigital: playerSwitchToDigital
};

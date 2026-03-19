/**
 * Dice Link Companion - Foundry VTT v13
 * 
 * A player-GM dice mode management system with approval workflow.
 */

const MODULE_ID = "dice-link-companion";
const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

// Track if player has already requested this session
let hasRequestedThisSession = false;

// ============================================================================
// DICE CONFIGURATION - Using Foundry v13 method
// ============================================================================

function applyManualDice() {
  console.log("[v0] applyManualDice called");
  
  // Foundry v13 dice fulfillment structure
  if (!CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment = { dice: {} };
  }
  if (!CONFIG.Dice.fulfillment.dice) {
    CONFIG.Dice.fulfillment.dice = {};
  }
  
  // Set each die type to manual
  for (const die of DICE_TYPES) {
    CONFIG.Dice.fulfillment.dice[die] = "manual";
  }
  
  // Set default method
  CONFIG.Dice.fulfillment.defaultMethod = "manual";
  
  console.log("[v0] Manual dice applied:", JSON.stringify(CONFIG.Dice.fulfillment));
}

function applyDigitalDice() {
  console.log("[v0] applyDigitalDice called");
  
  if (!CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment = { dice: {} };
  }
  if (!CONFIG.Dice.fulfillment.dice) {
    CONFIG.Dice.fulfillment.dice = {};
  }
  
  // Clear each die type (back to digital/default)
  for (const die of DICE_TYPES) {
    CONFIG.Dice.fulfillment.dice[die] = "";
  }
  
  // Clear default method
  CONFIG.Dice.fulfillment.defaultMethod = "";
  
  console.log("[v0] Digital dice applied:", JSON.stringify(CONFIG.Dice.fulfillment));
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
  console.log("[v0] Setting up chat button handlers");
  
  // Use document-level delegation for chat buttons
  $(document).on("click", ".dlc-chat-approve", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("[v0] Chat approve button clicked");
    
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
    console.log("[v0] Sending applyMode socket to player:", playerId);
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
    
    console.log("[v0] Chat deny button clicked");
    
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
  console.log("[v0] Setting up socket listeners");
  
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    console.log("[v0] Socket received:", data);
    
    // GM receives player request for manual
    if (game.user.isGM && data.action === "playerRequestManual") {
      console.log("[v0] GM received manual request from:", data.playerName);
      
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
      console.log("[v0] GM received digital switch from player:", data.playerId);
      await game.settings.set(MODULE_ID, `playerMode_${data.playerId}`, "digital");
    }

    // Player receives mode application
    if (data.action === "applyMode" && data.playerId === game.user.id) {
      console.log("[v0] Player received applyMode:", data.mode);
      
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
      console.log("[v0] Received global override:", data.mode);
      
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
      console.log("[v0] Player received revoke");
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
  console.log("[v0] Player requesting manual mode");
  
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
  console.log("[v0] Player switching to digital");
  
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

function openManagementPanel() {
  console.log("[v0] Opening management panel");
  
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  const pendingRequests = game.settings.get(MODULE_ID, "pendingRequests") || [];
  const gmMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";

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

  const content = `
    <div class="dlc-panel">
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
    </div>
  `;

  new Dialog({
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
      console.log("[v0] Dialog rendered");
      
      // Apply Global Override
      html.find("#dlc-apply-global").click(async () => {
        const newValue = html.find("#dlc-global-override").val();
        console.log("[v0] Applying global override:", newValue);
        
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
      });

      // Toggle GM's own mode
      html.find("#dlc-toggle-own").click(async () => {
        const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        const newMode = currentMode === "manual" ? "digital" : "manual";
        console.log("[v0] Toggling GM mode to:", newMode);
        
        await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
        
        if (newMode === "manual") {
          applyManualDice();
          ui.notifications.info("Your dice: Manual");
        } else {
          applyDigitalDice();
          ui.notifications.info("Your dice: Digital");
        }
      });

      // Panel approve buttons
      html.find(".dlc-panel-approve").click(async function() {
        const playerId = $(this).data("player-id");
        const player = game.users.get(playerId);
        console.log("[v0] Panel approving player:", playerId);
        
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
      });

      // Panel deny buttons
      html.find(".dlc-panel-deny").click(async function() {
        const playerId = $(this).data("player-id");
        const player = game.users.get(playerId);
        console.log("[v0] Panel denying player:", playerId);
        
        if (!player) return;
        
        let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
        pending = pending.filter(req => req.playerId !== playerId);
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
        
        await createApprovalChatMessage(playerId, player.name, false);
        ui.notifications.info(`Denied manual dice for ${player.name}.`);
      });

      // Panel revoke buttons
      html.find(".dlc-panel-revoke").click(async function() {
        const playerId = $(this).data("player-id");
        const player = game.users.get(playerId);
        console.log("[v0] Panel revoking player:", playerId);
        
        if (!player) return;
        
        await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "digital");
        
        game.socket.emit(`module.${MODULE_ID}`, {
          action: "revokeMode",
          playerId: playerId
        });
        
        ui.notifications.info(`Revoked manual dice for ${player.name}.`);
      });
    }
  }).render(true);
}

// ============================================================================
// SCENE CONTROLS - D20 BUTTON
// ============================================================================

Hooks.on("getSceneControlButtons", (controls) => {
  console.log("[v0] getSceneControlButtons hook fired");
  
  // v13: controls is a Record object
  if (!controls.tokens?.tools) {
    console.log("[v0] No tokens.tools found");
    return;
  }

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
      console.log("[v0] D20 button onChange fired, isGM:", isGM);
      
      if (isGM) {
        openManagementPanel();
      } else {
        // Check player's current mode
        const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        console.log("[v0] Player current mode:", playerMode);
        
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
  console.log("[v0] Dice Link Companion: init");
  
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
  console.log("[v0] Dice Link Companion: ready");
  
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
  console.log("[v0] Global override on ready:", globalOverride);
  
  if (globalOverride === "forceAllManual") {
    applyManualDice();
  } else if (globalOverride === "forceAllDigital") {
    applyDigitalDice();
  } else {
    const myMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    console.log("[v0] My mode on ready:", myMode);
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

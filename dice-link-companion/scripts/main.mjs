/**
 * Dice Link Companion - Foundry VTT v13
 * 
 * A player-GM dice mode management system with approval workflow.
 * - GMs can toggle their own mode, set global override, and manage player requests
 * - Players can request manual mode (GM approval needed) or switch back to digital
 * - Requests appear in chat with interactive approve/deny buttons (GM only sees buttons)
 * - Players see confirmation messages without buttons
 * - Accessed via D20 button in token controls on the canvas
 */

const MODULE_ID = "dice-link-companion";
const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

// ============================================================================
// HELPERS - DICE CONFIGURATION
// ============================================================================

function getCoreConfig() {
  try {
    return foundry.utils.deepClone(game.settings.get("core", "diceConfiguration") ?? {});
  } catch {
    return {};
  }
}

async function setCoreConfig(cfg) {
  // Only GMs can update core settings
  if (!game.user.isGM) return;
  
  await game.settings.set("core", "diceConfiguration", cfg);
  
  // Also update live CONFIG
  for (const die of DICE_TYPES) {
    const method = cfg[die] ?? "";
    CONFIG.Dice.fulfillment.dice[die] = method;
  }
  if ("defaultMethod" in cfg) {
    CONFIG.Dice.fulfillment.defaultMethod = cfg.defaultMethod;
  }
}

async function applyManualDiceGM() {
  // GM applies manual dice globally
  const cfg = {};
  for (const die of DICE_TYPES) cfg[die] = "manual";
  cfg.defaultMethod = "manual";
  await setCoreConfig(cfg);
}

async function applyDigitalDiceGM() {
  // GM resets to digital by clearing the config
  await setCoreConfig({});
}

async function applyManualDiceLocal() {
  // Players apply manual dice locally (CONFIG only, no settings)
  for (const die of DICE_TYPES) {
    CONFIG.Dice.fulfillment.dice[die] = "manual";
  }
  CONFIG.Dice.fulfillment.defaultMethod = "manual";
}

async function applyDigitalDiceLocal() {
  // Players apply digital dice locally (CONFIG only, no settings)
  for (const die of DICE_TYPES) {
    CONFIG.Dice.fulfillment.dice[die] = "";
  }
  CONFIG.Dice.fulfillment.defaultMethod = "roll";
}

// ============================================================================
// CHAT MESSAGE HANDLERS
// ============================================================================

async function createRequestChatMessage(playerId, playerName) {
  const content = `
    <div class="dice-link-request">
      <p><strong>${playerName}</strong> is requesting manual dice mode.</p>
      <div class="dlc-chat-buttons">
        <button class="dlc-chat-btn dlc-chat-approve" data-player-id="${playerId}" data-action="approve">
          <i class="fas fa-check"></i> Approve
        </button>
        <button class="dlc-chat-btn dlc-chat-deny" data-player-id="${playerId}" data-action="deny">
          <i class="fas fa-times"></i> Deny
        </button>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  const playerContent = `
    <div class="dice-link-result" style="border-left: 4px solid #6C5CE7; padding: 10px; margin: 5px 0;">
      <p>Your request for manual dice has been sent to the GM.</p>
    </div>
  `;

  const player = game.users.get(playerId);
  if (player) {
    await ChatMessage.create({
      user: game.user.id,
      content: playerContent,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      whisper: [playerId]
    });
  }
}

async function createApprovalChatMessage(playerId, playerName, approved) {
  const status = approved ? "approved" : "denied";
  const color = approved ? "green" : "red";
  
  const content = `
    <div class="dice-link-result" style="border-left: 4px solid ${color}; padding: 10px; margin: 5px 0;">
      <p><strong>${playerName}</strong>'s request for manual dice has been <strong style="color: ${color};">${status.toUpperCase()}</strong>.</p>
    </div>
  `;

  const player = game.users.get(playerId);
  if (!player) return;

  await ChatMessage.create({
    user: game.user.id,
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    whisper: [game.user.id, playerId]
  });
}

// ============================================================================
// CHAT BUTTON HANDLERS (using document-level event delegation)
// ============================================================================

function setupChatButtonHandlers() {
  document.addEventListener("click", async (e) => {
    const approveBtn = e.target.closest(".dlc-chat-approve");
    const denyBtn = e.target.closest(".dlc-chat-deny");
    
    if (approveBtn) {
      e.preventDefault();
      
      if (!game.user.isGM) {
        ui.notifications.error("Only GMs can approve requests.");
        return;
      }

      const playerId = approveBtn.dataset.playerId;
      const player = game.users.get(playerId);

      if (!player) {
        ui.notifications.error("Player not found.");
        return;
      }

      await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
      
      let pending = game.settings.get(MODULE_ID, "pendingRequests");
      pending = pending.filter(req => req.playerId !== playerId);
      await game.settings.set(MODULE_ID, "pendingRequests", pending);
      
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "applyMode",
        playerId: playerId,
        mode: "manual"
      });
      
      await createApprovalChatMessage(playerId, player.name, true);
      
      ui.notifications.info(`Approved manual dice for ${player.name}.`);
      ui.controls.render();
    }
    
    if (denyBtn) {
      e.preventDefault();
      
      if (!game.user.isGM) {
        ui.notifications.error("Only GMs can deny requests.");
        return;
      }

      const playerId = denyBtn.dataset.playerId;
      const player = game.users.get(playerId);

      if (!player) {
        ui.notifications.error("Player not found.");
        return;
      }

      let pending = game.settings.get(MODULE_ID, "pendingRequests");
      pending = pending.filter(req => req.playerId !== playerId);
      await game.settings.set(MODULE_ID, "pendingRequests", pending);
      
      await createApprovalChatMessage(playerId, player.name, false);
      
      ui.notifications.info(`Denied manual dice for ${player.name}.`);
    }
  });
}

// ============================================================================
// PLAYER REQUEST & MODE MANAGEMENT
// ============================================================================

async function requestManualMode() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    ui.notifications.warn("Manual dice is globally forced by the GM.");
    return;
  }
  if (globalOverride === "forceAllDigital") {
    ui.notifications.warn("Digital dice is globally forced by the GM.");
    return;
  }

  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerRequestManual",
    playerId: game.user.id,
    playerName: game.user.name
  });

  ui.notifications.info("Manual dice request sent to GM for approval.");
}

async function switchToDigitalMode() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    ui.notifications.warn("Manual dice is globally forced by the GM.");
    return;
  }

  // Send socket to GM to update the setting
  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerSwitchToDigital",
    playerId: game.user.id
  });

  // Apply locally immediately (players only modify CONFIG, not settings)
  await applyDigitalDiceLocal();
  ui.notifications.info("Switched to digital roll mode.");
  ui.controls.render();
}

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

function setupSocketListeners() {
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    // GM receives player request
    if (game.user.isGM && data.action === "playerRequestManual") {
      const pending = game.settings.get(MODULE_ID, "pendingRequests");
      if (!pending.some(req => req.playerId === data.playerId)) {
        pending.push({ playerId: data.playerId, playerName: data.playerName });
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
      }

      await createRequestChatMessage(data.playerId, data.playerName);

      ui.notifications.warn(
        `${data.playerName} requested manual dice mode.`,
        { permanent: false }
      );
    }

    // GM receives player switch to digital request
    if (game.user.isGM && data.action === "playerSwitchToDigital") {
      await game.settings.set(MODULE_ID, `playerMode_${data.playerId}`, "digital");
    }

    // Player receives approval and applies mode
    if (data.action === "applyMode" && data.playerId === game.user.id) {
      if (data.mode === "manual") {
        await applyManualDiceLocal();
        ui.notifications.info("Manual dice mode activated!");
      } else {
        await applyDigitalDiceLocal();
        ui.notifications.info("Digital dice mode activated!");
      }
      ui.controls.render();
    }

    // Handle global override broadcast
    if (data.action === "globalOverride") {
      if (data.mode === "forceAllManual") {
        await applyManualDiceLocal();
        ui.notifications.info("GM has forced manual dice for all players.");
      } else if (data.mode === "forceAllDigital") {
        await applyDigitalDiceLocal();
        ui.notifications.info("GM has forced digital dice for all players.");
      }
      ui.controls.render();
    }

    // Handle revoke
    if (data.action === "revokeMode" && data.playerId === game.user.id) {
      await applyDigitalDiceLocal();
      ui.notifications.warn("GM has revoked your manual dice mode.");
      ui.controls.render();
    }
  });
}

// ============================================================================
// GM MANAGEMENT PANEL (Classic Dialog for v13 compatibility)
// ============================================================================

async function openManagementPanel() {
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  const pendingRequests = game.settings.get(MODULE_ID, "pendingRequests");
  const gmMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";

  const players = [];
  for (const user of game.users) {
    if (user.isGM || user.isSelf) continue;
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
    <form class="dlc-panel">
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
        <h3>Your Mode: <span class="dlc-mode-badge ${gmMode === "manual" ? "manual" : "digital"}">${gmMode === "manual" ? "Manual" : "Digital"}</span></h3>
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
            <span>${player.name} - <span class="dlc-mode-badge ${player.mode === "manual" ? "manual" : "digital"}">${player.mode === "manual" ? "Manual" : "Digital"}</span></span>
            <div class="dlc-buttons">
              ${player.canRevoke ? `<button type="button" class="dlc-btn-small dlc-panel-revoke" data-player-id="${player.id}">Revoke</button>` : ""}
            </div>
          </div>
        `).join("") : "<p>No players connected.</p>"}
      </div>
    </form>
  `;

  // Create new dialog instance - can be called multiple times
  const dialog = new Dialog({
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
      // Apply Global Override button
      html.on("click", "#dlc-apply-global", async () => {
        const newValue = html.find("#dlc-global-override").val();
        await game.settings.set(MODULE_ID, "globalOverride", newValue);
        
        if (newValue === "forceAllManual") {
          await applyManualDiceGM();
          game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllManual" });
          ui.notifications.info("Forced all players to manual dice.");
        } else if (newValue === "forceAllDigital") {
          await applyDigitalDiceGM();
          game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllDigital" });
          ui.notifications.info("Forced all players to digital dice.");
        } else {
          ui.notifications.info("Set to individual control.");
        }
        
        ui.controls.render();
      });

      // Toggle own mode
      html.on("click", "#dlc-toggle-own", async () => {
        const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        const newMode = currentMode === "manual" ? "digital" : "manual";
        
        await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
        
        if (newMode === "manual") {
          await applyManualDiceGM();
          ui.notifications.info("Your dice mode: Manual");
        } else {
          await applyDigitalDiceGM();
          ui.notifications.info("Your dice mode: Digital");
        }
        
        ui.controls.render();
      });

      // Approve pending requests
      html.on("click", ".dlc-panel-approve", async (e) => {
        const playerId = e.currentTarget.dataset.playerId;
        const player = game.users.get(playerId);
        
        if (!player) {
          ui.notifications.error("Player not found.");
          return;
        }
        
        await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
        
        let pending = game.settings.get(MODULE_ID, "pendingRequests");
        pending = pending.filter(req => req.playerId !== playerId);
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
        
        game.socket.emit(`module.${MODULE_ID}`, {
          action: "applyMode",
          playerId: playerId,
          mode: "manual"
        });
        
        await createApprovalChatMessage(playerId, player.name, true);
        
        ui.notifications.info(`Approved manual dice for ${player.name}.`);
        ui.controls.render();
      });

      // Deny pending requests
      html.on("click", ".dlc-panel-deny", async (e) => {
        const playerId = e.currentTarget.dataset.playerId;
        const player = game.users.get(playerId);
        
        if (!player) {
          ui.notifications.error("Player not found.");
          return;
        }
        
        let pending = game.settings.get(MODULE_ID, "pendingRequests");
        pending = pending.filter(req => req.playerId !== playerId);
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
        
        await createApprovalChatMessage(playerId, player.name, false);
        
        ui.notifications.info(`Denied manual dice for ${player.name}.`);
      });

      // Revoke manual mode
      html.on("click", ".dlc-panel-revoke", async (e) => {
        const playerId = e.currentTarget.dataset.playerId;
        const player = game.users.get(playerId);
        
        if (!player) {
          ui.notifications.error("Player not found.");
          return;
        }
        
        await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "digital");
        
        game.socket.emit(`module.${MODULE_ID}`, {
          action: "revokeMode",
          playerId: playerId
        });
        
        ui.notifications.info(`Revoked manual dice for ${player.name}.`);
        ui.controls.render();
      });
    }
  }, {
    width: 400,
    classes: ["dlc-dialog"]
  });

  dialog.render(true);
}

// ============================================================================
// SCENE CONTROLS BUTTON
// ============================================================================

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens?.tools) return;

  const isGM = game.user.isGM;
  
  controls.tokens.tools.diceLinkToggle = {
    name: "diceLinkToggle",
    title: isGM ? "Dice Link Companion: Manage Dice" : "Dice Link Companion: Request/Toggle Dice",
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(controls.tokens.tools).length,
    toggle: false,
    visible: true,
    onClick: () => {
      if (isGM) {
        openManagementPanel();
      } else {
        const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        
        if (playerMode === "manual") {
          switchToDigitalMode();
        } else {
          requestManualMode();
        }
      }
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
    type: Object,
    default: []
  });
});

Hooks.once("ready", () => {
  // Register settings for all users
  for (const user of game.users) {
    const settingKey = `playerMode_${user.id}`;
    try {
      game.settings.get(MODULE_ID, settingKey);
    } catch {
      game.settings.register(MODULE_ID, settingKey, {
        scope: "world",
        config: false,
        type: String,
        default: "digital"
      });
    }
  }

  // Setup socket listeners
  setupSocketListeners();
  
  // Setup chat button handlers via event delegation
  setupChatButtonHandlers();

  // Apply mode based on current settings
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  if (globalOverride === "forceAllManual") {
    if (game.user.isGM) {
      applyManualDiceGM();
    } else {
      applyManualDiceLocal();
    }
  } else if (globalOverride === "forceAllDigital") {
    if (game.user.isGM) {
      applyDigitalDiceGM();
    } else {
      applyDigitalDiceLocal();
    }
  } else {
    const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    if (playerMode === "manual") {
      if (game.user.isGM) {
        applyManualDiceGM();
      } else {
        applyManualDiceLocal();
      }
    }
  }
});

// ============================================================================
// PUBLIC API
// ============================================================================

globalThis.DiceLinkCompanion = {
  requestManualMode,
  switchToDigital: switchToDigitalMode,
  openPanel: openManagementPanel
};

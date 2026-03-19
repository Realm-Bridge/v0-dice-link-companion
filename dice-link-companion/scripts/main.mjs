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

/**
 * Apply manual dice mode - sets all dice to "manual" fulfillment
 * Works for both GM and players by directly modifying CONFIG
 */
function applyManualDice() {
  console.log("[v0] applyManualDice called");
  
  // Ensure the structure exists
  if (!CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment = {};
  }
  if (!CONFIG.Dice.fulfillment.dice) {
    CONFIG.Dice.fulfillment.dice = {};
  }
  
  // Set all dice to manual
  for (const die of DICE_TYPES) {
    CONFIG.Dice.fulfillment.dice[die] = "manual";
  }
  CONFIG.Dice.fulfillment.defaultMethod = "manual";
  
  console.log("[v0] Applied manual dice, CONFIG.Dice.fulfillment:", CONFIG.Dice.fulfillment);
}

/**
 * Apply digital dice mode - clears manual fulfillment
 * Works for both GM and players by directly modifying CONFIG
 */
function applyDigitalDice() {
  console.log("[v0] applyDigitalDice called");
  
  // Ensure the structure exists
  if (!CONFIG.Dice.fulfillment) {
    CONFIG.Dice.fulfillment = {};
  }
  if (!CONFIG.Dice.fulfillment.dice) {
    CONFIG.Dice.fulfillment.dice = {};
  }
  
  // Clear all dice fulfillment (back to default/digital)
  for (const die of DICE_TYPES) {
    delete CONFIG.Dice.fulfillment.dice[die];
  }
  CONFIG.Dice.fulfillment.defaultMethod = "";
  
  console.log("[v0] Applied digital dice, CONFIG.Dice.fulfillment:", CONFIG.Dice.fulfillment);
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
  console.log("[v0] Setting up chat button handlers");
  
  document.addEventListener("click", async (e) => {
    const approveBtn = e.target.closest(".dlc-chat-approve");
    const denyBtn = e.target.closest(".dlc-chat-deny");
    
    if (approveBtn) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log("[v0] Approve button clicked in chat");
      
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
      
      console.log("[v0] Emitting applyMode socket for player:", playerId);
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
      e.stopPropagation();
      
      console.log("[v0] Deny button clicked in chat");
      
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
  console.log("[v0] requestManualMode called by player");
  
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  
  if (globalOverride === "forceAllManual") {
    ui.notifications.warn("Manual dice is globally forced by the GM.");
    return;
  }
  if (globalOverride === "forceAllDigital") {
    ui.notifications.warn("Digital dice is globally forced by the GM.");
    return;
  }

  // Only send socket message - don't try to update any settings as player
  game.socket.emit(`module.${MODULE_ID}`, {
    action: "playerRequestManual",
    playerId: game.user.id,
    playerName: game.user.name
  });

  ui.notifications.info("Manual dice request sent to GM for approval.");
}

async function switchToDigitalMode() {
  console.log("[v0] switchToDigitalMode called by player");
  
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

  // Apply locally immediately
  applyDigitalDice();
  ui.notifications.info("Switched to digital roll mode.");
  ui.controls.render();
}

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

function setupSocketListeners() {
  console.log("[v0] Setting up socket listeners");
  
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    console.log("[v0] Socket received:", data);
    
    // GM receives player request
    if (game.user.isGM && data.action === "playerRequestManual") {
      console.log("[v0] GM received player request for manual dice");
      
      let pending = [];
      try {
        pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
      } catch (e) {
        pending = [];
      }
      
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
      console.log("[v0] GM received player switch to digital");
      await game.settings.set(MODULE_ID, `playerMode_${data.playerId}`, "digital");
    }

    // Player receives approval and applies mode
    if (data.action === "applyMode" && data.playerId === game.user.id) {
      console.log("[v0] Player received applyMode:", data.mode);
      
      if (data.mode === "manual") {
        applyManualDice();
        ui.notifications.info("Manual dice mode activated!");
      } else {
        applyDigitalDice();
        ui.notifications.info("Digital dice mode activated!");
      }
      ui.controls.render();
    }

    // Handle global override broadcast
    if (data.action === "globalOverride") {
      console.log("[v0] Received global override:", data.mode);
      
      if (data.mode === "forceAllManual") {
        applyManualDice();
        ui.notifications.info("GM has forced manual dice for all players.");
      } else if (data.mode === "forceAllDigital") {
        applyDigitalDice();
        ui.notifications.info("GM has forced digital dice for all players.");
      }
      ui.controls.render();
    }

    // Handle revoke
    if (data.action === "revokeMode" && data.playerId === game.user.id) {
      console.log("[v0] Player received revoke");
      applyDigitalDice();
      ui.notifications.warn("GM has revoked your manual dice mode.");
      ui.controls.render();
    }
  });
}

// ============================================================================
// GM MANAGEMENT PANEL
// ============================================================================

let currentDialog = null;

function openManagementPanel() {
  console.log("[v0] openManagementPanel called");
  
  // Close existing dialog if open
  if (currentDialog) {
    try {
      currentDialog.close();
    } catch (e) {
      // Dialog already closed
    }
    currentDialog = null;
  }
  
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  let pendingRequests = [];
  try {
    pendingRequests = game.settings.get(MODULE_ID, "pendingRequests") || [];
  } catch (e) {
    pendingRequests = [];
  }
  
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

  currentDialog = new Dialog({
    title: "Dice Link Companion",
    content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Close",
        callback: () => {
          currentDialog = null;
        }
      }
    },
    default: "close",
    close: () => {
      currentDialog = null;
    },
    render: (html) => {
      console.log("[v0] Dialog render callback fired, html:", html);
      
      // Get the actual DOM element
      const element = html[0] || html;
      
      // Apply Global Override button
      const applyGlobalBtn = element.querySelector("#dlc-apply-global");
      if (applyGlobalBtn) {
        console.log("[v0] Found apply global button");
        applyGlobalBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          console.log("[v0] Apply global clicked");
          
          const selectEl = element.querySelector("#dlc-global-override");
          const newValue = selectEl.value;
          
          await game.settings.set(MODULE_ID, "globalOverride", newValue);
          
          if (newValue === "forceAllManual") {
            applyManualDice();
            game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllManual" });
            ui.notifications.info("Forced all players to manual dice.");
          } else if (newValue === "forceAllDigital") {
            applyDigitalDice();
            game.socket.emit(`module.${MODULE_ID}`, { action: "globalOverride", mode: "forceAllDigital" });
            ui.notifications.info("Forced all players to digital dice.");
          } else {
            ui.notifications.info("Set to individual control.");
          }
          
          ui.controls.render();
          currentDialog.close();
        });
      }

      // Toggle own mode
      const toggleOwnBtn = element.querySelector("#dlc-toggle-own");
      if (toggleOwnBtn) {
        console.log("[v0] Found toggle own button");
        toggleOwnBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          console.log("[v0] Toggle own clicked");
          
          const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
          const newMode = currentMode === "manual" ? "digital" : "manual";
          
          await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
          
          if (newMode === "manual") {
            applyManualDice();
            ui.notifications.info("Your dice mode: Manual");
          } else {
            applyDigitalDice();
            ui.notifications.info("Your dice mode: Digital");
          }
          
          ui.controls.render();
          currentDialog.close();
        });
      }

      // Approve pending requests
      element.querySelectorAll(".dlc-panel-approve").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          console.log("[v0] Panel approve clicked");
          
          const playerId = btn.dataset.playerId;
          const player = game.users.get(playerId);
          
          if (!player) {
            ui.notifications.error("Player not found.");
            return;
          }
          
          await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
          
          let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
          pending = pending.filter(req => req.playerId !== playerId);
          await game.settings.set(MODULE_ID, "pendingRequests", pending);
          
          console.log("[v0] Emitting applyMode socket");
          game.socket.emit(`module.${MODULE_ID}`, {
            action: "applyMode",
            playerId: playerId,
            mode: "manual"
          });
          
          await createApprovalChatMessage(playerId, player.name, true);
          
          ui.notifications.info(`Approved manual dice for ${player.name}.`);
          ui.controls.render();
          currentDialog.close();
        });
      });

      // Deny pending requests
      element.querySelectorAll(".dlc-panel-deny").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          console.log("[v0] Panel deny clicked");
          
          const playerId = btn.dataset.playerId;
          const player = game.users.get(playerId);
          
          if (!player) {
            ui.notifications.error("Player not found.");
            return;
          }
          
          let pending = game.settings.get(MODULE_ID, "pendingRequests") || [];
          pending = pending.filter(req => req.playerId !== playerId);
          await game.settings.set(MODULE_ID, "pendingRequests", pending);
          
          await createApprovalChatMessage(playerId, player.name, false);
          
          ui.notifications.info(`Denied manual dice for ${player.name}.`);
          currentDialog.close();
        });
      });

      // Revoke manual mode
      element.querySelectorAll(".dlc-panel-revoke").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          console.log("[v0] Panel revoke clicked");
          
          const playerId = btn.dataset.playerId;
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
          currentDialog.close();
        });
      });
    }
  }, {
    width: 400,
    classes: ["dlc-dialog"]
  });

  currentDialog.render(true);
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
      console.log("[v0] D20 button clicked, isGM:", isGM);
      
      if (isGM) {
        openManagementPanel();
      } else {
        let playerMode = "digital";
        try {
          playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
        } catch (e) {
          playerMode = "digital";
        }
        
        console.log("[v0] Player mode:", playerMode);
        
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
  console.log("[v0] Dice Link Companion init");
  
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
  console.log("[v0] Dice Link Companion ready");
  
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
  try {
    const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
    console.log("[v0] Global override on ready:", globalOverride);
    
    if (globalOverride === "forceAllManual") {
      applyManualDice();
    } else if (globalOverride === "forceAllDigital") {
      applyDigitalDice();
    } else {
      const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
      console.log("[v0] Player mode on ready:", playerMode);
      
      if (playerMode === "manual") {
        applyManualDice();
      }
    }
  } catch (e) {
    console.error("[v0] Error applying initial mode:", e);
  }
});

// ============================================================================
// PUBLIC API
// ============================================================================

globalThis.DiceLinkCompanion = {
  requestManualMode,
  switchToDigital: switchToDigitalMode,
  openPanel: openManagementPanel,
  applyManual: applyManualDice,
  applyDigital: applyDigitalDice
};

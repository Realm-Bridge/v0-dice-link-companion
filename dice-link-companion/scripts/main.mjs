/**
 * Dice Link Companion - Foundry VTT v13
 * 
 * A player-GM dice mode management system with approval workflow.
 * - GMs can toggle their own mode, set global override, and manage player requests
 * - Players can request manual mode (GM approval needed) or switch back to digital
 * - Accessed via D20 button in token controls on the canvas
 */

const MODULE_ID = "dice-link-companion";
const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
let dlcPanelAppId = null; // Track the panel's app ID for proper window management

// ============================================================================
// HELPERS
// ============================================================================

function getCoreConfig() {
  try {
    return foundry.utils.deepClone(game.settings.get("core", "diceConfiguration") ?? {});
  } catch {
    return {};
  }
}

async function setCoreConfig(cfg) {
  await game.settings.set("core", "diceConfiguration", cfg);
  for (const die of DICE_TYPES) {
    const method = cfg[die] ?? "";
    CONFIG.Dice.fulfillment.dice[die] = method;
  }
  if ("defaultMethod" in cfg) {
    CONFIG.Dice.fulfillment.defaultMethod = cfg.defaultMethod;
  }
}

// Apply manual dice config
async function applyManualDice() {
  const cfg = {};
  for (const die of DICE_TYPES) cfg[die] = "manual";
  cfg.defaultMethod = "manual";
  await setCoreConfig(cfg);
}

// Apply digital dice config
async function applyDigitalDice() {
  await setCoreConfig({});
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

  // Send request to GM via socket
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

  // Players can always switch back to digital without GM approval
  await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, "digital");
  await applyDigitalDice();
  ui.notifications.info("Switched to digital roll mode.");
  ui.controls.render();
}

// ============================================================================
// SOCKET HANDLERS (GM-only for most actions)
// ============================================================================

Hooks.once("socketlib.ready", () => {
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    if (!game.user.isGM) return;

    if (data.action === "playerRequestManual") {
      // Store pending request
      const pending = game.settings.get(MODULE_ID, "pendingRequests");
      if (!pending.some(req => req.playerId === data.playerId)) {
        pending.push({ playerId: data.playerId, playerName: data.playerName });
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
      }

      ui.notifications.warn(
        `${data.playerName} requested manual dice mode. Check the Dice Link panel.`,
        { permanent: false }
      );
    }
  });
});

// Fallback if socketlib isn't available
Hooks.once("ready", () => {
  if (!game.socket.emit) {
    game.socket.emit = () => {};
  }
});

// ============================================================================
// GM MANAGEMENT PANEL (ApplicationV2)
// ============================================================================

class DiceLinkCompanionPanel extends foundry.applications.api.ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this.pendingRequests = [];
    this.playerModes = {};
  }

  static DEFAULT_OPTIONS = {
    id: "dice-link-companion-panel",
    classes: ["dice-link-companion"],
    tag: "div",
    window: { title: "Dice Link Companion", icon: "fa-solid fa-dice-d20" },
    position: { width: 400, height: 500 }
  };

  async _prepareContext() {
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

    return {
      globalOverride,
      gmMode,
      players,
      pendingRequests,
      isGM: game.user.isGM
    };
  }

  async _renderHTML(context, options) {
    const html = `
      <div class="dlc-panel">
        <div class="dlc-section">
          <h3>Global Override</h3>
          <select id="dlc-global-override" class="dlc-select">
            <option value="individual" ${context.globalOverride === "individual" ? "selected" : ""}>Individual Control</option>
            <option value="forceAllManual" ${context.globalOverride === "forceAllManual" ? "selected" : ""}>Force All Manual</option>
            <option value="forceAllDigital" ${context.globalOverride === "forceAllDigital" ? "selected" : ""}>Force All Digital</option>
          </select>
        </div>

        <div class="dlc-section">
          <h3>Your Mode: <span class="dlc-mode-badge ${context.gmMode === "manual" ? "manual" : "digital"}">${context.gmMode === "manual" ? "Manual" : "Digital"}</span></h3>
          <button id="dlc-toggle-own" class="dlc-button">Toggle Your Dice Mode</button>
        </div>

        ${context.pendingRequests.length > 0 ? `
          <div class="dlc-section dlc-pending">
            <h3>Pending Requests (${context.pendingRequests.length})</h3>
            ${context.pendingRequests.map(req => `
              <div class="dlc-player-row">
                <span>${req.playerName}</span>
                <div class="dlc-buttons">
                  <button class="dlc-btn-small dlc-approve" data-player-id="${req.playerId}">Approve</button>
                  <button class="dlc-btn-small dlc-deny" data-player-id="${req.playerId}">Deny</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="dlc-section">
          <h3>Player Modes</h3>
          ${context.players.length > 0 ? context.players.map(player => `
            <div class="dlc-player-row">
              <span>${player.name} - <span class="dlc-mode-badge ${player.mode === "manual" ? "manual" : "digital"}">${player.mode === "manual" ? "Manual" : "Digital"}</span></span>
              <div class="dlc-buttons">
                ${player.canRevoke ? `<button class="dlc-btn-small dlc-revoke" data-player-id="${player.id}">Revoke</button>` : ""}
              </div>
            </div>
          `).join("") : "<p>No players connected.</p>"}
        </div>
      </div>
    `;
    return html;
  }

  _attachListeners(html) {
    // Global override dropdown
    html.querySelector("#dlc-global-override")?.addEventListener("change", async (e) => {
      await game.settings.set(MODULE_ID, "globalOverride", e.target.value);
      
      if (e.target.value === "forceAllManual") {
        await applyManualDice();
      } else if (e.target.value === "forceAllDigital") {
        await applyDigitalDice();
      }
      
      this.render();
    });

    // Toggle own mode
    html.querySelector("#dlc-toggle-own")?.addEventListener("click", async () => {
      const currentMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
      const newMode = currentMode === "manual" ? "digital" : "manual";
      
      await game.settings.set(MODULE_ID, `playerMode_${game.user.id}`, newMode);
      
      if (newMode === "manual") {
        await applyManualDice();
      } else {
        await applyDigitalDice();
      }
      
      this.render();
      ui.controls.render();
    });

    // Approve pending requests
    html.querySelectorAll(".dlc-approve").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const playerId = e.target.dataset.playerId;
        await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "manual");
        
        let pending = game.settings.get(MODULE_ID, "pendingRequests");
        pending = pending.filter(req => req.playerId !== playerId);
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
        
        ui.notifications.info(`Approved manual dice for ${game.users.get(playerId)?.name}.`);
        this.render();
      });
    });

    // Deny pending requests
    html.querySelectorAll(".dlc-deny").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const playerId = e.target.dataset.playerId;
        
        let pending = game.settings.get(MODULE_ID, "pendingRequests");
        pending = pending.filter(req => req.playerId !== playerId);
        await game.settings.set(MODULE_ID, "pendingRequests", pending);
        
        ui.notifications.info(`Denied manual dice for ${game.users.get(playerId)?.name}.`);
        this.render();
      });
    });

    // Revoke manual mode
    html.querySelectorAll(".dlc-revoke").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const playerId = e.target.dataset.playerId;
        await game.settings.set(MODULE_ID, `playerMode_${playerId}`, "digital");
        
        ui.notifications.info(`Revoked manual dice for ${game.users.get(playerId)?.name}.`);
        this.render();
      });
    });
  }
}

// ============================================================================
// SCENE CONTROLS BUTTON
// ============================================================================

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens?.tools) return;

  const isGM = game.user.isGM;
  
  // FIX: Read playerMode at click time, not at hook registration
  // So we capture the current state when button is actually clicked
  controls.tokens.tools.diceLinkToggle = {
    name: "diceLinkToggle",
    title: isGM ? "Dice Link Companion: Manage Dice" : "Dice Link Companion: Request/Toggle Dice",
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(controls.tokens.tools).length,
    toggle: false, // FIX: Set to false so it's a button click, not a toggle
    visible: true, // FIX: Show button to all users (GMs and players)
    onChange: () => {
      if (isGM) {
        // FIX: Use appId tracking instead of ui.windows.dlcPanel
        if (dlcPanelAppId && ui.windows[dlcPanelAppId]) {
          ui.windows[dlcPanelAppId].close();
        }
        const panel = new DiceLinkCompanionPanel();
        panel.render(true);
        dlcPanelAppId = panel.appId;
      } else {
        // Player: read current mode at click time
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

  // Register per-player mode settings dynamically
  for (const user of game.users || []) {
    if (!game.settings.storage.get("world", `${MODULE_ID}.playerMode_${user.id}`)) {
      game.settings.register(MODULE_ID, `playerMode_${user.id}`, {
        scope: "world",
        config: false,
        type: String,
        default: "digital"
      });
    }
  }
});

Hooks.once("ready", () => {
  // Register settings for any users that weren't present at init
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

  // Apply global override if set
  const globalOverride = game.settings.get(MODULE_ID, "globalOverride");
  if (globalOverride === "forceAllManual") {
    applyManualDice();
  } else if (globalOverride === "forceAllDigital") {
    applyDigitalDice();
  } else {
    const playerMode = game.settings.get(MODULE_ID, `playerMode_${game.user.id}`) || "digital";
    if (playerMode === "manual") {
      applyManualDice();
    }
  }
});

// ============================================================================
// PUBLIC API
// ============================================================================

globalThis.DiceLinkCompanion = {
  requestManualMode,
  switchToDigital: switchToDigitalMode,
  panel: () => new DiceLinkCompanionPanel().render(true)
};

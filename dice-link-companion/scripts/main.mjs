/**
 * Dice Link Companion - Foundry VTT v13
 *
 * Adds a D20 toggle button to the left-hand scene controls.
 * Click once to switch all dice to manual input.
 * Click again to restore digital (automatic) rolls.
 */

const MODULE_ID = "dice-link-companion";
const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

// ------------------------------------------------------------------ helpers --

/**
 * Read the current per-die fulfillment method from Foundry's core setting.
 * Returns the raw object stored under "core" > "diceConfiguration".
 */
function getCoreConfig() {
  try {
    return foundry.utils.deepClone(game.settings.get("core", "diceConfiguration") ?? {});
  } catch {
    return {};
  }
}

/**
 * Overwrite Foundry's core dice configuration AND the live CONFIG object.
 */
async function setCoreConfig(cfg) {
  // Update the persistent setting
  await game.settings.set("core", "diceConfiguration", cfg);

  // Reflect the change immediately in the live CONFIG without a reload
  for (const die of DICE_TYPES) {
    const method = cfg[die] ?? "";
    if (CONFIG.Dice.fulfillment.dice[die] !== undefined) {
      CONFIG.Dice.fulfillment.dice[die] = method;
    } else {
      CONFIG.Dice.fulfillment.dice[die] = method;
    }
  }

  // v13 stores the default method separately
  if ("defaultMethod" in cfg) {
    CONFIG.Dice.fulfillment.defaultMethod = cfg.defaultMethod;
  }
}

// ------------------------------------------------------------------- toggle --

async function enableManualDice() {
  // Snapshot the current config so we can restore it later
  const snapshot = getCoreConfig();
  await game.settings.set(MODULE_ID, "snapshot", JSON.stringify(snapshot));

  // Build a new config that sets every die to manual
  const cfg = {};
  for (const die of DICE_TYPES) {
    cfg[die] = "manual";
  }
  cfg.defaultMethod = "manual";

  await setCoreConfig(cfg);
  await game.settings.set(MODULE_ID, "enabled", true);

  ui.notifications.info(
    game.i18n.localize("DICE_LINK_COMPANION.Notify.Enabled")
  );
}

async function disableManualDice() {
  // Restore the snapshot taken when we enabled manual mode
  let restored = {};
  try {
    const raw = game.settings.get(MODULE_ID, "snapshot");
    if (raw) restored = JSON.parse(raw);
  } catch { /* snapshot was empty or corrupt – fall back to defaults */ }

  // If there was no meaningful snapshot, default to empty (digital roll)
  await setCoreConfig(restored);
  await game.settings.set(MODULE_ID, "enabled", false);

  ui.notifications.info(
    game.i18n.localize("DICE_LINK_COMPANION.Notify.Disabled")
  );
}

async function toggleManualDice() {
  const isEnabled = game.settings.get(MODULE_ID, "enabled");
  if (isEnabled) {
    await disableManualDice();
  } else {
    await enableManualDice();
  }

  // Re-render the controls so the active state of the button updates
  ui.controls.render();
}

// ----------------------------------------------------------- scene controls --

/**
 * Inject a "Dice Link Companion" toggle into the Token layer controls
 * (first group in the left-hand bar, always visible on the canvas).
 * 
 * In v13, controls is a Record object, not an array.
 * Access token controls via controls.tokens.tools
 */
Hooks.on("getSceneControlButtons", (controls) => {
  // Only GMs should be able to toggle the dice mode
  if (!game.user.isGM) return;

  const isEnabled = game.settings.get(MODULE_ID, "enabled");

  // v13: controls is a Record - access tokens group directly
  if (!controls.tokens?.tools) return;

  // Add our D20 button to the Token controls group
  // The key must match the name property
  controls.tokens.tools.diceLinkToggle = {
    name: "diceLinkToggle",
    title: isEnabled
      ? game.i18n.localize("DICE_LINK_COMPANION.Button.TitleActive")
      : game.i18n.localize("DICE_LINK_COMPANION.Button.Title"),
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(controls.tokens.tools).length,
    toggle: true,
    active: isEnabled,
    visible: game.user.isGM,
    onChange: () => toggleManualDice()
  };
});

// -------------------------------------------------------------------- init ---

Hooks.once("init", () => {
  // Persist enabled state across sessions
  game.settings.register(MODULE_ID, "enabled", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Store a snapshot of the pre-manual config so we can restore it
  game.settings.register(MODULE_ID, "snapshot", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
});

Hooks.once("ready", () => {
  // Restore state from the previous session on load
  const isEnabled = game.settings.get(MODULE_ID, "enabled");
  if (isEnabled) {
    // Re-apply without overwriting the snapshot
    const cfg = {};
    for (const die of DICE_TYPES) cfg[die] = "manual";
    cfg.defaultMethod = "manual";
    setCoreConfig(cfg);
  }
});

// ---------------------------------------------------------------- public API -

globalThis.DiceLinkCompanion = {
  enable: enableManualDice,
  disable: disableManualDice,
  toggle: toggleManualDice,
  isEnabled: () => game.settings.get(MODULE_ID, "enabled")
};

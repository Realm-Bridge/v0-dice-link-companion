# 05 - Hook Registration Map

**Version:** 1.0.6.66 Snapshot (durable function-based references)  
**Note:** This document uses function/section references instead of line numbers for longevity. Regenerate during restructuring to reflect new organization.

---

## Overview

Foundry hooks are the lifecycle events that trigger DLC functionality. This document maps each hook: when it fires, what depends on it, and initialization order requirements.

---

## Hook Registration Timeline

### Phase 1: Module Load (Immediate)
**No hooks registered yet** - Only imports and state variable declarations

### Phase 2: Foundry Init Hook
**When:** Before game data loads  
**Location:** `main.mjs` in `Hooks.once("init")`  
**Action:** Call `registerCoreSettings()`  
**Dependencies:** None - this is first  
**Side effects:** World-scoped settings registered (available immediately)

### Phase 3: Foundry Ready Hook
**When:** After all game data loaded and users connected  
**Location:** `main.mjs` in `Hooks.once("ready")`  
**Complex sequence:**
1. Call `registerPlayerModeSettings()` - registers per-user settings
2. Wait 100ms (WORKAROUND - see edge-cases.md Section 2)
3. Load `collapsedSections` from settings
4. Call `setupSocketListeners()` - socket.js hooks in `game.socket.on()`
5. Call `setupChatButtonHandlers()` - attaches click listeners
6. Call `setupDialogMirroring()` - registers four render hooks
7. Call `setupDiceFulfillment()` - prepares dice fulfillment
8. Populate `window.diceLink` global with all public functions
9. Apply initial dice mode based on settings

**Why this order matters:** Dialog mirroring hooks must fire AFTER settings are ready, hence the 100ms delay. Socket listeners must be registered early to catch cross-client messages.

**Cross-reference - IMPORTANT:** Both the 100ms delay and the dialog mirroring itself are questioned in earlier documents:
- See 01-edge-cases.md Section 2 - The 100ms delay is documented as a WORKAROUND, not a proper solution
- See 02-simplicity-targets.md Section 3.3 - Questions whether the entire dialog mirroring system is necessary
- If dialog mirroring is removed or simplified, this timing requirement may become irrelevant
- See 06-settings-registry.md "Settings Registration Flow" - Complete initialization sequence diagram with detailed breakdown

**Note:** Refer to 06-settings-registry.md for comprehensive analysis of this flow and architectural recommendations.

---

## Individual Hook Registrations

### Hooks.once("init") - Core Settings Registration
**File:** `main.mjs`  
**Function:** Inline in ready hook  
**What it does:** Registers world-scoped settings via `registerCoreSettings()`

**Registered settings:**
- `diceMode` (world-scoped)
- `globalOverride` (world-scoped)
- `pendingRequests` (world-scoped)
- `collapsedSections` (client-scoped)

**Cross-reference:** See 04-state-variables-inventory.md for each setting's purpose and scope

---

### Hooks.once("ready") - Full System Initialization
**File:** `main.mjs`  
**Function:** Inline (async function)  
**What it does:** Master initialization hook that calls all setup functions in proper sequence

**Calls:**
- `registerPlayerModeSettings()` → settings.js - Per-user settings
- `setupSocketListeners()` → socket.js - Cross-client communication
- `setupChatButtonHandlers()` → main.mjs - Chat UI interactions
- `setupDialogMirroring()` → dialog-mirroring.js - Register four render hooks
- `setupDiceFulfillment()` → main.mjs - Dice system integration

**Error handling:** Wrapped in try-catch to prevent silent failures

**Cross-reference:** See 03-dependency-map.md for initialization flow diagram

---

### Hooks.on("renderApplication") - Dialog Capture (Hook 1 of 4)
**File:** `dialog-mirroring.js` in `setupDialogMirroring()`  
**What it does:** Catches ApplicationV2 render events for legacy compatibility

**Calls:** `handleDialogRender()` → `isRollDialog()` → `mirrorDialogToPanel()`

**Redundancy note:** See 01-edge-cases.md Section 1 - may be unnecessary for Foundry v13+

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Questions if all four render hooks are redundant

---

### Hooks.on("renderDialog") - Dialog Capture (Hook 2 of 4)
**File:** `dialog-mirroring.js` in `setupDialogMirroring()`  
**What it does:** Catches Dialog render events for legacy compatibility

**Calls:** Same flow as renderApplication hook

**Redundancy note:** See 01-edge-cases.md Section 1 - may be unnecessary for Foundry v13+

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Part of the four-hook redundancy question

---

### Hooks.on("renderRollConfigurationDialog") - Dialog Capture (Hook 3 of 4)
**File:** `dialog-mirroring.js` in `setupDialogMirroring()`  
**What it does:** Catches dnd5e-specific roll configuration dialogs

**Calls:** Same flow as renderApplication hook

**Why kept:** Specific targeting for dnd5e modules

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Part of the four-hook redundancy question

---

### Hooks.on("renderApplicationV2") - Dialog Capture (Hook 4 of 4)
**File:** `dialog-mirroring.js` in `setupDialogMirroring()`  
**What it does:** Generic catch-all for modern Foundry v13 ApplicationV2 renders

**Calls:** Same flow as renderApplication hook

**Likely primary:** Probably the only one needed for Foundry v13+

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Questions whether the entire dialog mirroring system is necessary. Also see 03-dependency-map.md "Dialog Mirroring Flow" section for the complete flow and architectural concerns.

---

### Hooks.on("getSceneControlButtons") - GM Panel Button
**File:** `main.mjs`  
**What it does:** Adds DLC button to scene controls toolbar

**Location:** Inline hook  
**Listener:** Calls `openPanel()` when button clicked

**Only fires for:** GMs and game master users

---

### game.socket.on("module.dice-link-companion") - Cross-Client Messages
**File:** `socket.js` in `setupSocketListeners()`  
**What it does:** Listens for socket messages between clients

**Message types:**
- `playerRequestManual` - Player requests manual mode
- `playerSwitchToDigital` - Player switches to digital
- `applyMode` - GM applies mode to player

**Calls:** Updates settings, refreshes UI, sends chat messages

---

## Hook Interdependencies

```
init hook
    ↓ (immediate)
ready hook (async)
    ├→ registerPlayerModeSettings()
    ├→ [100ms delay] ← WORKAROUND (see 01-edge-cases.md Section 2)
    ├→ setupSocketListeners()
    │   └→ Listens for cross-client messages
    ├→ setupDialogMirroring() ← QUESTIONED (see 02-simplicity-targets.md Section 3.3)
    │   ├→ Hooks.on("renderApplication")    ← POTENTIALLY REDUNDANT
    │   ├→ Hooks.on("renderDialog")          ← POTENTIALLY REDUNDANT
    │   ├→ Hooks.on("renderRollConfigurationDialog") ← POTENTIALLY REDUNDANT
    │   └→ Hooks.on("renderApplicationV2")   ← LIKELY ONLY ONE NEEDED
    ├→ Populate window.diceLink ← FRAGILE (see 02-simplicity-targets.md Section 4.3)
    ├→ getSceneControlButtons hook (for GM button)
    └→ Apply initial dice mode

During gameplay:
    render* hooks trigger when dialogs open
        ├→ handleDialogRender()
        └→ mirrorDialogToPanel()

    socket messages arrive
        └→ setupSocketListeners handlers
```

**Note:** Items marked WORKAROUND, QUESTIONED, POTENTIALLY REDUNDANT, or FRAGILE are architectural concerns documented in earlier logs that should be addressed during restructuring.

---

## Timing Considerations

### Critical Sequence Points
1. **Settings must be registered before being read** (see 01-edge-cases.md Section 2)
   - Mitigation: 100ms delay before dialog mirroring hooks
   - Better solution: Async/await on setting registration completion

2. **window.diceLink must be populated before dialog hooks fire** (see 02-simplicity-targets.md Section 4.3)
   - Current: Done in ready hook before setupDialogMirroring()
   - Risk: If order changes, dialog-mirroring breaks

3. **Socket listeners must be registered early** (see 03-dependency-map.md Critical Risks)
   - Current: Done immediately in ready hook
   - Why: Socket messages can arrive at any time after connection

### Known Workarounds
- **100ms delay:** See 01-edge-cases.md Section 2 - WORKAROUND note
- **Defensive getPlayerMode():** See 01-edge-cases.md Section 2 - has try-catch fallback
- **Four render hooks:** See 01-edge-cases.md Section 1 - potentially redundant pattern

**Key Question:** If dialog mirroring is simplified or removed (see 02-simplicity-targets.md Section 3.3), several of these timing constraints become irrelevant. Evaluate necessity before optimizing.

---

## Cross-Module Hook Interactions

These hooks create implicit dependencies between modules:

| Module | Registers | Depends On | Timing Issue |
|--------|-----------|-----------|--------------|
| main.mjs | init, ready, getSceneControlButtons | settings.js | ready hook order |
| dialog-mirroring.js | 4 render hooks | settings.js | 100ms delay |
| socket.js | socket listener | N/A | registered early |
| chat.js | (none) | (none) | (none) |
| settings.js | (none) | (none) | (none) |

---

## Recommendations for Restructuring

1. **Consolidate dialog detection:** The four render hooks (renderApplication, renderDialog, renderRollConfigurationDialog, renderApplicationV2) likely do the same thing. Investigate if only renderApplicationV2 is needed for Foundry v13+.
   - *See 01-edge-cases.md Section 1 for analysis*

2. **Remove 100ms delay:** Properly await settings registration instead of using arbitrary timeout.
   - *See 01-edge-cases.md Section 2 - documented as WORKAROUND*

3. **Replace window.diceLink pattern:** Use proper ES6 module exports instead of global object coupling.
   - *See 02-simplicity-targets.md Section 4.3 for fragility analysis*

4. **Separate hook registration from execution:** Register hooks early, execute logic late (after dependencies ready).

5. **Evaluate dialog mirroring necessity:** Before optimizing the hook system, determine if dialog mirroring is even needed.
   - *See 02-simplicity-targets.md Section 3.3 - questions the entire approach*

---

## Module Initialization Flow (Detailed)

### Before ready hook fires
- Module loaded
- Settings.js imported, functions available
- Dialog-mirroring.js imported, functions available
- State variables declared (all null/empty)

### During ready hook
1. **Settings phase** (sync)
   - registerCoreSettings() - Creates world settings
   - registerPlayerModeSettings() - Creates per-user settings

2. **Wait phase** (WORKAROUND)
   - setTimeout 100ms
   - Allows settings to propagate

3. **Initialize services phase** (sync)
   - setupSocketListeners() - Register socket handler
   - setupChatButtonHandlers() - Attach listeners
   - setupDialogMirroring() - Register four render hooks
   - setupDiceFulfillment() - Prepare dice system

4. **Expose API phase** (sync)
   - Populate window.diceLink with 9 functions
   - Populate globalThis.DiceLinkCompanion with 5 functions

5. **Apply defaults phase** (sync)
   - Read current dice mode from settings
   - Call applyManualDice() or applyDigitalDice()
   - Initialize panel UI appropriately

### After ready hook completes
- System fully operational
- Waiting for:
  - Dialog render events
  - Socket messages
  - User interactions
  - GM button click

---

## Error Handling in Hooks

**init hook:** No explicit error handling (rare to fail)

**ready hook:** Wrapped in try-catch at function level
- Catches any errors during initialization
- Logs stack trace for debugging
- Does NOT rethrow (prevents module load failure)

**render* hooks:** Error handling in `mirrorDialogToPanel()`
- Defensive checks before accessing properties
- Wrapped in try-catch in dialog-mirroring.js
- Logs errors but continues

**socket handler:** No explicit error handling
- Messages are assumed valid (come from own server)
- Risk: Malformed messages could cause issues

---

## Testing Hooks During Restructuring

1. **Verify init hook:** Settings created before ready fires
2. **Verify settings ready:** Per-user settings accessible in ready hook (remove 100ms delay and test)
3. **Verify dialog hooks:** At least one fires for each roll dialog type
4. **Verify socket handler:** Cross-client messages received and processed
5. **Verify window.diceLink:** All properties exist and callable

---

## Cross-Reference to Module Boundary Plan

See 07-module-boundary-plan.md - The hook timing requirements here directly informed the proposed main.mjs restructure:
- main.mjs becomes Tier 9 (entry point only) containing just hook registrations
- The 100ms delay and window.diceLink population are eliminated by proper tier system
- Hook registration logic stays in main.mjs, but execution code moves to appropriate tier modules


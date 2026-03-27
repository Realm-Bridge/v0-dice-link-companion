# 06 - Settings Registry

**Version:** 1.0.6.66 Snapshot  
**Note:** This document catalogs all Foundry settings used by DLC. References use function/section names for durability. Regenerate this documentation after restructuring.

---

## Overview

DLC uses Foundry's settings system for persistence. Settings are divided into:
- **World-scoped:** Shared across all users (GM controls)
- **Client-scoped:** Per-user preferences

**Files involved:**
- `settings.js` - All registration and access functions
- `main.mjs` - Imports and uses settings functions

---

## Complete Settings Inventory

### 1. globalOverride

**Purpose:** Controls whether all players use the same dice mode or individual settings

**Registration:**
- **Function:** `registerCoreSettings()` in settings.js
- **When:** Called during `init` hook from main.mjs
- **Scope:** world (GM-controlled, applies to all users)

**Configuration:**
- **Type:** String
- **Default:** "digital"
- **Valid Values:** "manual", "digital", "individual"
- **Config:** true (appears in module settings UI)

**Access Pattern:**
- **Read:** `getGlobalOverride()` in settings.js
- **Write:** `setGlobalOverride(value)` in settings.js
- **Used by:** 
  - `applyDigitalDice()` in mode-application.js
  - `applyManualDice()` in mode-application.js
  - `isUserInManualMode()` in settings.js
  - Panel UI generation in main.mjs `generateGMPanel()` and `generatePlayerPanel()`

**Behavior:**
- When "manual" or "digital": All players forced to that mode, individual settings ignored
- When "individual": Each player's `playerMode_*` setting is respected

**Cross-references:**
- See 04-state-variables-inventory.md - globalOverride is settings-based persistence (not memory-only)
- See 03-dependency-map.md "Settings Access Pattern" - demonstrates the read/write pattern used

---

### 2. collapsedSections

**Purpose:** Remembers which UI sections the user has collapsed/expanded

**Registration:**
- **Function:** `registerCoreSettings()` in settings.js
- **When:** Called during `init` hook from main.mjs
- **Scope:** client (each user has their own UI state)

**Configuration:**
- **Type:** Object
- **Default:** 
  ```javascript
  {
    rollRequest: false,    // Expanded by default
    globalOverride: true,  // Collapsed by default
    playerModes: true,     // Collapsed by default
    permissions: true,     // Collapsed by default
    videoFeed: true,       // Collapsed by default
    pending: false,        // Expanded by default
    topRow: false          // Expanded by default
  }
  ```
- **Config:** false (not visible in module settings UI)

**Access Pattern:**
- **Read:** `getCollapsedSections()` in settings.js
- **Write:** `setCollapsedSections(sections)` in settings.js
- **Used by:**
  - `refreshPanel()` in main.mjs - reads on every panel refresh
  - Section toggle click handlers in main.mjs - writes when user clicks

**CRITICAL ARCHITECTURAL ISSUE - Triple Definition:**
The default values are defined in THREE places:
1. `registerCoreSettings()` - the Foundry registration
2. `getCollapsedSections()` - merges with defaults as fallback
3. State initialization in main.mjs - local `collapsedSections` variable

**Workaround implemented:** `getCollapsedSections()` uses object spread to merge saved values with defaults:
```javascript
const defaults = { rollRequest: false, globalOverride: true, ... };
const saved = getSetting("collapsedSections");
return { ...defaults, ...saved };
```
This ensures any missing keys (e.g., if videoFeed was added later) get default values.

**Cross-references:**
- See 02-simplicity-targets.md Section 2.4 - identifies triple-definition as redundancy to fix
- See 04-state-variables-inventory.md Section 6.3 - documents the workaround pattern
- See 01-edge-cases.md Section 3 - relates to state management fragility

---

### 3. playerMode_* (Dynamic Per-User Settings)

**Purpose:** Stores individual dice mode preference for each player

**Registration:**
- **Function:** `registerPlayerModeSettings()` in settings.js
- **When:** Called during `ready` hook (NOT init) from main.mjs
- **Scope:** world (visible to all, but conceptually per-player)

**Why world scope?** GM needs to see and potentially override player modes. Client scope would hide values from GM.

**Configuration:**
- **Type:** String
- **Default:** "digital"
- **Valid Values:** "manual", "digital"
- **Config:** false (managed through DLC panel, not Foundry settings UI)
- **Key Format:** `playerMode_${userId}` where userId is the Foundry user ID

**Dynamic Registration Process:**
```javascript
// In registerPlayerModeSettings()
for (const user of game.users) {
  const key = `playerMode_${user.id}`;
  game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: false,
    type: String,
    default: "digital"
  });
}
```

**Access Pattern:**
- **Read:** `getPlayerMode(userId)` in settings.js
- **Write:** `setPlayerMode(userId, mode)` in settings.js
- **Used by:**
  - `isUserInManualMode(userId)` in settings.js
  - Panel UI player rows in main.mjs
  - Socket handlers when player requests mode change

**CRITICAL TIMING ISSUE:**
Settings are only registered for users who exist at `ready` hook time. If a player joins mid-session:
- Their `playerMode_*` setting doesn't exist
- `getPlayerMode()` will fail or return undefined
- No hook currently handles late-joining players

**Workaround implemented:** `getPlayerMode()` has defensive try-catch and returns "digital" as fallback.

**Cross-references:**
- See 01-edge-cases.md Section 2 - Documents the 100ms delay workaround needed before reading these settings
- See 05-hook-registration-map.md "Settings Registration Timing" - Why ready hook instead of init
- See 03-dependency-map.md "Critical Risks" - Settings timing is identified as critical failure point
- See 02-simplicity-targets.md Section 4.2 - Questions whether this dynamic registration is over-engineered

---

### 4. permissions

**Purpose:** Controls what actions players can take (request manual mode, switch to digital, etc.)

**Registration:**
- **Function:** `registerCoreSettings()` in settings.js
- **When:** Called during `init` hook from main.mjs
- **Scope:** world (GM-controlled permissions for all players)

**Configuration:**
- **Type:** Object
- **Default:**
  ```javascript
  {
    playerCanRequestManual: true,
    playerCanSwitchToDigital: true
  }
  ```
- **Config:** false (managed through DLC panel permissions section)

**Access Pattern:**
- **Read:** `getPermissions()` in settings.js
- **Write:** `setPermissions(permissions)` in settings.js
- **Used by:**
  - `generatePlayerPanel()` in main.mjs - determines which buttons to show
  - `generateGMPanel()` in main.mjs - displays permission toggles
  - Socket handlers - validates player requests before processing

**Permission Definitions:**
| Permission | Default | Effect |
|------------|---------|--------|
| playerCanRequestManual | true | Players see "Request Manual" button |
| playerCanSwitchToDigital | true | Players see "Switch to Digital" button |

**Enforcement Points:**
1. **UI level:** Buttons hidden if permission is false
2. **Socket level:** Requests rejected if permission changed after UI rendered

**Cross-references:**
- See 01-edge-cases.md Section 4 - Documents magic numbers and silent error swallowing in permission checks
- See 04-state-variables-inventory.md - permissions is settings-based persistence
- See 03-dependency-map.md Section 3 "State Variable Access" - Shows permissions flow through the system

---

## Settings Access Functions

All settings access is abstracted through functions in settings.js. Direct `game.settings.get/set` calls should not appear elsewhere.

### Core Access Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getSetting(key)` | Low-level get wrapper | Setting value |
| `setSetting(key, value)` | Low-level set wrapper | Promise |
| `getGlobalOverride()` | Get current global mode | "manual", "digital", or "individual" |
| `setGlobalOverride(value)` | Set global mode | Promise |
| `getPlayerMode(userId)` | Get player's individual mode | "manual" or "digital" |
| `setPlayerMode(userId, mode)` | Set player's individual mode | Promise |
| `getCollapsedSections()` | Get UI collapse state | Object with section states |
| `setCollapsedSections(sections)` | Save UI collapse state | Promise |
| `getPermissions()` | Get permission settings | Object with permission flags |
| `setPermissions(permissions)` | Save permission settings | Promise |

### Computed/Derived Functions

| Function | Purpose | Logic |
|----------|---------|-------|
| `isUserInManualMode(userId)` | Check if user should use manual dice | Checks globalOverride first, then playerMode if "individual" |
| `isGMUser()` | Check if current user is GM | Returns `game.user.isGM` |

### Registration Functions

| Function | Called From | When |
|----------|-------------|------|
| `registerCoreSettings()` | main.mjs `init` hook | Module initialization |
| `registerPlayerModeSettings()` | main.mjs `ready` hook | After game data loaded |

**Cross-references:**
- See 03-dependency-map.md Section 1 - Shows import graph for these functions
- See 05-hook-registration-map.md - Documents when registration functions are called

---

## Settings Registration Flow

```
Module Load
    |
    v
init hook fires
    |
    +---> registerCoreSettings()
    |         |
    |         +---> game.settings.register("globalOverride")
    |         +---> game.settings.register("collapsedSections")
    |         +---> game.settings.register("permissions")
    |
    v
ready hook fires
    |
    +---> registerPlayerModeSettings()
    |         |
    |         +---> for each user in game.users:
    |                   game.settings.register("playerMode_${userId}")
    |
    +---> [100ms delay] <-- WORKAROUND (see 01-edge-cases.md Section 2)
    |
    +---> setupDialogMirroring() <-- QUESTIONED (see 02-simplicity-targets.md Section 3.3)
    |         |
    |         +---> isUserInManualMode() called
    |                   |
    |                   +---> getGlobalOverride()
    |                   +---> getPlayerMode() if "individual"
    |
    v
Panel renders
    |
    +---> getCollapsedSections()
    +---> getGlobalOverride()
    +---> getPlayerMode() for each user (GM panel)
    +---> getPermissions()
```

**Key Timing Constraint:**
`registerPlayerModeSettings()` MUST complete before `getPlayerMode()` is called. The 100ms delay is a workaround for this - proper solution would be to await registration completion.

**Cross-references:**
- See 05-hook-registration-map.md "Hook Interdependencies" - Full timing diagram
- See 01-edge-cases.md Section 2 - Why 100ms delay exists (WORKAROUND)

---

## Known Issues & Architectural Concerns

### Issue 1: Settings Defaults Defined Multiple Times

**Problem:** collapsedSections default values appear in THREE locations:
1. `registerCoreSettings()` - Foundry registration default
2. `getCollapsedSections()` - Fallback merge with defaults
3. `main.mjs` state initialization - Local variable default

**Impact:** If defaults change, must update three places or risk inconsistency.

**Current Workaround:** `getCollapsedSections()` merges saved values with hardcoded defaults, ensuring missing keys always have values.

**Proper Solution:** Single source of truth - export DEFAULT_COLLAPSED_SECTIONS constant and reference everywhere.

**Cross-references:**
- See 02-simplicity-targets.md Section 2.4 - Identifies this as redundancy
- See 04-state-variables-inventory.md - Documents the merge workaround

---

### Issue 2: 100ms Timing Delay Workaround

**Problem:** `registerPlayerModeSettings()` is async but we don't await its completion. Dialog mirroring hooks may fire before settings are ready.

**Current Workaround:** 100ms `setTimeout` before calling `setupDialogMirroring()`.

**Why This Is Bad:**
- Arbitrary delay may not be enough on slow systems
- May be too long on fast systems (wasted time)
- Masks the real architectural issue

**Proper Solution:** 
- Make `registerPlayerModeSettings()` return a Promise
- Await it before proceeding with dependent setup
- Or use Foundry's hook system to signal completion

**Cross-references:**
- See 01-edge-cases.md Section 2 - Documents this as WORKAROUND
- See 05-hook-registration-map.md "Timing Considerations" - Full timing analysis

---

### Issue 3: Late-Joining Players Not Handled

**Problem:** `playerMode_*` settings only registered for users present at `ready` hook time.

**Scenario:**
1. GM starts game with players A and B
2. `registerPlayerModeSettings()` creates `playerMode_A` and `playerMode_B`
3. Player C joins later
4. No `playerMode_C` setting exists
5. `getPlayerMode("C")` fails or returns undefined

**Current Workaround:** `getPlayerMode()` has try-catch that returns "digital" as fallback.

**Proper Solution:** Add `Hooks.on("userConnected")` to register settings for new players.

**Cross-references:**
- See 05-hook-registration-map.md "Recommendations" - Suggests player-join hook

---

### Issue 4: window.diceLink Global Dependency

**Problem:** `dialog-mirroring.js` accesses settings through `window.diceLink` global object rather than direct imports.

**Why This Exists:** Circular dependency avoidance - dialog-mirroring needs main.mjs functions, main.mjs imports dialog-mirroring.

**Why This Is Bad:**
- Fragile - breaks if initialization order changes
- Hidden dependency - not visible in import statements
- Global namespace pollution

**Proper Solution:** 
- Refactor to eliminate circular dependencies
- Pass required functions as parameters
- Or use dependency injection pattern

**Cross-references:**
- See 02-simplicity-targets.md Section 4.3 - Documents window.diceLink fragility
- See 03-dependency-map.md "Critical Risks" - Identifies as architectural concern

---

### Issue 5: Settings Accessed Before Registration (Defensive Coding)

**Problem:** Various functions have try-catch blocks to handle settings being accessed before registration completes.

**Locations:**
- `getPlayerMode()` - catches and returns "digital"
- `getCollapsedSections()` - catches and returns defaults
- `getGlobalOverride()` - catches and returns "digital"

**Why This Is Bad:**
- Silently swallows errors that might indicate real problems
- Hides timing issues rather than fixing them
- Makes debugging harder

**Proper Solution:** Fix timing so settings are always registered before access, then remove defensive try-catch blocks.

**Cross-references:**
- See 01-edge-cases.md Section 4 - Documents silent error swallowing

---

## Recommendations for Restructuring

### 1. Create Single Source of Truth for Defaults

```javascript
// settings.js - at top of file
export const SETTING_DEFAULTS = {
  globalOverride: "digital",
  playerMode: "digital",
  collapsedSections: {
    rollRequest: false,
    globalOverride: true,
    playerModes: true,
    permissions: true,
    videoFeed: true,
    pending: false,
    topRow: false
  },
  permissions: {
    playerCanRequestManual: true,
    playerCanSwitchToDigital: true
  }
};
```

Then reference `SETTING_DEFAULTS.collapsedSections` everywhere instead of hardcoding.

### 2. Replace 100ms Delay with Proper Async

```javascript
// main.mjs ready hook
Hooks.once("ready", async () => {
  await registerPlayerModeSettings();  // Returns Promise
  setupDialogMirroring();  // Now safe to call
  // ... rest of setup
});
```

### 3. Add Late-Joiner Hook

```javascript
// In main.mjs or settings.js
Hooks.on("userConnected", (user) => {
  const key = `playerMode_${user.id}`;
  if (!game.settings.settings.has(`${MODULE_ID}.${key}`)) {
    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: String,
      default: "digital"
    });
  }
});
```

### 4. Eliminate window.diceLink for Settings Access

Instead of:
```javascript
// dialog-mirroring.js
if (window.diceLink?.isUserInManualMode(userId)) { ... }
```

Use direct import:
```javascript
// dialog-mirroring.js
import { isUserInManualMode } from "./settings.js";
if (isUserInManualMode(userId)) { ... }
```

### 5. Remove Defensive Try-Catch After Fixing Timing

Once timing is fixed, simplify:
```javascript
// Before (defensive)
export function getPlayerMode(userId) {
  try {
    return getSetting(`playerMode_${userId}`) || "digital";
  } catch (e) {
    return "digital";
  }
}

// After (clean)
export function getPlayerMode(userId) {
  return getSetting(`playerMode_${userId}`) || SETTING_DEFAULTS.playerMode;
}
```

---

## Summary

| Setting | Scope | Registered | Issues |
|---------|-------|------------|--------|
| globalOverride | world | init | None |
| collapsedSections | client | init | Triple-definition of defaults |
| playerMode_* | world | ready | Timing, late-joiners |
| permissions | world | init | None |

**Key architectural debt:** Timing workarounds (100ms delay, defensive try-catch) mask underlying issues that should be fixed during restructure.

---

## Cross-Reference to Module Boundary Plan

See 07-module-boundary-plan.md - The settings analysis here directly informed the proposed restructure:
- constants.js (Tier 1) will hold SETTING_DEFAULTS as single source of truth
- settings.js (Tier 2) refactored to import defaults from constants.js
- Late-joiner hook recommendation implemented in main.mjs restructure
- window.diceLink pattern eliminated by proper tier system preventing circular imports

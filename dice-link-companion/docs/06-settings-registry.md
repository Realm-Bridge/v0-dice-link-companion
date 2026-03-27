# Settings Registry Map - v1.0.6.66 Snapshot

**Version:** 1.0.6.66  
**Note:** This document catalogs all game.settings used by DLC. When restructuring code, regenerate this documentation to reflect any settings changes.

## All Settings Overview

| Setting Name | Scope | Type | Default | Purpose |
|---|---|---|---|---|
| `globalOverride` | world | String | "individual" | GM can force all players to a mode |
| `pendingRequests` | world | Array | [] | Approval requests awaiting GM decision |
| `collapsedSections` | client | Object | {...} | UI state persistence across refreshes |
| `playerMode_*` | world | String | "digital" | Per-user manual/digital mode (dynamic) |

## Detailed Setting Specifications

### 1. globalOverride
- **Registration:** In `registerCoreSettings()` during init hook
- **Scope:** world (all users see same value)
- **Type:** String
- **Default:** "individual"
- **Valid values:** "individual", "forceAllManual", "forceAllDigital"
- **Accessed by:** `isUserInManualMode()`, GM mode override logic
- **Persisted:** Yes, in Foundry world settings

**Usage:** GM overrides individual player choices. If set to "forceAllManual", all players use manual mode regardless of their personal setting.

### 2. pendingRequests
- **Registration:** In `registerCoreSettings()` during init hook
- **Scope:** world (shared across all users)
- **Type:** Array
- **Default:** [] (empty array)
- **Structure:** Array of request objects {userId, rollType, timestamp, ...}
- **Accessed by:** Approval system in `approval.js`, socket handlers
- **Persisted:** Yes, in Foundry world settings

**Usage:** Stores pending approval requests that GMs must review. Updated via socket messages and approval functions.

### 3. collapsedSections
- **Registration:** In `registerCoreSettings()` during init hook
- **Scope:** client (each user has their own state)
- **Type:** Object
- **Default:** {rollRequest: false, globalOverride: true, playerModes: true, permissions: true, videoFeed: true, pending: false, topRow: false}
- **Accessed by:** `getCollapsedSections()`, `setCollapsedSections()`, UI refresh logic
- **Persisted:** Yes, in Foundry client-scoped settings
- **Updated:** In `refreshPanel()` when user toggles sections

**Usage:** Remembers which sections the user has collapsed in the UI. Merged with defaults on retrieval to ensure all keys always exist.

**Architectural workaround:** Default value is defined in THREE places (here, getCollapsedSections, and state initialization in main.mjs). The `getCollapsedSections()` function merges with defaults as a workaround for this duplication - if any key is missing from saved state, it gets the default value. This is defensive but indicates architectural debt.

**Cross-references:** 
- See 02-simplicity-targets.md Section 2.4 - identifies this triple-definition as redundant
- The merging pattern in getCollapsedSections is a WORKAROUND for this duplication, documented in 04-state-variables-inventory.md Section 6.3

### 4. playerMode_* (Dynamic Per-User)
- **Registration:** In `registerPlayerModeSettings()` during ready hook
- **Scope:** world (all users see the modes)
- **Type:** String
- **Default:** "digital"
- **Valid values:** "manual", "digital"
- **Key format:** `playerMode_${userId}` 
- **Accessed by:** `getPlayerMode(userId)`, `setPlayerMode(userId, mode)`
- **Persisted:** Yes, in Foundry world settings

**Usage:** Stores each player's individual dice preference. Only applies if globalOverride is "individual".

**Dynamic registration note:** Settings are registered one per user during ready hook. If a new user joins mid-session, their setting won't be created automatically.

**Cross-references:**
- See 01-edge-cases.md Section 2 - Initialization timing requires 100ms workaround before reading these settings
- See 05-hook-registration-map.md "Settings Registration Timing" - Documents timing dependencies for this registration
- See "Known Issues #3" in this document - Late-joining player problem should be addressed in a player-join hook

## Registration Timing

### init hook → registerCoreSettings()
- Registers globalOverride, pendingRequests, collapsedSections
- These are available immediately when module loads
- No dependency issues

### ready hook → registerPlayerModeSettings()
- Registers one setting per user: `playerMode_${userId}`
- **Cross-reference:** See 05-hook-registration-map.md "Settings Registration Timing" and 01-edge-cases.md Section 2 - Timing issue requiring 100ms delay workaround

## Access Patterns

### Direct game.settings API (inside settings.js)
- `game.settings.register()` - initial registration
- `game.settings.get()` - read setting
- `game.settings.set()` - write setting

### Module API (exported functions)
- `getSetting(key)` - Get any setting value
- `setSetting(key, value)` - Set any setting value
- `getPlayerMode(userId)` - Get specific player's mode with fallback
- `setPlayerMode(userId, mode)` - Set specific player's mode
- `getGlobalOverride()` - Get override setting
- `setGlobalOverride(value)` - Set override setting
- `getPendingRequests()` - Get approval requests
- `setPendingRequests(requests)` - Set approval requests
- `getCollapsedSections()` - Get UI state with merged defaults
- `setCollapsedSections(sections)` - Set UI state
- `isUserInManualMode()` - Determine if current user is in manual mode (respects global override)

## Known Issues & Architectural Concerns

1. **Settings defaults defined in multiple places**
   - collapsedSections defaults in: registerCoreSettings(), getCollapsedSections(), and state initialization in main.mjs
   - Should be single source of truth
   - See 02-simplicity-targets.md Section 2.4
   - Workaround implemented: getCollapsedSections() merges saved state with defaults (see 04-state-variables-inventory.md)

2. **Timing workaround required**
   - playerMode_* settings need 100ms delay before being read
   - See 01-edge-cases.md Section 2 (marked as WORKAROUND) and 05-hook-registration-map.md "Settings Registration Timing"
   - Better solution: Async/await proper completion instead of arbitrary delay

3. **Dynamic per-user setting registration - late joiners not handled**
   - Settings created during ready hook per existing users only
   - If user joins after module load, their setting won't be created automatically
   - Should add player-join hook to create settings for new players
   - See 05-hook-registration-map.md for recommendation to separate registration from execution

4. **Settings accessed via window.diceLink pattern**
   - dialog-mirroring.js accesses settings through window.diceLink global
   - See 02-simplicity-targets.md Section 4.3 - this pattern is fragile
   - Tight coupling via global, breaks if initialization order changes
   - Architectural concern affects entire settings access strategy

## Recommendations for Restructuring

1. **Consolidate defaults:** Create single SETTINGS_DEFAULTS constant with all defaults
2. **Remove timing workaround:** Properly wait for all settings before using them
3. **Handle late-joining players:** Register settings when new player joins
4. **Replace global access:** Use proper exports instead of window.diceLink pattern
5. **Consider server-side validation:** Validate mode values before persisting


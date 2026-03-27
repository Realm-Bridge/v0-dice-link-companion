# 06 - Settings Registry

**Version:** 1.0.6.66 Snapshot  
**Note:** This document catalogs all Foundry settings used by DLC. References use function/section names for durability. Regenerate after restructuring.

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

---

### 2. collapsedSections

**Purpose:** Remembers which UI sections the user has collapsed/expanded

**Configuration:**
- **Type:** Object
- **Default:** 
```javascript
{
  rollRequest: false,
  globalOverride: true,
  playerModes: true,
  permissions: true,
  videoFeed: true,
  pending: false,
  topRow: false
}
```
- **Scope:** client (each user has their own UI state)

**CRITICAL ISSUE - Triple Definition:**
Default values defined in THREE places per 02-simplicity-targets.md Section 2.4

---

### 3. playerMode_* (Dynamic Per-User Settings)

**Purpose:** Stores individual dice mode preference for each player

**Registration:**
- **Function:** `registerPlayerModeSettings()` in settings.js
- **When:** Called during `ready` hook (NOT init)
- **Scope:** world (visible to all, but conceptually per-player)

**Configuration:**
- **Type:** String
- **Default:** "digital"
- **Valid Values:** "manual", "digital"
- **Config:** false (managed through DLC panel)

---

### 4. permissions

**Purpose:** Controls what actions players can take

**Configuration:**
- **Type:** Object
- **Default:**
```javascript
{
  playerCanRequestManual: true,
  playerCanSwitchToDigital: true
}
```
- **Scope:** world (GM-controlled)

**Permission Definitions:**
| Permission | Default | Effect |
|------------|---------|--------|
| playerCanRequestManual | true | Players see "Request Manual" button |
| playerCanSwitchToDigital | true | Players see "Switch to Digital" button |

---

## Settings Access Functions

All settings access is abstracted through functions in settings.js:

| Function | Purpose | Returns |
|----------|---------|---------|
| `getSetting(key)` | Low-level get wrapper | Setting value |
| `setSetting(key, value)` | Low-level set wrapper | Promise |
| `getGlobalOverride()` | Get current global mode | Mode string |
| `setGlobalOverride(value)` | Set global mode | Promise |
| `getPlayerMode(userId)` | Get player's mode | "manual" or "digital" |
| `setPlayerMode(userId, mode)` | Set player's mode | Promise |
| `getCollapsedSections()` | Get UI collapse state | Object |
| `setCollapsedSections(sections)` | Save UI state | Promise |

---

## Known Issues & Architectural Concerns

### Issue 1: Settings Defaults Defined Multiple Times
**Problem:** collapsedSections defaults in THREE locations
**Current Workaround:** Merge saved values with hardcoded defaults
**Proper Solution:** Single source of truth - SETTING_DEFAULTS constant

### Issue 2: 100ms Timing Delay Workaround
**Problem:** Settings accessed before registration completes
**Current Workaround:** 100ms setTimeout
**Proper Solution:** Await registration completion

### Issue 3: Late-Joining Players Not Handled
**Problem:** Settings only registered for users present at ready hook time
**Current Workaround:** Defensive try-catch returns fallback
**Proper Solution:** Add userConnected hook to register late-joiner settings

### Issue 4: window.diceLink Global Dependency
**Problem:** dialog-mirroring.js accesses settings through global
**Current Workaround:** Fragile global population in ready hook
**Proper Solution:** Direct ES6 imports

---

## Recommendations for Restructuring

1. Create SETTING_DEFAULTS constant (Tier 1, constants.js)
2. Replace 100ms delay with proper async/await
3. Add userConnected hook for late-joiner support
4. Eliminate window.diceLink for settings access (use direct imports)
5. Remove defensive try-catch after fixing timing

---

## Cross-Reference to Module Boundary Plan

See 07-module-boundary-plan.md - Settings analysis informed Tier 1-2 structure

See 08-extraction-sequence.md - Settings refactoring in Phase 1, Step 1.3

See 06-settings-registry.md - Complete settings documentation (this file)

# 10. Public API - Module Exports & External Interfaces

**Version:** 1.0.6.69 Snapshot  
**Purpose:** Catalog all exported functions and global API surface for the Dice Link Companion module  
**Status:** Complete  
**Last Updated:** After full API analysis

---

## Overview

This document defines the public API - all functions that are either explicitly exported via ES6 modules or exposed via the `window.diceLink` global object. The module currently uses a hybrid approach:

1. **ES6 Exports:** Functions exported from individual modules (settings.js, socket.js, etc.)
2. **Global Namespace:** Critical functions assigned to `window.diceLink` in main.mjs ready hook

**Migration Note:** Per 08-extraction-sequence.md, the global namespace pattern will be eliminated during restructure. Functions will be imported directly instead.

---

## Global Public API (window.diceLink)

These functions are exposed on `window.diceLink` in main.mjs lines 2223-2232. This is the primary external interface during ready hook execution.

### Panel Management

#### `refreshPanel()`
**Location:** main.mjs  
**Purpose:** Rebuild and re-render the entire panel UI  
**Signature:** `function refreshPanel()`  
**Returns:** void  
**Called by:**
- Event handlers for collapse/expand sections
- Socket message handlers when remote changes occur
- Permission change handlers
- Setting change handlers

**Behavior:**
1. Reads current settings and state
2. Generates appropriate panel content (GM or player)
3. Updates panel HTML via jQuery
4. Reattaches event handlers
5. Updates all collapsible sections based on state

**Dependencies:** Calls all UI generators, reads all settings

**Event Handlers Reattached:** All section collapse/expand, button clicks, input changes

**Cross-reference:** See 09-ui-components-inventory.md - calls `generate*` functions

---

### Dice Mode Application

#### `applyManualDice()`
**Location:** mode-application.js  
**Purpose:** Switch system to manual dice mode  
**Signature:** `function applyManualDice()`  
**Returns:** void  
**Called by:**
- Global override change to "forceAllManual"
- Player request approval (when modal shows)
- Initial mode setup in ready hook
- Socket message from another client

**Behavior:**
1. Stores manual mode in settings (`globalOverride` = "manual" OR `playerMode_${userId}` = "manual")
2. Unhides manual dice entry UI elements
3. Calls `refreshPanel()` to show new UI
4. Disables digital dice mode inputs
5. Registers manual dice dialog hooks

**Side Effects:** Global state change affecting all game windows

**Cross-reference:** See 03-dependency-map.md "Mode Application" for dependency details

---

#### `applyDigitalDice()`
**Location:** mode-application.js  
**Purpose:** Switch system to digital dice mode  
**Signature:** `function applyDigitalDice()`  
**Returns:** void  
**Called by:**
- Global override change to "forceAllDigital"
- Player request denial
- Player requests to switch back
- Initial mode setup in ready hook

**Behavior:**
1. Stores digital mode in settings
2. Hides manual dice entry UI
3. Calls `refreshPanel()`
4. Enables digital dice rolling
5. Clears pending manual roll requests

**Side Effects:** Global state change affecting all game windows

---

### Permissions & Mode Queries

#### `isUserInManualMode(userId = game.user.id)`
**Location:** settings.js  
**Purpose:** Check if a user should use manual dice mode  
**Signature:** `function isUserInManualMode(userId = game.user.id) → Boolean`  
**Returns:** `true` if user is in manual mode, `false` if digital  
**Called by:**
- Dialog mirroring hook to decide if hooks should capture dialogs
- Player panel generation to show mode status
- Socket handlers to validate mode before processing

**Logic:**
```javascript
// Checks in this order:
1. If globalOverride is "manual" or "digital": use that (ignore per-user setting)
2. If globalOverride is "individual": check playerMode_${userId}
3. Default to false (digital)
```

**Dependencies:** Reads `globalOverride` and `playerMode_*` settings

**Cross-reference:** See 06-settings-registry.md - derives from settings, not source of truth

---

#### `getPlayerMode(userId = game.user.id)`
**Location:** settings.js  
**Purpose:** Get a player's individual mode setting  
**Signature:** `function getPlayerMode(userId = game.user.id) → "manual" | "digital"`  
**Returns:** Mode string  
**Called by:**
- `isUserInManualMode()` when checking individual mode
- Player panel generation to show each player's mode
- Condition checks in various handlers

**Behavior:** Returns setting value with defensive fallback to "digital" if unset

**Cross-reference:** See 06-settings-registry.md Section 3 - playerMode_* setting details

---

#### `getGlobalOverride()`
**Location:** settings.js  
**Purpose:** Get the global mode setting  
**Signature:** `function getGlobalOverride() → "manual" | "digital" | "individual"`  
**Returns:** Global override mode  
**Called by:**
- Main mode application logic in ready hook
- Panel generation to show current override
- Permission checks

**Behavior:** Queries Foundry settings with error handling

**Cross-reference:** See 06-settings-registry.md Section 1 - globalOverride setting details

---

### Socket Communication

#### `playerRequestManual()`
**Location:** socket.js  
**Purpose:** Player requests to switch to manual dice mode  
**Signature:** `function playerRequestManual()`  
**Returns:** void (async, returns Promise)  
**Called by:**
- "Request Manual" button click handler in player panel
- Manual mode request UI

**Behavior:**
1. Validates player has permission to request
2. Sends socket message to all clients with request
3. Adds to pending requests queue
4. Updates panel to show "pending" status
5. Notifies GM via chat message

**Socket Message:** Sent to all clients, processed by handler in socket.js

**Cross-reference:** See 03-dependency-map.md "Socket Communication" - part of request/approval flow

---

#### `playerSwitchToDigital()`
**Location:** socket.js  
**Purpose:** Player switches from manual back to digital mode  
**Signature:** `function playerSwitchToDigital()`  
**Returns:** void (async)  
**Called by:**
- "Switch to Digital" button in player panel (when in manual mode)

**Behavior:**
1. Validates player permission
2. Sends socket message to all clients
3. Switches mode to digital
4. Updates panel

**Socket Message:** Sent to all clients

---

### Dialog Mirroring

#### `updatePanelWithMirroredDialog(mirroredData)`
**Location:** main.mjs  
**Purpose:** Update panel to show mirrored dialog content  
**Signature:** `function updatePanelWithMirroredDialog(mirroredData)`  
**Parameters:**
- `mirroredData` - Object with `dialogTitle` and `buttons` array

**Returns:** void  
**Called by:**
- Dialog mirroring hook when dialog renders
- Socket handler when another client shows dialog

**Behavior:**
1. Updates pending roll section to show mirrored dialog
2. Stores dialog data in state
3. Calls `refreshPanel()` to render
4. Attaches click handlers to mirrored buttons

**Cross-reference:** See 09-ui-components-inventory.md Component 6 - generateMirroredDialogHTML()

---

## Module Exports by File

### settings.js Exports

Public API for settings access:

```javascript
export const MODULE_ID = "dice-link-companion";

// Registration (called in init and ready hooks)
export function registerCoreSettings() { ... }
export function registerPlayerModeSettings() { ... }

// Low-level access
export function getSetting(key) { ... }
export async function setSetting(key, value) { ... }

// High-level getters/setters
export function getPlayerMode(userId) { ... }
export async function setPlayerMode(userId, mode) { ... }
export function getGlobalOverride() { ... }
export async function setGlobalOverride(value) { ... }
export function getPendingRequests() { ... }
export async function setPendingRequests(requests) { ... }
export function getCollapsedSections() { ... }
export async function setCollapsedSections(sections) { ... }

// Computed
export function isUserInManualMode() { ... }
```

**Cross-reference:** See 06-settings-registry.md - complete settings API documentation

---

### socket.js Exports

```javascript
export function setupSocketListeners() { ... }
export function playerRequestManual() { ... }
export function playerSwitchToDigital() { ... }
```

All other socket handlers are internal (not exported).

---

### logger.js Exports

```javascript
export function log(...args) { ... }
export function info(...args) { ... }
export function warn(...args) { ... }
export function error(...args) { ... }
export function group(label, fn) { ... }
export function logLevel(level, ...args) { ... }
export const Logger = { ... }  // Object with all methods
```

**Usage:** Other modules use `import { log, info, warn, error } from './logger.js'`

---

### dice-parsing.js Exports

```javascript
export function parseDiceFromFormula(formula) { ... }
export async function executeRollWithValues(formula, diceResults, title, subtitle, rollConfig, originalConfig) { ... }
```

**Purpose:** Parse Foundry dice formulas and execute with manual values

---

### dialog-mirroring.js Exports

```javascript
export function getMirroredDialog() { ... }
export function setMirroredDialog(dialog) { ... }
export function setupDialogMirroring() { ... }
```

---

### chat.js Exports

```javascript
export async function createRequestChatMessage(playerId, playerName) { ... }
```

Creates notification message when player requests manual mode.

---

### approval.js Exports

```javascript
export async function createApprovalChatMessage(playerId, playerName, approved) { ... }
export function setupChatButtonHandlers() { ... }
```

Creates approval/denial messages and handles approval button clicks.

---

## Access Patterns

### Current Pattern (v1.0.6.69)

**Within main.mjs and dialog-mirroring.js:**
```javascript
// Use window.diceLink (global namespace)
window.diceLink.refreshPanel();
window.diceLink.getPlayerMode(userId);
```

**Within other modules:**
```javascript
// Use direct imports
import { getPlayerMode, refreshPanel } from './main.mjs';
getPlayerMode(userId);
```

**Issue:** Fragile - dialog-mirroring.js depends on window.diceLink being populated, which happens in ready hook after dialog-mirroring.js is imported.

**Cross-reference:** See 02-simplicity-targets.md Section 4.3 - window.diceLink fragility identified

---

### Proposed Pattern (After Restructure)

**All modules use direct ES6 imports:**
```javascript
import { getPlayerMode } from './settings.js';
import { refreshPanel } from './dice-panel.js';

getPlayerMode(userId);
refreshPanel();
```

**Benefits:**
- No circular dependency issues
- Imports visible in code
- No runtime window object population needed
- Eliminates 100ms delay in ready hook

**Cross-reference:** See 08-extraction-sequence.md Phase 5.4 - elimination of window.diceLink

---

## External Module Integration

The Dice Link Companion module is designed for use by other Foundry modules via the window.diceLink global.

### Example: Other Module Integrating

```javascript
// Another module wanting to force manual dice
if (window.diceLink && window.diceLink.applyManualDice) {
  window.diceLink.applyManualDice();
}

// Check if user is in manual mode
const userInManual = window.diceLink?.isUserInManualMode(targetUserId);

// Refresh panel after external change
window.diceLink?.refreshPanel();
```

**Dependency:** Requires DLC to be loaded (init hook must fire first)

**Risk:** If DLC module init fails, window.diceLink won't exist

---

## API Stability

### Stable (Should not change without deprecation)
- `getPlayerMode(userId)`
- `getGlobalOverride()`
- `isUserInManualMode(userId)`
- `applyManualDice()`
- `applyDigitalDice()`
- `refreshPanel()`

These are used in multiple places and external modules may depend on them.

### Internal (May change during restructure)
- `playerRequestManual()`
- `playerSwitchToDigital()`
- `updatePanelWithMirroredDialog()`

These are internal workflow functions less likely to be used by external modules.

### Deprecated After Restructure
- `window.diceLink` global object
- All functions will be imported directly instead

---

## Cross-References

See 08-extraction-sequence.md - Phase 5.4 eliminates window.diceLink and transitions to direct imports  
See 07-module-boundary-plan.md - Module exports defined by tier system  
See 06-settings-registry.md - Settings accessor functions are core public API  
See 03-dependency-map.md - Function call graph shows all public dependencies  
See 02-simplicity-targets.md Section 4.3 - Identifies window.diceLink as architectural concern

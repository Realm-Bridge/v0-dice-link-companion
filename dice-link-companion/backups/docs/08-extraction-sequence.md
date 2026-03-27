# 08. Extraction Sequence - Order of Operations for Restructure

**Version:** 1.0.6.66 Snapshot  
**Purpose:** Define the order in which modules should be extracted/refactored to minimize risk and circular dependency issues  
**Status:** Complete  
**Last Updated:** After full code analysis

---

## Overview

This document defines the sequence for extracting code from main.mjs into new modules. The order is critical - each step depends on previous steps being complete.

The extraction follows the **tier-based dependency model** from 07-module-boundary-plan.md. Modules with no dependencies (Tier 1) are extracted first, then each higher tier becomes available only after its dependencies are ready.

**Key Principle:** Never extract a module before its dependencies exist. Always test after each extraction to ensure nothing broke.

---

## Phase 1: Foundation Setup (Tiers 1-2)

These modules have zero dependencies on other DLC modules. Extract these first.

### Step 1.1: Create `constants.js` (Tier 1)

**Extract from:** Scattered throughout main.mjs and settings.js  
**Contains:** All hardcoded values and defaults

**Code to extract:**
```javascript
// Dice types (currently in dice-parsing.js, dice.js, main.mjs)
export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

// Setting defaults (currently scattered in 3 places per 02-simplicity-targets.md Section 2.4)
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

// UI-related constants
export const PANEL_WIDTH = 400;
export const PANEL_HEIGHT_MIN = 200;
export const PANEL_HEIGHT_MAX = 800;

// Module metadata
export const MODULE_ID = 'dice-link-companion';
export const MODULE_VERSION = '1.0.6.66';
```

**Why first:** Every other module will import from this. No circular dependency possible.

**Testing:** Verify constants are exported and importable

**Cross-reference:** See 02-simplicity-targets.md Section 2.4 - consolidates triple-definition problem

---

### Step 1.2: Create `logger.js` (Tier 1)

**Status:** Already exists! Skip to Step 1.3

---

### Step 1.3: Refactor `settings.js` (Tier 2 - depends on constants.js)

**Extract from:** Already separate file  
**Depends on:** constants.js (for SETTING_DEFAULTS)  
**Action:** Refactor existing file to import constants

**Changes:**
```javascript
// At top of settings.js
import { SETTING_DEFAULTS, MODULE_ID } from './constants.js';

// Replace hardcoded defaults
export function getCollapsedSections() {
  const saved = getSetting("collapsedSections");
  return { ...SETTING_DEFAULTS.collapsedSections, ...saved };
}

// Remove the hardcoded defaults that are now in constants.js
```

**Why Tier 2:** Depends on constants.js (Tier 1), no other DLC dependencies

**Testing:** All settings functions still work, defaults come from constants.js

**Cross-reference:** See 06-settings-registry.md - settings registration now imports from constants

---

### Step 1.4: Create `state.js` (Tier 2 - depends on constants.js)

**Extract from:** main.mjs (all module-level let/const variables)  
**Depends on:** constants.js  
**Contains:** All memory-only state with getter/setter pattern

**Code structure:**
```javascript
import { MODULE_ID } from './constants.js';

// All memory-only state variables (from 04-state-variables-inventory.md Section 1)
let pendingRollRequest = null;
let hasRequestedThisSession = {};
let currentPanelDialog = null;
let pendingDiceEntry = null;
let diceEntryCancelled = false;
let mirroredDialog = null;
let collapsedSections = {};

// Getters
export function getPendingRollRequest() { return pendingRollRequest; }
export function getHasRequestedThisSession() { return hasRequestedThisSession; }
export function getCurrentPanelDialog() { return currentPanelDialog; }
// ... all getters

// Setters
export function setPendingRollRequest(value) { pendingRollRequest = value; }
export function setHasRequestedThisSession(value) { hasRequestedThisSession = value; }
export function setCurrentPanelDialog(value) { currentPanelDialog = value; }
// ... all setters

// Compound operations
export function clearAllState() {
  pendingRollRequest = null;
  hasRequestedThisSession = {};
  currentPanelDialog = null;
  pendingDiceEntry = null;
  diceEntryCancelled = false;
  mirroredDialog = null;
  collapsedSections = {};
}
```

**Why Tier 2:** Isolated state, only depends on constants, no module logic

**Testing:** State can be get/set, persists across calls

**Cross-reference:** See 04-state-variables-inventory.md - implements the "single state module" recommendation

---

### Step 1.5: Refactor `dice-parsing.js` (Tier 2 - depends on constants.js)

**Status:** Mostly already standalone. Update imports

**Changes:**
```javascript
import { DICE_TYPES } from './constants.js';

// Remove local DICE_TYPES definition
// Update all references to use imported constant
```

**Why Tier 2:** Uses only constants, no state or settings dependencies

**Testing:** Dice parsing still works with imported constants

---

## Phase 2: Core Modules (Tiers 3-4)

These modules depend on Tier 1-2 being complete.

### Step 2.1: Refactor `socket.js` (Tier 3)

**Status:** Already exists  
**Depends on:** settings.js (Tier 2), state.js (Tier 2)  
**Action:** Add imports, remove any hardcoded values

**Changes:**
```javascript
import { MODULE_ID } from './constants.js';
import { getPlayerMode, setPlayerMode } from './settings.js';
import { getPendingRollRequest, setPendingRollRequest } from './state.js';
```

**Why Tier 3:** Depends on Tier 2 modules but no circular dependencies

**Testing:** Socket communication still works

**Cross-reference:** See 03-dependency-map.md - shows socket.js as mid-tier dependency

---

### Step 2.2: Create `approval.js` Refactored (Tier 3)

**Status:** Already exists  
**Depends on:** settings.js, state.js  
**Action:** Ensure proper imports, no circular dependencies

**Changes:**
```javascript
import { getPermissions } from './settings.js';
import { getPendingRollRequest, setPendingRollRequest } from './state.js';
```

**Testing:** Approval workflow still functions

---

### Step 2.3: Create `ui-templates.js` (Tier 4)

**Extract from:** main.mjs (all the `generate*` functions that return HTML strings)  
**Depends on:** constants.js, settings.js, state.js  
**Contains:** All panel HTML generation, no game logic

**Functions to extract:**
- `generateGMPanel()`
- `generatePlayerPanel()`
- `generateRollRequestSection()`
- `generateGlobalOverrideSection()`
- All other HTML generation functions

**Structure:**
```javascript
import { MODULE_ID, PANEL_WIDTH } from './constants.js';
import { getGlobalOverride, getPlayerMode } from './settings.js';
import { getPendingRollRequest } from './state.js';

export function generateGMPanel() {
  // HTML generation logic
}

export function generatePlayerPanel() {
  // HTML generation logic
}
// ... all other generators
```

**Why Tier 4:** Uses constants and queries settings/state but doesn't modify game logic

**Testing:** Panels render correctly, all buttons present

**Cross-reference:** See 09-ui-components-inventory.md for complete inventory of all HTML generators and their dependencies

**Cross-reference:** See 09-ui-components-inventory.md for complete list of functions

---

## Phase 3: Dialog & Event Handling (Tiers 5-6)

### Step 3.1: Refactor `dialog-mirroring.js` (Tier 5)

**Status:** Already exists  
**Depends on:** settings.js, state.js, ui-templates.js  
**Action:** Add imports, ensure no window.diceLink access

**Changes:**
```javascript
import { isUserInManualMode } from './settings.js';
import { getMirroredDialog, setMirroredDialog } from './state.js';
import { updatePanelWithMirroredDialog } from './ui-templates.js';

// Remove all window.diceLink references
// Replace with direct imports
```

**Why Tier 5:** High-level feature that depends on lower tiers

**Testing:** Dialog mirroring still captures and displays dialogs

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - questions if this module is needed; evaluate now

---

### Step 3.2: Create `chat-integration.js` (Tier 5)

**Extract from:** chat.js (already separate)  
**Depends on:** settings.js, state.js  
**Action:** Ensure proper imports

**Testing:** Chat buttons work

---

## Phase 4: Mode Application (Tier 6)

### Step 4.1: Refactor `mode-application.js` (Tier 6)

**Status:** Already exists  
**Depends on:** settings.js, state.js, socket.js  
**Action:** Add imports, ensure no window.diceLink

**Testing:** Mode switching works for both manual and digital

**Cross-reference:** See 03-dependency-map.md - mode-application is mid-dependency

---

## Phase 5: Orchestration (Tier 7-9)

### Step 5.1: Create `dice-panel.js` (Tier 7)

**Extract from:** main.mjs (all panel rendering and update logic)  
**Depends on:** All Tiers 2-6

**Functions:**
- `refreshPanel()`
- `openPanel()`
- `closePanel()`
- Panel event handlers

**Why Tier 7:** Orchestrates UI from lower tiers

**Testing:** Panel updates correctly

---

### Step 5.2: Create `dice-fulfillment.js` (Tier 7)

**Extract from:** main.mjs (all dice rolling and fulfillment)  
**Depends on:** settings, state, mode-application

**Functions:**
- `applyManualDice()`
- `applyDigitalDice()`
- Related helpers

**Testing:** Dice application works in both modes

**Cross-reference:** See 03-dependency-map.md - fulfillment is high-level orchestration

---

### Step 5.3: Create `video-feed.js` (Tier 8)

**Extract from:** main.mjs (video feed UI and logic)  
**Status:** Placeholder only (per 02-simplicity-targets.md Section 3.4)  
**Depends on:** ui-templates, constants

**Contains:** Video feed HTML and future video logic

**Why separate:** Isolates experimental feature, keeps main.mjs clean

**Cross-reference:** See 02-simplicity-targets.md Section 3.4 - placeholder for future video feature

---

### Step 5.4: Refactor `main.mjs` (Tier 9 - Entry Point Only)

**Final state:** Only contains hook registrations

**All imports at top:**
```javascript
import { MODULE_ID } from './constants.js';
import { registerCoreSettings, registerPlayerModeSettings, getGlobalOverride } from './settings.js';
import { setupSocketListeners } from './socket.js';
import { setupDialogMirroring } from './dialog-mirroring.js';
import { refreshPanel, openPanel } from './dice-panel.js';
import { setupChatButtonHandlers } from './chat-integration.js';
import { applyDigitalDice, applyManualDice } from './dice-fulfillment.js';
import { initializeLogger } from './logger.js';
```

**Content:** Only Hooks.once() and Hooks.on() calls that register other modules' functions

**Benefit:** Eliminates 100ms delay (no need - all modules loaded before hooks fire)  
**Benefit:** Eliminates window.diceLink (direct imports work)  
**Benefit:** Eliminates ~400 lines of logic from main.mjs

**Testing:** Module loads, all functionality works

**Cross-reference:** See 07-module-boundary-plan.md - main.mjs becomes entry point only

---

## Testing Strategy

### After Each Step
- Verify module exports correctly
- Check no new console errors
- Test affected features

### After Phase Complete
- Full integration test
- Check for circular dependencies using build tools
- Verify all settings still persist
- Verify all state operations work

### After All Phases
- Full feature test of all modes
- Multiplayer test with socket communication
- GM and Player role verification
- Edge cases from 01-edge-cases.md

---

## Risk Mitigation

**Backup before each phase:** Git commit before starting each phase  
**Test incrementally:** Don't skip testing between steps  
**Revert if needed:** Easy to revert each small change  
**Keep old code:** Comment out instead of delete while testing

**Cross-reference:** See 07-module-boundary-plan.md "Risks & Mitigations" for detailed risk analysis

---

## Success Criteria

✅ All 9 tiers extracted into separate files  
✅ main.mjs reduced to ~150 lines (hook registrations only)  
✅ Zero circular dependencies  
✅ 100ms delay removed  
✅ window.diceLink pattern eliminated  
✅ All tests pass  
✅ All features functional

---

## Cross-References

See 07-module-boundary-plan.md for the overall architecture this sequence implements.  
See 03-dependency-map.md for dependency relationships that inform this order.  
See 02-simplicity-targets.md for dead code that should be removed during extraction.  
See 06-settings-registry.md for settings refactoring during constants.js creation.  
See 04-state-variables-inventory.md for state.js module content.  
See 09-ui-components-inventory.md for UI component extraction details (Step 2.3).

## IMPORTANT: DO NOT DELETE THESE FILES WITHOUT APPROVAL

These documentation files represent significant analysis work and are critical for the restructuring effort. Always check with the project owner before deleting or modifying.

**Backups Location:** `backups/docs/`

---

## Document Manifest

| Doc # | Filename | Purpose | Status |
|-------|----------|---------|--------|
| 01 | 01-edge-cases.md | Edge cases, special handling, fragile patterns | Complete |
| 02 | 02-simplicity-targets.md | Dead code, redundancy, simplification opportunities | Complete |
| 03 | 03-dependency-map.md | Function calls, cross-module dependencies | Complete |
| 04 | 04-state-variables-inventory.md | All state variables, their scope and access | Complete |
| 05 | 05-hook-registration-map.md | Foundry hooks, timing, dependencies | Complete |
| 06 | 06-settings-registry.md | All settings, registration, access patterns | Complete |
| 07 | 07-module-boundary-plan.md | Proposed file structure for restructure | Complete |
| 08 | 08-extraction-sequence.md | Order of operations for restructure | Pending |
| 09 | 09-ui-components-inventory.md | HTML generation functions, UI patterns | Pending |
| 10 | 10-public-api.md | Exported functions, external interfaces | Pending |

---

## Cross-Reference System

All documents are interconnected with cross-references. When a topic is discussed in multiple documents, each includes references to the others. This creates a comprehensive documentation network where:

- Issues identified in one document reference related analysis in others
- Recommendations link back to the root cause analysis
- No information is isolated

---

## Version Note

These documents analyze the **v1.0.6.66** codebase. If the code is restructured, these documents should be regenerated to reflect the new architecture.

---

## Backup Protocol

After each document is completed:
1. Document is added to `backups/docs/` folder
2. This manifest is updated with status
3. Cross-references are verified against all previous documents

Last updated: Document 07 complete

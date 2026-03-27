# 10. Public API - Module Exports & External Interfaces

**Version:** 1.0.6.66 Snapshot  
**Purpose:** Catalog all exported functions and global API surface  
**Status:** Complete

---

## Overview

This document defines the public API - all functions either explicitly exported via ES6 modules or exposed via the `window.diceLink` global object.

---

## Global Public API (window.diceLink)

These functions are exposed on `window.diceLink` in main.mjs ready hook.

### Panel Management

#### `refreshPanel()`
**Purpose:** Rebuild and re-render the entire panel UI  
**Called by:** Event handlers, socket handlers, permission changes  
**Behavior:** Reads settings/state, generates appropriate HTML, updates panel, reattaches handlers

#### `openPanel()`
**Purpose:** Open the DLC panel dialog  
**Called by:** Scene control button, programmatic triggers

#### `closePanel()`
**Purpose:** Close the panel dialog  
**Called by:** Close button, panel handlers

---

### Dice Mode Application

#### `applyManualDice()`
**Purpose:** Switch system to manual dice mode  
**Called by:** Global override changes, request approval, socket messages  
**Behavior:** Stores mode in settings, updates UI, registers manual dice hooks

#### `applyDigitalDice()`
**Purpose:** Switch system to digital dice mode  
**Called by:** Override changes, request denial, player requests  
**Behavior:** Stores digital mode, hides manual UI, enables digital rolling

---

### Settings & Mode Queries

#### `isUserInManualMode(userId)`
**Purpose:** Check if user should use manual dice mode  
**Returns:** Boolean  
**Logic:** Checks globalOverride first, then playerMode if "individual"  
**Called by:** Dialog mirroring, mode checks, permission validation

#### `getPlayerMode(userId)`
**Purpose:** Get player's individual mode setting  
**Returns:** "manual" | "digital"  
**Called by:** Panel generation, mode checks

#### `getGlobalOverride()`
**Purpose:** Get global mode setting  
**Returns:** "manual" | "digital" | "individual"  
**Called by:** Mode application logic, panel display

---

### Socket Communication

#### `playerRequestManual()`
**Purpose:** Player requests manual mode  
**Called by:** "Request Manual" button  
**Behavior:** Validates permission, sends socket message, adds to queue

#### `playerSwitchToDigital()`
**Purpose:** Player switches to digital mode  
**Called by:** "Switch to Digital" button  
**Behavior:** Validates permission, sends socket message, switches mode

---

### Dialog Mirroring

#### `updatePanelWithMirroredDialog(mirroredData)`
**Purpose:** Update panel to show mirrored dialog content  
**Called by:** Dialog mirroring hook, socket handler  
**Behavior:** Updates roll section, stores dialog data, refreshes panel

---

## Module Exports by File

**settings.js:** All settings functions + MODULE_ID
**socket.js:** setupSocketListeners, emit functions
**logger.js:** log, info, warn, error, group functions
**dice-parsing.js:** parseDiceFromFormula, executeRollWithValues
**dialog-mirroring.js:** getMirroredDialog, setMirroredDialog, setupDialogMirroring
**chat.js:** createRequestChatMessage
**approval.js:** createApprovalChatMessage, setupChatButtonHandlers

---

## Access Patterns

### Current (v1.0.6.66)
- Main code: Uses window.diceLink global
- Issue: Fragile - depends on ready hook population

### Proposed (Post-Restructure)
- All modules: Direct ES6 imports
- Benefit: Visible imports, no runtime window object needed

---

## API Stability

### Stable (Should not change)
- getPlayerMode(userId)
- getGlobalOverride()
- isUserInManualMode(userId)
- applyManualDice()
- applyDigitalDice()
- refreshPanel()

These are used in multiple places and external modules may depend on them.

### Internal (May change)
- playerRequestManual()
- playerSwitchToDigital()
- updatePanelWithMirroredDialog()

---

## Cross-References

See 08-extraction-sequence.md Phase 5.4 - Eliminates window.diceLink
See 07-module-boundary-plan.md - Module exports defined by tier system
See 06-settings-registry.md - Settings accessor functions
See 03-dependency-map.md - Function call graph

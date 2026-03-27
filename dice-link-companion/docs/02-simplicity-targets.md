# Simplicity Targets - Dice Link Companion

**Version: 1.0.6.66 Snapshot**
**Note:** This document analyzes simplicity targets in v1.0.6.66. When we restructure the code, regenerate this documentation using the same analysis process to reflect the new architecture.

---

## Overview
This document identifies code that can be simplified, removed, or consolidated during restructuring.

---

## 1. DEAD CODE - Can Be Deleted

### 1.1 DiceLinkResolver Class
**Location:** `main.mjs` - `DiceLinkResolver` class definition
**Issue:** Class is defined (~115 lines) but never instantiated anywhere
**Action:** DELETE - No callers, no references

### 1.2 executeDirectRoll Function
**Location:** `main.mjs` - `executeDirectRoll()` function
**Issue:** Function exists (~50 lines) but is never called
**Action:** DELETE - Dead code from previous architecture

### 1.3 pendingRollConfig Variable
**Location:** `main.mjs` - state variable declarations at top
**Issue:** Declared but never used anywhere in codebase
**Action:** DELETE - Orphaned variable

### 1.4 Debug Console.log Statements
**Location:** `settings.js` - in `registerPlayerModeSettings()`
**Issue:** Debug logging left in production code
**Action:** DELETE - Development artifacts

**Estimated savings:** ~180 lines

---

## 2. REDUNDANT CODE - Can Be Consolidated

### 2.1 Dice Types Array
**Locations:** Defined in 4 places:
- `main.mjs` in `generateRollRequestHTML()`
- `main.mjs` in `generateMirroredDialogHTML()`  
- `main.mjs` in `generateDiceEntryHTML()`
- `dice-parsing.js` in `DICE_TYPES` constant

**Issue:** Same array `["d4", "d6", "d8", "d10", "d12", "d20", "d100"]` repeated
**Action:** CONSOLIDATE to single exported constant

### 2.2 Element Normalization Logic
**Locations:**
- `dice-parsing.js` in `normalizeElement()`
- `main.mjs` in `submitMirroredDialog()`

**Issue:** Same logic for converting element names to lowercase and handling variations
**Action:** CONSOLIDATE to single utility function

### 2.3 Panel Open/Refresh Logic
**Locations:** `openPanel()` and `refreshPanel()` in `main.mjs`
**Issue:** Both functions handle similar panel state management with overlapping logic
**Action:** CONSOLIDATE - `openPanel()` could simply set state and call `refreshPanel()`

### 2.4 Collapsed Sections Defaults
**Locations:** Defined in 3 places:
- `main.mjs` state variable initialization
- `settings.js` in `registerCoreSettings()`
- `settings.js` in `getCollapsedSections()`

**Issue:** Same default object repeated, risk of drift
**Action:** CONSOLIDATE to single source of truth, others reference it

**Cross-reference:** See 06-settings-registry.md "Known Issues #1" for comprehensive analysis of this triple-definition problem and recommendations for consolidation

**Estimated savings:** ~60 lines + reduced maintenance risk

---

## 3. OVER-ENGINEERED CODE - Can Be Simplified

### 3.1 isRollDialog Function
**Location:** `dialog-mirroring.js` - `isRollDialog()` function
**Issue:** ~100 lines of class name matching when ~10 lines would suffice
**Analysis:** Checks many legacy class names that may no longer be relevant in Foundry v13/dnd5e 4.x
**Action:** SIMPLIFY - Test which checks are actually needed, remove others

### 3.2 executeDiceTrayRollManually Function
**Location:** `main.mjs` - `executeDiceTrayRollManually()` function
**Issue:** ~125 lines rebuilding what Foundry's Roll class does natively
**Analysis:** Manual dice formula construction, term building, evaluation
**Action:** SIMPLIFY - Use Foundry's native Roll API where possible

### 3.3 Dialog Mirroring System
**Location:** `dialog-mirroring.js` entire file + related functions in `main.mjs`
**Issue:** Complex system to intercept, hide, and mirror native dialogs
**Question:** Is this necessary? Could we instead:
- Let native dialog show and just read its values?
- Use a simpler approach for manual mode?
**Action:** EVALUATE during restructure - may be able to simplify significantly

### 3.4 Video Feed Placeholder
**Locations:**
- `main.mjs` in `generateGMPanelHTML()` 
- `main.mjs` in `generatePlayerPanelHTML()`

**Issue:** ~40 lines of HTML for a "Coming Soon" placeholder
**Decision:** KEEP the UI but EXTRACT to separate `video-feed.js` module
**Rationale:** Feature will be developed later; isolating it now creates a clean module boundary and keeps main.mjs focused. The placeholder UI remains functional while all video-related code lives in its own file ready for future development.

---

## 4. FRAGILE CODE - Needs Restructuring

### 4.1 English Text Detection
**Locations:**
- `dialog-mirroring.js` in `mirrorDialogToPanel()` - checks for "initiative"
- `dialog-mirroring.js` in `extractDialogFormData()` - parses English labels
- `main.mjs` in `generateMirroredDialogHTML()` - English button labels

**Issue:** Hardcoded English strings break internationalization
**Action:** Use Foundry's localization system or detect by structure not text

### 4.2 Magic Numbers
**Locations:**
- `main.mjs` ready hook - `100` ms delay
- `settings.js` - permission level `3` (GAME_MASTER)
- Various timeout values throughout

**Issue:** Numbers without explanation, hard to maintain
**Action:** Define as named constants with comments

### 4.3 window.diceLink Global Dependency
**Locations:**
- `main.mjs` ready hook - populates `window.diceLink`
- `dialog-mirroring.js` - accesses `window.diceLink.updatePanelWithMirroredDialog`
- `socket.js` - accesses multiple `window.diceLink.*` functions

**Issue:** Tight coupling via global, fragile if ready hook order changes
**Action:** Pass functions as parameters or use proper module exports

**Cross-reference:** See 06-settings-registry.md "Known Issues #4" for detailed analysis of this global dependency pattern and how it affects settings access throughout the system

---

## 5. ARCHITECTURAL QUESTIONS

### 5.1 Do We Need Both Panel Types?
**Current:** Separate GM panel and Player panel HTML generation
**Question:** How different are they really? Could one template with conditional sections work?
**Impact:** Could reduce ~200 lines of duplicate HTML generation

### 5.2 mirroredDialog vs pendingRollRequest
**Current:** Two separate state objects tracking similar information
**Question:** Should these be unified into a single "currentRoll" state?
**Impact:** Simpler state management, fewer edge cases

### 5.3 Multiple Dialog Hooks
**Current:** Four hooks registered for dialog interception
**Question:** Is `renderApplicationV2` sufficient for Foundry v13+?
**Impact:** Could remove 3 redundant hook registrations

---

## 6. SUMMARY TABLE

| Category | Item | Est. Lines Saved | Priority |
|----------|------|------------------|----------|
| Dead Code | DiceLinkResolver class | ~115 | HIGH |
| Dead Code | executeDirectRoll function | ~50 | HIGH |
| Dead Code | pendingRollConfig variable | ~5 | HIGH |
| Dead Code | Debug console.logs | ~10 | HIGH |
| Redundant | Dice types array (4x) | ~20 | MEDIUM |
| Redundant | Element normalization (2x) | ~15 | MEDIUM |
| Redundant | Collapsed sections defaults (3x) | ~25 | MEDIUM |
| Over-eng | isRollDialog simplification | ~60 | MEDIUM |
| Over-eng | executeDiceTrayRollManually | ~80 | LOW |
| Extract | Video feed to module | 0 (move) | MEDIUM |

**Total potential reduction:** ~340 lines (~15% of main.mjs)

---

## Cross-References
- See 01-edge-cases.md for fragility details on dialog detection
- See 03-dependency-map.md for window.diceLink dependency flow
- See 04-state-variables-inventory.md for mirroredDialog/pendingRollRequest analysis
- See 07-module-boundary-plan.md - The simplicity targets here directly inform the proposed module structure:
  - Dead code removal happens before restructure
  - Redundant code consolidation creates constants.js
  - Video feed extraction creates video-feed.js
  - Dialog mirroring evaluation determines if that module stays or goes

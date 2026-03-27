# 08. Extraction Sequence - Order of Operations for Restructure

**Version:** 1.0.6.66 Snapshot  
**Purpose:** Define the order to extract modules to minimize risk and circular dependencies  
**Status:** Complete

---

## Overview

This document defines the sequence for extracting code from main.mjs into new modules. The order is critical - each step depends on previous steps being complete. Never extract a module before its dependencies exist.

---

## Phase 1: Foundation Setup (Tiers 1-2)

### Step 1.1: Create `constants.js`
- **Extract:** All hardcoded values from main.mjs and settings.js
- **Contains:** MODULE_ID, SETTING_DEFAULTS, DICE_TYPES, UI constants
- **Why first:** Every other module imports from this. No circular dependency possible.

### Step 1.2: Refactor `settings.js`
- **Action:** Import constants.js, replace hardcoded defaults
- **Change:** collapsedSections defaults now come from constants.js
- **Testing:** All settings functions still work

### Step 1.3: Create `state.js`
- **Extract:** All memory-only state variables from main.mjs
- **Contains:** pendingRollRequest, hasRequestedThisSession, etc. with getter/setter functions
- **Pattern:** Encapsulation via functions, no direct access

### Step 1.4: Refactor `dice-parsing.js`
- **Update:** Import DICE_TYPES from constants.js
- **Remove:** Local DICE_TYPES definition

---

## Phase 2: Core Modules (Tiers 3-4)

### Step 2.1: Refactor existing modules
- **socket.js:** Add imports from Tier 1-2
- **approval.js:** Ensure proper imports
- **mode-application.js:** Add imports

### Step 2.2: Create `ui-templates.js`
- **Extract:** All HTML generation functions from main.mjs
- **Functions:** generateGMPanel(), generatePlayerPanel(), all helpers
- **Depends on:** constants.js, settings.js, state.js
- **Size:** ~600 lines

---

## Phase 3: Dialog & Events

### Step 3.1: Refactor `dialog-mirroring.js`
- **Remove:** window.diceLink references
- **Add:** Direct imports from lower tiers
- **Evaluate:** Is this module still needed? (See 02-simplicity-targets.md Section 3.3)

### Step 3.2: Refactor `chat.js`
- **Ensure:** Proper imports, no window.diceLink

---

## Phase 4-5: Orchestration & Entry Point

### Step 4.1-5.3: Extract remaining UI components and features

### Step 5.4: Refactor `main.mjs` (Final Step)
- **Delete:** All extracted code
- **Keep:** Only hook registrations
- **New size:** ~150 lines
- **Remove:** 100ms delay (all modules already loaded)
- **Remove:** window.diceLink (use direct imports)

---

## Testing Strategy

- Test after each step
- Verify module exports
- Check for circular dependencies
- Test affected features

---

## Success Criteria

- All 9 tiers extracted
- main.mjs reduced to ~150 lines
- Zero circular dependencies
- 100ms delay removed
- window.diceLink eliminated
- All features functional

---

## Cross-References

See 07-module-boundary-plan.md for architecture
See 03-dependency-map.md for dependency relationships
See 02-simplicity-targets.md for dead code
See 04-state-variables-inventory.md for state.js content
See 09-ui-components-inventory.md for UI extraction

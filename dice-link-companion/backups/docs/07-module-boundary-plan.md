# Module Boundary Plan

**Version:** 1.0.6.66 Snapshot
**Note:** This document proposes module boundaries for restructuring. Regenerate after implementation.

---

## Overview

This document defines the proposed file structure for a clean DLC architecture.

### Current Structure
- main.mjs (2266 lines - monolithic)
- settings.js
- dialog-mirroring.js
- approval.js
- socket.js
- mode-application.js
- dice-parsing.js
- chat.js
- logger.js

### Problems with Current Structure
1. main.mjs contains UI, state, hooks, and logic all mixed together
2. Circular dependency risks between modules
3. Hard to test individual components
4. Changes to one feature risk breaking others

---

## Proposed Module Structure

The goal is to separate concerns while maintaining clear dependencies.

### Tier 1: Core Infrastructure (No dependencies on other DLC modules)

These modules have zero dependencies on other DLC code.

#### constants.js (NEW)
**Purpose:** Single source of truth for all constants
**Contains:**
- MODULE_ID
- SETTING_DEFAULTS (globalOverride, collapsedSections, permissions, playerMode)
- DICE_TYPES array
- CSS class names
- Socket event names

**Exports:**
- All constants as named exports

**Dependencies:** None

---

#### logger.js (EXISTS - keep as-is)
**Purpose:** Logging utility
**Contains:** Log level management, formatted output
**Exports:** log, debug, warn, error functions
**Dependencies:** None (uses MODULE_ID from constants.js in restructure)

---

### Tier 2: Settings Layer (Depends only on Tier 1)

#### settings.js (EXISTS - refactor)
**Purpose:** All Foundry settings registration and access
**Contains:**
- registerCoreSettings()
- registerPlayerModeSettings()
- All get/set functions for settings
- isUserInManualMode()
- isGMUser()

**Exports:**
- All settings functions
- SETTING_DEFAULTS re-exported from constants.js

**Dependencies:**
- constants.js (MODULE_ID, SETTING_DEFAULTS)

**Cross-reference:** See 06-settings-registry.md for detailed settings analysis

---

### Tier 3: State Management (Depends on Tier 1-2)

#### state.js (NEW)
**Purpose:** Centralized state management
**Contains:**
- All memory-only state variables:
  - hasRequestedThisSession
  - pendingRollRequest
  - currentPanelDialog
  - pendingDiceEntry
  - diceEntryCancelled
  - collapsedSections (memory cache)
- State getters and setters
- State reset functions

**Exports:**
- getState(), setState() for each variable
- resetAllState()

**Dependencies:**
- constants.js (default values)
- settings.js (for persisted state sync)

**Cross-reference:** See 04-state-variables-inventory.md for state analysis

---

### Tier 4: Business Logic (Depends on Tier 1-3)

#### dice-parsing.js (EXISTS - keep mostly as-is)
**Purpose:** Parse dice notation and roll data
**Exports:** parseDiceNotation, extractRollInfo
**Dependencies:** constants.js (DICE_TYPES)

---

#### mode-application.js (EXISTS - refactor)
**Purpose:** Apply dice modes to users
**Contains:**
- applyManualDice()
- applyDigitalDice()
- Mode switching logic

**Exports:** applyManualDice, applyDigitalDice
**Dependencies:**
- settings.js (getGlobalOverride, getPlayerMode, setPlayerMode)
- state.js (for tracking mode changes)

---

#### approval.js (EXISTS - keep mostly as-is)
**Purpose:** Manual mode request approval workflow
**Exports:** createApprovalRequest, processApproval
**Dependencies:**
- settings.js (permissions)
- state.js (pending requests)

---

### Tier 5: Communication (Depends on Tier 1-4)

#### socket.js (EXISTS - refactor)
**Purpose:** Cross-client communication via Foundry sockets
**Contains:**
- setupSocketListeners()
- Socket message handlers
- Socket emit functions

**Exports:**
- setupSocketListeners
- emitPlayerRequest, emitModeChange, etc.

**Dependencies:**
- settings.js (for permission checks)
- state.js (for updating state from socket messages)
- mode-application.js (for applying mode changes)

---

#### chat.js (EXISTS - keep mostly as-is)
**Purpose:** Chat message button handlers
**Exports:** setupChatButtonHandlers
**Dependencies:**
- state.js
- socket.js

---

### Tier 6: UI Layer (Depends on all above)

#### ui-templates.js (NEW)
**Purpose:** All HTML generation functions
**Contains:**
- generateGMPanel()
- generatePlayerPanel()
- generateRollRequestSection()
- generatePlayerModeRow()
- All other HTML template functions

**Exports:** All template generation functions
**Dependencies:**
- constants.js (CSS classes)
- settings.js (for reading current values to display)
- state.js (for reading current state to display)

**Cross-reference:** See 02-simplicity-targets.md Section 3 for UI simplification targets

---

#### ui-panel.js (NEW)
**Purpose:** Panel lifecycle management
**Contains:**
- openPanel()
- closePanel()
- refreshPanel()
- Panel dialog management

**Exports:** openPanel, closePanel, refreshPanel
**Dependencies:**
- ui-templates.js (for HTML generation)
- state.js (currentPanelDialog)

---

#### ui-listeners.js (NEW)
**Purpose:** All UI event listeners
**Contains:**
- setupPanelListeners()
- Click handlers for all buttons
- Section toggle handlers
- Dice entry handlers

**Exports:** setupPanelListeners
**Dependencies:**
- ui-panel.js (refreshPanel)
- state.js (for updating state on user actions)
- socket.js (for sending messages on user actions)
- settings.js (for saving preferences)

---

### Tier 7: Dialog Mirroring (CONDITIONAL - may be removed)

#### dialog-mirroring.js (EXISTS - may be simplified or removed)
**Purpose:** Intercept and mirror native roll dialogs
**Contains:**
- setupDialogMirroring()
- isRollDialog()
- mirrorDialogToPanel()
- handleDialogRender()

**Exports:** setupDialogMirroring, getMirroredDialog, setMirroredDialog
**Dependencies:**
- settings.js (isUserInManualMode)
- ui-panel.js (openPanel, refreshPanel)
- state.js (mirroredDialog state)

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Questions if this entire module is necessary

---

### Tier 8: Video Feed (PLACEHOLDER - future development)

#### video-feed.js (NEW - placeholder)
**Purpose:** Video feed functionality (future)
**Contains:**
- Video feed HTML generation
- Video connection logic (when implemented)

**Exports:** generateVideoFeedSection
**Dependencies:**
- constants.js
- state.js

**Cross-reference:** See 02-simplicity-targets.md Section 3.4 - Extract to separate module

---

### Tier 9: Application Entry Point

#### main.mjs (EXISTS - drastically simplified)
**Purpose:** Module initialization and hook registration ONLY
**Contains:**
- Hooks.once("init") - register core settings
- Hooks.once("ready") - setup all systems
- Hooks.on("getSceneControlButtons") - add GM button
- window.diceLink population (temporary, to be removed)

**Exports:** None (entry point only)
**Dependencies:** Imports from all other modules

---

## Dependency Graph

```
                    constants.js
                         |
                    logger.js
                         |
                    settings.js
                         |
                      state.js
                    /    |    \
           dice-parsing  |  approval.js
                    \    |    /
                mode-application.js
                         |
        +----------------+----------------+
        |                |                |
    socket.js         chat.js    dialog-mirroring.js
        |                |                |
        +----------------+----------------+
                         |
                  ui-templates.js
                         |
                    ui-panel.js
                         |
                  ui-listeners.js
                         |
                    video-feed.js
                         |
                     main.mjs
```

---

## Migration Strategy

### Phase 1: Extract Constants
1. Create constants.js with all shared values
2. Update all files to import from constants.js
3. Remove duplicate definitions

### Phase 2: Create State Module
1. Create state.js with all state variables
2. Update main.mjs to use state.js
3. Update other modules to use state.js

### Phase 3: Extract UI Templates
1. Create ui-templates.js
2. Move all generate* functions from main.mjs
3. Update main.mjs to import templates

### Phase 4: Extract UI Panel Management
1. Create ui-panel.js
2. Move openPanel, closePanel, refreshPanel
3. Update dependencies

### Phase 5: Extract UI Listeners
1. Create ui-listeners.js
2. Move all click handlers and event setup
3. Update dependencies

### Phase 6: Extract Video Feed
1. Create video-feed.js
2. Move video-related HTML and logic
3. Update ui-templates.js to use video-feed.js

### Phase 7: Simplify main.mjs
1. Remove all extracted code
2. Keep only hook registration
3. main.mjs becomes thin orchestration layer

### Phase 8: Evaluate Dialog Mirroring
1. Test if dialog mirroring is actually needed
2. If not, remove entirely
3. If yes, refactor to clean interface

---

## File Size Estimates (Post-Restructure)

| File | Estimated Lines | Purpose |
|------|-----------------|---------|
| constants.js | ~50 | Shared constants |
| logger.js | ~100 | Logging (unchanged) |
| settings.js | ~200 | Settings (refactored) |
| state.js | ~150 | State management |
| dice-parsing.js | ~100 | Dice parsing (unchanged) |
| mode-application.js | ~80 | Mode application |
| approval.js | ~100 | Approval workflow |
| socket.js | ~150 | Socket communication |
| chat.js | ~50 | Chat handlers |
| ui-templates.js | ~400 | HTML generation |
| ui-panel.js | ~150 | Panel lifecycle |
| ui-listeners.js | ~250 | Event handlers |
| dialog-mirroring.js | ~200 | Dialog mirroring |
| video-feed.js | ~50 | Video placeholder |
| main.mjs | ~100 | Entry point |
| **TOTAL** | **~2140** | Down from 2266 |

Note: Total lines similar but now properly organized with clear boundaries.

---

## Benefits of This Structure

1. **Single Responsibility:** Each file has one clear purpose
2. **Testability:** Individual modules can be tested in isolation
3. **Maintainability:** Changes to UI don't risk breaking settings
4. **Clear Dependencies:** Tier system prevents circular imports
5. **Easier Debugging:** Issues isolated to specific modules
6. **Future-Proof:** New features (video feed) have clear home

---

## Risks and Mitigations

### Risk 1: Circular Dependencies
**Mitigation:** Strict tier system - higher tiers can only import from lower tiers

### Risk 2: Over-Engineering
**Mitigation:** Only create new files that provide clear separation benefit

### Risk 3: Breaking Changes During Migration
**Mitigation:** 
- Migrate one phase at a time
- Test after each phase
- Keep v1.0.6.66 backup for rollback

### Risk 4: window.diceLink Pattern
**Mitigation:** 
- Keep temporarily during migration
- Remove once all circular dependencies resolved
- See 02-simplicity-targets.md Section 4.3

---

## Cross-References to Previous Documents

- **01-edge-cases.md:** Dialog detection patterns inform dialog-mirroring.js boundaries
- **02-simplicity-targets.md:** Redundancies to eliminate during restructure
- **03-dependency-map.md:** Current dependencies inform tier system
- **04-state-variables-inventory.md:** State variables define state.js contents
- **05-hook-registration-map.md:** Hook timing informs main.mjs structure
- **06-settings-registry.md:** Settings analysis informs settings.js refactoring

---

## Decision Points for Implementation

Before implementing, answer these questions:

1. **Dialog Mirroring:** Keep, simplify, or remove entirely?
   - See 02-simplicity-targets.md Section 3.3

2. **State Management Pattern:** Simple getters/setters or full state machine?
   - See 04-state-variables-inventory.md recommendations

3. **window.diceLink:** Keep temporarily or eliminate from start?
   - See 02-simplicity-targets.md Section 4.3

4. **Video Feed:** Include placeholder or defer entirely?
   - See 02-simplicity-targets.md Section 3.4

These decisions affect module boundaries and should be confirmed before starting migration.

---

## Cross-Reference to Extraction Sequence

See 08-extraction-sequence.md - Provides the step-by-step order for implementing this module boundary plan. The tier system here determines the extraction order there.

# Dependency Map - Dice Link Companion

**Version: 1.0.6.66 Snapshot**
**Note:** This document maps dependencies in v1.0.6.66. When we restructure the code, regenerate this documentation using the same analysis process to reflect the new architecture.

---

## 1. MODULE STRUCTURE

### Files and Their Exports

**main.mjs** (2266 lines) - Core module, entry point
- No exports (self-contained)
- Registers all Foundry hooks
- Defines all UI generation
- Depends on: settings.js, dialog-mirroring.js, socket.js, approval.js, mode-application.js, dice-parsing.js

**settings.js** - Settings management
- Exports: `MODULE_ID`, `registerCoreSettings`, `registerPlayerModeSettings`, `getSetting`, `setSetting`, `getPlayerMode`, `setPlayerMode`, `getGlobalOverride`, `setGlobalOverride`, `getPendingRequests`, `setPendingRequests`, `isUserInManualMode`, `getCollapsedSections`, `setCollapsedSections`
- No dependencies on other DLC modules

**dialog-mirroring.js** - Dialog interception and mirroring
- Exports: `setupDialogMirroring`, `getMirroredDialog`, `setMirroredDialog`
- Depends on: settings.js (getPlayerMode, getGlobalOverride)
- Calls back to main.mjs via: `window.diceLink.updatePanelWithMirroredDialog`

**socket.js** - Socket communication for GM-player sync
- Exports: `setupSocketListeners`, `emitPlayerRequest`, `emitModeChange`
- Depends on: settings.js (MODULE_ID)
- Calls back to main.mjs via: `window.diceLink.*` functions

**approval.js** - Request approval/denial handling
- Exports: `handleApproveRequest`, `handleDenyRequest`
- Depends on: settings.js (getPendingRequests, setPendingRequests)

**mode-application.js** - Dice mode application
- Exports: `applyManualDice`, `applyDigitalDice`
- No dependencies on other DLC modules

**dice-parsing.js** - Dice formula parsing utilities
- Exports: `parseDiceFormula`, `DICE_TYPES`
- No dependencies on other DLC modules

**chat.js** - Chat message utilities
- Exports: `sendChatMessage`
- No dependencies on other DLC modules

---

## 2. CALL FLOW DIAGRAMS

### Initialization Flow
```
Foundry loads module.json
  -> main.mjs executes
      -> Hooks.once("init")
          -> registerCoreSettings()     [settings.js]
      -> Hooks.once("ready")
          -> registerPlayerModeSettings()  [settings.js]
          -> 100ms delay (timing workaround)
          -> collapsedSections = getCollapsedSections()
          -> setupSocketListeners()     [socket.js]
          -> setupChatButtonHandlers()  [main.mjs]
          -> setupDialogMirroring()     [dialog-mirroring.js]
          -> setupDiceFulfillment()     [main.mjs]
          -> Populate window.diceLink global
          -> Apply initial dice mode based on settings
```

### UI Refresh Flow
```
User action or socket message
  -> refreshPanel()
      -> Check game.user.isGM
      -> generateGMPanelHTML() or generatePlayerPanelHTML()
      -> Update currentPanelDialog content
      -> attachGMPanelListeners() or attachPlayerPanelListeners()
```

### Dialog Mirroring Flow
```
Native dialog renders
  -> setupDialogMirroring() hook triggers [dialog-mirroring.js]
      -> handleDialogRender()
          -> isRollDialog()            [checks app type]
          -> mirrorDialogToPanel()
              -> isUserInManualMode()  [settings.js]
              -> window.diceLink.updatePanelWithMirroredDialog()
                  -> updatePanelWithMirroredDialog() [main.mjs]
                      -> getMirroredDialog()      [dialog-mirroring.js]
                      -> setMirroredDialog()      [dialog-mirroring.js]
                      -> openPanel()
                      -> refreshPanel()
```

**Cross-reference:** See 02-simplicity-targets.md Section 3.3 - Questions whether this entire dialog mirroring system is necessary. Also see 01-edge-cases.md Section 1 about fragile dialog detection patterns.

### Socket Communication Flow
```
Player requests manual mode
  -> playerRequestManual()           [main.mjs]
      -> emitPlayerRequest()         [socket.js]
          -> game.socket.emit()
              -> GM receives socket message
                  -> handlePlayerRequest()    [socket.js callback]
                      -> window.diceLink.refreshPanel()
```

---

## 3. STATE VARIABLE ACCESS

### Memory-Only State (main.mjs)
| Variable | Written By | Read By |
|----------|------------|---------|
| hasRequestedThisSession | playerRequestManual() | generatePlayerPanelHTML() |
| pendingRollRequest | updatePanelWithMirroredDialog(), socket handlers | generateRollRequestHTML(), handleMirroredRollSubmit() |
| currentPanelDialog | openPanel(), closePanel() | refreshPanel(), all panel functions |
| pendingDiceEntry | dice entry handlers | generateDiceEntryHTML(), submit handlers |
| diceEntryCancelled | cancel handler | dice entry flow |
| collapsedSections | ready hook, toggle handlers | all generateHTML functions |

### Shared State (dialog-mirroring.js)
| Variable | Written By | Read By |
|----------|------------|---------|
| mirroredDialog | setMirroredDialog() | getMirroredDialog() |

### Persisted State (via settings.js)
| Setting | Scope | Written By | Read By |
|---------|-------|------------|---------|
| globalOverride | world | GM panel actions | All mode checks |
| playerMode_{id} | world | GM panel, socket | All mode checks |
| pendingRequests | world | Request handlers | GM panel display |
| collapsedSections | client | Toggle handlers | Panel generation |

---

## 4. CRITICAL DEPENDENCIES

### window.diceLink Global
**Populated in:** main.mjs ready hook
**Contents:**
- refreshPanel
- applyManualDice
- applyDigitalDice
- isUserInManualMode
- playerRequestManual
- playerSwitchToDigital
- getPlayerMode
- getGlobalOverride
- updatePanelWithMirroredDialog

**Accessed by:**
- dialog-mirroring.js (updatePanelWithMirroredDialog)
- socket.js (refreshPanel, applyManualDice, applyDigitalDice, etc.)

**Cross-reference:** See 02-simplicity-targets.md Section 4.3 - This global dependency pattern is identified as fragile.

### Timing Dependencies
1. `registerCoreSettings()` MUST complete before `registerPlayerModeSettings()`
2. `registerPlayerModeSettings()` MUST complete before any `getPlayerMode()` calls
3. `window.diceLink` MUST be populated before socket messages arrive
4. `setupDialogMirroring()` hooks MUST be registered after settings are ready

---

## 5. CRITICAL INTEGRATION POINTS

### CRITICAL: window.diceLink Access
**Risk:** If window.diceLink not populated during ready, other modules break
**Mitigation:** ready hook populates it early, defensive ?. operator checks
**Testing needed:** Verify all window.diceLink.* references exist

**Cross-reference:** See 02-simplicity-targets.md Section 4.3 - This global dependency pattern is identified as fragile. The proper solution is to pass functions as parameters or use module imports instead of relying on a global object that may not exist during initialization.

### CRITICAL: Settings Registration Timing
**Risk:** Settings accessed before registerPlayerModeSettings() completes
**Mitigation:** 100ms delay before setupDialogMirroring() + defensive getPlayerMode()
**Testing needed:** Ensure getPlayerMode() never throws

**Cross-reference:** See 01-edge-cases.md Section 2 - The 100ms delay is documented as a "band-aid fix" workaround rather than proper solution. Better approach would be to not register hooks until settings are confirmed ready.

### HIGH: mirroredDialog State Consistency
**Risk:** Dialog reference becomes stale, object properties disappear
**Mitigation:** Getter/setter pattern, null checks before property access
**Testing needed:** Test dialog capture with various dnd5e modules

**Cross-reference:** See 02-simplicity-targets.md Section 5.2 - Questions whether mirroredDialog and pendingRollRequest should be unified into a single state object.

### MEDIUM: Socket Message Ordering
**Risk:** Socket messages arrive before handlers are ready
**Mitigation:** setupSocketListeners() called early in ready hook
**Testing needed:** Test with multiple connected clients

---

## 6. MODULE ISOLATION ASSESSMENT

| Module | Can Stand Alone? | Dependencies |
|--------|------------------|--------------|
| settings.js | YES | None |
| mode-application.js | YES | None |
| dice-parsing.js | YES | None |
| chat.js | YES | None |
| approval.js | PARTIAL | settings.js |
| socket.js | NO | window.diceLink, settings.js |
| dialog-mirroring.js | NO | window.diceLink, settings.js |
| main.mjs | NO | All other modules |

---

## 7. KNOWN ISSUES IN DEPENDENCY STRUCTURE

1. **window.diceLink global hack** - Works but not clean architecture
   - *See 02-simplicity-targets.md Section 4.3*
2. **100ms delay workaround** - Masks timing issue rather than fixing root cause
   - *See 01-edge-cases.md Section 2 - WORKAROUND note*
3. **refreshPanel() is called frequently** - Suggests UI state could be more granular
   - *See 02-simplicity-targets.md Section 2.3 - duplicate panel open/refresh logic*
4. **Multiple settings defaults defined** - Should be single source of truth
   - *See 02-simplicity-targets.md Section 2.4 - collapsed sections defaults defined 3 times*
5. **dialog-mirroring calls main.mjs via optional chaining** - Fragile pattern
   - *See 02-simplicity-targets.md Section 3.3 - questions if dialog mirroring is needed at all*

---

## Cross-References
- See 01-edge-cases.md for dialog detection edge cases
- See 02-simplicity-targets.md for redundancy and dead code
- See 04-state-variables-inventory.md for detailed state analysis
- See 07-module-boundary-plan.md - The dependency map here directly informed the tier-based module structure:
- Independent modules (settings, dice-parsing) become Tier 1-2
- Dependent modules (socket, dialog-mirroring) become higher tiers
- window.diceLink issues are addressed by the tier system preventing circular imports

See 08-extraction-sequence.md - This dependency map directly determines the extraction order. Tier 1-2 modules are extracted in Phase 1 (Steps 1.1-1.5), Tier 3-4 in Phase 2, etc., following dependency relationships to prevent circular imports

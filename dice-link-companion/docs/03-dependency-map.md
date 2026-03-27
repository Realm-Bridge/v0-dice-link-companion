# Dependency Map - v1.0.6.66

This document maps which functions call which, how data flows between modules, and critical dependencies discovered during analysis.

---

## Module Structure & Exports

### main.mjs (CORE - 2266 lines)
**Role:** Orchestration hub for UI generation, event listeners, and state management
**Exports:** (None - internal only, uses window.diceLink for cross-module access)
**Key state vars:** collapsedSections, pendingRollRequest, currentPanelDialog, hasRequestedThisSession

### settings.js
**Exports:**
- registerCoreSettings() - Register world-scoped settings
- registerPlayerModeSettings() - Register per-user player mode
- getSetting(key), setSetting(key, value)
- getPlayerMode(userId), setPlayerMode(userId, mode)
- getGlobalOverride(), setGlobalOverride(value)
- getPendingRequests(), setPendingRequests(requests)
- getCollapsedSections(), setCollapsedSections(sections)
- isUserInManualMode()

### dialog-mirroring.js
**Exports:**
- setupDialogMirroring() - Register hooks for native dialog interception
- getMirroredDialog(), setMirroredDialog(dialog)

**Internal:** handleDialogRender(), isRollDialog(), mirrorDialogToPanel()
**Cross-file access:** Uses window.diceLink?.updatePanelWithMirroredDialog?.() to call main.mjs

### socket.js
**Exports:**
- setupSocketListeners() - Register socket message handlers
- playerRequestManual() - Send socket to request manual mode
- playerSwitchToDigital() - Send socket to switch to digital

**Cross-file access:** Uses window.diceLink for applyManualDice(), applyDigitalDice()

### approval.js
**Exports:**
- setupChatButtonHandlers() - Attach listeners to chat approval buttons
- createApprovalChatMessage() - Generate approval chat message

### mode-application.js
**Exports:**
- applyManualDice() - Register Dice Fulfillment handler
- applyDigitalDice() - Remove Dice Fulfillment handler

### dice-parsing.js
**Exports:**
- getDiceTypeForFormula() - Identify roll types
- extractDiceFromFormula() - Parse formula to extract individual dice

---

## Call Flow Graph

### Initialization (ready hook)
```
Hooks.once("ready") {
  → registerPlayerModeSettings()           [settings.js]
  → setupSocketListeners()                 [socket.js]
  → setupChatButtonHandlers()              [approval.js]
  → setupDialogMirroring()                 [dialog-mirroring.js]
  → setupDiceFulfillment()                 [main.mjs]
  
  → window.diceLink = {
      applyManualDice,
      applyDigitalDice,
      refreshPanel,
      updatePanelWithMirroredDialog,
      ...
    }
  
  → Apply initial mode: applyManualDice() or applyDigitalDice()
}
```

### UI Panel Refresh Flow
```
refreshPanel() [main.mjs]
  → generateGMPanelContent() or generatePlayerPanelContent()
      → generateRollRequestSection()
      → generatePendingRollHTML()
      → getPlayerMode()              [settings.js]
      → getGlobalOverride()          [settings.js]
      → getCollapsedSections()       [settings.js]
  → attachGMPanelListeners() or attachPlayerPanelListeners()
      → setPlayerMode()              [settings.js]
      → applyManualDice()            [mode-application.js]
      → applyDigitalDice()           [mode-application.js]
      → setCollapsedSections()       [settings.js]
      → playerRequestManual()        [socket.js]
      → playerSwitchToDigital()      [socket.js]
```

### Dialog Mirroring Flow
```
Native dialog renders
  → setupDialogMirroring() hook triggers [dialog-mirroring.js]
      → handleDialogRender()
          → isRollDialog()            [checks app type]
          → mirrorDialogToPanel()
              → isUserInManualMode()  [settings.js]
              → window.diceLink.updatePanelWithMirroredDialog()
                  → updatePanelWithMirroredDialog() [main.mjs]
                      → getMirroredDialog()      [dialog-mirroring.js]
                      → setMirroredDialog()      [dialog-mirroring.js]
                      → openPanel()
                      → refreshPanel()
```

### Manual Dice Roll Flow
```
User clicks "Enter Manually" in mirrored dialog
  → submitMirroredDialog(userChoice) [main.mjs]
      → getMirroredDialog()          [dialog-mirroring.js]
      → executeDiceTrayRollManually()
          → Extract formula from dialog
          → Roll.fromFormula()
          → roll.roll()  [triggers dice terms]
              → diceLinkFulfillmentHandler() [for each term]
                  → waitForDiceResult()
                      → showDiceEntryUI()
                      → waitForDiceTrayEntry()
                          → User enters manually in UI
                      → pendingDiceEntry = result
                  → Return result to dice term
```

### Socket Communication Flow
```
Player clicks "Request Manual"
  → playerRequestManual() [socket.js]
      → game.socket.emit("playerRequestManual")
      
GM receives message in setupSocketListeners() [socket.js]
  → Send broadcast to all players
  → All clients call: window.diceLink.applyManualDice()
      → applyManualDice() [mode-application.js]
          → Register Dice Fulfillment handler
```

---

## Critical Cross-Module Dependencies

### 1. window.diceLink Global Access Pattern
**Problem:** Multiple modules need to call main.mjs functions, but main.mjs doesn't export them
**Solution:** Main.mjs populates window.diceLink during ready hook
**Used by:**
- dialog-mirroring.js → window.diceLink.updatePanelWithMirroredDialog()
- socket.js → window.diceLink.applyManualDice(), .applyDigitalDice()

**⚠️ WARNING:** This global namespace access caused the v64 failure. Must be carefully managed in any refactor.

### 2. Settings Timing Issue
**Problem:** getCollapsedSections(), getPlayerMode() can be called before registerPlayerModeSettings() completes
**Solution:** Defensive try-catch blocks with fallback defaults
**Locations:** settings.js getPlayerMode(), getCollapsedSections(), dialog-mirroring.js isUserInManualMode()

### 3. mirroredDialog State Sharing
**Problem:** mirroredDialog needs to be accessible from multiple functions in main.mjs
**Solution:** Getter/setter pattern (getMirroredDialog, setMirroredDialog) in dialog-mirroring.js
**Used by:**
- dialog-mirroring.js sets it when dialog found
- main.mjs updatePanelWithMirroredDialog() reads it
- main.mjs submitMirroredDialog() reads and clears it

### 4. Circular Refresh Pattern
**Problem:** refreshPanel() can be called from UI listeners, which themselves need refreshPanel() to work
**Solution:** Works because refreshPanel() generates fresh HTML each time (no state mutation)
**Called from:** 45+ locations throughout codebase

---

## State Variables & Their Scope

| Variable | Scope | Module | Read By | Written By |
|----------|-------|--------|---------|-----------|
| collapsedSections | Memory + Settings | main.mjs | All panel generators | Listeners, settings |
| pendingRollRequest | Memory | main.mjs | Dialog handlers | Dialog capture code |
| currentPanelDialog | Memory | main.mjs | openPanel() | openPanel() |
| pendingDiceEntry | Memory | main.mjs | waitForDiceResult() | showDiceEntryUI() |
| diceEntryCancelled | Memory | main.mjs | waitForDiceEntry() | User action |
| mirroredDialog | Memory (dialog-mirroring.js) | dialog-mirroring.js | Getters/setters | mirrorDialogToPanel() |
| playerMode_* | Settings (world) | settings.js | getPlayerMode() | setPlayerMode() |
| globalDiceMode | Settings (world) | settings.js | getGlobalOverride() | setGlobalOverride() |
| pendingApprovals | Settings (world) | settings.js | getPendingRequests() | socket handlers |
| collapsedSections | Settings (client) | settings.js | getCollapsedSections() | setCollapsedSections() |

---

## Data Flow Patterns

### Pattern 1: UI Event → Settings Update → Panel Refresh
```
User clicks button
→ attachGMPanelListeners() catches click
→ Call setPlayerMode(userId, newMode)
→ Call refreshPanel()
→ refreshPanel() reads getPlayerMode() and rebuilds UI
```

### Pattern 2: Network → Local Update → UI Refresh
```
Socket message received
→ setupSocketListeners() handler
→ Update local state or settings
→ Call refreshPanel()
→ All clients see updated UI
```

### Pattern 3: Dialog Intercept → Mirror → User Action → Execute
```
Native dialog renders
→ Dialog mirroring hook fires
→ Mirror dialog to our panel
→ User makes choice in our UI
→ Execute choice on mirrored dialog
→ Close native dialog
```

---

## Critical Integration Points (Most Error-Prone)

### 🔴 CRITICAL: window.diceLink Access
**Risk:** If window.diceLink not populated during ready, other modules break
**Mitigation:** ready hook populates it early, defensive ?. operator checks
**Testing needed:** Verify all window.diceLink.* references exist

### 🔴 CRITICAL: Settings Registration Timing
**Risk:** Settings accessed before registerPlayerModeSettings() completes
**Mitigation:** 100ms delay before setupDialogMirroring() + defensive getPlayerMode()
**Testing needed:** Ensure getPlayerMode() never throws

### 🟡 HIGH: mirroredDialog State Consistency
**Risk:** Dialog reference becomes stale, object properties disappear
**Mitigation:** Getter/setter pattern, null checks before property access
**Testing needed:** Test dialog capture with various dnd5e modules

### 🟡 HIGH: Circular Refresh Calls
**Risk:** Accidental infinite refresh loop if not careful with event handling
**Mitigation:** attachXXXListeners() only attach click handlers, not renderXXX hooks
**Testing needed:** Monitor console for excessive refresh calls

---

## Module Isolation Assessment

**main.mjs** - NOT isolated, depends on all modules
**settings.js** - ISOLATED, no external dependencies
**dialog-mirroring.js** - 1 dependency (settings.js)
**socket.js** - 1 dependency (window.diceLink from main.mjs)
**approval.js** - ISOLATED, only DOM manipulation
**mode-application.js** - ISOLATED, only Foundry API calls
**dice-parsing.js** - ISOLATED, pure logic

---

## Known Issues in Dependency Structure

1. **window.diceLink global hack** - Works but not clean architecture
2. **100ms delay workaround** - Masks timing issue rather than fixing root cause
3. **refreshPanel() is called 45+ times** - Suggests UI state could be more granular
4. **Multiple settings defaults defined** - Should be single source of truth
5. **dialog-mirroring calls main.mjs via optional chaining** - Fragile pattern

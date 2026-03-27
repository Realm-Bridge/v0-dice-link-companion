# 01 - Edge Cases Documentation
**Version: 1.0.6.66 Snapshot**  
**Note:** This document analyzes edge cases in v1.0.6.66. Line numbers reference that version only and will change during restructuring. During implementation, refer to function names and section headers instead.

---

## 1. DIALOG DETECTION & FILTERING

**File:** `dialog-mirroring.js`, functions `isRollDialog()`, `handleDialogRender()`, `mirrorDialogToPanel()`

### Edge Cases Handled
- **Third-party module exclusions** - Prevents capture of Monks Token Bar, LMRTFY, GM Screen, Settings, File Picker, Journal, Actor/Item Sheets
- **Initiative dialogs** - Specially formatted when title contains "initiative" (English-dependent)
- **Roll dialog class matching** - Multiple hooks (renderApplication, renderDialog, renderRollConfigurationDialog, renderApplicationV2) increase reliability
- **Dialog state checks** - "Roll Resolution" dialogs handled differently than regular roll dialogs

### Findings
- ⚠️ **POTENTIALLY REDUNDANT**: Four render hooks may be overkill; ApplicationV2 likely sufficient for Foundry v13+
- ⚠️ **FRAGILE**: Initiative and button detection depend on English language text
- ✅ **WORKING**: Comprehensive exclusion patterns prevent false captures

---

## 2. PLAYER MODE TIMING & INITIALIZATION

**Files:** `settings.js` functions `getPlayerMode()`, `getCollapsedSections()`; `main.mjs` ready hook

### Edge Cases Handled
- **Early settings access** - Defensive getPlayerMode() checks setting exists, returns "digital" fallback
- **Initialization timing** - 100ms delay after registerPlayerModeSettings() before dialog hooks fire
- **Defensive getCollapsedSections()** - Merges saved state with defaults to ensure all keys exist

### Findings
- ⚠️ **WORKAROUND**: 100ms delay is band-aid for initialization order (documented as WORKAROUND)
- ⚠️ **SCATTERED DEFENSIVE CODE**: Multiple defensive checks suggest original architecture didn't properly sequence initialization
- ✅ **WORKING**: Defensive fallbacks prevent crashes

**Cross-reference:** See 06-settings-registry.md - "Known Issues #2" for detailed timing analysis and recommendations

---

## 3. STATE MANAGEMENT ACROSS MODULES

**Variables:** `mirroredDialog`, `pendingRollRequest`, `currentPanelDialog`, `pendingDiceEntry`, `diceEntryCancelled`

### Edge Cases Handled
- **Mirrored dialog scope** - Using getter/setter functions (getMirroredDialog, setMirroredDialog) prevents duplicate declarations
- **Pending dice entry** - Promise-based with diceEntryCancelled flag prevents double-processing
- **Null checks throughout** - Consistent `if (!value)` checks before using state variables

### Findings
- ⚠️ **SCATTERED NULL CHECKS**: Nearly 20+ null/undefined checks across codebase suggests state could be more structured
- ⚠️ **NO STATE MACHINE**: Uses booleans and nulls instead of formal state machine (IDLE, WAITING_ENTRY, PENDING_ROLL, etc.)
- ⚠️ **MULTIPLE STATE VARIABLES**: Five separate variables could be consolidated
- ✅ **WORKING**: Current approach is resilient, just verbose

---

## 4. PERMISSIONS & ROLE HANDLING

**File:** `main.mjs` functions `getManualRollsPermissions()`, `setManualRollsPermission()`

### Edge Cases Handled
- **Permission caching** - Reads Foundry core settings with safe defaults
- **Permission updates** - Attempts to preserve diceConfiguration when enabling
- **Undefined role handling** - Only defines roles 1-4, undefined roles fail safely

### Findings
- ⚠️ **REDUNDANT PRESERVATION**: Logic to preserve diceConfiguration appears in multiple places
- ⚠️ **SILENT FAILURES**: Inner try-catch blocks swallow errors completely without logging
- ⚠️ **MAGIC NUMBERS**: Role numbers (1-4) hardcoded; should use CONST.USER_ROLES
- ✅ **WORKING**: Reliably enables/disables permissions

---

## 5. DIALOG CONTENT EXTRACTION & MIRRORING

**File:** `dialog-mirroring.js` functions `extractDialogFormData()`, `main.mjs` function `updatePanelWithMirroredDialog()`

### Edge Cases Handled
- **Form data extraction** - Searches for `<form>` elements, returns null if not found
- **Missing dialog properties** - Handles missing app.title with fallbacks
- **Button detection** - Searches for specific button text: "advantage", "disadvantage", "critical"

### Findings
- ⚠️ **FRAGILE FORM DETECTION**: Only looks for `<form>` elements
- ⚠️ **BUTTON TEXT HARDCODING**: English text search won't work for translated Foundry
- ⚠️ **NO FALLBACK FOR MISSING FORM**: If form missing, dialog mirroring fails silently
- ✅ **WORKING**: Current dnd5e uses form-based layout

---

## 6. DICE PARSING & FULFILLMENT

**Files:** `dice-parsing.js`, `main.mjs` functions `diceLinkFulfillmentHandler()`, `executeDiceTrayRollManually()`

### Edge Cases Handled
- **Dice formula parsing** - Regex `/(\d*)d(\d+)/g` handles: 1d20, 2d8+5, etc.
- **Cancellation handling** - If user cancels, throws Error to abort roll
- **Invalid dice value checks** - Validates each die value between 1 and max faces

### Findings
- ⚠️ **DEAD CODE**: Midi-QOL code present but marked removed
- ⚠️ **REGEX LIMITATION**: Doesn't handle parentheses or complex expressions
- ⚠️ **SILENT FAILURES**: Blank dice fields silently skipped rather than rejected
- ✅ **WORKING**: Simple d20/d8 rolls work correctly

---

## 7. CHAT MESSAGE & APPROVAL SYSTEM

**File:** `approval.js` functions `setupChatButtonHandlers()`, `handleApproveClick()`, `handleDenyClick()`

### Edge Cases Handled
- **Missing player check** - Verifies player exists before approval/denial
- **Multiple message updates** - Updates ALL chat messages for that player (prevents multiple clicks)
- **Window diceLink check** - Defensive check before calling window.diceLink.refreshPanel()

### Findings
- ✅ **WELL HANDLED**: Good defensive checks and edge case handling
- ⚠️ **GLOBAL WINDOW CHECK**: Reliance on window.diceLink is fragile
- ⚠️ **BULK UPDATE**: Updating all messages for a player might be confusing

---

## SUMMARY OF KEY FINDINGS

### Redundancies Found
1. Multiple dialog render hooks (likely only ApplicationV2 needed)
2. Nested null/undefined checks could be consolidated
3. Midi-QOL dead code present
4. Multiple defensive layers suggest original poor sequencing

### Fragile Patterns
1. English language button/dialog title detection
2. Form-only dialog detection
3. Regex-based dice parsing doesn't handle complex formulas
4. 100ms initialization delay is a workaround

### Areas for Improvement
1. State machine instead of scattered booleans/nulls
2. Central settings coordination before hooks fire
3. Remove Midi-QOL references entirely
4. Better error handling vs. silent failures
5. Use Foundry constants instead of magic numbers

### What's Working Well
1. Defensive null checks prevent crashes
2. Comprehensive third-party module exclusions
3. Approval workflow handles edge cases
4. Role-based permissions functional and safe
5. Dice fulfillment system is reliable

---

## Cross-Reference to Module Boundary Plan

See 07-module-boundary-plan.md - The edge cases documented here directly inform module boundaries:
- Dialog detection patterns define dialog-mirroring.js scope
- State management issues inform the proposed state.js module
- Timing workarounds inform the initialization sequence in main.mjs

See 08-extraction-sequence.md - Edge cases here determine testing strategy during extraction (Phase 2.1+), and the 100ms delay workaround is eliminated by Phase 5.4 (main.mjs refactoring)

See 09-ui-components-inventory.md - UI edge cases and complex conditional rendering patterns documented with the HTML generators

See 10-public-api.md - Edge cases in API usage; window.diceLink fragility is documented as a concern to be eliminated

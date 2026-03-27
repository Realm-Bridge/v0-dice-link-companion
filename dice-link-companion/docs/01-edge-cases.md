# Dice Link Companion - Edge Cases Documentation
**Version: 1.0.6.66**  
**Date: Current Analysis**

---

## 1. DIALOG DETECTION & FILTERING

### Current Implementation
- **File**: `dialog-mirroring.js` (lines 109-182)
- **Purpose**: Distinguish between dnd5e roll dialogs vs. third-party module dialogs
- **Approach**: Check class name, app ID, and dialog title against specific patterns

### Edge Cases Handled
1. **Third-party module exclusions** (line 118-132)
   - Monks Token Bar, LMRTFY, GM Screen, Settings, File Picker, Journal, Actor/Item Sheets
   - Prevents accidental capture of non-roll dialogs
   - **Note**: Midi-QOL no longer listed in exclusions (deprecated with new architecture)

2. **Initiative dialogs** (line 165, 175)
   - Specifically checks title for "initiative"
   - Creates pending roll request formatted for initiative rolls
   - **Analysis**: This works but is somewhat fragile - relies on English title text

3. **Roll dialog class matching** (line 141-149)
   - Looks for specific dnd5e class names: `RollConfigurationDialog`, `D20Roll`, `DamageRoll`, etc.
   - Multiple hooks to catch dialogs: `renderApplication`, `renderDialog`, `renderRollConfigurationDialog`, `renderApplicationV2`
   - **Analysis**: Casting wide net is good for reliability, but may be redundant - ApplicationV2 hook probably sufficient for Foundry v13

4. **Dialog state checks** (line 88-98)
   - "Roll Resolution" dialogs are hidden but NOT mirrored (different handling)
   - Regular roll dialogs are hidden AND mirrored
   - **Potential redundancy**: Having multiple checks for the same dialog class

### Findings for Future Restructure
- ⚠️ **POTENTIALLY REDUNDANT**: Four separate hooks (`renderApplication`, `renderDialog`, `renderRollConfigurationDialog`, `renderApplicationV2`) may all fire for the same dialog. Only `renderApplicationV2` may be necessary for Foundry v13+
- ⚠️ **FRAGILE**: Initiative detection depends on dialog title containing "initiative" (English language dependent)
- ✅ **WORKING**: Exclusion patterns are comprehensive and prevent false captures

---

## 2. PLAYER MODE TIMING & INITIALIZATION

### Current Implementation
- **File**: `settings.js` (lines 35-51), `main.mjs` (lines 2193-2212)
- **Issue**: Settings may not be registered when first hook fires

### Edge Cases Handled
1. **Early settings access** (settings.js, lines 102-108)
   - `getPlayerMode()` checks if setting exists before calling `getSetting()`
   - Returns "digital" as fallback if setting not registered yet
   - Try-catch wrapper ensures no crash if settings fail

2. **Initialization timing** (main.mjs, lines 2193-2212)
   - Added 100ms delay after `registerPlayerModeSettings()` to ensure registration completes
   - Dialog mirroring hooks only fire AFTER settings ready
   - `collapsedSections` loaded from settings in ready hook with merge logic

3. **Defensive `getCollapsedSections()`** (settings.js, lines 152-176)
   - Merges saved sections with defaults to ensure all keys exist
   - Returns safe defaults if setting doesn't exist or fails to load
   - Try-catch prevents errors if called before settings initialized

### Findings for Future Restructure
- ⚠️ **WORKAROUND**: The 100ms delay is a band-aid fix for initialization order. Better approach: don't register hooks until settings are ready
- ⚠️ **SCATTERED DEFENSIVE CODE**: Multiple defensive checks across files (`dialog-mirroring.js` line 58-68, `settings.js` multiple locations) suggest original architecture didn't properly sequence initialization
- ✅ **WORKING**: Defensive fallbacks prevent crashes during initialization phase

---

## 3. STATE MANAGEMENT ACROSS MODULES

### Current Implementation
- **Main state variables**: `mirroredDialog`, `pendingRollRequest`, `currentPanelDialog`, `pendingDiceEntry`, `collapsedSections`

### Edge Cases Handled
1. **Mirrored dialog scope** (main.mjs vs. dialog-mirroring.js)
   - After v64 refactor, using getter/setter functions: `getMirroredDialog()`, `setMirroredDialog()`
   - Prevents duplicate declarations from shadowing
   - Centralized control point for dialog state

2. **Pending dice entry state** (main.mjs, lines 71-72, 1914, 1920, 2032)
   - `pendingDiceEntry` is a Promise that resolves when user enters dice
   - `diceEntryCancelled` flag prevents double-processing if cancelled
   - States reset to null/false after roll completion or cancellation

3. **Null checks throughout** (main.mjs lines 1056, 1084, 1707, 1914, 1920, 1823)
   - Code consistently checks for null before using state variables
   - `if (value === null || diceEntryCancelled)` prevents executing cancelled rolls
   - Dialog checks: `if (!dialogRef)` before accessing properties

### Findings for Future Restructure
- ⚠️ **SCATTERED NULL CHECKS**: Nearly 20+ null/undefined checks across codebase for state management suggests state could be more structured
- ⚠️ **NO STATE MACHINE**: Code uses booleans and null checks instead of formal state machine (IDLE, WAITING_ENTRY, PENDING_ROLL, etc.)
- ⚠️ **MULTIPLE STATE VARIABLES**: Five separate variables tracked at module level could be consolidated into single state object
- ✅ **WORKING**: Current approach is resilient, just verbose

---

## 4. PERMISSIONS & ROLE HANDLING

### Current Implementation
- **File**: `main.mjs` (lines 89-145)
- **Purpose**: Control which player roles can use manual dice

### Edge Cases Handled
1. **Permission caching** (lines 96-109)
   - `getManualRollsPermissions()` reads from Foundry core settings
   - Returns object mapping role numbers (1-4) to boolean permissions
   - Try-catch with safe defaults: `{ 1: false, 2: false, 3: false, 4: true }`
   - GM (role 4) always has permission

2. **Permission updates** (lines 111-145)
   - `setManualRollsPermission()` attempts to preserve `diceConfiguration` when enabling
   - Nested try-catch blocks: inner catches silently ignore dice config errors
   - Outer catch shows user error notification
   - Sorts roles array after modification for consistency

3. **Undefined role handling** (ROLE_NAMES lines 89-94)
   - Only defines roles 1-4
   - Fallback: undefined roles won't appear in dropdown, but won't crash

### Findings for Future Restructure
- ⚠️ **REDUNDANT PRESERVATION**: Lines 113-118 and 134-137 attempt to preserve `diceConfiguration`, but this is only used if enabled=true and CONFIG exists. Dead code path?
- ⚠️ **SILENT FAILURES**: Inner try-catch blocks (lines 115-117, 135-137) swallow errors completely without logging - hard to debug permission issues
- ⚠️ **MAGIC NUMBERS**: Role numbers (1, 2, 3, 4) hardcoded throughout; Foundry's CONST.USER_ROLES should be used
- ✅ **WORKING**: Current approach reliably enables/disables permissions

---

## 5. DIALOG CONTENT EXTRACTION & MIRRORING

### Current Implementation
- **File**: `dialog-mirroring.js` (lines 230-280), `main.mjs` (lines 1300-1380)

### Edge Cases Handled
1. **Form data extraction** (dialog-mirroring.js, lines 242-265)
   - Searches for `<form>` elements within dialog
   - Extracts form data as object with all input values
   - **If no form found**: Returns null (line 228)
   - **Problem**: If form missing, dialog won't be mirrored at all

2. **Missing dialog properties** (main.mjs, lines 1370-1382)
   - Checks for `app.title`, `app.constructor.name`, both case-insensitive
   - Handles missing properties gracefully with fallbacks
   - Try-catch wraps entire extraction process

3. **Advantage/Disadvantage/Critical buttons** (main.mjs, lines 1368-1384)
   - Searches for specific button text: "advantage", "disadvantage", "critical"
   - May be dnd5e version-specific
   - **If buttons missing**: Fields set to false (lines 1379-1382)

### Findings for Future Restructure
- ⚠️ **FRAGILE FORM DETECTION**: Only looks for `<form>` elements. What if dnd5e uses div-based form layout?
- ⚠️ **BUTTON TEXT HARDCODING**: Searching for English button text ("advantage", "disadvantage", "critical") - won't work for translated Foundry
- ⚠️ **NO FALLBACK FOR MISSING FORM**: If `<form>` missing, entire dialog mirroring fails silently
- ✅ **WORKING**: Current dnd5e uses form-based layout, buttons are in English

---

## 6. DICE PARSING & FULFILLMENT

### Current Implementation
- **Files**: `dice-parsing.js`, `main.mjs` (lines 1631-2070)
- **Purpose**: Intercept d20/damage rolls and allow manual entry

### Edge Cases Handled
1. **Midi-QOL integration removed** (main.mjs, line 2112, 2186)
   - Comment notes: "midi-qol interception removed - dice fulfillment system handles all rolls automatically"
   - Old code attempted to hook into Midi-QOL workflow
   - **Status**: DEAD CODE - now uses dice fulfillment system

2. **Dice formula parsing** (dice-parsing.js, lines 16-41)
   - Regex pattern: `/(\d*)d(\d+)/g`
   - Handles: `1d20`, `2d8+5`, etc.
   - **Limitation**: Doesn't handle complex expressions like `(1d4 + 1d6) * 2`
   - **Current scope**: Only processes simple roll formulas

3. **Cancellation handling** (main.mjs, lines 1705-1710, 1822-1824)
   - If user cancels dice entry: `throw new Error("Roll cancelled by user")`
   - This aborts the entire roll fulfillment
   - Results set to `null` to signal cancellation (lines 1083-1084)

4. **Invalid dice value checks** (main.mjs, lines 1717, 1920)
   - Validates each die value is between 1 and max faces
   - Skips `undefined` values (won't apply that die)
   - **Issue**: Silent skip means if user leaves a field blank, die doesn't count

### Findings for Future Restructure
- ⚠️ **DEAD CODE**: Midi-QOL code should be removed entirely
- ⚠️ **REGEX LIMITATION**: Formula regex doesn't handle parentheses or complex expressions
- ⚠️ **SILENT FAILURES**: Blank dice fields are silently skipped rather than rejected
- ⚠️ **ERROR UNWINDING**: Throwing errors to cancel rolls might be caught/logged oddly by Foundry
- ✅ **WORKING**: Simple d20/d8/etc rolls work correctly

---

## 7. CHAT MESSAGE & APPROVAL SYSTEM

### Current Implementation
- **File**: `approval.js`

### Edge Cases Handled
1. **Missing player check** (lines 44-49, 89-94)
   - Verifies player exists before approval/denial
   - Returns error if player not found
   - Checks `game.user.isGM` before allowing action

2. **Multiple chat message updates** (lines 52-54, 97-99)
   - When approving/denying, updates ALL chat messages for that player (not just one)
   - Replaces buttons with text: "Request approved" or "Request denied"
   - Prevents user from clicking button multiple times on different messages

3. **Window diceLink check** (lines 72-74, 101-103)
   - Before refreshing panel, checks `if (window.diceLink && window.diceLink.refreshPanel)`
   - Safe guard against panel not being initialized yet
   - **Fallback**: If panel not initialized, refresh silently fails

### Findings for Future Restructure
- ✅ **WELL HANDLED**: Approval system has good defensive checks and handles edge cases
- ⚠️ **GLOBAL WINDOW CHECK**: Reliance on `window.diceLink` for cross-module communication is fragile
- ⚠️ **BULK UPDATE**: Updating ALL chat messages for a player might be confusing if many requests exist

---

## 8. REMOVED/DEPRECATED FEATURES

### Midi-QOL Support
- **Location**: main.mjs lines 2112, 2186 (comments only)
- **Status**: REMOVED - no longer attempts to hook Midi-QOL
- **Why**: Dice fulfillment system now handles all rolls automatically
- **Finding**: DEAD CODE PRESENT - these comments should be removed during restructure

### Initiative Roll Special Handling
- **Location**: main.mjs lines 1291-1320, dialog-mirroring.js lines 165-175
- **Current**: Specially formats initiative dialogs but routes to same system
- **Finding**: May be unnecessary - could use generic roll handling

---

## SUMMARY OF KEY FINDINGS

### Redundancies Found
1. Multiple dialog render hooks (likely only ApplicationV2 needed)
2. Nested null/undefined checks could be consolidated
3. Midi-QOL dead code present
4. Multiple defensive layers suggest original poor sequencing

### Fragile Patterns
1. English language button/dialog title detection
2. Form-only dialog detection (no div-based forms)
3. Regex-based dice parsing doesn't handle complex formulas
4. 100ms initialization delay is a workaround, not a solution

### Areas for Improvement
1. State machine instead of scattered booleans/nulls
2. Central settings coordination before any hooks fire
3. Remove Midi-QOL references entirely
4. Better error handling (vs. silent failures or swallowed errors)
5. Use Foundry constants instead of magic numbers

### What's Working Well
1. Defensive null checks prevent crashes
2. Comprehensive third-party module exclusions
3. Approval workflow handles edge cases
4. Role-based permissions functional and safe
5. Dice fulfillment system is reliable


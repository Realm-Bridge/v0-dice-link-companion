# State Variables Inventory - Dice Link Companion

**Version: 1.0.6.69 Snapshot**
**Note:** This document inventories state variables in v1.0.6.69. When we restructure the code, regenerate this documentation using the same analysis process to reflect the new architecture.

---

## Overview
This document catalogs all state variables, their purpose, lifecycle, and access patterns.

---

## 1. MEMORY-ONLY STATE VARIABLES (main.mjs)

### 1.1 hasRequestedThisSession
**Type:** `boolean`
**Initial Value:** `false`
**Purpose:** Prevents players from spamming manual mode requests to GM
**Lifecycle:**
- Set to `true` when player clicks "Request Manual Dice"
- Never reset (persists until page refresh)
**Read By:** `generatePlayerPanelHTML()` - controls button visibility
**Written By:** `playerRequestManual()`
**Cross-reference:** See 01-edge-cases.md Section 3 about session-scoped state

### 1.2 pendingRollRequest
**Type:** `object | null`
**Initial Value:** `null`
**Purpose:** Stores current roll request awaiting dice entry
**Structure:**
```javascript
{
  title: string,        // "Dexterity Check"
  subtitle: string,     // "1d20 + 5"
  formula: string,      // "1d20 + 5"
  roller: string,       // User ID
  timestamp: number     // Date.now()
}
```
**Lifecycle:**
- Set when roll dialog is mirrored or roll request received
- Cleared after roll is submitted or cancelled
**Read By:** `generateRollRequestHTML()`, `handleMirroredRollSubmit()`
**Written By:** `updatePanelWithMirroredDialog()`, socket handlers
**Cross-reference:** See 02-simplicity-targets.md Section 5.2 about overlap with mirroredDialog

### 1.3 currentPanelDialog
**Type:** `Application | null`
**Initial Value:** `null`
**Purpose:** Reference to the currently open DLC panel dialog
**Lifecycle:**
- Set when panel is opened via `openPanel()`
- Cleared when panel is closed
**Read By:** `refreshPanel()`, all panel update functions
**Written By:** `openPanel()`, `closePanel()`
**Note:** Used to update content without creating new dialog instances

### 1.4 pendingDiceEntry
**Type:** `object | null`
**Initial Value:** `null`
**Purpose:** Stores dice entry in progress for manual rolls
**Structure:**
```javascript
{
  dice: { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 },
  modifier: number,
  formula: string  // Original formula for reference
}
```
**Lifecycle:**
- Set when dice entry UI is shown
- Updated as user clicks dice buttons
- Cleared after submission or cancellation
**Read By:** `generateDiceEntryHTML()`, dice button handlers
**Written By:** Dice entry initialization, button click handlers

### 1.5 diceEntryCancelled
**Type:** `boolean`
**Initial Value:** `false`
**Purpose:** Flag to prevent race conditions during dice entry cancellation
**Lifecycle:**
- Set to `true` when user cancels dice entry
- Checked before processing dice entry results
- Reset when new dice entry begins
**Read By:** Dice entry submission handlers
**Written By:** Cancel button handler

### 1.6 collapsedSections
**Type:** `object`
**Initial Value:** 
```javascript
{
  rollRequest: false,
  globalOverride: true,
  playerModes: true,
  permissions: true,
  videoFeed: true,
  pending: false,
  topRow: false
}
```
**Purpose:** Tracks which UI sections are collapsed/expanded
**Lifecycle:**
- Initialized from settings in ready hook
- Updated when user clicks section headers
- Persisted to settings after each change
**Read By:** All `generateHTML()` functions
**Written By:** Section header click handlers, ready hook
**Cross-reference:** See 02-simplicity-targets.md Section 2.4 about duplicate defaults

---

## 2. SHARED MODULE STATE (dialog-mirroring.js)

### 2.1 mirroredDialog
**Type:** `object | null`
**Initial Value:** `null`
**Purpose:** Reference to the native dialog being mirrored
**Structure:**
```javascript
{
  app: Application,     // Foundry dialog instance
  html: jQuery,         // Dialog HTML element
  data: object,         // Extracted form data
  timestamp: number     // When captured
}
```
**Lifecycle:**
- Set when a roll dialog is detected and mirrored
- Cleared after roll is submitted or cancelled
**Access Pattern:** Via getter/setter functions
- `getMirroredDialog()` - returns current value
- `setMirroredDialog(dialog)` - sets new value
**Read By:** `submitMirroredDialog()` in main.mjs
**Written By:** `mirrorDialogToPanel()` in dialog-mirroring.js
**Cross-reference:** See 02-simplicity-targets.md Section 5.2 - overlaps with pendingRollRequest

---

## 3. PERSISTED STATE (via Foundry Settings)

### 3.1 World-Scoped Settings

#### globalOverride
**Setting Key:** `dice-link-companion.globalOverride`
**Type:** `string`
**Default:** `"off"`
**Values:** `"off"`, `"forceAllManual"`, `"forceAllDigital"`
**Purpose:** GM can force all players into a specific dice mode
**Access:**
- `getGlobalOverride()` - reads value
- `setGlobalOverride(value)` - writes value

#### playerMode_{userId}
**Setting Key:** `dice-link-companion.playerMode_{userId}`
**Type:** `string`
**Default:** `"digital"`
**Values:** `"digital"`, `"manual"`
**Purpose:** Per-player dice mode preference
**Registration:** Dynamic - created for each user in `registerPlayerModeSettings()`
**Access:**
- `getPlayerMode(userId)` - reads value
- `setPlayerMode(userId, mode)` - writes value
**Cross-reference:** See 01-edge-cases.md Section 2 about registration timing

#### pendingRequests
**Setting Key:** `dice-link-companion.pendingRequests`
**Type:** `Array`
**Default:** `[]`
**Purpose:** Queue of player manual mode requests awaiting GM approval
**Structure:** Array of request objects
**Access:**
- `getPendingRequests()` - reads array
- `setPendingRequests(requests)` - writes array

**Cross-reference:** See 06-settings-registry.md "Complete Settings Inventory" Section 4 for detailed permissions and pendingRequests handling

### 3.2 Client-Scoped Settings

#### collapsedSections
**Setting Key:** `dice-link-companion.collapsedSections`
**Type:** `object`
**Default:** (see section 1.6 above)
**Purpose:** Remember user's UI collapse preferences
**Access:**
- `getCollapsedSections()` - reads and merges with defaults
- `setCollapsedSections(sections)` - writes value
**Note:** Client-scoped means each user has their own preferences

---

## 4. STATE ACCESS PATTERNS

### Pattern 1: Memory Cache with Persistence
**Used by:** collapsedSections
```
Settings (persistent) <-> Memory Variable (fast access) <-> UI
```
- Load from settings on ready
- Keep in memory for fast reads
- Write back to settings on changes

### Pattern 2: Global Access via window.diceLink
**Used by:** Most cross-module state
```
main.mjs state -> window.diceLink -> other modules
```
- State lives in main.mjs
- Exposed via window.diceLink global
- Other modules access via optional chaining
**Cross-reference:** See 02-simplicity-targets.md Section 4.3 - this is fragile

### Pattern 3: Getter/Setter Encapsulation
**Used by:** mirroredDialog in dialog-mirroring.js
```
Private variable -> getMirroredDialog() / setMirroredDialog()
```
- Variable is module-private
- Accessed only through exported functions
- Allows validation/side effects on access

---

## 5. STATE FLOW DIAGRAM

```
User clicks dice in native dialog
        |
        v
mirrorDialogToPanel() captures dialog
        |
        v
setMirroredDialog({ app, html, data })
        |
        v
window.diceLink.updatePanelWithMirroredDialog()
        |
        v
pendingRollRequest = { title, formula, ... }
        |
        v
refreshPanel() reads pendingRollRequest
        |
        v
generateRollRequestHTML() displays it
        |
        v
User enters dice results
        |
        v
submitMirroredDialog() uses getMirroredDialog()
        |
        v
setMirroredDialog(null), pendingRollRequest = null
        |
        v
refreshPanel() shows normal state
```

---

## 6. RESTRUCTURE RECOMMENDATIONS

### 6.1 Consolidate Roll State
**Current:** mirroredDialog AND pendingRollRequest track similar info
**Recommendation:** Single `currentRoll` state object containing all roll context

### 6.2 Remove window.diceLink Pattern
**Current:** Global object for cross-module access
**Recommendation:** Pass required functions as parameters, or use proper module exports with careful import ordering

### 6.3 Single Source for Defaults
**Current:** collapsedSections defaults in 3 places
**Recommendation:** Define once in settings.js, export for others to reference

### 6.4 State Machine for Roll Flow
**Current:** Multiple boolean/null checks scattered throughout
**Recommendation:** Formal state machine: IDLE -> ROLL_PENDING -> DICE_ENTRY -> SUBMITTING -> IDLE

---

## Cross-References
- See 01-edge-cases.md for timing and null check edge cases
- See 02-simplicity-targets.md for redundancy in state definitions
- See 03-dependency-map.md for how state flows between modules
- See 07-module-boundary-plan.md - The state inventory here directly informed the proposed state.js module:
- All memory-only state variables (Section 1) move to state.js
- Getter/setter pattern (Section 4.3) is the model for state.js exports
- Restructure recommendations (Section 6) are implemented via state.js architecture

See 08-extraction-sequence.md - state.js creation is Step 1.4 (Phase 1), which consolidates all memory-only variables from main.mjs using the getter/setter pattern documented here

See 09-ui-components-inventory.md - All 6 UI component generators access state variables through getters (e.g., getPendingRollRequest, getCollapsedSections)

See 10-public-api.md - The public API includes state accessor functions (refreshPanel, getPlayerMode) that read and modify state documented here

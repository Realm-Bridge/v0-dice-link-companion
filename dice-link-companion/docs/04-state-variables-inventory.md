# 04 - State Variables Inventory

Complete inventory of all module-level state variables that persist across function calls.

## 1. Memory-Only State Variables

### 1.1 hasRequestedThisSession
**Location:** main.mjs line 62
**Type:** `boolean`
**Scope:** Session-only (memory)
**Initial Value:** `false`
**Accessed via:**
- Direct assignment: `socket.js` line 48, 82, 91, 123, 141
- Direct read: `socket.js` line 112, `main.mjs` via `window.diceLink`

**Purpose:** Prevents duplicate requests from same player in single session
**Lifecycle:**
- Initialized to `false` at module load
- Set to `true` when player requests manual mode
- Set to `false` when GM approves or rejects request

**⚠️ Issue:** Accessed via `window.diceLink` global instead of proper export. See 02-simplicity-targets.md Section 4.3

---

### 1.2 pendingRollRequest
**Location:** main.mjs line 65
**Type:** `object | null`
**Scope:** Memory only (lost on refresh)
**Initial Value:** `null`
**Structure when set:**
```javascript
{
  title: string,           // Roll title/type
  subtitle: string,        // Formula or description
  formula: string,         // Dice formula
  isMirroredDialog?: bool, // Flag if from dialog mirroring
  isFulfillment?: bool,    // Flag if from dice tray
  onComplete?: function    // Callback when resolved
}
```

**Accessed from:** main.mjs (direct), socket.js (via window.diceLink)
**Read locations:** ~45+ places in main.mjs
**Write locations:** 
- Line 1447: Dialog mirroring capture
- Line 1738: Dice tray fulfillment
- Line 1436, 1461, 1470: Null out when done

**Purpose:** Stores active dice roll waiting for player action
**Lifecycle:**
- `null` when idle
- Set when dialog/tray roll intercepted
- Passed to onComplete callback
- Nulled when user responds

**⚠️ Issue:** See 02-simplicity-targets.md Section 5.2 - May overlap with mirroredDialog. See 01-edge-cases.md Section 3 - Scattered null checks.

---

### 1.3 currentPanelDialog
**Location:** main.mjs line 68
**Type:** `DiceLinkCompanionApp | null`
**Scope:** Memory only
**Initial Value:** `null`
**Structure:** Application instance with properties:
- `.rendered` - boolean if visible
- `.element` - jQuery DOM element
- `.isGM` - boolean if GM panel
- `.close()` - method
- `.bringToTop()` - method
- `.setPosition()` - method

**Accessed from:** main.mjs (direct)
**Read locations:** Lines 1122, 1144, 1150, 1478, 1766
**Write locations:**
- Line 209: Null out on panel close
- Line 1159: Set to new instance on open

**Purpose:** Holds reference to currently open panel UI
**Lifecycle:**
- `null` when panel closed
- Set to DiceLinkCompanionApp instance when opened
- Used to update panel content
- Nulled when panel closes

**🟢 OK:** Clean usage pattern, proper null checks.

---

### 1.4 pendingDiceEntry
**Location:** main.mjs line 71
**Type:** `Promise-like object | null`
**Scope:** Memory only
**Initial Value:** `null`
**Structure when set:**
```javascript
{
  resolve: function,  // Called when dice entered
  reject: function    // Called on error
}
```

**Accessed from:** main.mjs (direct)
**Read locations:** Lines 1082, 1837, 1843, 1908, 1914, 2002, 2007
**Write locations:**
- Line 1843, 2007: Set new Promise
- Line 1084, 1085: Resolve and null
- Line 1092: Null on cancel

**Purpose:** Waits for manual dice entry in dice tray UI
**Lifecycle:**
- `null` when idle
- Set to Promise when showing dice entry UI
- Resolved when user enters dice
- Nulled after resolution

**Related:** `diceEntryCancelled` flag prevents double-processing

---

### 1.5 diceEntryCancelled
**Location:** main.mjs line 72
**Type:** `boolean`
**Scope:** Memory only
**Initial Value:** `false`
**Accessed from:** main.mjs (direct)
**Read locations:** Lines 1837, 1901, 1908, 1914, 2002
**Write locations:**
- Line 1079: Set true when user cancels
- Line 1816, 1901: Reset to false

**Purpose:** Prevents double-processing if user cancels dice entry
**Lifecycle:**
- Reset to `false` at start of dice entry
- Set to `true` if user cancels
- Checked to reject pending entry

**Relationship:** Works with `pendingDiceEntry` as a guard flag

**🟡 Issue:** See 01-edge-cases.md Section 3 - Flag-based cancellation could be cleaner with state machine.

---

### 1.6 mirroredDialog
**Location:** dialog-mirroring.js line 10
**Type:** `object | null`
**Scope:** Memory only (dialog-mirroring module scope)
**Initial Value:** `null`
**Structure when set:**
```javascript
{
  app: Application,       // Dialog application
  html: jQuery,           // Dialog HTML
  data: object,           // Form data
  timestamp: number       // When captured
}
```

**Accessed from:** dialog-mirroring.js via getter/setter pattern
**Read locations:** Via `getMirroredDialog()` - lines 1456
**Write locations:** Via `setMirroredDialog()` - lines 1346, 1351

**Purpose:** Stores reference to native dnd5e roll dialog for suppression
**Lifecycle:**
- `null` when no native dialog open
- Set when native dialog renders (if in manual mode)
- Used to suppress native dialog
- Nulled after handling

**⚠️ Issue:** See 03-dependency-map.md Section 3 & 02-simplicity-targets.md Section 5.2 - Questions whether dialog mirroring system is necessary at all.

---

## 2. Settings-Based State Variables

### 2.1 collapsedSections
**Location:** main.mjs line 75 (memory cache), settings.js (persistent store)
**Type:** `object`
**Scope:** Client (saved to game.settings, persistent across sessions)
**Initial Value:**
```javascript
{
  rollRequest: false,      // Show "Pending Rolls" section
  globalOverride: true,    // Hide "Global Override" section
  playerModes: true,       // Hide "Player Modes" section
  permissions: true,       // Hide "Permissions" section
  videoFeed: true,         // Hide "Video Feed" section
  pending: false,          // Show "Pending Requests" section
  topRow: false            // Show top row section
}
```

**Registration:** settings.js line 30 (scope: "client")
**Read locations:** 
- Loaded during ready hook (main.mjs line 2212)
- Read from memory 30+ times for UI generation
- Via `getCollapsedSections()` - defensive with try-catch

**Write locations:**
- Line 686, 839: Toggle on user click
- Line 689, 841: Call `setCollapsedSections()` to persist
- Line 1476, 1765: Force expand rollRequest section

**Purpose:** UI/UX state for panel section expand/collapse
**Lifecycle:**
- Defaults applied if not in settings
- Loaded into memory during ready hook
- Updated on user toggle
- Persisted to game.settings
- Merged with defaults on read to ensure all keys exist

**🟢 OK:** Proper separation of memory cache + persistent store. See 02-simplicity-targets.md Section 2.4 - defaults defined 3 times (should consolidate).

---

### 2.2 Game Settings (World-Scoped)
**Location:** settings.js
**Scope:** World (shared by all users)

#### globalOverride
- **Line:** 14
- **Type:** `String`
- **Values:** `"individual"`, `"forceAllManual"`, `"forceAllDigital"`
- **Read:** `getGlobalOverride()` - settings.js line 111
- **Write:** `setGlobalOverride()` - settings.js line 119
- **Purpose:** GM can force all players to specific mode
- **Cross-ref:** See 02-simplicity-targets.md Section 2.2 - Questions if this complexity is needed

#### pendingRequests
- **Line:** 22
- **Type:** `Array of objects`
- **Structure:** `[{ playerId: string, playerName: string }]`
- **Read:** `getPendingRequests()` - settings.js line 131
- **Write:** `setPendingRequests()` - settings.js line 139
- **Purpose:** GM approval queue for players requesting manual mode
- **Access:** socket.js uses this

### 2.3 Game Settings (Per-User, Dynamically Registered)
**Location:** settings.js line 50-65
**Scope:** World (but per-user naming)
**Key Pattern:** `playerMode_{userId}`
**Type:** `String`
**Values:** `"manual"` or `"digital"`
**Registration:** Dynamic in ready hook after users loaded
**Read:** `getPlayerMode(userId)` - settings.js line 90
**Write:** `setPlayerMode(userId, mode)` - settings.js line 102
**Purpose:** Stores each player's preferred dice mode
**⚠️ Issue:** See 03-dependency-map.md "Settings Registration Timing" - 100ms delay workaround for initialization ordering

---

## 3. State Variable Access Patterns

### Pattern 1: Memory Cache + Settings Persistence
Used by: `collapsedSections`
```
Ready hook: Load from settings → Memory variable
User action: Modify memory variable → Call setter
Setter: Update game.settings + return
Next read: Fetch from memory or reload from settings
```
**Issue:** Double storage can get out of sync

---

### Pattern 2: Direct Global Access
Used by: `hasRequestedThisSession` (via `window.diceLink`)
```
socket.js: Directly writes to window.diceLink.hasRequestedThisSession
main.mjs: Exposes in window.diceLink during ready
```
**Issue:** Not proper module export. See 02-simplicity-targets.md Section 4.3

---

### Pattern 3: Memory Only (Session State)
Used by: `pendingRollRequest`, `currentPanelDialog`, `pendingDiceEntry`
```
Lost on page refresh
Updated during execution
Checked before operations
Nulled when done
```
**Issue:** No persistence, appropriate for session data

---

## 4. State Variable Dependencies

```
hasRequestedThisSession
  ↓ (checked in socket.js)
playerRequestManual()

pendingRollRequest
  ↓ (created by dialog-mirroring + dice tray)
  ├→ updatePanelWithMirroredDialog()
  ├→ submitMirroredDialog()
  ├→ handleDiceEntry()
  └→ Multiple UI generators

currentPanelDialog
  ↓ (created by openPanel)
  ├→ refreshPanel()
  ├→ closePanel()
  └→ updatePanelWithMirroredDialog()

collapsedSections
  ↓ (loaded in ready hook)
  ├→ All panel HTML generators
  ├→ Collapse toggle listeners
  └→ setCollapsedSections() on toggle

mirroredDialog
  ↓ (captured in dialog-mirroring)
  ├→ updatePanelWithMirroredDialog()
  └→ submitMirroredDialog()
```

---

## 5. Cross-Reference Notes

**From 02-simplicity-targets.md:**
- Section 2.2: Multiple dice types arrays should be single constant
- Section 2.4: collapsedSections defaults defined 3 times
- Section 4.3: window.diceLink global pattern is fragile
- Section 5.2: mirroredDialog vs pendingRollRequest overlap

**From 01-edge-cases.md:**
- Section 2: 100ms delay is band-aid workaround
- Section 3: Scattered null checks suggest unstructured state management
- Section 4: Permissions stored in core settings, not DLC settings

**From 03-dependency-map.md:**
- Settings Registration Timing: 100ms delay masks initialization issue
- window.diceLink Access: Global dependency pattern
- mirroredDialog State: Stale reference risks

---

## 6. Recommendations for Restructure

1. **Consolidate defaults** - All settings defaults in one place (settings.js)
2. **State machine pattern** - Replace scattered flags with structured state object
3. **Unify pending rolls** - Merge mirroredDialog + pendingRollRequest into single `activeRoll` object
4. **Remove window.diceLink** - Use proper module exports instead of global
5. **Simplify persistence** - Either cache in memory OR in settings, not both
6. **Type definitions** - Define clear TypeScript/JSDoc interfaces for all state objects

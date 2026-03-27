# Dice Link Companion - Simplicity Targets
# Document 02 of 10 - Prepared for v1.0.6.66 Review

## Purpose
Identify dead code, redundancy, over-engineering, and opportunities for simplification.

---

## 1. DEAD CODE - Can Be Removed

### 1.1 DiceLinkResolver Class (lines 1658-1773)
**Location:** main.mjs lines 1658-1773
**Status:** DEAD - Never instantiated
**Evidence:** The class is defined but never used. The actual dice fulfillment uses `diceLinkFulfillmentHandler` function (lines 1798-1828) registered as a handler, not an interactive resolver.
**Action:** DELETE entire DiceLinkResolver class (~115 lines)

### 1.2 pendingDiceFulfillment Variable
**Location:** Referenced in DiceLinkResolver but never declared at module level
**Status:** DEAD - Only used by dead DiceLinkResolver class
**Action:** DELETE if exists, verify not used elsewhere

### 1.3 pendingRollConfig Variable (line 2168)
**Location:** main.mjs line 2168
**Code:** `let pendingRollConfig = null;`
**Status:** DEAD - Declared but never written to or read from
**Action:** DELETE

### 1.4 executeDirectRoll Function (lines 2114-2165)
**Location:** main.mjs lines 2114-2165
**Status:** LIKELY DEAD - May be a fallback that's never called
**Evidence:** No callers found in codebase. Comment says "used as a fallback" but no code triggers it.
**Action:** VERIFY not called anywhere, then DELETE (~50 lines)

### 1.5 Legacy Comments Block (lines 2179-2188)
**Location:** main.mjs lines 2179-2188
**Code:** Comments about "LEGACY", "MIDI-QOL NOTE", removed approaches
**Status:** DEAD COMMENTS - Just clutter
**Action:** DELETE or consolidate into proper documentation

### 1.6 Debug console.log Statements
**Location:** settings.js lines 51-55, 60-61, 63-64, 66
**Code:** Multiple `console.log("[v0]...")` debug statements
**Status:** DEVELOPMENT DEBUGGING - Should not be in production
**Action:** DELETE all "[v0]" debug logs

---

## 2. REDUNDANCY - Duplicate Code/Logic

### 2.1 Duplicate Dice Type Arrays
**Locations:**
- main.mjs line 2082-2083: `const diceTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];`
- main.mjs line 2096-2097: Same array repeated
- mode-application.js lines 17-24 and 40-47: Same dice listed inline

**Action:** Create single `DICE_TYPES` constant and import where needed

### 2.2 Duplicate Element Normalization Logic
**Locations:**
- main.mjs lines 1364-1376 (extractDialogFormData)
- main.mjs lines 1500-1508 (submitMirroredDialog)

**Code Pattern:**
```javascript
if (html instanceof jQuery) { element = html[0]; }
else if (html?.element) { element = html.element; }
else if (html instanceof HTMLElement) { element = html; }
```
**Action:** Extract to single `normalizeHtmlElement(html)` utility function

### 2.3 Duplicate Panel Open/Refresh Logic
**Location:** Three places call nearly identical open/refresh pattern:
- updatePanelWithMirroredDialog (lines 1476-1483)
- showDiceEntryUI (lines 2072-2074)
- waitForDiceTrayEntry (lines 2040-2041)

**Code Pattern:**
```javascript
collapsedSections.rollRequest = false;
const panelIsOpen = currentPanelDialog && currentPanelDialog.rendered;
if (!panelIsOpen) { openPanel(); } else { refreshPanel(); }
```
**Action:** Extract to `ensurePanelOpenWithRollRequest()` helper

### 2.4 Duplicate Collapsed Sections Defaults
**Locations:**
- main.mjs lines 75-83
- settings.js lines 35-42
- settings.js lines 146-153

**Same object defined three times:**
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
**Action:** Define ONCE in settings.js and export for use elsewhere

### 2.5 Duplicate Mode Application Functions
**Locations:**
- main.mjs lines 2081-2103: `applyDiceLinkFulfillment()` and `removeDiceLinkFulfillment()`
- mode-application.js: `applyManualDice()` and `applyDigitalDice()`

**Issue:** main.mjs has its own copy of the fulfillment logic even though mode-application.js exists
**Action:** DELETE from main.mjs, use only mode-application.js exports

---

## 3. OVER-ENGINEERING - Unnecessary Complexity

### 3.1 isRollDialog Function (lines 1232-1330)
**Location:** main.mjs lines 1232-1330
**Issue:** 100 lines of pattern matching when simpler approach works
**Current:** Checks class names, excluded patterns, title parsing for abilities/skills
**Simpler:** Just check for `dnd5e` class prefix and exclude known non-roll dialogs

**Current complexity:**
- 12 excluded patterns checked
- 6 roll dialog class patterns
- 6 ability names searched
- 17 skill names searched
- 8 different title conditions

**Potential simplification:**
```javascript
function isRollDialog(app) {
  if (!app) return false;
  const className = app.constructor?.name?.toLowerCase() || "";
  // dnd5e roll dialogs all have "configuration" or "roll" in class name
  if (className.includes("configurationdialog") || className.includes("d20roll")) return true;
  return false;
}
```
**Action:** SIMPLIFY - most title parsing is redundant if class check works

### 3.2 executeDiceTrayRollManually Function (lines 1871-1996)
**Location:** main.mjs lines 1871-1996
**Issue:** 125 lines to manually rebuild what Roll.evaluate() does
**Why:** Manually injecting values, handling keep highest/lowest, calculating totals

**Root cause:** Working around Foundry instead of with it
**Potential:** May be able to use Foundry's `Roll.registerResult()` API instead
**Action:** INVESTIGATE if fulfillment API can handle dice tray rolls natively

### 3.3 generateMirroredDialogHTML Function (lines 1579-1651)
**Location:** main.mjs lines 1579-1651
**Issue:** 72 lines generating HTML for mirrored dialogs
**Evidence from logs:** Dialog mirroring has recurring issues (this was source of v64 bugs)

**Question:** Is dialog mirroring necessary at all?
**Alternative:** Just hide native dialog, use fulfillment system for dice entry
**Action:** EVALUATE if this entire system can be simplified or removed

### 3.4 Video Feed Placeholder
**Locations:**
- main.mjs lines 526-545 (GM panel)
- main.mjs lines 653-672 (Player panel)

**Issue:** ~40 lines of HTML for a "Coming Soon" placeholder
**Action:** SIMPLIFY to single line placeholder, or REMOVE entirely until feature is ready

---

## 4. FRAGILE CODE - Should Be Rewritten

### 4.1 Hardcoded English Strings for Detection
**Location:** main.mjs lines 1280-1293
**Code:**
```javascript
const abilityNames = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const skillNames = ["acrobatics", "animal handling", "arcana", ... ];
```
**Issue:** Will fail for non-English Foundry users
**Action:** Use dnd5e system data/constants instead of hardcoded English strings

### 4.2 Magic Numbers for Roles
**Location:** main.mjs lines 89-94, 101-104
**Code:** `1: "Player", 2: "Trusted Player", 3: "Assistant GM", 4: "GM"`
**Issue:** Foundry role IDs hardcoded, could change
**Action:** Use `CONST.USER_ROLES` or `game.users.ROLES` from Foundry API

### 4.3 window.diceLink Global Dependency
**Location:** socket.js entire file uses `window.diceLink.*`
**Issue:** Tight coupling to global object, can fail if order is wrong
**Action:** Pass functions as parameters or use proper module imports

---

## 5. QUESTIONABLE ARCHITECTURE

### 5.1 Two Parallel Dice Entry Systems
**Systems:**
1. Fulfillment handler (`diceLinkFulfillmentHandler`) - for ability checks, saves, attacks
2. Dice tray manual roll (`executeDiceTrayRollManually`) - for free-form rolls

**Issue:** Both do similar things with different code paths
**Question:** Can these be unified into one system?

### 5.2 mirroredDialog vs pendingRollRequest
**Issue:** Two separate state variables tracking essentially the same thing
- `mirroredDialog` in dialog-mirroring.js
- `pendingRollRequest` in main.mjs

**They interact but have overlapping responsibilities
**Action:** Consider unifying into single state object

### 5.3 Multiple HTML Generation Functions
**Functions:**
- generateGMPanelContent() - 200+ lines
- generatePlayerPanelContent() - 100+ lines
- generateRollRequestSection() - 30 lines
- generatePendingRollHTML() - 70 lines
- generateDiceTrayHTML() - 25 lines
- generateMirroredDialogHTML() - 72 lines

**Issue:** 500+ lines of HTML string templates scattered through main.mjs
**Action:** Could be consolidated into single template system or moved to separate file

---

## 6. SUMMARY: ESTIMATED LINE SAVINGS

| Target | Lines | Priority |
|--------|-------|----------|
| DiceLinkResolver class | ~115 | HIGH |
| executeDirectRoll function | ~50 | HIGH |
| Debug console.logs | ~10 | HIGH |
| Dead variables | ~5 | HIGH |
| Duplicate code extraction | ~50 | MEDIUM |
| isRollDialog simplification | ~70 | MEDIUM |
| Video feed placeholder | ~30 | LOW |
| Legacy comments | ~10 | LOW |

**Total potential reduction:** ~340 lines (~15% of main.mjs)

---

## 7. NOTES FOR RESTRUCTURE

! HIGH PRIORITY: DiceLinkResolver is completely dead code - safe to delete
! HIGH PRIORITY: Debug logs must be removed before any release
! CAUTION: executeDiceTrayRollManually is complex but may be necessary
! QUESTION: Is the entire dialog mirroring system worth keeping?
! QUESTION: Can the two dice entry systems be unified?

---

*Document created for v1.0.6.66 analysis*
*Next document: 03-dependency-map.md*

# 09. UI Components Inventory - HTML Generation Functions

**Version:** 1.0.6.72 Snapshot  
**Purpose:** Catalog all HTML-generating functions, their structure, dependencies, and refactoring into ui-templates.js  
**Status:** Complete  
**Last Updated:** After full UI analysis

---

## Overview

This document inventories all UI components - the functions that generate HTML for the panel, dialogs, and interactive elements. These functions are key targets for extraction into the `ui-templates.js` module (Step 2.3 in the extraction sequence).

**Key Insights:**
- 6 main HTML generator functions in main.mjs
- Complex HTML using template literals and conditional rendering
- Heavy use of jQuery for DOM manipulation
- Multiple dependency chains (settings, state, constants)

---

## Components by Tier & Function

### 1. generateDiceTrayHTML() - Dice Input Interface

**Location:** main.mjs lines 225-248  
**Called by:** `refreshPanel()` → Panel content rendering  
**Used in:** Both GM and Player panels

**Renders:**
- Dice formula input field (e.g., "/r 1d20")
- 7 dice buttons (d4, d6, d8, d10, d12, d20, d100)
- Modifier controls (−/+ buttons, display)
- Advantage/Disadvantage toggle
- Roll button

**Dependencies:**
- No settings/state dependencies
- Pure HTML generation
- CSS classes: dlc-dice-*, dlc-btn-*

**Structure:**
```html
<div class="dlc-dice-tray">
  <div class="dlc-dice-formula-row">
    <input type="text" placeholder="/r 1d20" />
  </div>
  <div class="dlc-dice-buttons-row">
    [d4, d6, d8, d10, d12, d20, d100 buttons]
  </div>
  <div class="dlc-dice-controls-row">
    [Modifier controls] [ADV/DIS] [Roll button]
  </div>
</div>
```

**Event Handlers Attached:**
- `.dlc-dice-btn` click → Add/remove die
- `.dlc-dice-plus/minus` click → Adjust modifier
- `.dlc-dice-adv-btn` click → Toggle ADV/DIS
- `.dlc-dice-roll-btn` click → Submit roll

**Cross-reference:** Extracted to ui-templates.js in Step 2.3 (08-extraction-sequence.md)

---

### 2. generatePendingRollHTML(roll) - Dice Entry/Config Display

**Location:** main.mjs lines 250-320  
**Called by:** `refreshPanel()` when `pendingRollRequest` exists  
**Used in:** Conditional rendering in main panel

**Renders:** Three different UIs based on roll type:

#### 2a. Mirrored Dialog Display (roll.isMirroredDialog)
Delegates to `generateMirroredDialogHTML()` - see Component 6

#### 2b. Dice Entry/Fulfillment (roll.isFulfillment)
```html
<div class="dlc-pending-roll dlc-dice-entry-step">
  <div class="dlc-pending-roll-header">
    <h4>${roll.title}</h4>
    <p>${roll.subtitle}</p>
  </div>
  <div class="dlc-dice-inputs">
    [Input fields for each die]
  </div>
  <div class="dlc-pending-roll-actions">
    [SUBMIT RESULTS button]
  </div>
</div>
```

**Dependencies:**
- `roll.diceNeeded` array
- `roll.title`, `roll.subtitle`
- State: roll object structure

#### 2c. Roll Config/Formula View
```html
<div class="dlc-pending-roll dlc-config-step">
  <div class="dlc-pending-roll-header">
    [Title, subtitle]
  </div>
  <div class="dlc-pending-roll-formula">
    ${roll.formula}
  </div>
  [Optional: ability options, situational bonus]
</div>
```

**Event Handlers:**
- `.dlc-submit-dice-btn` click → Parse and submit dice values
- `.dlc-dice-value-input` input → Validate die values
- `.dlc-situational-bonus` input → Store bonus text

**Cross-reference:** Extracted to ui-templates.js in Step 2.3

---

### 3. generateRollRequestSection(mode, globalOverride) - Request Status Display

**Location:** main.mjs lines 322-348  
**Called by:** `generatePlayerPanelContent()`  
**Used in:** Player panel, bottom sections

**Renders:**
```html
<div class="dlc-section dlc-roll-request">
  <div class="dlc-section-header">
    <h3><i class="fas fa-bell"></i> Roll Requests</h3>
  </div>
  <div class="dlc-section-content">
    [Conditional based on globalOverride and mode]
  </div>
</div>
```

**Conditional Logic:**
- If `globalOverride !== "individual"`: Hidden or shows "All players use global setting"
- If player has pending request: Shows approval status
- If player can request: Shows "Request Manual" button

**Dependencies:**
- Parameter: `mode` (manual/digital)
- Parameter: `globalOverride` (individual/forceAllManual/forceAllDigital)
- State: `myPending` from `getPendingRequests()`

**Event Handlers:**
- Request button click → Send socket request to GM
- Cancel button click → Withdraw request

**Cross-reference:** Part of panel generation, extracted in Step 2.3

---

### 4. generateGMPanelContent() - GM Control Center

**Location:** main.mjs lines 350-555  
**Called by:** `refreshPanel()` when user is GM  
**Size:** 200+ lines of complex HTML generation

**Renders:**
```html
<div class="dlc-panel">
  <div class="dlc-header">
    [Logo/branding]
  </div>
  
  <!-- Top Section (Collapsible) -->
  <div class="dlc-section dlc-top-section">
    <div class="dlc-section-header" data-section="topRow">
      [Permissions toggles]
      [Global override dropdown]
      [GM mode selector]
    </div>
  </div>
  
  <!-- Roll Request Section -->
  <div class="dlc-section dlc-roll-request">
    [Pending requests list with approve/deny buttons]
  </div>
  
  <!-- Pending Roll Section -->
  <div class="dlc-section dlc-pending">
    [Current pending roll or empty state]
  </div>
  
  <!-- Video Feed Section (if video-feed.js is extracted) -->
  <div class="dlc-section dlc-video-feed">
    [Video HTML or placeholder]
  </div>
  
  <!-- Player List Section -->
  <div class="dlc-section dlc-players">
    [Grid of player cards showing mode and pending status]
  </div>
</div>
```

**Dependencies:**
- Settings: `getGlobalOverride()`, `getPlayerMode(userId)`, `getManualRollsPermissions()`
- State: `getPendingRequests()`, `collapsedSections`
- Game API: `game.users` iterator
- Constants: `ROLE_NAMES`, logos, URLs

**Subsections:**

**4a. Top Section - Permissions & Settings**
- Permission toggles for 3 roles (Trusted, Player, All)
- Global override selector dropdown
- GM mode display/selector

**4b. Roll Request Section**
- List of pending manual mode requests
- For each: Player name, "Approve" button, "Deny" button
- Shows approval status after action

**4c. Pending Roll Section**
- Renders `generatePendingRollHTML()` if roll exists
- Otherwise shows "No pending roll"

**4d. Video Feed Section**
- Logo/branding display
- Placeholder for future video feature (per 02-simplicity-targets.md Section 3.4)

**4e. Player List Section**
- Grid layout of player cards
- Each card shows: player name, current mode (digital/manual/pending)
- Cards are read-only in GM view (mode determined by global override)

**Event Handlers:**
- `.dlc-role-toggle` change → Update permissions
- `.dlc-override-selector` change → Update global override
- `.dlc-approve-request` click → Send approval
- `.dlc-deny-request` click → Send denial
- `.dlc-section-header` click → Toggle collapse
- Video logo click → Error fallback to placeholder

**Collapsible Sections:** 7 collapsible sections controlled by `collapsedSections` state

**Cross-reference:** Extracted to ui-templates.js in Step 2.3; calls helper functions to stay modular

---

### 5. generatePlayerPanelContent() - Player Control Interface

**Location:** main.mjs lines 555-770  
**Called by:** `refreshPanel()` when user is NOT GM  
**Size:** 200+ lines

**Renders:**
```html
<div class="dlc-panel dlc-player-panel">
  <div class="dlc-header">
    [Logo/branding]
  </div>
  
  <!-- Player Modes Section -->
  <div class="dlc-section dlc-player-modes">
    [Mode legend]
    [Player cards grid showing current modes]
    [Conditional: "Request Manual" button if eligible]
    [Conditional: Pending request status if exists]
  </div>
  
  <!-- Roll Request Section -->
  <div class="dlc-section dlc-roll-request">
    [Status: manual allowed/denied/pending]
  </div>
  
  <!-- Pending Roll Section -->
  <div class="dlc-section dlc-pending">
    [Current pending roll or empty]
  </div>
  
  <!-- Video Feed Section -->
  <div class="dlc-section dlc-video-feed">
    [Video or placeholder]
  </div>
</div>
```

**Dependencies:**
- Settings: `getGlobalOverride()`, `getPlayerMode(userId)`, `getPendingRequests()`
- Game API: `game.users`, `game.user.id`
- State: `collapsedSections`

**Subsections:**

**5a. Player Modes Section**
- Legend: Digital (blue), Manual (red), Pending (yellow) dots
- Grid of player cards (including self)
- Conditional elements based on permissions

**5b. Roll Request Section**
- Shows current permission status for manual mode requests
- Shows if request is pending approval
- Shows if permission denied

**5c. Pending Roll Section**
- Renders `generatePendingRollHTML()` if roll exists

**5d. Video Feed Section**
- Same as GM version

**Event Handlers:**
- `.dlc-player-request` click → Request manual mode
- `.dlc-switch-digital` click → Switch back to digital
- `.dlc-section-header` click → Toggle collapse

**Conditional Logic:**
- `canRequest`: Not pending AND in digital AND override is individual
- `canSwitchToDigital`: In manual AND override allows it
- Show pending status only if override is "individual"

**Cross-reference:** Extracted to ui-templates.js in Step 2.3

---

### 6. generateMirroredDialogHTML(mirrorData) - Dialog Capture Display

**Location:** main.mjs lines 1579-1620  
**Called by:** `generatePendingRollHTML()` when `isMirroredDialog` is true  
**Used in:** Dialog mirroring feature (questioned in 02-simplicity-targets.md Section 3.3)

**Renders:**
```html
<div class="dlc-mirrored-dialog">
  <div class="dlc-mirrored-header">
    <h4>${mirrorData.dialogTitle}</h4>
  </div>
  <div class="dlc-mirrored-buttons">
    [Mirrored button options from original dialog]
  </div>
</div>
```

**Dependencies:**
- `mirrorData.dialogTitle`
- `mirrorData.buttons` array
- State: Dialog state tracking

**Event Handlers:**
- Mirrored button clicks → Trigger original dialog action

**Cross-reference:** Extracted to ui-templates.js in Step 2.3; may be removed if dialog mirroring is eliminated (08-extraction-sequence.md Step 3.1)

---

## HTML Patterns & Classes

### CSS Class Naming Convention

All DLC classes start with `dlc-`:
- `dlc-panel` - Main panel container
- `dlc-section` - Collapsible section
- `dlc-dice-*` - Dice-related elements
- `dlc-btn-*` - Button variants (success, danger, etc.)
- `dlc-player-*` - Player-related elements
- `dlc-*-header` - Section headers
- `dlc-*-content` - Collapsible section content

### Common Structure

```html
<div class="dlc-section">
  <div class="dlc-section-header" data-section="sectionName">
    <span class="dlc-collapse-btn">[+/−]</span>
    <h3><i class="fas fa-icon"></i> Section Title</h3>
  </div>
  <div class="dlc-section-content">
    [Dynamic content based on conditions]
  </div>
</div>
```

### Conditional Rendering Patterns

**Template Literal Conditionals:**
```javascript
${condition ? `<div>True branch</div>` : `<div>False branch</div>`}
```

**Array Mapping:**
```javascript
${array.map(item => `<div>${item}</div>`).join('')}
```

**Nested Ternary (Not Recommended - Should Simplify):**
```javascript
${x ? y ? `A` : `B` : `C`}
```

**Cross-reference:** See 02-simplicity-targets.md Section 5 - simplify nested ternaries

---

## jQuery Integration Points

Components use jQuery for:

**Event Delegation:**
```javascript
$(document).on('click', '.dlc-dice-btn', handler);
```

**DOM Manipulation:**
```javascript
contentElement.html(newContent);  // Update panel content
```

**Event Data:**
```javascript
$(this).data('section')  // Get section name from data attribute
```

**Cross-reference:** jQuery patterns should be replaced with vanilla JS during refactor

---

## Extraction Plan

Per 08-extraction-sequence.md Step 2.3 (Create ui-templates.js):

**Move to ui-templates.js:**
1. `generateDiceTrayHTML()` - No changes
2. `generatePendingRollHTML()` - Add state imports
3. `generateRollRequestSection()` - Add imports
4. `generateGMPanelContent()` - Add imports, split into helpers
5. `generatePlayerPanelContent()` - Add imports, split into helpers
6. `generateMirroredDialogHTML()` - Add imports (or remove if dialog mirroring cut)

**Import Structure for ui-templates.js:**
```javascript
import { MODULE_ID, ROLE_NAMES, LOGO_URL } from './constants.js';
import { getGlobalOverride, getPlayerMode } from './settings.js';
import { getPendingRequests, getCollapsedSections } from './state.js';

export function generateDiceTrayHTML() { ... }
export function generatePendingRollHTML(roll) { ... }
// ... all generators
```

**Size Reduction:**
- main.mjs: 2244 lines → ~150 lines (95% reduction)
- ui-templates.js: New file, ~600 lines (all generators + helpers)

**Testing After Extraction:**
- Panels render identically
- All conditional logic works
- Collapse/expand functionality preserved
- All event handlers attached correctly

---

## Cross-References

See 08-extraction-sequence.md Step 2.3 - UI template extraction sequence  
See 07-module-boundary-plan.md Tier 4 - ui-templates.js module definition  
See 02-simplicity-targets.md Section 5 - Simplify nested ternaries  
See 06-settings-registry.md - Settings accessed by all generators  
See 04-state-variables-inventory.md - State accessed by all generators

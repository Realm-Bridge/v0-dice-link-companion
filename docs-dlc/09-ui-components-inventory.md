# 09. UI Components Inventory - HTML Generation Functions

**Version:** 1.0.6.66 Snapshot  
**Purpose:** Catalog all HTML-generating functions for extraction into ui-templates.js  
**Status:** Complete

---

## Overview

This document inventories all UI components - the functions that generate HTML for the panel, dialogs, and interactive elements. These functions are key targets for extraction into `ui-templates.js` (Step 2.2 in the extraction sequence).

---

## Main HTML Generators

### 1. generateDiceTrayHTML()
**Renders:** Dice input interface with buttons
**Structure:** Formula input, 7 dice buttons, modifier controls, ADV/DIS toggle
**Dependencies:** None (pure HTML)
**Event Handlers:** Dice button clicks, modifier adjustments

### 2. generatePendingRollHTML(roll)
**Renders:** Three different UIs based on roll type
- Mirrored dialog display
- Dice entry/fulfillment
- Roll config/formula view
**Dependencies:** roll object structure from state
**Conditional:** Based on roll.isMirroredDialog, roll.isFulfillment

### 3. generateRollRequestSection(mode, globalOverride)
**Renders:** Request status display in player panel
**Conditional Logic:** Shows based on globalOverride and mode
**Dependencies:** Permissions, pending requests

### 4. generateGMPanelContent()
**Size:** 200+ lines of complex HTML
**Renders:**
- Top section (permissions, global override, GM mode)
- Roll request section (pending requests with approve/deny)
- Pending roll section
- Video feed section
- Player list section (grid of player cards)

**Dependencies:** All settings and state
**Collapsible Sections:** 7 collapsible areas

### 5. generatePlayerPanelContent()
**Size:** 200+ lines
**Renders:**
- Player modes section (legend + grid)
- Roll request section (status display)
- Pending roll section
- Video feed section

**Dependencies:** Settings, state, game data

### 6. generateMirroredDialogHTML(mirrorData)
**Renders:** Mirrored dialog content display
**Dependencies:** Dialog data structure
**Note:** May be removed if dialog mirroring is eliminated

---

## CSS Class Patterns

All DLC classes start with `dlc-`:
- `dlc-panel` - Main container
- `dlc-section` - Collapsible section
- `dlc-dice-*` - Dice elements
- `dlc-btn-*` - Button variants
- `dlc-*-header` - Headers
- `dlc-*-content` - Content areas

---

## Extraction Plan

**Move to ui-templates.js:**
1. All generate* functions
2. Helper functions for HTML generation
3. Import dependencies: constants.js, settings.js, state.js
4. Export all generators as named exports

**Result:**
- main.mjs: 2244 lines → ~150 lines
- ui-templates.js: New file, ~600 lines

**Testing after extraction:**
- Panels render identically
- Conditional logic works
- Collapse/expand functionality preserved
- Event handlers attached correctly

---

## Cross-References

See 08-extraction-sequence.md Step 2.2 - UI template extraction
See 07-module-boundary-plan.md Tier 6 - ui-templates.js module
See 02-simplicity-targets.md Section 5 - Simplify nested ternaries

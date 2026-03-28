# Dice Link Companion v1.0.7.9 Backup

**Date Locked:** 2026-03-28  
**Version:** 1.0.7.9  
**Status:** Stable - All Tests Passing

## What's in this version:

- Fixed `setPosition` null check for ApplicationV2 (prevents offsetWidth error)
- Unified shadow/mirror pattern (no custom resolver, uses Foundry's native system)
- Clean, modular code with no window globals
- All console logging through centralized debug.js
- Fully tested with no DLC errors

## Key Changes from v1.0.7.8:

- Changed element check from `!this.element` to `!this.element || !this.element[0]`
- jQuery objects can be truthy but still lack actual DOM nodes, this catches both cases

## Architecture:

- **dialog-mirroring.js** - Hides Foundry's dialogs and RollResolver, mirrors to our panel
- **dice-fulfillment.js** - Registers "dice-link" as fulfillment method (Foundry native)
- **state-management.js** - All transient state (no window globals)
- **settings.js** - All persistent state via Foundry settings
- **ui-templates.js** - Clean HTML generation with no logic
- **dice-panel.js** - Panel UI and event handlers

All rolls flow through Foundry natively - we just shadow the UI.

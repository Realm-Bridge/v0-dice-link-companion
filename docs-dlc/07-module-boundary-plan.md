# 07. Module Boundary Plan

**Version:** 1.0.6.66 Snapshot
**Note:** This document proposes module boundaries for restructuring. Regenerate after implementation.

---

## Overview

This document defines the proposed file structure for a clean DLC architecture separating concerns while maintaining clear dependencies.

---

## Proposed Module Structure (9 Tiers)

### Tier 1: Core Infrastructure

**constants.js** (NEW)
- MODULE_ID, SETTING_DEFAULTS, DICE_TYPES, CSS classes, Socket event names
- No dependencies

**logger.js** (EXISTS)
- Logging utility functions
- No dependencies

---

### Tier 2: Settings Layer

**settings.js** (Refactor)
- All Foundry settings registration and access
- Depends on: constants.js
- Exports: All settings functions

---

### Tier 3: State Management

**state.js** (NEW)
- Centralized memory-only state management
- Getter/setter functions for all state variables
- Depends on: constants.js, settings.js

---

### Tier 4: Business Logic

**dice-parsing.js** - Parse dice notation
**mode-application.js** - Apply dice modes
**approval.js** - Approval workflow
- All depend on: Tier 1-3

---

### Tier 5: Communication

**socket.js** - Cross-client communication
**chat.js** - Chat message utilities
- Depend on: Tier 1-4

---

### Tier 6: UI Layer

**ui-templates.js** (NEW) - HTML generation
**ui-panel.js** (NEW) - Panel lifecycle
**ui-listeners.js** (NEW) - Event handlers
- All depend on: Tier 1-5

---

### Tier 7-8: Features

**dialog-mirroring.js** (May be removed)
**video-feed.js** (Placeholder)
- Depend on: Tier 1-6

---

### Tier 9: Application Entry Point

**main.mjs** (Drastically simplified)
- Only: Hook registrations
- Imports from all other modules
- ~150 lines (down from 2266)

---

## Benefits

- **Single Responsibility:** Each file has one clear purpose
- **Testability:** Individual modules can be tested in isolation
- **Maintainability:** Changes isolated to specific modules
- **Clear Dependencies:** Tier system prevents circular imports
- **Future-Proof:** New features have clear home

---

## Migration Strategy

**Phase 1:** Extract constants and state (Tiers 1-3)
**Phase 2:** Extract business logic (Tier 4)
**Phase 3:** Refactor communication (Tier 5)
**Phase 4:** Extract UI layer (Tier 6)
**Phase 5:** Simplify entry point (Tier 9)

---

## Cross-References

See 01-edge-cases.md - Edge cases inform module boundaries
See 02-simplicity-targets.md - Redundancies to eliminate
See 03-dependency-map.md - Current dependencies inform tier system
See 04-state-variables-inventory.md - State variables define state.js
See 05-hook-registration-map.md - Hook timing informs main.mjs structure
See 06-settings-registry.md - Settings analysis informs settings.js refactoring
See 08-extraction-sequence.md - Step-by-step implementation order
See 09-ui-components-inventory.md - UI extraction targets
See 10-public-api.md - Public API follows tier system

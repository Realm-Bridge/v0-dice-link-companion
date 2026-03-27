# Dice Link Companion - Documentation

## IMPORTANT: DO NOT DELETE THESE FILES WITHOUT APPROVAL

These documentation files represent significant analysis work and are critical for the restructuring effort. Always check with the project owner before deleting or modifying.

**Backups Location:** `backups/docs/`

---

## Document Manifest

| Doc # | Filename | Purpose | Status |
|-------|----------|---------|--------|
| 01 | 01-edge-cases.md | Edge cases, special handling, fragile patterns | Complete |
| 02 | 02-simplicity-targets.md | Dead code, redundancy, simplification opportunities | Complete |
| 03 | 03-dependency-map.md | Function calls, cross-module dependencies | Complete |
| 04 | 04-state-variables-inventory.md | All state variables, their scope and access | Complete |
| 05 | 05-hook-registration-map.md | Foundry hooks, timing, dependencies | Complete |
| 06 | 06-settings-registry.md | All settings, registration, access patterns | Complete |
| 07 | 07-module-boundary-plan.md | Proposed file structure for restructure | Complete |
| 08 | 08-extraction-sequence.md | Order of operations for restructure | Complete |
| 09 | 09-ui-components-inventory.md | HTML generation functions, UI patterns | Complete |
| 10 | 10-public-api.md | Exported functions, external interfaces | Complete |

---

## Cross-Reference System

All documents are interconnected with cross-references. When a topic is discussed in multiple documents, each includes references to the others. This creates a comprehensive documentation network where:

- Issues identified in one document reference related analysis in others
- Recommendations link back to the root cause analysis
- No information is isolated

---

## Version Note

These documents analyze the **v1.0.6.72** codebase. Cleanup changes implemented:
- v1.0.6.67: Removed debug console.log statements (4 lines)
- v1.0.6.68: Removed dead code - DiceLinkResolver class, executeDirectRoll function, pendingRollConfig variable (~171 lines)
- v1.0.6.69: Refactored to use Foundry's CONFIG.Dice.terms dynamically instead of hardcoded arrays
- v1.0.6.70: Removed duplicate dialog mirroring functions (~289 lines)
- v1.0.6.71: Fixed - Restored updatePanelWithMirroredDialog (was needed, not duplicate)
- v1.0.6.72: Optimized async operation delays from 100ms to 40ms, unified into single constant

If the code is further restructured, these documents should be regenerated to reflect the new architecture.

---

## Backup Protocol

After each document is completed:
1. Document is added to `backups/docs/` folder
2. This manifest is updated with status
3. Cross-references are verified against all previous documents

Last updated: Document 10 complete

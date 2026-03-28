/**
 * UI Templates Module - Phase 3: Core UI/UX Functions
 * Version 1.0.7.0
 * 
 * Extracts all HTML generation functions from main.mjs
 * Pure template functions with no game logic - only rendering
 * 
 * v1.0.7.0 - Updated to support resolver approach: shows ALL dice at once
 * Depends on: constants.js, settings.js, settings-helpers.js, state-management.js, video-feed.js
 */

import {
  REALM_BRIDGE_URL,
  LOGO_URL,
  LOGO_SQUARE_URL,
  ROLE_NAMES
} from "./constants.js";

import {
  getGlobalOverride,
  getPlayerMode,
  getPendingRequests,
  getCollapsedSections
} from "./settings.js";

import { getManualRollsPermissions } from "./settings-helpers.js";

import {
  getPendingRollRequest,
  getActiveResolver,
  getResolverDiceTerms
} from "./state-management.js";

import { generateVideoFeedSection } from "./video-feed.js";
import { debugResolver } from "./debug.js";

// ============================================================================
// DICE TRAY HTML
// ============================================================================

/**
 * Generate the dice tray UI for manual dice entry
 * Shows dice buttons (d4, d6, d8, d10, d12, d20, d100), modifier controls, and roll button
 */
export function generateDiceTrayHTML() {
  return `
    <div class="dlc-dice-tray">
      <div class="dlc-dice-formula-row">
        <input type="text" class="dlc-dice-formula-input" placeholder="/r 1d20" value="/r ">
      </div>
      <div class="dlc-dice-buttons-row">
        ${[4, 6, 8, 10, 12, 20, 100].map(die => `
          <button type="button" class="dlc-dice-btn" data-die="${die}" title="d${die}">
            <span class="dlc-die-icon">d${die}</span>
            <span class="dlc-die-count" style="display:none;">0</span>
          </button>
        `).join('')}
      </div>
      <div class="dlc-dice-controls-row">
        <button type="button" class="dlc-dice-mod-btn dlc-dice-minus" title="Decrease modifier">−</button>
        <span class="dlc-dice-modifier">0</span>
        <button type="button" class="dlc-dice-mod-btn dlc-dice-plus" title="Increase modifier">+</button>
        <button type="button" class="dlc-dice-adv-btn" data-mode="normal" title="Toggle Advantage/Disadvantage">ADV/DIS</button>
        <button type="button" class="dlc-dice-roll-btn dlc-btn-success" title="Roll dice">Roll</button>
      </div>
    </div>
  `;
}

// ============================================================================
// PENDING ROLL HTML
// ============================================================================

/**
 * Generate the pending roll UI
 * Handles four cases:
 * 1. Resolver dice entry (v1.0.7.0 - ALL dice at once from RollResolver)
 * 2. Mirrored native dialog (when player in manual mode and native dialog appears)
 * 3. Dice entry step (legacy - when fulfilling a roll with manual dice entry one at a time)
 * 4. Configuration step (selecting advantage/disadvantage/normal)
 */
export function generatePendingRollHTML(roll) {
  // Check for resolver-based dice entry first (v1.0.7.0 - ALL dice at once)
  const resolverDiceTerms = getResolverDiceTerms();
  if (resolverDiceTerms && resolverDiceTerms.length > 0) {
    debugResolver("Rendering resolver dice inputs", { count: resolverDiceTerms.length });
    
    const diceInputs = resolverDiceTerms.map((die, index) => {
      const faces = die.faces || 20;
      const dieLabel = die.type || `d${faces}`;
      return `
        <div class="dlc-dice-input-row">
          <label class="dlc-dice-label">${dieLabel} #${die.index + 1}</label>
          <input type="number" 
                 class="dlc-dice-value-input dlc-resolver-input" 
                 data-die-index="${index}" 
                 data-die-faces="${faces}"
                 min="1" 
                 max="${faces}" 
                 placeholder="1-${faces}">
        </div>
      `;
    }).join('');
    
    return `
      <div class="dlc-pending-roll dlc-dice-entry-step dlc-resolver-entry">
        <div class="dlc-pending-roll-header">
          <h4 class="dlc-pending-roll-title">Enter Dice Results</h4>
          <p class="dlc-pending-roll-subtitle">${resolverDiceTerms.length} dice to enter</p>
        </div>
        <div class="dlc-dice-inputs">
          ${diceInputs}
        </div>
        <div class="dlc-pending-roll-actions">
          <button type="button" class="dlc-roll-action-btn dlc-submit-resolver-btn dlc-btn-success">SUBMIT ALL</button>
          <button type="button" class="dlc-roll-action-btn dlc-cancel-resolver-btn dlc-btn-danger">CANCEL</button>
        </div>
      </div>
    `;
  }
  
  if (roll.isMirroredDialog && roll.mirrorData) {
    return generateMirroredDialogHTML(roll.mirrorData);
  }
  
  if (roll.isFulfillment && roll.diceNeeded) {
    const diceInputs = roll.diceNeeded.map((die, index) => {
      const faces = die.faces || parseInt((die.type || "d20").replace("d", "")) || 20;
      const dieLabel = die.type || `d${faces}`;
      // For all-at-once mode, show die number
      const labelSuffix = roll.isAllAtOnce ? ` #${index + 1}` : '';
      return `
        <div class="dlc-dice-input-row">
          <label class="dlc-dice-label">${dieLabel}${labelSuffix}</label>
          <input type="number" 
                 class="dlc-dice-value-input${roll.isAllAtOnce ? ' dlc-all-at-once-input' : ''}" 
                 data-die-index="${index}" 
                 data-die-faces="${faces}"
                 min="1" 
                 max="${faces}" 
                 placeholder="1-${faces}">
        </div>
      `;
    }).join('');
    
    // Use different button class for all-at-once mode
    const submitBtnClass = roll.isAllAtOnce ? 'dlc-submit-all-dice-btn' : 'dlc-submit-dice-btn';
    const submitBtnText = roll.isAllAtOnce ? 'SUBMIT ALL' : 'SUBMIT RESULTS';
    
    return `
      <div class="dlc-pending-roll dlc-dice-entry-step${roll.isAllAtOnce ? ' dlc-all-at-once' : ''}">
        <div class="dlc-pending-roll-header">
          <h4 class="dlc-pending-roll-title">${roll.title || "Enter Dice Results"}</h4>
          ${roll.subtitle ? `<p class="dlc-pending-roll-subtitle">${roll.subtitle}</p>` : ''}
        </div>
        <div class="dlc-dice-inputs">
          ${diceInputs}
        </div>
        <div class="dlc-pending-roll-actions">
          <button type="button" class="dlc-roll-action-btn ${submitBtnClass} dlc-btn-success">${submitBtnText}</button>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dlc-pending-roll dlc-config-step">
      <div class="dlc-pending-roll-header">
        <h4 class="dlc-pending-roll-title">${roll.title}</h4>
        ${roll.subtitle ? `<p class="dlc-pending-roll-subtitle">${roll.subtitle}</p>` : ''}
      </div>
      <div class="dlc-pending-roll-formula">
        <span class="dlc-pending-formula-text">${roll.formula}</span>
        <span class="dlc-pending-formula-label">Formula</span>
      </div>
      ${roll.situationalBonus !== undefined ? `
      <div class="dlc-pending-roll-bonus">
        <input type="text" class="dlc-dice-formula-input dlc-situational-bonus" placeholder="Situational Bonus?" value="${roll.situationalBonus || ''}">
      </div>
      ` : ''}
      ${roll.abilityOptions ? `
      <div class="dlc-pending-roll-config">
        <div class="dlc-config-row">
          <label>Ability</label>
          <span class="dlc-config-value">${roll.abilityOptions}</span>
        </div>
      </div>
      ` : ''}
      <div class="dlc-pending-roll-actions">
        ${roll.hasAdvantage ? `<button type="button" class="dlc-roll-action-btn dlc-roll-advantage" data-roll-mode="advantage">Advantage</button>` : ''}
        <button type="button" class="dlc-roll-action-btn dlc-roll-normal" data-roll-mode="normal">Normal</button>
        ${roll.hasDisadvantage ? `<button type="button" class="dlc-roll-action-btn dlc-roll-disadvantage" data-roll-mode="disadvantage">Disadvantage</button>` : ''}
        ${roll.hasCritical ? `<button type="button" class="dlc-roll-action-btn dlc-roll-critical" data-roll-mode="critical">Critical</button>` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// ROLL REQUEST SECTION
// ============================================================================

/**
 * Generate the roll request section for player or GM panel
 * Only shows if user is in manual mode (respects global override)
 */
export function generateRollRequestSection(mode, globalOverride) {
  let effectiveMode = mode;
  if (globalOverride === "forceAllManual") effectiveMode = "manual";
  else if (globalOverride === "forceAllDigital") effectiveMode = "digital";

  if (effectiveMode !== "manual") return '';

  const currentPendingRoll = getPendingRollRequest();
  const resolverDiceTerms = getResolverDiceTerms();
  
  // Has pending if either legacy pending roll OR resolver dice terms exist
  const hasPending = currentPendingRoll !== null || (resolverDiceTerms && resolverDiceTerms.length > 0);
  const currentCollapsed = getCollapsedSections();
  const sectionClass = `dlc-section dlc-roll-request-section${hasPending ? ' dlc-roll-request-pending' : ''}`;

  // For resolver-based rolls, pass an empty object - generatePendingRollHTML will check resolver state
  const rollDataForTemplate = resolverDiceTerms ? {} : currentPendingRoll;

  return `
    <div class="${sectionClass} ${currentCollapsed.rollRequest ? 'collapsed' : ''}">
      <div class="dlc-section-header" data-section="rollRequest">
        <span class="dlc-collapse-btn">${currentCollapsed.rollRequest ? '+' : '−'}</span>
        <h3><i class="fas fa-dice-d20"></i> Roll Request${hasPending ? ' <span class="dlc-pending-badge">PENDING</span>' : ''}</h3>
        ${hasPending ? '<button type="button" class="dlc-roll-cancel-btn dlc-header-cancel-btn">Cancel Roll</button>' : ''}
      </div>
      <div class="dlc-section-content">
        ${hasPending ? generatePendingRollHTML(rollDataForTemplate) : generateDiceTrayHTML()}
      </div>
    </div>
  `;
}

// ============================================================================
// GM PANEL CONTENT
// ============================================================================

/**
 * Generate the complete GM control panel
 * Shows: Permissions, Global Override, Player Modes, Pending Requests, Video Feed, Roll Request
 */
export function generateGMPanelContent() {
  const globalOverride = getGlobalOverride();
  const pendingRequests = getPendingRequests();
  const gmMode = getPlayerMode();
  const rolePermissions = getManualRollsPermissions();
  const collapsedSections = getCollapsedSections();

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = getPlayerMode(user.id);
    const isPending = pendingRequests.some(req => req.playerId === user.id);
    
    let effectiveMode = storedMode;
    if (globalOverride === "forceAllManual") {
      effectiveMode = "manual";
    } else if (globalOverride === "forceAllDigital") {
      effectiveMode = "digital";
    }
    
    players.push({
      id: user.id,
      name: user.name,
      mode: effectiveMode,
      storedMode: storedMode,
      isPending: globalOverride === "individual" ? isPending : false,
      canRevoke: globalOverride === "individual" && storedMode === "manual"
    });
  }

  return `
    <div class="dlc-panel">
      <!-- Header with Logo -->
      <div class="dlc-header">
        <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-logo-link" title="Visit Realm Bridge">
          <img src="${LOGO_URL}" alt="Realm Bridge" class="dlc-logo" onerror="this.style.display='none'">
        </a>
      </div>

      <!-- Top Row: Permissions | Global Override | GM Mode (Collapsible) -->
      <div class="dlc-section dlc-top-section ${collapsedSections.topRow ? 'collapsed' : ''}" style="margin: 12px 12px 0 12px;">
        <div class="dlc-section-header" data-section="topRow">
          <span class="dlc-collapse-btn">${collapsedSections.topRow ? '+' : '−'}</span>
          <h3><i class="fas fa-cog"></i> Settings</h3>
        </div>
        <div class="dlc-section-content">
          <div class="dlc-top-row">
        <!-- Permissions -->
        <div class="dlc-mini-section">
          <h4>Permissions</h4>
          <div class="dlc-role-toggles">
            ${[1, 2, 3].map(role => `
              <div class="dlc-toggle-row">
                <label class="dlc-switch">
                  <input type="checkbox" class="dlc-role-toggle" data-role="${role}" ${rolePermissions[role] ? 'checked' : ''}>
                  <span class="dlc-slider"></span>
                </label>
                <span class="dlc-toggle-label">${ROLE_NAMES[role]}</span>
              </div>
            `).join('')}
            <div class="dlc-toggle-row dlc-disabled">
              <label class="dlc-switch">
                <input type="checkbox" checked disabled>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">GM <em>(always)</em></span>
            </div>
          </div>
        </div>

        <!-- Global Override -->
        <div class="dlc-mini-section dlc-mini-compact">
          <h4>Override</h4>
          <div class="dlc-role-toggles">
            <div class="dlc-toggle-row">
              <label class="dlc-switch">
                <input type="checkbox" class="dlc-override-manual" ${globalOverride === 'forceAllManual' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">Manual</span>
            </div>
            <div class="dlc-toggle-row">
              <label class="dlc-switch">
                <input type="checkbox" class="dlc-override-digital" ${globalOverride === 'forceAllDigital' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">Digital</span>
            </div>
          </div>
        </div>

        <!-- GM Mode -->
        <div class="dlc-mini-section dlc-mini-compact">
          <h4>Your Mode</h4>
          <div class="dlc-role-toggles">
            <div class="dlc-toggle-row">
              <label class="dlc-switch dlc-gm-mode-switch">
                <input type="checkbox" class="dlc-gm-mode-toggle" ${gmMode === 'manual' ? 'checked' : ''}>
                <span class="dlc-slider"></span>
              </label>
              <span class="dlc-toggle-label">${gmMode === 'manual' ? 'Manual' : 'Digital'}</span>
            </div>
            <button type="button" class="dlc-refresh-icon-btn dlc-refresh-btn" title="Refresh Panel" style="margin-top: 4px;">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>

      <!-- Bottom Sections -->
      <div class="dlc-bottom-sections">
        ${pendingRequests.length > 0 ? `
          <!-- Pending Requests -->
          <div class="dlc-section dlc-pending-section">
            <div class="dlc-section-header" data-section="pending">
              <span class="dlc-collapse-btn">${collapsedSections.pending ? '+' : '−'}</span>
              <h3><i class="fas fa-clock"></i> Pending Requests (${pendingRequests.length})</h3>
            </div>
            <div class="dlc-section-content">
              <div class="dlc-pending-list">
                ${pendingRequests.map(req => `
                  <div class="dlc-pending-item">
                    <span class="dlc-pending-name">${req.playerName}</span>
                    <div class="dlc-player-actions">
                      <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-success dlc-panel-approve" data-player-id="${req.playerId}">
                        <i class="fas fa-check"></i> Approve
                      </button>
                      <button type="button" class="dlc-btn dlc-btn-sm dlc-btn-danger dlc-panel-deny" data-player-id="${req.playerId}">
                        <i class="fas fa-times"></i> Deny
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Player Modes -->
        <div class="dlc-section ${collapsedSections.playerModes ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="playerModes">
            <span class="dlc-collapse-btn">${collapsedSections.playerModes ? '+' : '−'}</span>
            <h3><i class="fas fa-users"></i> Player Modes</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-mode-legend">
              <span class="dlc-legend-item"><span class="dlc-mode-dot digital"></span>Digital</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot manual"></span>Manual</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot pending"></span>Pending</span>
              <span class="dlc-legend-item"><span class="dlc-revoke-dot"></span>Revoke</span>
            </div>
            ${players.length > 0 ? `
              <div class="dlc-players-grid">
                ${players.map(player => `
                  <div class="dlc-player-card${player.canRevoke ? ' dlc-player-card-revokable' : ''}">
                    <div class="dlc-player-info">
                      <span class="dlc-mode-dot ${player.isPending ? 'pending' : player.mode}"></span>
                      <span class="dlc-player-name">${player.name}</span>
                    </div>
                    ${player.canRevoke ? `
                      <button type="button" class="dlc-revoke-corner dlc-panel-revoke" data-player-id="${player.id}" title="Revoke manual dice">
                        <i class="fas fa-times"></i>
                      </button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : '<p class="dlc-no-players">No players connected.</p>'}
          </div>
        </div>

        ${generateRollRequestSection(gmMode, "individual")}

        ${generateVideoFeedSection()}
      </div>
    </div>
  `;
}

// ============================================================================
// PLAYER PANEL CONTENT
// ============================================================================

/**
 * Generate the complete player control panel
 * Shows: Player Modes (with request/switch buttons), Roll Request, Video Feed
 */
export function generatePlayerPanelContent() {
  const globalOverride = getGlobalOverride();
  const pendingRequests = getPendingRequests();
  const myMode = getPlayerMode();
  const myPending = pendingRequests.some(req => req.playerId === game.user.id);
  const collapsedSections = getCollapsedSections();

  const players = [];
  for (const user of game.users) {
    if (user.isGM) continue;
    const storedMode = getPlayerMode(user.id);
    const isPendingRaw = pendingRequests.some(req => req.playerId === user.id);
    let effectiveMode = storedMode;
    if (globalOverride === "forceAllManual") effectiveMode = "manual";
    else if (globalOverride === "forceAllDigital") effectiveMode = "digital";
    const isPending = globalOverride === "individual" ? isPendingRaw : false;
    players.push({
      id: user.id,
      name: user.name,
      mode: effectiveMode,
      isPending,
      isSelf: user.id === game.user.id
    });
  }

  const canRequest = !myPending && myMode === "digital" && globalOverride === "individual";
  const canSwitchToDigital = myMode === "manual" && globalOverride !== "forceAllManual";
  
  const otherPlayers = players.filter(p => !p.isSelf);
  const selfPlayer = players.find(p => p.isSelf);

  return `
    <div class="dlc-panel dlc-player-panel">
      <!-- Header with Logo -->
      <div class="dlc-header">
        <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-logo-link" title="Visit Realm Bridge">
          <img src="${LOGO_URL}" alt="Realm Bridge" class="dlc-logo" onerror="this.style.display='none'">
        </a>
      </div>

      <!-- Bottom Sections -->
      <div class="dlc-bottom-sections" style="padding-top: 12px;">
        <!-- Player Modes - Two Column Layout -->
        <div class="dlc-section ${collapsedSections.playerModes ? 'collapsed' : ''}">
          <div class="dlc-section-header" data-section="playerModes">
            <span class="dlc-collapse-btn">${collapsedSections.playerModes ? '+' : '−'}</span>
            <h3><i class="fas fa-users"></i> Player Modes</h3>
          </div>
          <div class="dlc-section-content">
            <div class="dlc-mode-legend">
              <span class="dlc-legend-item"><span class="dlc-mode-dot digital"></span>Digital</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot manual"></span>Manual</span>
              <span class="dlc-legend-item"><span class="dlc-mode-dot pending"></span>Pending</span>
            </div>
            <div class="dlc-players-grid">
              ${canRequest ? `
                <button type="button" class="dlc-player-card dlc-player-action-card dlc-btn-success dlc-player-request">
                  <i class="fas fa-dice"></i> Request Manual
                </button>
              ` : ''}
              ${myPending ? `
                <div class="dlc-player-card dlc-player-pending-card">
                  <i class="fas fa-clock"></i> Awaiting GM
                </div>
              ` : ''}
              ${canSwitchToDigital ? `
                <button type="button" class="dlc-player-card dlc-player-action-card dlc-btn-secondary dlc-player-digital">
                  <i class="fas fa-desktop"></i> To Digital
                </button>
              ` : ''}
              ${selfPlayer ? `
                <div class="dlc-player-card dlc-player-card-self">
                  <div class="dlc-player-info">
                    <span class="dlc-mode-dot ${selfPlayer.isPending ? 'pending' : selfPlayer.mode}"></span>
                    <span class="dlc-player-name">${selfPlayer.name}</span>
                    <span class="dlc-self-indicator">(You)</span>
                  </div>
                </div>
              ` : ''}
              ${otherPlayers.map(player => `
                <div class="dlc-player-card">
                  <div class="dlc-player-info">
                    <span class="dlc-mode-dot ${player.isPending ? 'pending' : player.mode}"></span>
                    <span class="dlc-player-name">${player.name}</span>
                  </div>
                </div>
              `).join('')}
            </div>
            ${globalOverride !== "individual" ? `
              <p class="dlc-no-players" style="margin-top: 10px;">
                <i class="fas fa-lock"></i> GM has set global override: ${globalOverride === "forceAllManual" ? "All Manual" : "All Digital"}
              </p>
            ` : ''}
          </div>
        </div>

        ${generateRollRequestSection(myMode, globalOverride)}

        ${generateVideoFeedSection()}
      </div>
    </div>
  `;
}

// ============================================================================
// MIRRORED DIALOG HTML
// ============================================================================

/**
 * Generate HTML representation of a native dnd5e dialog
 * Used when a dialog is mirrored into our panel UI
 */
export function generateMirroredDialogHTML(mirrorData) {
  if (!mirrorData) {
    return "";
  }
  
  let html = `
    <div class="dlc-mirrored-dialog">
      <div class="dlc-dialog-title">${mirrorData.title}</div>
      <div class="dlc-dialog-content">
  `;
  
  // Show formula if available
  if (mirrorData.formula) {
    html += `
      <div class="dlc-dialog-formula">
        <span class="dlc-label">Formula</span>
        <span class="dlc-value">${mirrorData.formula}</span>
      </div>
    `;
  }
  
  // Generate input fields for form inputs
  html += `<div class="dlc-dialog-inputs">`;
  
  for (const [name, input] of Object.entries(mirrorData.inputs)) {
    if (input.type === "checkbox") {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-checkbox-label">
            <input type="checkbox" name="${name}" ${input.checked ? "checked" : ""}>
            <span>${name}</span>
          </label>
        </div>
      `;
    } else if (input.type === "select" || input.options) {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-label">${name}</label>
          <select name="${name}" class="dlc-select-input">
      `;
      if (input.options) {
        for (const opt of input.options) {
          html += `<option value="${opt.value}" ${opt.value === input.value ? "selected" : ""}>${opt.label}</option>`;
        }
      }
      html += `</select></div>`;
    } else {
      html += `
        <div class="dlc-input-row">
          <label class="dlc-label">${name}</label>
          <input type="text" name="${name}" class="dlc-text-input" value="${input.value}">
        </div>
      `;
    }
  }
  
  html += `</div>`;
  
  // Generate buttons
  html += `<div class="dlc-dialog-buttons">`;
  for (const btn of mirrorData.buttons) {
    html += `
      <button type="button" class="dlc-dialog-btn" data-button="${btn.label}">
        ${btn.label}
      </button>
    `;
  }
  html += `</div>`;
  
  html += `</div></div>`;
  
  return html;
}

// ============================================================================
// ============================================================================
// TEMPLATE EXPORTS
// ============================================================================

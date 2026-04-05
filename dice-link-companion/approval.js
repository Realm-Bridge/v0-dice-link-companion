/**
 * Approval Module - Handle GM approval/denial of player requests
 * Manages chat buttons and approval workflow
 */

import { MODULE_ID } from "./constants.js";
import { getPlayerMode, setPlayerMode, getPendingRequests, setPendingRequests } from "./settings.js";
import { refreshPanel } from "./dice-panel.js";
import { debugState, debugError } from "./debug.js";

/**
 * Create a chat message showing approval/denial decision
 */
export async function createApprovalChatMessage(playerId, playerName, approved) {
  const status = approved ? "APPROVED" : "DENIED";
  const color = approved ? "#10b981" : "#ef4444";
  
  const content = `
    <div class="dice-link-result" style="border-left: 4px solid ${color}; padding: 10px;">
      <p><strong>${playerName}</strong>'s request for manual dice has been <strong style="color: ${color};">${status}</strong>.</p>
    </div>
  `;

  await ChatMessage.create({
    content,
    whisper: [playerId, ...game.users.filter(u => u.isGM).map(u => u.id)]
  });
}

/**
 * Setup chat button handlers for approval/denial
 * Called from main.mjs setup
 */
export function setupChatButtonHandlers() {
  $(document).on("click", ".dlc-chat-approve", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!game.user.isGM) {
      ui.notifications.error("Only GMs can approve requests.");
      return;
    }

    const $btn = $(this);
    const $container = $btn.closest(".dice-link-request");
    const playerId = $btn.data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Remove buttons from ALL chat messages for this player
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request approved</em>');
    });

    await setPlayerMode(playerId, "manual");
    
    let pending = getPendingRequests();
    pending = pending.filter(req => req.playerId !== playerId);
    await setPendingRequests(pending);
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "applyMode",
      playerId: playerId,
      mode: "manual"
    });
    
    await createApprovalChatMessage(playerId, player.name, true);
    ui.notifications.info(`Approved manual dice for ${player.name}.`);
    
    // Refresh the panel to show updated state
    refreshPanel();
  });

  $(document).on("click", ".dlc-chat-deny", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!game.user.isGM) {
      ui.notifications.error("Only GMs can deny requests.");
      return;
    }

    const $btn = $(this);
    const $container = $btn.closest(".dice-link-request");
    const playerId = $btn.data("player-id");
    const player = game.users.get(playerId);

    if (!player) {
      ui.notifications.error("Player not found.");
      return;
    }

    // Remove buttons from ALL chat messages for this player
    $(`.dlc-chat-approve[data-player-id="${playerId}"], .dlc-chat-deny[data-player-id="${playerId}"]`).each(function() {
      $(this).closest(".dlc-chat-buttons").html('<em>Request denied</em>');
    });

    let pending = getPendingRequests();
    pending = pending.filter(req => req.playerId !== playerId);
    await setPendingRequests(pending);
    
    game.socket.emit(`module.${MODULE_ID}`, {
      action: "requestDenied",
      playerId: playerId
    });
    
    await createApprovalChatMessage(playerId, player.name, false);
    ui.notifications.info(`Denied manual dice for ${player.name}.`);
    
    // Refresh the panel to show updated state
    refreshPanel();
  });
}

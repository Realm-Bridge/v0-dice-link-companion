/**
 * Dice Parsing Utility Module
 * Handles parsing dice formulas and executing rolls with user-provided values
 */

import { error } from './logger.js';

/**
 * Parse dice from a formula string to determine what dice inputs we need
 * Returns array of {faces, index} for each individual die
 * @param {string} formula - Dice formula like "2d20+5" or "1d8+1d6"
 * @returns {Array} Array of {faces, index} objects for each die
 */
export function parseDiceFromFormula(formula) {
  const diceNeeded = [];
  // Match patterns like 2d20, 1d8, 4d6, etc.
  const diceRegex = /(\d+)d(\d+)/gi;
  let match;
  
  while ((match = diceRegex.exec(formula)) !== null) {
    const count = parseInt(match[1]) || 1;
    const faces = parseInt(match[2]) || 20;
    
    // Add individual dice entries
    for (let i = 0; i < count; i++) {
      diceNeeded.push({ faces, index: diceNeeded.length });
    }
  }
  
  return diceNeeded;
}

/**
 * Execute a roll with user-provided dice values
 * Replaces the random results with actual user-entered values and sends to chat
 * @param {string} formula - Dice formula to roll
 * @param {Array} diceResults - Array of user-provided die results
 * @param {string} title - Roll title
 * @param {string} subtitle - Roll subtitle (actor name)
 * @param {Object} rollConfig - Configuration object with advantage/disadvantage flags
 * @param {Object} originalConfig - Original roll configuration for context
 */
export async function executeRollWithValues(formula, diceResults, title, subtitle, rollConfig, originalConfig) {
  try {
    // Create the roll
    const roll = new Roll(formula);
    
    // We need to manually set the dice results before evaluation
    // Parse the roll to get terms
    await roll.evaluate({ allowInteractive: false });
    
    // Now we need to replace the random results with user values
    let resultIndex = 0;
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.DiceTerm) {
        for (let i = 0; i < term.results.length; i++) {
          if (diceResults[resultIndex] !== undefined) {
            term.results[i].result = diceResults[resultIndex];
          }
          resultIndex++;
        }
        // Recalculate the term's total
        term._evaluateModifiers();
      }
    }
    
    // Recalculate the roll total
    roll._total = roll._evaluateTotal();
    
    // Build flavor text
    let flavor = title;
    if (subtitle && subtitle !== "Unknown") {
      flavor = `${title} - ${subtitle}`;
    }
    if (rollConfig?.advantage) {
      flavor += " (Advantage)";
    } else if (rollConfig?.disadvantage) {
      flavor += " (Disadvantage)";
    }
    
    // Get actor for speaker
    const actor = originalConfig?.subject?.parent || originalConfig?.subject || game.user.character;
    
    // Send to chat
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavor,
      rollMode: game.settings.get("core", "rollMode")
    });
    
  } catch (e) {
    error("Error executing roll with values:", e);
    ui.notifications.error("Failed to execute roll.");
  }
}

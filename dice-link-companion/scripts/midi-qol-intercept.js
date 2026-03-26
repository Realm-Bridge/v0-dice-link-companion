/**
 * Midi-QOL Interception Module
 * Handles integration with midi-qol module
 * 
 * Note: We rely on the dice fulfillment system for all rolls,
 * including those from midi-qol workflows. We don't intercept
 * midi's hooks directly to keep everything properly connected.
 */

/**
 * Setup midi-qol interception
 * Currently minimal - just a check that midi-qol is active
 * All actual roll handling happens through the fulfillment system
 */
export function setupMidiQolInterception() {
  // Only setup if midi-qol is active
  if (!game.modules.get("midi-qol")?.active) {
    console.log("[Dice Link] midi-qol not active, skipping midi-qol hooks");
    return;
  }
  
  console.log("[Dice Link] midi-qol detected - relying on dice fulfillment system for manual rolls");
  
  // We don't need to hook into Midi's workflow.
  // The dice fulfillment handler will be called automatically when Midi
  // makes its rolls, keeping everything properly connected in the workflow.
  
  // All roll handling is done through diceLinkFulfillmentHandler
  // which is called for every roll including midi-qol rolls
}

/**
 * Debug Module - Centralized debugging for Dice Link Companion
 * 
 * Set DEBUG_ENABLED to true to enable logging, false to disable.
 * All debug output goes through this module for easy cleanup.
 */

const DEBUG_ENABLED = true;

/**
 * Log a debug message with [Dice Link Debug] prefix
 * @param {...any} args - Arguments to log
 */
export function debug(...args) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Debug]", ...args);
  }
}

/**
 * Log a debug warning
 * @param {...any} args - Arguments to log
 */
export function debugWarn(...args) {
  if (DEBUG_ENABLED) {
    console.warn("[Dice Link Debug]", ...args);
  }
}

/**
 * Log a debug error
 * @param {...any} args - Arguments to log
 */
export function debugError(...args) {
  if (DEBUG_ENABLED) {
    console.error("[Dice Link Debug]", ...args);
  }
}

/**
 * Log state of a variable with label
 * @param {string} label - Description of what's being logged
 * @param {any} value - Value to log
 */
export function debugState(label, value) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Debug]", label + ":", value);
  }
}

/**
 * Log resolver state changes
 * @param {string} event - Event type (e.g., "created", "fulfillable", "submitted", "cancelled")
 * @param {any} data - Associated data
 */
export function debugResolverState(event, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Resolver State]", event, data);
  }
}

/**
 * Log fulfillment-specific debug information
 * @param {...any} args - Arguments to log
 */
export function debugFulfillment(...args) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Fulfillment]", ...args);
  }
}

/**
 * Log resolver cancellation
 * @param {string} method - Method used to cancel (e.g., "resolveResult", "reject", etc.)
 * @param {any} data - Associated data or result
 */
export function debugResolverCancel(method, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Resolver Cancel]", `Used ${method}:`, data);
  }
}

/**
 * Log resolver closure sequence
 * @param {string} stage - Stage of closure (e.g., "resolveResult called", "closing app")
 */
export function debugResolverClosure(stage) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Resolver Closure]", stage);
  }
}

/**
 * Log HTML cloning operations for mirrored dialogs
 * @param {string} stage - Stage of cloning operation
 * @param {any} data - Associated data (element info, HTML length, etc.)
 */
export function debugCloning(stage, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Cloning]", stage, data);
  }
}

/**
 * Log button/footer detection attempts and results
 * @param {string} stage - Stage of button detection (e.g., "searching", "found", "not found")
 * @param {any} data - Associated data (selector used, element found, HTML preview, etc.)
 */
export function debugButtonDetection(stage, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Button Detection]", stage, data);
  }
}

/**
 * Log panel content injection and DOM state
 * @param {string} stage - Stage of injection (e.g., "before injection", "after injection", "verification")
 * @param {any} data - Associated data (HTML length, element counts, visibility states, etc.)
 */
export function debugPanelInjection(stage, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Panel Injection]", stage, data);
  }
}

/**
 * Log template/HTML generation for pending rolls
 * @param {string} stage - Stage of generation (e.g., "generatePendingRollHTML called", "using clonedHTML", "fallback")
 * @param {any} data - Associated data (roll object properties, HTML preview, etc.)
 */
export function debugTemplateGeneration(stage, data) {
  if (DEBUG_ENABLED) {
    console.log("[Dice Link Template]", stage, data);
  }
}

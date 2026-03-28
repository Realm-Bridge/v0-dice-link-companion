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

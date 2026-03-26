/**
 * Dice Link Companion - Logging Utility
 * Version 1.0.6.50
 * 
 * Centralized logging for easy debugging and cleanup.
 * Set DEBUG_MODE to true to enable debug logging.
 * Set DEBUG_MODE to false for production (only errors will be logged).
 */

// Toggle this to enable/disable ALL debug logging
const DEBUG_MODE = false;

// Optional: More granular control
const LOG_LEVELS = {
  debug: false,    // Verbose debugging info
  info: false,     // General info messages  
  warn: true,      // Warnings (always on by default)
  error: true      // Errors (always on by default)
};

const PREFIX = "[Dice Link]";

/**
 * Debug log - only outputs when DEBUG_MODE is true
 */
export function log(...args) {
  if (DEBUG_MODE || LOG_LEVELS.debug) {
    console.log(PREFIX, ...args);
  }
}

/**
 * Info log - only outputs when DEBUG_MODE is true
 */
export function info(...args) {
  if (DEBUG_MODE || LOG_LEVELS.info) {
    console.info(PREFIX, ...args);
  }
}

/**
 * Warning log - outputs by default (can be disabled via LOG_LEVELS)
 */
export function warn(...args) {
  if (LOG_LEVELS.warn) {
    console.warn(PREFIX, ...args);
  }
}

/**
 * Error log - always outputs (should never be disabled)
 */
export function error(...args) {
  if (LOG_LEVELS.error) {
    console.error(PREFIX, ...args);
  }
}

/**
 * Group logs together (collapsed by default)
 */
export function group(label, fn) {
  if (DEBUG_MODE) {
    console.groupCollapsed(PREFIX, label);
    fn();
    console.groupEnd();
  }
}

/**
 * Log with a specific level
 */
export function logLevel(level, ...args) {
  switch(level) {
    case 'debug': log(...args); break;
    case 'info': info(...args); break;
    case 'warn': warn(...args); break;
    case 'error': error(...args); break;
    default: log(...args);
  }
}

// Export a convenience object for destructured import
export const Logger = {
  log,
  info,
  warn,
  error,
  group,
  logLevel,
  DEBUG_MODE,
  LOG_LEVELS
};

export default Logger;

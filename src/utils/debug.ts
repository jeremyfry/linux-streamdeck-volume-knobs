import streamDeck from "@elgato/streamdeck";

/**
 * Enable debug logging by setting DEBUG=true in environment or DEBUG=1
 * Set this before building/packaging to control logging
 */
const DEBUG_ENABLED = true; // process.env.DEBUG === "true" || process.env.DEBUG === "1" || process.env.VOLUME_KNOBS_DEBUG === "true";

/**
 * Debug logger utility that only logs when DEBUG is enabled
 */
export const debug = {
	/**
	 * Log a debug message
	 */
	log: (...args: any[]): void => {
		if (DEBUG_ENABLED) {
			console.log('DEBUG', ...args);
			streamDeck.logger.info("[DEBUG]", ...args);
		}
	},

	/**
	 * Log an error (always logged, but marked as debug)
	 */
	error: (...args: any[]): void => {
		console.error('ERROR', ...args);
		if (DEBUG_ENABLED) {
			streamDeck.logger.error("[DEBUG ERROR]", ...args);
		}
	},

	/**
	 * Check if debug is enabled
	 */
	isEnabled: (): boolean => DEBUG_ENABLED
};

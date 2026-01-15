import { exec } from "child_process";
import { promisify } from "util";
import { debug } from "./debug";

const execAsync = promisify(exec);

/**
 * PID cache map: stores the correct PID for each application name.
 * Key: application name (user-specified)
 * Value: PID that matches wpctl output
 */
const pidCache = new Map<string, number>();

/**
 * Check if a sink identifier is the default audio sink shortcut.
 */
function isDefaultSink(sinkId: string): boolean {
	return sinkId === "@DEFAULT_AUDIO_SINK@";
}

/**
 * Check if a sink identifier is a PID-based identifier (format: "PID:12345").
 */
export function isPidBased(sinkId: string): boolean {
	return sinkId.startsWith("PID:");
}

/**
 * Extract PID from a PID-based sink identifier.
 */
function extractPid(sinkId: string): number {
	const pid = parseInt(sinkId.substring(4), 10);
	if (isNaN(pid)) {
		throw new Error(`Invalid PID-based sink identifier: ${sinkId}`);
	}
	return pid;
}

/**
 * Execute a wpctl command and return the output.
 */
async function execWpctl(command: string): Promise<string> {
	debug.log(`[wpctl] Executing: wpctl ${command}`);
	try {
		const { stdout, stderr } = await execAsync(`wpctl ${command}`);
		if (stderr && !stderr.includes("Warning")) {
			debug.error(`[wpctl] stderr: ${stderr}`);
			throw new Error(stderr);
		}
		const output = stdout.trim();
		debug.log(`[wpctl] Output: ${output.substring(0, 200)}${output.length > 200 ? "..." : ""}`);
		return output;
	} catch (error: any) {
		debug.error(`[wpctl] Error executing wpctl ${command}:`, error.message);
		if (error.code === "ENOENT") {
			throw new Error("wpctl command not found. Please ensure WirePlumber is installed.");
		}
		throw error;
	}
}

/**
 * Get PIDs for an application using pidof.
 * Returns an array of PIDs (can be empty if application not found).
 */
async function getApplicationPids(appName: string): Promise<number[]> {
	debug.log(`[getApplicationPids] Getting PIDs for application: ${appName}`);
	try {
		const { stdout } = await execAsync(`pidof ${appName}`);
		const pids = stdout
			.trim()
			.split(/\s+/)
			.filter(pid => pid.length > 0)
			.map(pid => parseInt(pid, 10))
			.filter(pid => !isNaN(pid));
		debug.log(`[getApplicationPids] Found PIDs for ${appName}: ${pids.join(", ")}`);
		return pids;
	} catch (error: any) {
		// pidof returns non-zero exit code if no PIDs found, which is normal
		if (error.code !== 1) {
			debug.error(`[getApplicationPids] Error getting PIDs for ${appName}:`, error.message);
			throw new Error(`Failed to get PIDs for ${appName}: ${error.message}`);
		}
		debug.log(`[getApplicationPids] No PIDs found for ${appName}`);
		return [];
	}
}

/**
 * Find the PID that matches an entry in wpctl status output.
 * Returns the matching PID or null if not found.
 * Checks both "Clients:" and "Sink Inputs:" sections.
 */
function findMatchingPidInWpctl(pids: number[], wpctlOutput: string): number | null {
	const lines = wpctlOutput.split("\n");
	
	// Check in both Clients and Sink Inputs sections
	let inClients = false;
	let inSinkInputs = false;
	
	for (const line of lines) {
		// Track which section we're in
		if (line.includes("Clients:")) {
			inClients = true;
			inSinkInputs = false;
			continue;
		}
		if (line.includes("Sink Inputs:")) {
			inSinkInputs = true;
			inClients = false;
			continue;
		}
		
		// Check if we've left the section
		if ((inClients || inSinkInputs) && line.match(/^\s*[A-Z]/) && 
		    !line.includes("Clients") && !line.includes("Sink Inputs")) {
			inClients = false;
			inSinkInputs = false;
			continue;
		}
		
		// Check if any of our PIDs appear in this line
		if (inClients || inSinkInputs) {
			for (const pid of pids) {
				// Match PID as a whole word or at word boundaries to avoid partial matches
				const pidRegex = new RegExp(`\\b${pid}\\b`);
				if (pidRegex.test(line)) {
					debug.log(`[findMatchingPidInWpctl] Found matching PID ${pid} in wpctl output (section: ${inClients ? "Clients" : "Sink Inputs"})`);
					return pid;
				}
			}
		}
	}
	
	debug.log(`[findMatchingPidInWpctl] No matching PID found in wpctl output`);
	return null;
}

/**
 * Verify that a cached PID is still valid in wpctl status.
 */
async function verifyPidInWpctl(pid: number): Promise<boolean> {
	const output = await execWpctl("status");
	return findMatchingPidInWpctl([pid], output) !== null;
}

/**
 * Get the default system sink ID from wpctl status.
 * The default sink is marked with an asterisk (*) in the output.
 * turns out I needed none of that code and there's a handy shortcut
 */
export async function getDefaultSink(): Promise<string> {
	return "@DEFAULT_AUDIO_SINK@";
}

/**
 * Get application sink identifier using PID-based lookup.
 * Accepts only application name (not sink ID).
 * Returns a PID-based identifier (format: "PID:12345") that can be used with --pid flag.
 */
export async function getApplicationSink(appName: string): Promise<string> {
	debug.log(`[getApplicationSink] Looking for application: ${appName}`);
	
	// Check if we have a cached PID
	if (pidCache.has(appName)) {
		const cachedPid = pidCache.get(appName)!;
		debug.log(`[getApplicationSink] Found cached PID ${cachedPid} for ${appName}`);
		
		// Verify the cached PID is still valid
		const isValid = await verifyPidInWpctl(cachedPid);
		if (isValid) {
			debug.log(`[getApplicationSink] Cached PID ${cachedPid} is still valid`);
			return `PID:${cachedPid}`;
		} else {
			debug.log(`[getApplicationSink] Cached PID ${cachedPid} is no longer valid, clearing cache`);
			pidCache.delete(appName);
		}
	}
	
	// Get PIDs for the application
	const pids = await getApplicationPids(appName);
	if (pids.length === 0) {
		debug.error(`[getApplicationSink] No PIDs found for application: ${appName}`);
		throw new Error(`Application "${appName}" not found (no running processes)`);
	}
	
	// Get wpctl status to find which PID matches
	const wpctlOutput = await execWpctl("status");
	const matchingPid = findMatchingPidInWpctl(pids, wpctlOutput);
	
	if (matchingPid === null) {
		debug.error(`[getApplicationSink] Application "${appName}" is not currently using audio (no matching PID in wpctl)`);
		throw new Error(`Application "${appName}" is not currently using audio`);
	}
	
	// Cache the PID for future use
	pidCache.set(appName, matchingPid);
	debug.log(`[getApplicationSink] Found and cached PID ${matchingPid} for ${appName}`);
	
	return `PID:${matchingPid}`;
}

/**
 * Get current volume percentage for a sink.
 * Note: get-volume does not work with --pid flag, so this only works for default sink.
 * For PID-based sinks, volume cannot be retrieved.
 */
export async function getVolume(sinkId: string): Promise<number> {
	if (isPidBased(sinkId)) {
		debug.error(`[getVolume] Cannot get volume for PID-based sink (get-volume doesn't support --pid flag)`);
		throw new Error("Cannot get volume for application-specific sinks. Use incremental volume changes instead.");
	}
	
	debug.log(`[getVolume] Getting volume for sink: ${sinkId}`);
	try {
		const output = await execWpctl(`get-volume ${sinkId}`);
		// Output format: "Volume: 0.50" or "Volume: 0.50 [MUTED]"
		const match = output.match(/Volume:\s*([\d.]+)/);
		if (!match) {
			debug.error(`[getVolume] Could not parse volume from output: ${output}`);
			throw new Error(`Could not parse volume from: ${output}`);
		}
		
		const volume = parseFloat(match[1]);
		// Convert from 0.00-1.65 range to 0-100 percentage
		// WirePlumber uses 1.00 = 100%, but allows up to 1.65 (165%) for overamplification
		// We'll cap the display at 100% even if the actual volume is higher
		const percentage = Math.min(Math.round((volume / 1.0) * 100), 100);
		const finalPercentage = Math.max(0, percentage);
		debug.log(`[getVolume] Sink ${sinkId} volume: ${volume} -> ${finalPercentage}%`);
		return finalPercentage;
	} catch (error: any) {
		debug.error(`[getVolume] Error getting volume for sink ${sinkId}:`, error.message);
		throw new Error(`Failed to get volume for sink ${sinkId}: ${error.message}`);
	}
}

/**
 * Set volume to a specific percentage (0-100).
 * For default sink: uses absolute volume value.
 * For PID-based sinks: uses incremental notation (e.g., "5+", "5-") since absolute values don't work well.
 * Note: For PID-based sinks, this calculates the delta from a baseline and uses incremental notation.
 */
export async function setVolume(sinkId: string, percentage: number): Promise<void> {
	const clampedPercentage = Math.max(0, Math.min(100, percentage));
	
	if (isPidBased(sinkId)) {
		// For PID-based sinks, we can't get current volume, so we can't set absolute values.
		// Instead, we should use adjustVolume with incremental changes.
		// But if we're called with setVolume, we'll throw an error suggesting to use adjustVolume instead.
		debug.error(`[setVolume] Cannot set absolute volume for PID-based sink. Use adjustVolume instead.`);
		throw new Error("Cannot set absolute volume for application-specific sinks. Use incremental volume changes (adjustVolume) instead.");
	}
	
	// Convert percentage to wpctl volume (0.00-1.00 range)
	// WirePlumber allows up to 1.65, but we'll keep it at 1.00 max for safety
	const volume = clampedPercentage / 100;
	
	debug.log(`[setVolume] Setting sink ${sinkId} to ${clampedPercentage}% (${volume.toFixed(2)})`);
	try {
		await execWpctl(`set-volume ${sinkId} ${volume.toFixed(2)}`);
		debug.log(`[setVolume] Successfully set volume for sink ${sinkId}`);
	} catch (error: any) {
		debug.error(`[setVolume] Error setting volume for sink ${sinkId}:`, error.message);
		throw new Error(`Failed to set volume for sink ${sinkId}: ${error.message}`);
	}
}

/**
 * Toggle mute state for a sink.
 */
export async function toggleMute(sinkId: string): Promise<void> {
	debug.log(`[toggleMute] Toggling mute for sink: ${sinkId}`);
	try {
		// Build command with --pid flag if using PID-based identifier
		let command: string;
		if (isPidBased(sinkId)) {
			const pid = extractPid(sinkId);
			command = `set-mute --pid ${pid} toggle`;
		} else {
			command = `set-mute ${sinkId} toggle`;
		}
		
		await execWpctl(command);
		debug.log(`[toggleMute] Successfully toggled mute for sink ${sinkId}`);
	} catch (error: any) {
		debug.error(`[toggleMute] Error toggling mute for sink ${sinkId}:`, error.message);
		throw new Error(`Failed to toggle mute for sink ${sinkId}: ${error.message}`);
	}
}

/**
 * Get mute state for a sink.
 * Note: get-volume does not work with --pid flag, so this only works for default sink.
 * For PID-based sinks, mute state cannot be retrieved.
 */
export async function getMuteState(sinkId: string): Promise<boolean> {
	if (isPidBased(sinkId)) {
		debug.error(`[getMuteState] Cannot get mute state for PID-based sink (get-volume doesn't support --pid flag)`);
		throw new Error("Cannot get mute state for application-specific sinks.");
	}
	
	debug.log(`[getMuteState] Getting mute state for sink: ${sinkId}`);
	try {
		const output = await execWpctl(`get-volume ${sinkId}`);
		const isMuted = output.includes("[MUTED]");
		debug.log(`[getMuteState] Sink ${sinkId} is ${isMuted ? "MUTED" : "unmuted"}`);
		return isMuted;
	} catch (error: any) {
		debug.error(`[getMuteState] Error getting mute state for sink ${sinkId}:`, error.message);
		throw new Error(`Failed to get mute state for sink ${sinkId}: ${error.message}`);
	}
}

/**
 * Adjust volume by a delta percentage.
 * Positive values increase, negative values decrease.
 * For PID-based sinks: uses incremental notation (e.g., "5+", "5-").
 * For default sink: gets current volume and sets new absolute value.
 */
export async function adjustVolume(sinkId: string, deltaPercentage: number): Promise<void> {
	if (isPidBased(sinkId)) {
		// For PID-based sinks, use incremental notation
		const pid = extractPid(sinkId);
		const absDelta = Math.abs(deltaPercentage);
		const sign = deltaPercentage >= 0 ? "+" : "-";
		
		debug.log(`[adjustVolume] Adjusting PID-based sink ${sinkId} by ${deltaPercentage}% (using ${absDelta}${sign})`);
		try {
			await execWpctl(`set-volume --pid ${pid} 0.0${absDelta}${sign}`);
			debug.log(`[adjustVolume] Successfully adjusted volume for sink ${sinkId}`);
		} catch (error: any) {
			debug.error(`[adjustVolume] Error adjusting volume for sink ${sinkId}:`, error.message);
			throw new Error(`Failed to adjust volume for sink ${sinkId}: ${error.message}`);
		}
	} else {
		// For default sink, get current volume and set new absolute value
		const currentVolume = await getVolume(sinkId);
		const newVolume = Math.max(0, Math.min(100, currentVolume + deltaPercentage));
		await setVolume(sinkId, newVolume);
	}
}

/**
 * Get the appropriate sink ID based on control mode.
 * For system mode, returns "@DEFAULT_AUDIO_SINK@".
 * For application mode, accepts application name and returns PID-based identifier (format: "PID:12345").
 */
export async function getSinkId(controlMode: "system" | "application", appName?: string): Promise<string> {
	debug.log(`[getSinkId] Getting sink ID - mode: ${controlMode}, appName: ${appName || "none"}`);
	if (controlMode === "system") {
		const sinkId = await getDefaultSink();
		debug.log(`[getSinkId] Resolved to system sink: ${sinkId}`);
		return sinkId;
	} else {
		if (!appName) {
			debug.error("[getSinkId] Application name is required but not provided");
			throw new Error("Application name is required when control mode is 'application'");
		}
		const sinkId = await getApplicationSink(appName);
		debug.log(`[getSinkId] Resolved to application sink: ${sinkId}`);
		return sinkId;
	}
}

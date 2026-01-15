import streamDeck, { action, DialDownEvent, DialRotateEvent, PropertyInspectorDidAppearEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, adjustVolume, getVolume, toggleMute, getMuteState, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";
import { getDesktopApplications, getProcessNameFromApp } from "../utils/desktop-apps";
import { encodeIconToBase64 } from "../utils/icon-encoder";

/**
 * Settings for VolumeDial action.
 */
type VolumeDialSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
	appIcon?: string; // Icon path for the selected application
	stepSize?: number; // Volume change per tick (default 2%)
};

/**
 * Action that controls volume via dial rotation and toggles mute on dial press.
 */
@action({ UUID: "com.jeremy-fry.volume-knobs.volume-dial" })
export class VolumeDial extends SingletonAction<VolumeDialSettings> {
	/**
	 * Update the button display when it becomes visible.
	 */
	override async onWillAppear(ev: WillAppearEvent<VolumeDialSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		debug.log("[VolumeDial] onWillAppear - settings:", JSON.stringify(settings));
		
		// Restore app icon if one was previously set
		if (settings.appIcon) {
			try {
				const base64Icon = await encodeIconToBase64(settings.appIcon);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[VolumeDial] Restored app icon from settings`);
				}
			} catch (error: any) {
				debug.error(`[VolumeDial] Error restoring app icon:`, error.message);
			}
		}
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			if (isPidBased(sinkId)) {
				// Can't get volume or mute state for PID-based sinks
				await ev.action.setTitle("App");
			} else {
				const volume = await getVolume(sinkId);
				const isMuted = await getMuteState(sinkId);
				
				const title = isMuted ? `🔇 ${volume}%` : `${volume}%`;
				debug.log(`[VolumeDial] Setting title to: ${title}`);
				await ev.action.setTitle(title);
			}
		} catch (error: any) {
			debug.error("[VolumeDial] Error in onWillAppear:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Handle dial rotation to adjust volume.
	 */
	override async onDialRotate(ev: DialRotateEvent<VolumeDialSettings>): Promise<void> {
		const { settings, ticks } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		const stepSize = settings.stepSize ?? 2; // Default 2% per tick
		debug.log(`[VolumeDial] onDialRotate - ticks: ${ticks}, stepSize: ${stepSize}, controlMode: ${controlMode}`);
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			
			// Calculate volume delta based on ticks
			const volumeDelta = ticks * stepSize;
			debug.log(`[VolumeDial] Volume delta: ${volumeDelta}%`);
			
			// Use adjustVolume which handles both default and PID-based sinks
			await adjustVolume(sinkId, volumeDelta);
			
			// Update display
			if (isPidBased(sinkId)) {
				// Can't get volume for PID-based sinks
				await ev.action.setTitle("App");
			} else {
				const updatedVolume = await getVolume(sinkId);
				const isMuted = await getMuteState(sinkId);
				const title = isMuted ? `🔇 ${updatedVolume}%` : `${updatedVolume}%`;
				debug.log(`[VolumeDial] Updated title to: ${title}`);
				await ev.action.setTitle(title);
			}
		} catch (error: any) {
			debug.error("[VolumeDial] Error in onDialRotate:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Handle dial press to toggle mute.
	 */
	override async onDialDown(ev: DialDownEvent<VolumeDialSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		debug.log(`[VolumeDial] onDialDown - controlMode: ${controlMode}`);
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			await toggleMute(sinkId);
			
			// Update display
			if (isPidBased(sinkId)) {
				// Can't get volume or mute state for PID-based sinks
				await ev.action.setTitle("App");
			} else {
				const volume = await getVolume(sinkId);
				const isMuted = await getMuteState(sinkId);
				const title = isMuted ? `🔇 ${volume}%` : `${volume}%`;
				debug.log(`[VolumeDial] After mute toggle, title: ${title}`);
				await ev.action.setTitle(title);
			}
		} catch (error: any) {
			debug.error("[VolumeDial] Error in onDialDown:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Send application list when Property Inspector appears
	 */
	override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<VolumeDialSettings>): Promise<void> {
		debug.log("[VolumeDial] Property Inspector appeared, sending application list");
		try {
			const apps = await getDesktopApplications();
			await streamDeck.ui.sendToPropertyInspector({
				event: "applicationsList",
				applications: apps.map(app => ({
					name: app.name,
					icon: app.icon,
					processName: getProcessNameFromApp(app) || app.name.toLowerCase()
				}))
			});
			debug.log(`[VolumeDial] Sent ${apps.length} applications to Property Inspector`);
		} catch (error: any) {
			debug.error("[VolumeDial] Error getting applications:", error.message);
			await streamDeck.ui.sendToPropertyInspector({
				event: "applicationsListError",
				error: error.message
			});
		}
	}

	/**
	 * Handle messages from Property Inspector
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, VolumeDialSettings>): Promise<void> {
		const payload = ev.payload as any;
		debug.log("[VolumeDial] onSendToPlugin called with payload:", JSON.stringify(payload));
		
		if (payload?.event === "getApplications") {
			debug.log("[VolumeDial] Property Inspector requested application list");
			try {
				const apps = await getDesktopApplications();
				// Send response back to Property Inspector
				await streamDeck.ui.sendToPropertyInspector({
					event: "applicationsList",
					applications: apps.map(app => ({
						name: app.name,
						icon: app.icon,
						processName: getProcessNameFromApp(app) || app.name.toLowerCase()
					}))
				});
				debug.log(`[VolumeDial] Sent ${apps.length} applications to Property Inspector`);
			} catch (error: any) {
				debug.error("[VolumeDial] Error getting applications:", error.message);
				await streamDeck.ui.sendToPropertyInspector({
					event: "applicationsListError",
					error: error.message
				});
			}
		} else if (payload?.event === "setAppIcon") {
			// Store the icon path when an application is selected
			const iconPath = payload.icon as string;
			debug.log(`[VolumeDial] Setting app icon from path: ${iconPath}`);
			
			try {
				// Convert icon to base64 data URI
				const base64Icon = await encodeIconToBase64(iconPath);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[VolumeDial] Successfully set app icon`);
					
					// Also store the icon path in settings for reference
					const settings = await ev.action.getSettings();
					settings.appIcon = iconPath;
					await ev.action.setSettings(settings);
				} else {
					debug.error(`[VolumeDial] Failed to encode icon: ${iconPath}`);
				}
			} catch (error: any) {
				debug.error(`[VolumeDial] Error setting app icon:`, error.message);
			}
		}
	}
}

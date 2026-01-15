import streamDeck, { action, KeyDownEvent, PropertyInspectorDidAppearEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, setVolume, getVolume, adjustVolume, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";
import { getDesktopApplications, getProcessNameFromApp } from "../utils/desktop-apps";
import { encodeIconToBase64 } from "../utils/icon-encoder";

/**
 * Settings for SetVolume action.
 */
type SetVolumeSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
	appIcon?: string; // Icon path for the selected application
	targetVolume?: number;
};

/**
 * Action that sets volume to a specific level for system or application audio.
 */
@action({ UUID: "com.jeremy-fry.volume-knobs.set-volume" })
export class SetVolume extends SingletonAction<SetVolumeSettings> {
	/**
	 * Update the button display when it becomes visible.
	 */
	override async onWillAppear(ev: WillAppearEvent<SetVolumeSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		debug.log("[SetVolume] onWillAppear - settings:", JSON.stringify(settings));
		
		// Restore app icon if one was previously set
		if (settings.appIcon) {
			try {
				const base64Icon = await encodeIconToBase64(settings.appIcon);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[SetVolume] Restored app icon from settings`);
				}
			} catch (error: any) {
				debug.error(`[SetVolume] Error restoring app icon:`, error.message);
			}
		}
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			if (isPidBased(sinkId)) {
				// Can't get volume for PID-based sinks
				await ev.action.setTitle("App");
			} else {
				const volume = await getVolume(sinkId);
				debug.log(`[SetVolume] Setting title to: ${volume}%`);
				await ev.action.setTitle(`${volume}%`);
			}
		} catch (error: any) {
			debug.error("[SetVolume] Error in onWillAppear:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Set volume to target level when the button is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<SetVolumeSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		const targetVolume = settings.targetVolume ?? 50;
		debug.log(`[SetVolume] onKeyDown - controlMode: ${controlMode}, targetVolume: ${targetVolume}%`);
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			
			if (isPidBased(sinkId)) {
				// For PID-based sinks, we can't set absolute volume, so this action doesn't work well
				// We could calculate a delta, but that requires knowing current volume which we can't get
				debug.error("[SetVolume] Cannot set absolute volume for application-specific sinks");
				await ev.action.setTitle("N/A");
			} else {
				await setVolume(sinkId, targetVolume);
				
				// Update display
				const volume = await getVolume(sinkId);
				debug.log(`[SetVolume] After set, volume: ${volume}%`);
				await ev.action.setTitle(`${volume}%`);
			}
		} catch (error: any) {
			debug.error("[SetVolume] Error in onKeyDown:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Send application list when Property Inspector appears
	 */
	override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<SetVolumeSettings>): Promise<void> {
		debug.log("[SetVolume] Property Inspector appeared, sending application list");
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
			debug.log(`[SetVolume] Sent ${apps.length} applications to Property Inspector`);
		} catch (error: any) {
			debug.error("[SetVolume] Error getting applications:", error.message);
			await streamDeck.ui.sendToPropertyInspector({
				event: "applicationsListError",
				error: error.message
			});
		}
	}

	/**
	 * Handle messages from Property Inspector
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<unknown, SetVolumeSettings>): Promise<void> {
		const payload = ev.payload as any;
		debug.log("[SetVolume] onSendToPlugin called with payload:", JSON.stringify(payload));
		
		if (payload?.event === "getApplications") {
			debug.log("[SetVolume] Property Inspector requested application list");
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
				debug.log(`[SetVolume] Sent ${apps.length} applications to Property Inspector`);
			} catch (error: any) {
				debug.error("[SetVolume] Error getting applications:", error.message);
				await streamDeck.ui.sendToPropertyInspector({
					event: "applicationsListError",
					error: error.message
				});
			}
		} else if (payload?.event === "setAppIcon") {
			// Store the icon path when an application is selected
			const iconPath = payload.icon as string;
			debug.log(`[SetVolume] Setting app icon from path: ${iconPath}`);
			
			try {
				// Convert icon to base64 data URI
				const base64Icon = await encodeIconToBase64(iconPath);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[SetVolume] Successfully set app icon`);
					
					// Also store the icon path in settings for reference
					const settings = await ev.action.getSettings();
					settings.appIcon = iconPath;
					await ev.action.setSettings(settings);
				} else {
					debug.error(`[SetVolume] Failed to encode icon: ${iconPath}`);
				}
			} catch (error: any) {
				debug.error(`[SetVolume] Error setting app icon:`, error.message);
			}
		}
	}
}

import streamDeck, { action, KeyDownEvent, PropertyInspectorDidAppearEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, toggleMute, getMuteState, getVolume, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";
import { getDesktopApplications, getProcessNameFromApp } from "../utils/desktop-apps";
import { encodeIconToBase64 } from "../utils/icon-encoder";

/**
 * Settings for VolumeMute action.
 */
type VolumeMuteSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
	appIcon?: string; // Icon path for the selected application
};

/**
 * Action that toggles mute state for system or application audio.
 */
@action({ UUID: "com.jeremy-fry.volume-knobs.mute" })
export class VolumeMute extends SingletonAction<VolumeMuteSettings> {
	/**
	 * Update the button display when it becomes visible.
	 */
	override async onWillAppear(ev: WillAppearEvent<VolumeMuteSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		debug.log("[VolumeMute] onWillAppear - settings:", JSON.stringify(settings));
		
		// Restore app icon if one was previously set
		if (settings.appIcon) {
			try {
				const base64Icon = await encodeIconToBase64(settings.appIcon);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[VolumeMute] Restored app icon from settings`);
				}
			} catch (error: any) {
				debug.error(`[VolumeMute] Error restoring app icon:`, error.message);
			}
		}
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			if (isPidBased(sinkId)) {
				// Can't get volume or mute state for PID-based sinks
				await ev.action.setTitle("🔇 App");
			} else {
				const isMuted = await getMuteState(sinkId);
				const volume = await getVolume(sinkId);
				
				const title = isMuted ? "🔇 MUTED" : `🔊 ${volume}%`;
				debug.log(`[VolumeMute] Setting title to: ${title}`);
				await ev.action.setTitle(title);
			}
		} catch (error: any) {
			debug.error("[VolumeMute] Error in onWillAppear:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Toggle mute when the button is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<VolumeMuteSettings>): Promise<void> {
		const { settings } = ev.payload;
		const controlMode = settings.controlMode ?? "system";
		debug.log(`[VolumeMute] onKeyDown - controlMode: ${controlMode}`);
		
		try {
			const sinkId = await getSinkId(controlMode, settings.appSinkId);
			await toggleMute(sinkId);
			
			// Update display
			if (isPidBased(sinkId)) {
				// Can't get volume or mute state for PID-based sinks
				await ev.action.setTitle("🔇 App");
			} else {
				const isMuted = await getMuteState(sinkId);
				const volume = await getVolume(sinkId);
				const title = isMuted ? "🔇 MUTED" : `🔊 ${volume}%`;
				debug.log(`[VolumeMute] After toggle, title: ${title}`);
				await ev.action.setTitle(title);
			}
		} catch (error: any) {
			debug.error("[VolumeMute] Error in onKeyDown:", error.message);
			await ev.action.setTitle(`Error: ${error.message}`);
		}
	}

	/**
	 * Send application list when Property Inspector appears
	 */
	override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<VolumeMuteSettings>): Promise<void> {
		debug.log("[VolumeMute] Property Inspector appeared, sending application list");
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
			debug.log(`[VolumeMute] Sent ${apps.length} applications to Property Inspector`);
		} catch (error: any) {
			debug.error("[VolumeMute] Error getting applications:", error.message);
			await streamDeck.ui.sendToPropertyInspector({
				event: "applicationsListError",
				error: error.message
			});
		}
	}

	/**
	 * Handle messages from Property Inspector
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, VolumeMuteSettings>): Promise<void> {
		const payload = ev.payload as any;
		debug.log("[VolumeMute] onSendToPlugin called with payload:", JSON.stringify(payload));
		
		if (payload?.event === "getApplications") {
			debug.log("[VolumeMute] Property Inspector requested application list");
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
				debug.log(`[VolumeMute] Sent ${apps.length} applications to Property Inspector`);
			} catch (error: any) {
				debug.error("[VolumeMute] Error getting applications:", error.message);
				await streamDeck.ui.sendToPropertyInspector({
					event: "applicationsListError",
					error: error.message
				});
			}
		} else if (payload?.event === "setAppIcon") {
			// Store the icon path when an application is selected
			const iconPath = payload.icon as string;
			debug.log(`[VolumeMute] Setting app icon from path: ${iconPath}`);
			
			try {
				// Convert icon to base64 data URI
				const base64Icon = await encodeIconToBase64(iconPath);
				if (base64Icon) {
					await ev.action.setImage(base64Icon);
					debug.log(`[VolumeMute] Successfully set app icon`);
					
					// Also store the icon path in settings for reference
					const settings = await ev.action.getSettings();
					settings.appIcon = iconPath;
					await ev.action.setSettings(settings);
				} else {
					debug.error(`[VolumeMute] Failed to encode icon: ${iconPath}`);
				}
			} catch (error: any) {
				debug.error(`[VolumeMute] Error setting app icon:`, error.message);
			}
		}
	}
}

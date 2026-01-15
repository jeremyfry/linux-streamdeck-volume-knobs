import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, toggleMute, getMuteState, getVolume, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";

/**
 * Settings for VolumeMute action.
 */
type VolumeMuteSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
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
}

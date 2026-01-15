import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, setVolume, getVolume, adjustVolume, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";

/**
 * Settings for SetVolume action.
 */
type SetVolumeSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
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
}

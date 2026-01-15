import { action, DialDownEvent, DialRotateEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSinkId, adjustVolume, getVolume, toggleMute, getMuteState, isPidBased } from "../utils/volume-control";
import { debug } from "../utils/debug";

/**
 * Settings for VolumeDial action.
 */
type VolumeDialSettings = {
	controlMode?: "system" | "application";
	appSinkId?: string;
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
}

import streamDeck from "@elgato/streamdeck";

import { VolumeMute } from "./actions/volume-mute";
import { VolumeDial } from "./actions/volume-dial";
import { SetVolume } from "./actions/set-volume";
import { debug } from "./utils/debug";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("trace");

// Log debug status on startup
if (debug.isEnabled()) {
	streamDeck.logger.info("[Plugin] Debug logging is ENABLED");
} else {
	streamDeck.logger.info("[Plugin] Debug logging is DISABLED (set DEBUG=true or VOLUME_KNOBS_DEBUG=true to enable)");
}

// Register all volume control actions.
streamDeck.actions.registerAction(new VolumeMute());
streamDeck.actions.registerAction(new VolumeDial());
streamDeck.actions.registerAction(new SetVolume());

// Finally, connect to the Stream Deck.
streamDeck.connect();

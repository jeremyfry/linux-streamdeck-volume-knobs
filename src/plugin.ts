import streamDeck from "@elgato/streamdeck";

import { VolumeDial } from "./actions/volume-dial";
import { debug } from "./utils/debug";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("trace");

// Log debug status on startup
if (debug.isEnabled()) {
	streamDeck.logger.info("[Plugin] Debug logging is ENABLED");
} else {
	streamDeck.logger.info("[Plugin] Debug logging is DISABLED (set DEBUG=true or VOLUME_DIALS_DEBUG=true to enable)");
}

// Register volume dial action.
streamDeck.actions.registerAction(new VolumeDial());

// Finally, connect to the Stream Deck.
streamDeck.connect();

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { debug } from "./debug";

/**
 * Read an icon file and convert it to a base64 data URI.
 * Supports PNG and SVG files.
 * 
 * @param iconPath Path to the icon file
 * @returns Base64 data URI string, or undefined if file doesn't exist or can't be read
 */
export async function encodeIconToBase64(iconPath: string | undefined): Promise<string | undefined> {
	if (!iconPath) {
		debug.log("[encodeIconToBase64] No icon path provided");
		return undefined;
	}

	// Check if file exists
	if (!existsSync(iconPath)) {
		debug.log(`[encodeIconToBase64] Icon file does not exist: ${iconPath}`);
		// Try alternative locations
		const alternatives = [
			iconPath.replace("/128x128/", "/64x64/"),
			iconPath.replace("/128x128/", "/48x48/"),
			iconPath.replace("/128x128/", "/32x32/"),
			iconPath.replace("/128x128/", "/"),
		];
		
		for (const altPath of alternatives) {
			if (existsSync(altPath)) {
				debug.log(`[encodeIconToBase64] Found icon at alternative location: ${altPath}`);
				iconPath = altPath;
				break;
			}
		}
		
		if (!existsSync(iconPath)) {
			debug.error(`[encodeIconToBase64] Icon file not found: ${iconPath}`);
			return undefined;
		}
	}

	try {
		// Read the file as a buffer
		const fileBuffer = await readFile(iconPath);
		
		// Determine MIME type based on file extension
		let mimeType: string;
		if (iconPath.endsWith(".svg")) {
			mimeType = "image/svg+xml";
		} else if (iconPath.endsWith(".png")) {
			mimeType = "image/png";
		} else if (iconPath.endsWith(".jpg") || iconPath.endsWith(".jpeg")) {
			mimeType = "image/jpeg";
		} else {
			// Default to PNG
			mimeType = "image/png";
		}
		
		// Convert to base64
		const base64 = fileBuffer.toString("base64");
		
		// Create data URI
		const dataUri = `data:${mimeType};base64,${base64}`;
		
		debug.log(`[encodeIconToBase64] Successfully encoded icon: ${iconPath} (${mimeType}, ${base64.length} bytes)`);
		return dataUri;
	} catch (error: any) {
		debug.error(`[encodeIconToBase64] Error reading icon file ${iconPath}:`, error.message);
		return undefined;
	}
}

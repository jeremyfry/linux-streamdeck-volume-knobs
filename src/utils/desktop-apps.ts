import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { debug } from "./debug";

/**
 * Desktop application information
 */
export interface DesktopApp {
	name: string;
	icon?: string;
	exec?: string;
	display: boolean;
	desktopFile: string;
}

/**
 * Parse a .desktop file and extract relevant information
 */
async function parseDesktopFile(filePath: string): Promise<DesktopApp | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const lines = content.split("\n");
		
		let name: string | undefined;
		let icon: string | undefined;
		let exec: string | undefined;
		let noDisplay: boolean | undefined;
		let inDesktopEntry = false;
		
		for (const line of lines) {
			const trimmed = line.trim();
			
			// Skip comments and empty lines
			if (trimmed.startsWith("#") || trimmed === "") {
				continue;
			}
			
			// Check if we're in [Desktop Entry] section
			if (trimmed === "[Desktop Entry]") {
				inDesktopEntry = true;
				continue;
			}
			
			// Stop if we hit another section
			if (trimmed.startsWith("[") && trimmed !== "[Desktop Entry]") {
				break;
			}
			
			// Only parse keys in [Desktop Entry] section
			if (!inDesktopEntry) {
				continue;
			}
			
			// Parse Name
			if (trimmed.startsWith("Name=")) {
				name = trimmed.substring(5).trim();
			}
			
			// Parse Icon
			if (trimmed.startsWith("Icon=")) {
				icon = trimmed.substring(5).trim();
			}
			
			// Parse Exec (for reference, might be useful)
			if (trimmed.startsWith("Exec=")) {
				exec = trimmed.substring(5).trim();
			}

			if (trimmed.startsWith("NoDisplay=")) {
				noDisplay = trimmed.includes("true");
			}
			
			// Stop if we have what we need
			if (name && icon && noDisplay !== undefined) {
				break;
			}
		}
		
		if (!name) {
			return null;
		}
		
		// Resolve icon path
		let iconPath: string | undefined;
		if (icon) {
			// If it's an absolute path, use it as-is
			if (icon.startsWith("/")) {
				iconPath = icon;
			} else {
				// Try relative path in /usr/share/icons/hicolor/128x128/apps/
				// Add .png extension if not present
				let iconName = icon;
				if (!iconName.endsWith(".png") && !iconName.endsWith(".svg")) {
					iconName = iconName + ".png";
				}
				iconPath = join("/usr/share/icons/hicolor/128x128/apps", iconName);
			}
		}
		
		return {
			name,
			icon: iconPath,
			exec,
			desktopFile: filePath,
			display: noDisplay !== true
		};
	} catch (error: any) {
		debug.error(`[parseDesktopFile] Error parsing ${filePath}:`, error.message);
		return null;
	}
}

/**
 * Get all desktop applications from /usr/share/applications
 */
export async function getDesktopApplications(): Promise<DesktopApp[]> {
	debug.log("[getDesktopApplications] Scanning /usr/share/applications");
	const applicationsDir = "/usr/share/applications";
	const apps: DesktopApp[] = [];
	
	try {
		const files = await readdir(applicationsDir);
		debug.log(`[getDesktopApplications] Found ${files.length} files in applications directory`);
		
		// Filter to only .desktop files
		const desktopFiles = files.filter(f => f.endsWith(".desktop"));
		debug.log(`[getDesktopApplications] Found ${desktopFiles.length} .desktop files`);
		
		// Parse each desktop file
		for (const file of desktopFiles) {
			const filePath = join(applicationsDir, file);
			const app = await parseDesktopFile(filePath);
			if (app && app.display) {
				apps.push(app);
			}
		}
		
		// Sort by name
		apps.sort((a, b) => a.name.localeCompare(b.name));
		
		debug.log(`[getDesktopApplications] Parsed ${apps.length} applications`);
		return apps;
	} catch (error: any) {
		debug.error("[getDesktopApplications] Error reading applications directory:", error.message);
		throw new Error(`Failed to read desktop applications: ${error.message}`);
	}
}

/**
 * Get application name from desktop file path or name
 * This is used to match the desktop app name to the process name for pidof
 */
export function getProcessNameFromApp(app: DesktopApp): string | null {
	if (!app.exec) {
		return null;
	}
	
	// Extract the command name from Exec line
	// Exec lines can be complex: "firefox %u" or "/usr/bin/firefox" or "env VAR=value firefox"
	const execParts = app.exec.split(/\s+/);
	const firstPart = execParts[0];
	
	// If it's a path, get just the filename
	if (firstPart.includes("/")) {
		return firstPart.split("/").pop() || null;
	}
	
	return firstPart;
}

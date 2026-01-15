# Volume Dials Plugin - Agent Documentation

This document provides context and decisions made during the development of the volume-dials StreamDeck plugin for Linux/OpenDeck.

## Project Overview

A StreamDeck plugin that controls system and application audio volume on Linux using WirePlumber's `wpctl` command. The plugin is designed to work with OpenDeck (Linux alternative to StreamDeck software) and supports both system-wide and per-application volume control.

## Key Decisions

### 1. Dial-Based Volume Control
- **Decision**: Use StreamDeck dial rotation for primary volume control instead of separate up/down buttons
- **Rationale**: More intuitive and efficient for volume adjustment
- **Implementation**: 
  - Single `VolumeDial` action responds to `DialRotateEvent` for volume changes
  - `DialDownEvent` toggles mute
  - Configurable step size (default 2% per tick)

### 2. Application Sink Identification
- **Decision**: Use PID-based identification for application sinks instead of sink input IDs
- **Rationale**: 
  - Sink input IDs change when applications restart
  - PIDs are more stable and can be cached
  - `wpctl` supports `--pid` flag for operations
- **Format**: `PID:12345` (e.g., `PID:1234` for process ID 1234)
- **System Sink**: Uses `@DEFAULT_AUDIO_SINK@` shortcut (simpler than parsing wpctl status)

### 3. Application Name Input
- **Decision**: Users enter application name (e.g., "firefox", "chrome") rather than sink ID
- **Rationale**: More user-friendly; plugin handles PID lookup and caching
- **Implementation**:
  - Uses `pidof` to find application PIDs
  - Matches PIDs against `wpctl status` output to find active audio clients
  - Caches valid PIDs for performance
  - Verifies cached PIDs on each use

### 4. Property Inspector Compatibility
- **Decision**: Use standard HTML form elements instead of sdpi-components
- **Rationale**: OpenDeck may not fully support sdpi-components library
- **Implementation**:
  - Standard `<select>`, `<input>`, and `<input type="range">` elements
  - Uses `connectElgatoStreamDeckSocket()` function (standard StreamDeck API)
  - WebSocket communication for settings sync
  - Dark theme styling to match StreamDeck appearance

### 5. Debug Logging
- **Decision**: Include comprehensive debug logging that can be enabled/disabled
- **Rationale**: Essential for debugging on Linux where tools may be limited
- **Implementation**:
  - Controlled by `DEBUG=true` or `VOLUME_DIALS_DEBUG=true` environment variable
  - Runtime check (not baked into build)
  - Logs all wpctl commands, sink operations, and action events
  - Uses `streamDeck.logger` and `console.log/error` for dual output

### 6. Volume Control Limitations
- **Decision**: Different handling for system vs application sinks
- **Rationale**: `wpctl get-volume` doesn't support `--pid` flag
- **Implementation**:
  - System sink: Can get/set absolute volume, get mute state
  - Application sink: Can only adjust volume incrementally, toggle mute
  - `getVolume()` and `getMuteState()` throw errors for PID-based sinks
  - `setVolume()` throws error for PID-based sinks (use `adjustVolume()` instead)

## Application Structure

```
volume-dials/
├── src/
│   ├── plugin.ts                 # Main entry point, registers actions
│   ├── actions/
│   │   ├── volume-dial.ts       # Dial-based volume control (rotation + press)
│   │   ├── volume-mute.ts        # Button-based mute toggle
│   │   └── set-volume.ts         # Button to set specific volume level
│   └── utils/
│       ├── volume-control.ts     # Core wpctl interaction functions
│       └── debug.ts              # Debug logging utility
├── com.jeremy-fry.volume-dials.sdPlugin/
│   ├── manifest.json             # Plugin configuration
│   ├── bin/
│   │   └── plugin.js             # Compiled plugin (from rollup)
│   ├── ui/                       # Property Inspector HTML files
│   │   ├── volume-dial.html
│   │   ├── volume-mute.html
│   │   └── set-volume.html
│   └── imgs/actions/             # Action icons
│       ├── volume-dial/
│       ├── volume-mute/
│       └── set-volume/
└── package.json                  # Build scripts and dependencies
```

## Action Types

### 1. Volume Dial (`com.jeremy-fry.volume-dials.volume-dial`)
- **Controller**: Encoder (dial)
- **Events**:
  - `onDialRotate`: Adjusts volume based on ticks and step size
  - `onDialDown`: Toggles mute
- **Settings**:
  - `controlMode`: "system" | "application"
  - `appSinkId`: Application name (when controlMode is "application")
  - `stepSize`: Volume change per tick (1-10%, default 2%)

### 2. Volume Mute (`com.jeremy-fry.volume-dials.mute`)
- **Controller**: Keypad (button)
- **Events**:
  - `onKeyDown`: Toggles mute
- **Settings**:
  - `controlMode`: "system" | "application"
  - `appSinkId`: Application name (when controlMode is "application")

### 3. Set Volume (`com.jeremy-fry.volume-dials.set-volume`)
- **Controller**: Keypad (button)
- **Events**:
  - `onKeyDown`: Sets volume to target level
- **Settings**:
  - `controlMode`: "system" | "application"
  - `appSinkId`: Application name (when controlMode is "application")
  - `targetVolume`: Target volume percentage (0-100)

## Volume Control Functions

### System Sink Operations
- `getDefaultSink()`: Returns `"@DEFAULT_AUDIO_SINK@"`
- `getVolume(sinkId)`: Gets current volume (0-100%)
- `setVolume(sinkId, percentage)`: Sets absolute volume
- `getMuteState(sinkId)`: Gets mute state
- `toggleMute(sinkId)`: Toggles mute
- `adjustVolume(sinkId, delta)`: Adjusts volume by delta

### Application Sink Operations
- `getApplicationSink(appName)`: Returns `"PID:12345"` format
- `adjustVolume(sinkId, delta)`: Adjusts volume incrementally (uses `0.0X+` or `0.0X-` notation)
- `toggleMute(sinkId)`: Toggles mute (uses `--pid` flag)
- **Cannot use**: `getVolume()`, `setVolume()`, `getMuteState()` (not supported by wpctl with --pid)

## wpctl Command Patterns

### System Sink
```bash
wpctl get-volume @DEFAULT_AUDIO_SINK@
wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.50
wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle
```

### Application Sink (PID-based)
```bash
wpctl set-volume --pid 1234 0.05+    # Increase by 5%
wpctl set-volume --pid 1234 0.05-    # Decrease by 5%
wpctl set-mute --pid 1234 toggle
```

## PID Caching Strategy

- **Cache Key**: Application name (user-provided)
- **Cache Value**: PID number
- **Validation**: Cached PID is verified against `wpctl status` on each use
- **Invalidation**: Cache is cleared if PID no longer appears in wpctl output
- **Lookup Process**:
  1. Check cache
  2. If cached, verify PID still valid in wpctl
  3. If not cached or invalid, use `pidof` to find PIDs
  4. Match PIDs against wpctl output to find active audio client
  5. Cache the matching PID

## Debug Logging

### Enabling Debug Mode
Set environment variable before running OpenDeck:
```bash
DEBUG=true opendeck
# or
VOLUME_DIALS_DEBUG=true opendeck
```

### What Gets Logged
- All `wpctl` command executions and outputs
- Sink ID resolution (system vs application)
- PID lookup and caching operations
- Volume operations (get, set, adjust)
- Mute operations
- All action events (dial rotate, dial press, key down, will appear)
- Settings received from Property Inspector
- Errors with full context

### Log Format
- All debug logs prefixed with `[DEBUG]`
- Context tags: `[VolumeDial]`, `[wpctl]`, `[getDefaultSink]`, etc.
- Uses both `streamDeck.logger` and `console.log/error` for visibility

## Build and Packaging

### Build Scripts
- `npm run build`: Standard build (debug disabled)
- `npm run build:debug`: Build with debug enabled (runtime check still applies)
- `npm run watch`: Watch mode for development
- `npm run watch:debug`: Watch mode with debug
- `npm run package`: Build and create zip file
- `npm run package:debug`: Build with debug and create zip

### Packaging
- Creates `volume-dials.sdPlugin.zip` in project root
- Includes: `manifest.json`, `bin/`, `imgs/`, `ui/`
- Excludes: `logs/` directory

## Platform Considerations

### OpenDeck Compatibility
- Property Inspector uses standard HTML (not sdpi-components)
- Uses `connectElgatoStreamDeckSocket()` API
- Tested on Linux with OpenDeck

### WirePlumber Requirements
- Requires `wpctl` command in PATH
- Requires WirePlumber/PipeWire running
- Uses `pidof` for application PID lookup

## Common Issues and Solutions

### Issue: Application sink not found
- **Cause**: Application not running or not using audio
- **Solution**: Ensure application is running and playing audio, check with `wpctl status`

### Issue: Cannot get volume for application
- **Cause**: `wpctl get-volume` doesn't support `--pid` flag
- **Solution**: This is expected behavior; use incremental volume adjustments instead

### Issue: Property Inspector not loading
- **Cause**: OpenDeck may not support sdpi-components
- **Solution**: Already addressed - using standard HTML forms

### Issue: Debug logs not appearing
- **Cause**: DEBUG environment variable not set
- **Solution**: Set `DEBUG=true` when launching OpenDeck

## Future Considerations

- Consider adding volume level display for application sinks (would require parsing wpctl status)
- Consider adding application name autocomplete in Property Inspector
- Consider adding volume level indicators/feedback
- May need to handle cases where multiple instances of an application are running

## Notes for AI Assistants

- The plugin uses TypeScript with ES modules
- Rollup is used for bundling
- StreamDeck SDK v3 is used
- All actions extend `SingletonAction`
- Settings are typed with TypeScript interfaces
- Error handling is comprehensive with user-friendly messages
- Debug logging is extensive but can be disabled for production

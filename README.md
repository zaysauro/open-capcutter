# CapCutter

CapCutter is a local-first video editor. Source media remains on the current device.

## Current working features

- Import local video files into a project.
- Preview and play a sequential video timeline.
- Trim clip in/out points, split clips, and remove clips.
- Persist project metadata and media blobs locally in IndexedDB.
- Save and reopen a `.capcutter.json` project file.
- Export the edited sequence as WebM locally, including source audio where supported.

## Run it as a desktop app

Install dependencies with `npm install`, then launch the native window with `npm run tauri:dev`.

Create an installer for the current operating system with `npm run tauri:build`.

Tauri 2 prerequisites: Rust toolchain; on macOS, Xcode Command Line Tools; on Windows, Microsoft C++ Build Tools and WebView2 Runtime. Build separately on macOS and Windows to produce native installers for each platform.

## Run it in a browser

Run `npm install` and `npm run dev`. Open the local address printed by Vite (normally http://127.0.0.1:5173).

Build and validate with `npm run typecheck` and `npm run build`.

## Export notes

The first export target is WebM because current Chromium browsers provide a built-in local MediaRecorder encoder. Use current Chrome or Edge for the most reliable result. MP4/H.264 export, a bundled FFmpeg engine, native audio timeline tracks, captions, and offline AI transcription are subsequent milestones.

## Privacy and project portability

There is no account, analytics, upload endpoint, or remote media processing. Video blobs remain in the browser's IndexedDB. A project JSON file contains the edit structure, not the media itself. Re-import source files if browser storage is cleared or the project is opened on another device.

## License

MIT. The original OpenCut reference is MIT-licensed; this repository's implementation is maintained separately.

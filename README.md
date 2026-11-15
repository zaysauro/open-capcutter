# CapCutter

CapCutter is a local-first video editor foundation. The current application runs locally in a browser window and keeps source media in IndexedDB on the current device.

## Current working features

- Import local video files into a project.
- Preview and play a sequential video timeline.
- Trim clip in/out points, split clips, reorder by import order, and remove clips.
- Persist project metadata and media blobs locally in the browser profile.
- Save and reopen a `.capcutter.json` project file.
- Export the edited sequence as a WebM video locally, including source audio when the browser permits Web Audio capture.

## Run it

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local address printed by Vite (normally http://127.0.0.1:5173).

Build and validate:

```bash
npm run typecheck
npm run build
npm run preview
```

## Export notes

The first export target is WebM because current Chromium browsers provide a built-in local MediaRecorder encoder. Use current Chrome or Edge for the most reliable result. MP4/H.264 export, a bundled FFmpeg engine, native desktop installers, audio timeline tracks, captions, and offline AI transcription are subsequent milestones; they are not represented as implemented.

## Privacy and project portability

There is no account, analytics, upload endpoint, or remote media processing. Video blobs remain in the browser's IndexedDB. A project JSON file contains the edit structure, not the media itself. Re-import source files if the browser storage is cleared or the project is opened on another device.

## License

MIT. The original OpenCut reference is MIT-licensed; this repository's implementation is maintained separately.

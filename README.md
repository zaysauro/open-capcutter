# CapCutter

**Local-first, offline-capable video editor.** An independent editor inspired by OpenCut and the simplicity of CapCut, designed to keep media and projects on the user's machine.

> Status: early MVP foundation. The current app supports local video import, preview, a basic timeline, trimming, splitting, project JSON export/import, and local project persistence. Final video rendering, audio mixing, desktop installers, and AI-assisted editing are not implemented yet.

## Product principles

- **Local-first:** media is read and stored locally; no account, analytics, or upload service is configured.
- **Offline target:** the app has no remote API dependency. The editor UI uses system fonts and local assets. The planned desktop package will bundle the runtime and media engine.
- **Non-destructive editing:** timeline clips reference original media and trim ranges.
- **Cross-platform:** Windows first for validation, followed by macOS and Linux.
- **Honest capabilities:** implemented, experimental, and planned features are distinguished.

## Current MVP

- Import local video files.
- Preview the selected clip.
- Basic sequential video timeline.
- Play/pause and playhead navigation.
- Set clip in/out points and split at the playhead.
- Remove clips from the timeline.
- Persist project metadata in localStorage and media blobs in IndexedDB.
- Export/import a `.capcutter.json` project structure.

## Roadmap

1. **Editing foundation:** timeline drag-and-drop, undo/redo, audio tracks, thumbnails and waveform.
2. **Rendering engine:** bundled FFmpeg/native media pipeline, export presets, progress and cancellation.
3. **Desktop packaging:** Tauri shell and installers for Windows, macOS (Apple Silicon + Intel), and Linux.
4. **Offline AI tools:** local Whisper transcription, subtitle editor, silence detection, scene segmentation and suggested vertical cuts.
5. **Creator workflow:** aspect-ratio canvas, captions, titles, transitions, filters, templates and batch export.

## Development

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run typecheck
npm run build
npm run preview
```

## Project structure

- `src/App.tsx` — editor shell and timeline interactions.
- `src/lib/project.ts` — project and clip data model.
- `src/lib/storage.ts` — IndexedDB media persistence.
- `src/styles.css` — editor interface.

## Offline and privacy notes

There is no analytics, authentication, remote API, or media upload path in this MVP. Video files are read locally and media blobs are stored in the browser's IndexedDB for the current browser profile. Browser storage can be cleared by the browser or operating system; keep source media backed up.

**The MVP does not yet render a finished MP4.** Project JSON stores the edit structure, not the actual video files. When opening a project on another browser or computer, source media must be imported again. Native desktop packaging, portable project bundles, and a bundled FFmpeg engine are future milestones.

## License

MIT. See [LICENSE](LICENSE).

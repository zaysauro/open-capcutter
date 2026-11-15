import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Clapperboard, Film, FolderOpen, Import, Layers3, Maximize2, MoreHorizontal,
  Music2, Pause, Play, Plus, Scissors, Settings2, SkipBack, SkipForward, Sparkles,
  Trash2, Upload, Volume2, WandSparkles, X,
} from "lucide-react";
import {
  clipDuration, createProject, EditorProject, formatTime, makeId, projectDuration,
  TimelineClip,
} from "./lib/project";
import { getMedia, saveMedia } from "./lib/storage";

const PROJECT_KEY = "capcutter-project-v1";

function getInitialProject(): EditorProject {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EditorProject;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.assets) && Array.isArray(parsed.clips)) return parsed;
    }
  } catch { /* Start with a clean project when local state is invalid. */ }
  return createProject("Untitled project");
}

function readDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read video metadata: ${file.name}`));
    };
    video.src = url;
  });
}

export default function App() {
  const [project, setProject] = useState<EditorProject>(getInitialProject);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [notice, setNotice] = useState("Your media stays on this device.");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const duration = useMemo(() => projectDuration(project.clips), [project.clips]);
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;

  const clipStarts = useMemo(() => {
    let cursor = 0;
    return project.clips.map((clip) => {
      const start = cursor;
      cursor += clipDuration(clip);
      return { clip, start, end: cursor };
    });
  }, [project.clips]);

  const activeEntry = clipStarts.find((entry) => playhead >= entry.start && playhead < entry.end)
    ?? (playhead >= duration && clipStarts.length ? clipStarts[clipStarts.length - 1] : clipStarts[0]);
  const activeClip = activeEntry?.clip ?? null;
  const activeUrl = activeClip ? urls[activeClip.assetId] : undefined;

  useEffect(() => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const next: Record<string, string> = {};
      for (const asset of project.assets) {
        try {
          const blob = await getMedia(asset.id);
          if (blob && !cancelled) next[asset.id] = URL.createObjectURL(blob);
        } catch { /* A missing browser blob is reported in the media bin. */ }
      }
      if (!cancelled) setUrls((current) => ({ ...current, ...next }));
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [urls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip || !activeUrl) return;
    if (video.src !== activeUrl) {
      video.src = activeUrl;
      video.load();
    }
    const localOffset = Math.max(0, playhead - (activeEntry?.start ?? 0));
    const target = Math.min(activeClip.trimEnd, activeClip.trimStart + localOffset);
    if (Math.abs(video.currentTime - target) > 0.35) video.currentTime = target;
    video.volume = volume;
  }, [activeClip?.id, activeUrl, activeEntry?.start, playhead, volume, activeClip?.trimStart, activeClip?.trimEnd]);

  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    if (!video || !activeUrl) {
      setPlaying(false);
      return;
    }
    void video.play().catch(() => setPlaying(false));
  }, [playing, activeClip?.id, activeUrl]);

  const updateProject = useCallback((updater: (current: EditorProject) => EditorProject) => {
    setProject((current) => updater(current));
  }, []);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const imported = [];
      for (const file of files) {
        if (!file.type.startsWith("video/")) continue;
        const mediaDuration = await readDuration(file);
        if (!mediaDuration) continue;
        const id = makeId();
        await saveMedia(id, file);
        const url = URL.createObjectURL(file);
        setUrls((current) => ({ ...current, [id]: url }));
        imported.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          duration: mediaDuration,
          addedAt: Date.now(),
        });
      }
      if (!imported.length) {
        setNotice("No supported video files were found.");
      } else {
        updateProject((current) => ({
          ...current,
          assets: [...current.assets, ...imported],
          clips: [
            ...current.clips,
            ...imported.map((asset) => ({
              id: makeId(),
              assetId: asset.id,
              name: asset.name,
              sourceDuration: asset.duration,
              trimStart: 0,
              trimEnd: asset.duration,
            })),
          ],
        }));
        setSelectedClipId(null);
        setNotice(`${imported.length} video(s) added to the timeline.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const removeClip = (id: string) => {
    updateProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== id) }));
    if (selectedClipId === id) setSelectedClipId(null);
    setNotice("Clip removed from timeline. Source media remains in the project bin.");
  };

  const setTrim = (field: "trimStart" | "trimEnd", value: number) => {
    if (!selectedClip) return;
    updateProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => {
        if (clip.id !== selectedClip.id) return clip;
        const next = { ...clip, [field]: value };
        if (next.trimEnd - next.trimStart < 0.15) return clip;
        return next;
      }),
    }));
  };

  const splitAtPlayhead = () => {
    if (!selectedClip || !activeEntry || selectedClip.id !== activeClip?.id) {
      setNotice("Select the clip under the playhead before splitting.");
      return;
    }
    const sourceTime = selectedClip.trimStart + (playhead - activeEntry.start);
    if (sourceTime <= selectedClip.trimStart + 0.1 || sourceTime >= selectedClip.trimEnd - 0.1) {
      setNotice("Move the playhead inside the selected clip to split it.");
      return;
    }
    const first: TimelineClip = { ...selectedClip, trimEnd: sourceTime };
    const second: TimelineClip = { ...selectedClip, id: makeId(), name: `${selectedClip.name} (split)`, trimStart: sourceTime };
    updateProject((current) => {
      const index = current.clips.findIndex((clip) => clip.id === selectedClip.id);
      const clips = [...current.clips];
      clips.splice(index, 1, first, second);
      return { ...current, clips };
    });
    setSelectedClipId(second.id);
    setNotice("Clip split at playhead.");
  };

  const seek = (time: number) => {
    setPlayhead(Math.max(0, Math.min(duration, time)));
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !activeEntry || !activeClip) return;
    const local = Math.max(0, video.currentTime - activeClip.trimStart);
    setPlayhead(Math.min(duration, activeEntry.start + local));
    if (video.currentTime >= activeClip.trimEnd - 0.04) {
      const next = clipStarts.find((entry) => entry.start >= activeEntry.end - 0.01);
      if (next) {
        setPlayhead(next.start);
        setSelectedClipId(next.clip.id);
      } else {
        setPlaying(false);
      }
    }
  };

  const saveProjectFile = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "-")}.capcutter.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Project structure exported. Media files remain stored locally in this browser.");
  };

  const loadProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as EditorProject;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.assets) || !Array.isArray(parsed.clips)) {
        throw new Error("This is not a supported CapCutter project file.");
      }
      setProject(parsed);
      setSelectedClipId(parsed.clips[0]?.id ?? null);
      setPlayhead(0);
      setNotice("Project structure loaded. Previously imported media must still exist in this browser's local storage.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open project.");
    }
  };

  const formatBytes = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Clapperboard size={19} /></div><span>cap<span>cutter</span></span><em>LOCAL EDITOR</em></div>
        <div className="project-title"><span className="status-dot" /><input aria-label="Project name" value={project.name} onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))} /></div>
        <div className="top-actions">
          <button className="quiet-button" onClick={() => setShowSettings((value) => !value)}><Settings2 size={16} /> Settings</button>
          <button className="outline-button" onClick={loadProjectFile}><FolderOpen size={16} /> Open project</button>
          <button className="primary-button" onClick={saveProjectFile}><Import size={16} /> Save project</button>
          <input className="hidden-input" type="file" accept=".json,.capcutter.json,application/json" onChange={loadProjectFile} id="project-open" />
        </div>
      </header>

      {showSettings && <div className="settings-popover"><strong>Local workspace</strong><p>Media is stored in this browser profile using IndexedDB. No cloud account or upload is configured.</p><button onClick={() => setShowSettings(false)}>Close</button></div>}

      <section className="workspace">
        <aside className="media-panel">
          <div className="panel-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Media library</h2></div><button className="icon-button" onClick={() => fileInput.current?.click()} title="Import media"><Plus size={18} /></button></div>
          <div className="media-tabs"><button className="active"><Film size={15} /> Media <span>{project.assets.length}</span></button><button><Music2 size={15} /> Audio</button></div>
          <button className="import-card" onClick={() => fileInput.current?.click()} disabled={busy}>
            <div className="upload-icon"><Upload size={19} /></div><strong>{busy ? "Importing media…" : "Import media"}</strong><span>Video files · stored locally</span>
          </button>
          <input ref={fileInput} className="hidden-input" type="file" accept="video/*" multiple onChange={importFiles} />
          <div className="asset-list">
            {project.assets.length === 0 ? <div className="empty-library"><div className="empty-icon"><Layers3 size={22} /></div><strong>Your library is empty</strong><p>Import a video to start editing. Your original files are never modified.</p></div> :
              project.assets.map((asset) => (
                <button className="asset-row" key={asset.id} onClick={() => {
                  const clip = project.clips.find((item) => item.assetId === asset.id);
                  if (clip) { setSelectedClipId(clip.id); const entry = clipStarts.find((item) => item.clip.id === clip.id); if (entry) seek(entry.start); }
                }}>
                  <div className="asset-thumb"><Film size={17} /></div><div className="asset-meta"><strong title={asset.name}>{asset.name}</strong><span>{formatTime(asset.duration)} · {formatBytes(asset.size)}</span></div><MoreHorizontal size={16} className="muted" />
                </button>
              ))}
          </div>
          <div className="storage-note"><span className="privacy-icon">●</span><span>Private by design<br /><b>Files stay on this device</b></span></div>
        </aside>

        <section className="preview-area">
          <div className="preview-toolbar"><div><span className="eyebrow">CANVAS</span><strong>Preview</strong></div><div className="preview-tools"><span className="resolution-tag">ORIGINAL</span><button className="icon-button" title="Fit preview"><Maximize2 size={16} /></button></div></div>
          <div className="preview-stage">
            {activeClip && activeUrl ? <video ref={videoRef} onTimeUpdate={handleTimeUpdate} onEnded={() => setPlaying(false)} playsInline /> :
              <div className="preview-empty"><div className="preview-logo"><Clapperboard size={30} /></div><h3>Your story starts here</h3><p>Import a video to see it on the canvas.</p><button className="primary-button" onClick={() => fileInput.current?.click()}><Plus size={16} /> Add your first video</button></div>}
            {activeClip && !activeUrl && <div className="missing-media">Media file not found in local storage. Re-import the source video.</div>}
          </div>
          <div className="transport">
            <div className="transport-left"><button className="icon-button" onClick={() => seek(0)} title="Go to start"><SkipBack size={17} /></button><button className="play-button" onClick={() => { if (playhead >= duration) seek(0); setPlaying((value) => !value); }} title={playing ? "Pause" : "Play"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="icon-button" onClick={() => seek(duration)} title="Go to end"><SkipForward size={17} /></button></div>
            <div className="time-readout"><b>{formatTime(playhead)}</b><span>/</span>{formatTime(duration)}</div>
            <div className="volume-control"><Volume2 size={16} /><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></div>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-heading"><div><span className="eyebrow">PROPERTIES</span><h2>Inspector</h2></div><WandSparkles size={17} className="muted" /></div>
          {selectedClip ? <div className="inspector-content">
            <div className="inspector-file"><div className="inspector-file-icon"><Film size={18} /></div><div><strong>{selectedClip.name}</strong><span>Video clip</span></div></div>
            <div className="property-block"><label>TRIM START <b>{formatTime(selectedClip.trimStart)}</b></label><input type="range" min="0" max={Math.max(0, selectedClip.trimEnd - 0.15)} step="0.05" value={selectedClip.trimStart} onChange={(e) => setTrim("trimStart", Number(e.target.value))} /></div>
            <div className="property-block"><label>TRIM END <b>{formatTime(selectedClip.trimEnd)}</b></label><input type="range" min={Math.min(selectedClip.sourceDuration, selectedClip.trimStart + 0.15)} max={selectedClip.sourceDuration} step="0.05" value={selectedClip.trimEnd} onChange={(e) => setTrim("trimEnd", Number(e.target.value))} /></div>
            <div className="duration-card"><span>CLIP DURATION</span><strong>{formatTime(clipDuration(selectedClip))}</strong></div>
            <button className="danger-button" onClick={() => removeClip(selectedClip.id)}><Trash2 size={15} /> Remove from timeline</button>
          </div> : <div className="inspector-empty"><Settings2 size={23} /><strong>Nothing selected</strong><p>Select a clip on the timeline to adjust its properties.</p></div>}
          <div className="ai-card"><div className="ai-card-head"><Sparkles size={15} /><span>AI TOOLS</span><em>COMING SOON</em></div><strong>Make editing effortless</strong><p>Local transcription, silence detection and smart cuts are planned. No cloud AI required.</p></div>
        </aside>
      </section>

      <section className="timeline-panel">
        <div className="timeline-header"><div className="timeline-title"><span className="eyebrow">SEQUENCE</span><h2>Timeline <small>{project.clips.length} clips</small></h2></div><div className="timeline-actions"><button className="tool-button" onClick={splitAtPlayhead} disabled={!selectedClip}><Scissors size={15} /> Split</button><button className="tool-button" onClick={() => fileInput.current?.click()}><Plus size={15} /> Add clip</button></div></div>
        <div className="timeline-ruler">
          <div className="track-label ruler-label">TIME</div>
          <div className="ruler-content" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const ratio = (e.clientX - rect.left) / rect.width; seek(Math.max(0, Math.min(duration, ratio * Math.max(duration, 1)))); }}>
            {Array.from({ length: Math.max(6, Math.ceil(duration / 5) + 1) }, (_, i) => <span key={i} style={{ left: `${duration ? (i * 5 / duration) * 100 : i * 10}%` }}>{formatTime(i * 5).slice(0, 5)}</span>)}
          </div>
        </div>
        <div className="timeline-scroll">
          <div className="track-row">
            <div className="track-label"><Film size={15} /><span>VIDEO 1</span></div>
            <div className="track-content">
              <div className="playhead" style={{ left: `${duration ? (playhead / duration) * 100 : 0}%` }}><div /></div>
              {clipStarts.map(({ clip, start }) => {
                const width = duration ? (clipDuration(clip) / duration) * 100 : 0;
                const left = duration ? (start / duration) * 100 : 0;
                return <button key={clip.id} className={`timeline-clip ${selectedClipId === clip.id ? "selected" : ""}`} style={{ left: `${left}%`, width: `${width}%` }} onClick={() => { setSelectedClipId(clip.id); seek(start); }} title={clip.name}>
                  <div className="clip-filmstrip"><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="clip-caption"><Film size={12} />{clip.name}</div>
                </button>;
              })}
              {project.clips.length === 0 && <div className="track-empty">Import media to add clips to your timeline</div>}
            </div>
          </div>
          <div className="track-row audio-row"><div className="track-label"><AudioLines size={15} /><span>AUDIO</span></div><div className="track-content"><div className="track-empty">Audio tracks are part of the next editing milestone</div></div></div>
        </div>
        <div className="timeline-footer"><span>{notice}</span><span>{formatTime(duration)} total duration</span></div>
      </section>
      <footer className="app-footer"><span><span className="footer-dot" /> LOCAL MODE</span><span>CAPCUTTER 0.1.0 · NO CLOUD · NO UPLOADS</span></footer>
    </main>
  );
}

export type TimelineClip = {
  id: string;
  assetId: string;
  name: string;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
};

export type MediaAsset = {
  id: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  addedAt: number;
};

export type EditorProject = {
  schemaVersion: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  assets: MediaAsset[];
  clips: TimelineClip[];
};

export const createProject = (name = "Untitled project"): EditorProject => {
  const now = Date.now();
  return { schemaVersion: 1, name, createdAt: now, updatedAt: now, assets: [], clips: [] };
};

export const clipDuration = (clip: TimelineClip) => Math.max(0, clip.trimEnd - clip.trimStart);

export const projectDuration = (clips: TimelineClip[]) =>
  clips.reduce((total, clip) => total + clipDuration(clip), 0);

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;

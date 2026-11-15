import type { EditorProject, TimelineClip } from "./project";
import { getMedia } from "./storage";

type Progress = (message: string) => void;

const waitFor = (target: EventTarget, eventName: string) =>
  new Promise<void>((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("The source video could not be decoded.")); };
    const cleanup = () => {
      target.removeEventListener(eventName, onDone);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onDone, { once: true });
    target.addEventListener("error", onError, { once: true });
  });

const seekTo = async (video: HTMLVideoElement, time: number) => {
  if (Math.abs(video.currentTime - time) < 0.04) return;
  const ready = waitFor(video, "seeked");
  video.currentTime = time;
  await ready;
};

export async function exportTimelineWebM(project: EditorProject, onProgress: Progress = () => {}) {
  if (!project.clips.length) throw new Error("Add at least one clip before exporting.");
  if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("This browser does not support local video recording. Use the latest Chrome or Edge.");
  }

  const mediaById = new Map<string, Blob>();
  for (const asset of project.assets) {
    const blob = await getMedia(asset.id);
    if (blob) mediaById.set(asset.id, blob);
  }

  const firstClip = project.clips[0];
  const firstBlob = mediaById.get(firstClip.assetId);
  if (!firstBlob) throw new Error("A source file is missing. Re-import the missing video and try again.");

  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.left = "-10000px";
  document.body.appendChild(video);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) { video.remove(); throw new Error("Could not create the export canvas."); }

  const firstUrl = URL.createObjectURL(firstBlob);
  video.src = firstUrl;
  await waitFor(video, "loadedmetadata");
  const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight);
  canvas.width = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2);
  canvas.height = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2);

  const canvasStream = canvas.captureStream(30);
  let audioContext: AudioContext | undefined;
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  try {
    audioContext = new AudioContext();
    audioDestination = audioContext.createMediaStreamDestination();
    source = audioContext.createMediaElementSource(video);
    source.connect(audioDestination);
    source.connect(audioContext.destination);
    await audioContext.resume();
  } catch {
    // Video-only export remains available if Web Audio is blocked.
  }

  const tracks = [...canvasStream.getVideoTracks(), ...(audioDestination?.stream.getAudioTracks() ?? [])];
  const stream = new MediaStream(tracks);
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
    URL.revokeObjectURL(firstUrl);
    throw new Error("This browser has no supported WebM encoder.");
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The video encoder stopped unexpectedly."));
  });

  const drawFrame = () => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  };

  try {
    recorder.start(250);
    for (let index = 0; index < project.clips.length; index += 1) {
      const clip: TimelineClip = project.clips[index];
      const blob = mediaById.get(clip.assetId);
      if (!blob) throw new Error(`Missing source media: ${clip.name}. Re-import it before exporting.`);
      onProgress(`Exporting clip ${index + 1} of ${project.clips.length}: ${clip.name}`);
      const url = URL.createObjectURL(blob);
      video.pause();
      video.src = url;
      video.load();
      await waitFor(video, "loadedmetadata");
      await seekTo(video, clip.trimStart);
      drawFrame();
      await video.play();

      await new Promise<void>((resolve, reject) => {
        let raf = 0;
        const tick = () => {
          drawFrame();
          if (video.currentTime >= clip.trimEnd || video.ended) {
            cancelAnimationFrame(raf);
            video.pause();
            resolve();
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        video.onerror = () => { cancelAnimationFrame(raf); reject(new Error(`Could not export ${clip.name}.`)); };
        raf = requestAnimationFrame(tick);
      });
      URL.revokeObjectURL(url);
    }
    recorder.stop();
    await stopped;
    const output = new Blob(chunks, { type: "video/webm" });
    if (!output.size) throw new Error("The export produced an empty file.");
    const downloadUrl = URL.createObjectURL(output);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "-") || "capcutter-project"}.webm`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    await stopped.catch(() => undefined);
    throw error;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    canvasStream.getTracks().forEach((track) => track.stop());
    audioContext?.close();
    URL.revokeObjectURL(firstUrl);
  }
}

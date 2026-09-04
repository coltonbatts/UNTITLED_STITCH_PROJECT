// Glue between store, worker, and persistence. The only place side effects
// (decoding, worker messages, IndexedDB) are triggered.
import { decodeImageFile } from '@/engine/image/decode';
import { croppedSourceSize } from '@/engine/image/physical';
import type { Project } from '@/engine/types';
import { EngineClient } from './workerClient';
import { getState, setState, subscribe, updateProject, newProject } from './store';
import { loadLastProject, saveImage, saveProject } from './persistence';

export const engine = new EngineClient();

engine.onResult = (result) => setState({ result, status: 'idle', stage: null, error: null });
engine.onProgress = (stage) => setState({ stage });
engine.onError = (message) => {
  // The worker lost its source (e.g. it was restarted): resend and retry once.
  const s = getState();
  if (/Source image not loaded/.test(message) && s.project.source && s.sourceRaster) {
    engine.setSource(s.project.source.id, s.sourceRaster);
    lastRunKey = '';
    scheduleRun();
    return;
  }
  setState({ status: 'error', error: message, stage: null });
};

let lastRunKey = '';
function scheduleRun(): void {
  const s = getState();
  if (!s.project.source || !s.sourceRaster) return;
  const { crop, dimensions, settings, paletteEdits } = s.project;
  const key = JSON.stringify([s.project.source.id, crop, dimensions, settings, paletteEdits]);
  if (key === lastRunKey) return;
  lastRunKey = key;
  setState({ status: 'running' });
  engine.run({ sourceId: s.project.source.id, crop, dimensions, settings, paletteEdits });
}

let saveTimer: number | undefined;
let lastSavedRevision = -1;
function scheduleSave(): void {
  const s = getState();
  if (s.revision === lastSavedRevision) return;
  lastSavedRevision = s.revision;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveProject(getState().project); }, 400);
}

subscribe(() => { scheduleRun(); scheduleSave(); });

export async function importImageFile(file: File): Promise<void> {
  const decoded = await decodeImageFile(file);
  const sourceId = `img_${Date.now()}`;
  const prev = getState().project;
  const fresh = newProject();
  const aspect = decoded.width / decoded.height;
  const widthMm = prev.dimensions.widthMm;
  const project: Project = {
    ...fresh,
    name: file.name.replace(/\.[^.]+$/, '') || 'Untitled',
    source: { id: sourceId, fileName: file.name, mimeType: file.type, width: decoded.width, height: decoded.height },
    dimensions: { ...prev.dimensions, widthMm, heightMm: Math.round((widthMm / aspect) * 10) / 10 },
  };
  engine.setSource(sourceId, decoded);
  lastRunKey = '';
  setState({ project, sourceRaster: { width: decoded.width, height: decoded.height, rgba: decoded.rgba }, result: null, status: 'running', past: [], future: [], revision: getState().revision + 1, view: { ...getState().view, selectedThread: null, hoverRegion: null } });
  await saveImage(sourceId, file);
  await saveProject(project);
}

export async function restoreLastSession(): Promise<boolean> {
  const last = await loadLastProject();
  if (!last || !last.project.source || !last.image) return false;
  const decoded = await decodeImageFile(last.image);
  engine.setSource(last.project.source.id, decoded);
  lastRunKey = '';
  setState({ project: last.project, sourceRaster: { width: decoded.width, height: decoded.height, rgba: decoded.rgba }, status: 'running', revision: getState().revision + 1 });
  return true;
}

/** Rotates the crop by a quarter turn and swaps physical dimensions to match. */
export function rotate(delta: 90 | -90): void {
  const p = getState().project;
  if (!p.source) return;
  const rotation = (((p.crop.rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
  const crop = { ...p.crop, rotation };
  const size = croppedSourceSize(p.source.width, p.source.height, crop);
  const aspect = size.width / size.height;
  const widthMm = Math.max(p.dimensions.widthMm, p.dimensions.heightMm) * (aspect >= 1 ? 1 : aspect);
  updateProject({ crop, dimensions: { ...p.dimensions, widthMm: Math.round(widthMm * 10) / 10, heightMm: Math.round((widthMm / aspect) * 10) / 10 } });
}

// Development aid: inspect state and timings from the browser console.
if (import.meta.env.DEV) (window as unknown as { __np: unknown }).__np = { getState };

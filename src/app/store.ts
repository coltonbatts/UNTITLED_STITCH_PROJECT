// Single application store with an undo stack for the artist's decisions.
// No dependency: useSyncExternalStore over one immutable state object.
import { useSyncExternalStore } from 'react';
import type { CropRect, EmbroideryDimensions, PaletteEdits, PipelineResult, ProcessingSettings, Project, RasterRGBA } from '@/engine/types';
import { DEFAULT_DIMENSIONS, DEFAULT_SETTINGS, presetSettings } from '@/engine/embroidery/params';
import type { Preset } from '@/engine/types';

export type ViewMode = 'original' | 'threads' | 'regions' | 'pattern';

export interface ViewState {
  mode: ViewMode;
  showLabels: boolean;
  showHoop: boolean;
  tintRegions: boolean;
  compare: boolean;
  selectedThread: string | null; // generated DMC number
  hoverRegion: number | null;
}

/** The undoable part of the project. */
export interface Snapshot {
  name: string;
  crop: CropRect;
  dimensions: EmbroideryDimensions;
  settings: ProcessingSettings;
  paletteEdits: PaletteEdits;
}

export interface AppState {
  project: Project;
  sourceRaster: RasterRGBA | null;
  result: PipelineResult | null;
  status: 'empty' | 'idle' | 'running' | 'error';
  stage: string | null;
  error: string | null;
  view: ViewState;
  past: Snapshot[];
  future: Snapshot[];
  /** Incremented on every committed (undoable) change; persistence listens to it. */
  revision: number;
}

export function newProject(): Project {
  const now = new Date().toISOString();
  return {
    id: `p_${now.replace(/\D/g, '').slice(0, 14)}_${Math.floor(Math.random() * 1e6)}`,
    name: 'Untitled',
    createdAt: now,
    updatedAt: now,
    source: null,
    crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
    dimensions: { ...DEFAULT_DIMENSIONS },
    settings: { ...DEFAULT_SETTINGS },
    paletteEdits: { locked: [], replacements: {}, merges: {} },
  };
}

const initial: AppState = {
  project: newProject(),
  sourceRaster: null,
  result: null,
  status: 'empty',
  stage: null,
  error: null,
  view: { mode: 'regions', showLabels: true, showHoop: true, tintRegions: true, compare: false, selectedThread: null, hoverRegion: null },
  past: [],
  future: [],
  revision: 0,
};

let state: AppState = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getState(): AppState { return state; }
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}
export function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
export function useAppState(): AppState { return useSyncExternalStore(subscribe, getState, getState); }

const snapshot = (p: Project): Snapshot => ({ name: p.name, crop: p.crop, dimensions: p.dimensions, settings: p.settings, paletteEdits: p.paletteEdits });
const MAX_HISTORY = 100;

/** Pending transient edit (slider drag) that has not been committed to history yet. */
let transientBase: Snapshot | null = null;

/**
 * Applies an undoable change to the project. `transient` changes (mid-drag)
 * update the project without touching history; the first transient change
 * records the pre-drag snapshot and `commit()` pushes it.
 */
export function updateProject(patch: Partial<Snapshot>, opts: { transient?: boolean } = {}): void {
  const before = snapshot(state.project);
  if (opts.transient) {
    transientBase ??= before;
    setState({ project: { ...state.project, ...patch, updatedAt: new Date().toISOString() } });
    return;
  }
  const base = transientBase ?? before;
  transientBase = null;
  setState({
    project: { ...state.project, ...patch, updatedAt: new Date().toISOString() },
    past: [...state.past.slice(-MAX_HISTORY + 1), base],
    future: [],
    revision: state.revision + 1,
  });
}
export function commitTransient(): void {
  if (!transientBase) return;
  const base = transientBase;
  transientBase = null;
  setState({ past: [...state.past.slice(-MAX_HISTORY + 1), base], future: [], revision: state.revision + 1 });
}
export function undo(): void {
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  setState({ project: { ...state.project, ...prev }, past: state.past.slice(0, -1), future: [snapshot(state.project), ...state.future], revision: state.revision + 1 });
}
export function redo(): void {
  const next = state.future[0];
  if (!next) return;
  setState({ project: { ...state.project, ...next }, past: [...state.past, snapshot(state.project)], future: state.future.slice(1), revision: state.revision + 1 });
}
export function setView(patch: Partial<ViewState>): void {
  setState({ view: { ...state.view, ...patch } });
}
export function updateSettings(patch: Partial<ProcessingSettings>, opts?: { transient?: boolean }): void {
  updateProject({ settings: { ...state.project.settings, ...patch, preset: 'custom' } }, opts);
}
/** Presets set the artist-facing controls; what they mean to the engine lives in params.ts. */
export function applyPreset(preset: Preset): void {
  updateProject({ settings: presetSettings(state.project.settings, preset) });
}
export function updateDimensions(patch: Partial<EmbroideryDimensions>, opts?: { transient?: boolean }): void {
  updateProject({ dimensions: { ...state.project.dimensions, ...patch } }, opts);
}
export function updatePaletteEdits(fn: (e: PaletteEdits) => PaletteEdits): void {
  updateProject({ paletteEdits: fn(state.project.paletteEdits) });
}

/// <reference lib="webworker" />
import { Pipeline, type PipelineRequest } from './pipeline';
import { getDmcLibrary } from './threads/dmc';
import type { PipelineResult, RasterRGBA } from './types';

export type WorkerIn =
  | { type: 'setSource'; sourceId: string; source: RasterRGBA }
  | { type: 'run'; requestId: number; request: Omit<PipelineRequest, 'source'> };

export type WorkerOut =
  | { type: 'progress'; requestId: number; stage: string }
  | { type: 'result'; requestId: number; result: PipelineResult }
  | { type: 'error'; requestId: number; message: string };

const sources = new Map<string, RasterRGBA>();
let pipeline: Pipeline | null = null;

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'setSource') {
    sources.clear();
    sources.set(msg.sourceId, msg.source);
    return;
  }
  const post = (m: WorkerOut, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);
  try {
    const source = sources.get(msg.request.sourceId);
    if (!source) throw new Error('Source image not loaded in worker');
    pipeline ??= new Pipeline(getDmcLibrary());
    const result = pipeline.run({ ...msg.request, source }, (stage) => post({ type: 'progress', requestId: msg.requestId, stage }));
    // Copy typed arrays so the cache keeps its own buffers.
    const out: PipelineResult = {
      ...result,
      working: { ...result.working, rgba: result.working.rgba.slice() },
      rawLabelMap: { ...result.rawLabelMap, labels: result.rawLabelMap.labels.slice() },
      labelMap: { ...result.labelMap, labels: result.labelMap.labels.slice() },
      graph: { ...result.graph, regionMap: result.graph.regionMap.slice() },
    };
    post({ type: 'result', requestId: msg.requestId, result: out }, [out.working.rgba.buffer, out.rawLabelMap.labels.buffer, out.labelMap.labels.buffer, out.graph.regionMap.buffer]);
  } catch (e) {
    post({ type: 'error', requestId: msg.requestId, message: e instanceof Error ? e.message : String(e) });
  }
};

// Main-thread side of the engine worker. Coalesces requests: at most one in
// flight, the newest waiting one replaces older waiting ones.
import type { PipelineRequest } from '@/engine/pipeline';
import type { PipelineResult, RasterRGBA } from '@/engine/types';
import type { WorkerIn, WorkerOut } from '@/engine/worker';

type Request = Omit<PipelineRequest, 'source'>;

export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private inFlight: number | null = null;
  private pending: Request | null = null;
  onResult: (r: PipelineResult) => void = () => {};
  onProgress: (stage: string) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.requestId !== this.inFlight) return; // stale
      if (m.type === 'progress') { this.onProgress(m.stage); return; }
      this.inFlight = null;
      if (m.type === 'result') this.onResult(m.result); else this.onError(m.message);
      if (this.pending) { const p = this.pending; this.pending = null; this.run(p); }
    };
    this.worker.onerror = (e) => { this.inFlight = null; this.onError(e.message); };
  }

  setSource(sourceId: string, source: RasterRGBA): void {
    const copy = source.rgba.slice();
    const msg: WorkerIn = { type: 'setSource', sourceId, source: { width: source.width, height: source.height, rgba: copy } };
    this.worker.postMessage(msg, [copy.buffer]);
  }

  run(request: Request): void {
    if (this.inFlight !== null) { this.pending = request; return; }
    const requestId = this.nextId++;
    this.inFlight = requestId;
    const msg: WorkerIn = { type: 'run', requestId, request };
    this.worker.postMessage(msg);
  }

  get busy(): boolean { return this.inFlight !== null; }
}

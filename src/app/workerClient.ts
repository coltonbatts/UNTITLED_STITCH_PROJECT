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
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.requestId !== this.inFlight) return; // stale
      if (m.type === 'progress') { this.onProgress(m.stage); return; }
      this.inFlight = null;
      if (m.type === 'result') this.onResult(m.result); else this.onError(m.message);
      this.runPending();
    };
    // A message that cannot be deserialised would otherwise leave the request in flight forever.
    worker.onmessageerror = () => this.fail('Could not read the result from the engine');
    // An uncaught error may have left the worker dead: replace it. The new one has no source
    // image; the controller resends it when a run reports "Source image not loaded".
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate();
      this.worker = this.spawn();
      this.fail(e.message || 'The engine stopped unexpectedly');
    };
    return worker;
  }

  private fail(message: string): void {
    this.inFlight = null;
    this.onError(message);
    this.runPending();
  }

  private runPending(): void {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    this.run(p);
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

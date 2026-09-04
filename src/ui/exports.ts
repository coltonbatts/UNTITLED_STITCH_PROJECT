import type { PipelineResult, ThreadColor } from '@/engine/types';
import { paintLabels } from './viewModel';

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/** Raster export of the thread approximation or cleaned regions at 2× working resolution. */
export async function exportPng(result: PipelineResult, threads: ThreadColor[], which: 'threads' | 'regions', filename: string): Promise<void> {
  const map = which === 'threads' ? result.rawLabelMap : result.labelMap;
  const { width, height } = map;
  const src = document.createElement('canvas');
  src.width = width; src.height = height;
  const sctx = src.getContext('2d')!;
  const img = sctx.createImageData(width, height);
  paintLabels(map.labels, threads, img.data);
  sctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = width * 2; out.height = height * 2;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  if (blob) downloadBlob(blob, filename);
}

/** Opens the pattern in a print-ready window; the browser's print dialog produces the PDF. */
export function printSvg(svg: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>@page{margin:10mm}html,body{margin:0;background:#fff}svg{max-width:100%;height:auto;display:block}</style></head><body>${svg}<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`);
  w.document.close();
}

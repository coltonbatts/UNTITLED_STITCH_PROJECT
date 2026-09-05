import { readFileSync } from 'node:fs';
import { Pipeline } from '@/engine/pipeline';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { DEFAULT_SETTINGS } from '@/engine/embroidery/params';
import type { RasterRGBA, ProcessingSettings } from '@/engine/types';

function readBmp(path: string): RasterRGBA {
  const b = readFileSync(path);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), hRaw = b.readInt32LE(22), bpp = b.readUInt16LE(28);
  const h = Math.abs(hRaw), topDown = hRaw < 0;
  const row = Math.floor((w * bpp + 31) / 32) * 4;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const p = off + sy * row + x * (bpp / 8), o = (y * w + x) * 4;
      rgba[o] = b[p + 2]; rgba[o + 1] = b[p + 1]; rgba[o + 2] = b[p]; rgba[o + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}
const src = readBmp(process.argv[2]);
const over: Partial<ProcessingSettings> = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const widthMm = 150, heightMm = Math.round((widthMm / (src.width / src.height)) * 10) / 10;
const p = new Pipeline(getDmcLibrary());
const res = p.run({ sourceId: 'r', source: src, crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, dimensions: { widthMm, heightMm, strands: 1 },
  settings: { ...DEFAULT_SETTINGS, ...over }, paletteEdits: { locked: [], replacements: {}, merges: {} } });
console.log('regions', res.graph.regions.length, 'lines', (res as any).lines?.strokes?.length ?? 0);
// Mean assignment error: how far each stitched pixel is from its thread, in OKLab, for the raw and cleaned maps.
import { buildWorkingImage } from '@/engine/image/working';
import { workingResolution } from '@/engine/image/physical';
import { cropRotate, resample } from '@/engine/image/resample';
const r = workingResolution({ widthMm, heightMm, strands: 1 }, 4);
const w = buildWorkingImage(resample(cropRotate(src, { x: 0, y: 0, w: 1, h: 1, rotation: 0 }), r.width, r.height), r.mmPerPx, 0);
const err = (labels: Uint16Array) => { let s = 0, n = 0; for (let i = 0; i < labels.length; i++) { const l = labels[i]; if (l >= res.palette.entries.length) continue; const t = res.palette.entries[l].thread.oklab; s += Math.hypot(w.oklab[i*3]-t[0], w.oklab[i*3+1]-t[1], w.oklab[i*3+2]-t[2]); n++; } return (s / n).toFixed(4); };
console.log('meanDE raw', err(res.rawLabelMap.labels), 'clean', err(res.labelMap.labels));
for (const l of (res as any).lines?.strokes ?? []) console.log('  line', l.source, l.thread.number, 'w', l.widthMm.toFixed(2), 'len', l.lengthMm.toFixed(1), 'at', JSON.stringify(l.paths[0][0]));
console.log('palette', res.palette.entries.map((e) => e.thread.number).join(' '));
console.log('labels', res.pattern.labels.filter((l) => l.tier === 'leader').length, 'leaders /', res.pattern.labels.length);
console.log('timings', JSON.stringify(res.timingsMs));

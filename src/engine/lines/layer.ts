// Gives detected strokes a thread, a physical width, and a suggested stitch.
import type { LineLayer, LineStitch, LineStroke, RawStroke, StrandCount, ThreadLibrary, ThreadPalette } from '../types';
import { nearestThread } from '../threads/match';
import { STITCH_WIDTH_MM } from '../embroidery/params';

/**
 * A stroke colour this close to a palette thread reuses it. Generous on
 * purpose: a thin stroke's colour is always pulled toward its ground by
 * anti-aliasing, and a line legend full of near-greys helps nobody.
 */
const SNAP_DELTA_E = 0.2;

export function resolveStrokes(raw: RawStroke[], library: ThreadLibrary, palette: ThreadPalette, mmPerPx: number, strands: StrandCount): LineLayer {
  const stitchWidth = STITCH_WIDTH_MM[strands] ?? STITCH_WIDTH_MM[1];
  const strokes: LineStroke[] = raw.map((s, id) => {
    let thread = nearestThread(library, s.oklab);
    let best = Infinity;
    for (const e of palette.entries) {
      const dL = e.thread.oklab[0] - s.oklab[0], da = e.thread.oklab[1] - s.oklab[1], db = e.thread.oklab[2] - s.oklab[2];
      const d = Math.sqrt(dL * dL + da * da + db * db);
      if (d < best && d < SNAP_DELTA_E) { best = d; thread = e.thread; }
    }
    const widthMm = s.widthPx * mmPerPx;
    // A single row of stitches is a back stitch; anything visibly wider reads as stem stitch.
    const stitch: LineStitch = widthMm <= stitchWidth * 1.25 ? 'back' : 'stem';
    return { ...s, id, widthMm, lengthMm: s.lengthPx * mmPerPx, thread, stitch };
  });
  return { strokes };
}

import type { Point } from '../types';

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** SVG path data for a set of rings (outer + holes), intended for fill-rule evenodd. */
export function ringsToPathD(rings: Point[][], scale = 1): string {
  let d = '';
  for (const ring of rings) {
    if (ring.length < 3) continue;
    d += `M${fmt(ring[0].x * scale)} ${fmt(ring[0].y * scale)}`;
    for (let i = 1; i < ring.length; i++) d += `L${fmt(ring[i].x * scale)} ${fmt(ring[i].y * scale)}`;
    d += 'Z';
  }
  return d;
}

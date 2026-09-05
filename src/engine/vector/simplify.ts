import type { Point } from '../types';

/** Douglas–Peucker with endpoints pinned. Tolerance in the same units as points. */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a].x, ay = points[a].y, bx = points[b].x, by = points[b].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax, py = points[i].y - ay;
      let d2: number;
      if (len2 === 0) d2 = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx, ey = py - t * dy;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > maxD) { maxD = d2; maxI = i; }
    }
    if (maxD > tol2 && maxI > 0) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Interior turn angle at vertex i in degrees: 0 = straight on, 90 = right angle. */
function turnDeg(points: Point[], i: number): number {
  const ax = points[i].x - points[i - 1].x, ay = points[i].y - points[i - 1].y;
  const bx = points[i + 1].x - points[i].x, by = points[i + 1].y - points[i].y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
}

/**
 * Chaikin corner cutting with endpoints pinned. Turns staircases into drawn
 * curves. Vertices turning by at least `cornerAngleDeg` are real corners
 * (serifs, box edges) and are pinned too; the default never pins.
 */
export function chaikin(points: Point[], passes: number, cornerAngleDeg = 181): Point[] {
  if (cornerAngleDeg <= 180 && points.length > 2 && passes > 0) {
    const out: Point[] = [];
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      const last = i === points.length - 1;
      if (!last && turnDeg(points, i) < cornerAngleDeg) continue;
      const piece = chaikinOpen(points.slice(start, i + 1), passes);
      if (out.length) piece.shift();
      out.push(...piece);
      start = i;
    }
    return out;
  }
  return chaikinOpen(points, passes);
}

function chaikinOpen(points: Point[], passes: number): Point[] {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    if (pts.length < 3) return pts;
    const out: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const q = { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 };
      const r = { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 };
      if (i === 0) out.push(r);
      else if (i === pts.length - 2) out.push(q);
      else out.push(q, r);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export function signedArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
  return a / 2;
}

export function polylineLength(points: Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    l += Math.sqrt(dx * dx + dy * dy);
  }
  return l;
}

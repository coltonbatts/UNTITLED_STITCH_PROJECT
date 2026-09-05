import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { setView, useAppState } from '@/app/store';
import { importImageFile } from '@/app/controller';

async function loadSample(): Promise<void> {
  const res = await fetch('/samples/golden-retriever.jpg');
  const blob = await res.blob();
  await importImageFile(new File([blob], 'golden-retriever.jpg', { type: 'image/jpeg' }));
}
import { getDmcLibrary } from '@/engine/threads/dmc';
import { cropRotate } from '@/engine/image/resample';
import { croppedSourceSize } from '@/engine/image/physical';
import { outlineWidthMm } from '@/engine/export/svg';
import { effectiveThreads, fmtMm, paintLabels } from './viewModel';
import { pathsToD } from '@/engine/export/svg';
import type { LineLayer } from '@/engine/types';

/** Stem/back-stitch strokes drawn over the fills at their real width. */
function LineLayerSvg({ lines, mmPerPx, width, height, muted }: { lines: LineLayer; mmPerPx: number; width: number; height: number; muted?: boolean }) {
  if (lines.strokes.length === 0) return null;
  return (
    <svg className="vec lines" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ pointerEvents: 'none' }}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={muted ? 0.9 : 1}>
        {lines.strokes.map((l) => (
          <path key={l.id} d={pathsToD(l.paths)} stroke={l.thread.hex} strokeWidth={Math.max(l.widthMm, 0.3) / mmPerPx}>
            <title>{`Line · DMC ${l.thread.number} · ${l.stitch} stitch · ${l.widthMm.toFixed(2)} mm wide · ${Math.round(l.lengthMm)} mm`}</title>
          </path>
        ))}
      </g>
    </svg>
  );
}

function useCanvasPaint(width: number, height: number, paint: ((ctx: CanvasRenderingContext2D) => void) | null) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !paint || width === 0) return;
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    if (ctx) paint(ctx);
  }, [width, height, paint]);
  return ref;
}

export function Canvas() {
  const s = useAppState();
  const lib = getDmcLibrary();
  const { result, view, project, sourceRaster } = s;
  const host = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState({ x: 0, y: 0, k: 1 });
  const [over, setOver] = useState(false);
  const fittedFor = useRef('');

  // Base size: working resolution once we have a result, else the cropped source.
  const base = result ? { w: result.working.width, h: result.working.height } : sourceRaster && project.source
    ? (() => { const c = croppedSourceSize(project.source.width, project.source.height, project.crop); return { w: c.width, h: c.height }; })() : { w: 0, h: 0 };

  const fit = useCallback(() => {
    const el = host.current;
    if (!el || base.w === 0) return;
    const pad = 32;
    const k = Math.min((el.clientWidth - pad * 2) / base.w, (el.clientHeight - pad * 2) / base.h);
    setTf({ k, x: (el.clientWidth - base.w * k) / 2, y: (el.clientHeight - base.h * k) / 2 });
  }, [base.w, base.h]);
  useEffect(() => {
    const key = `${project.source?.id}:${base.w}x${base.h}`;
    if (key !== fittedFor.current) { fittedFor.current = key; fit(); }
  }, [fit, base.w, base.h, project.source?.id]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (fittedFor.current) fit(); });
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [fit]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = host.current!;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setTf((t) => { const k = Math.max(0.05, Math.min(20, t.k * f)); const sc = k / t.k; return { k, x: mx - (mx - t.x) * sc, y: my - (my - t.y) * sc }; });
  };
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; setTf((t) => ({ ...t, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y })); };
  const onPointerUp = () => { drag.current = null; };

  // Layers.
  const threads = useMemo(() => (result ? effectiveThreads(result.palette, project.paletteEdits, lib) : []), [result, project.paletteEdits, lib]);
  const original = useMemo(() => (sourceRaster ? cropRotate(sourceRaster, project.crop) : null), [sourceRaster, project.crop]);
  const paintOriginal = useMemo(() => original ? (ctx: CanvasRenderingContext2D) => {
    const tmp = document.createElement('canvas');
    tmp.width = original.width; tmp.height = original.height;
    tmp.getContext('2d')!.putImageData(new ImageData(original.rgba as Uint8ClampedArray<ArrayBuffer>, original.width, original.height), 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, ctx.canvas.width, ctx.canvas.height);
  } : null, [original]);
  const paintMap = (which: 'raw' | 'clean') => result ? (ctx: CanvasRenderingContext2D) => {
    const map = which === 'raw' ? result.rawLabelMap : result.labelMap;
    const img = ctx.createImageData(map.width, map.height);
    paintLabels(map.labels, threads, img.data);
    ctx.putImageData(img, 0, 0);
  } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paintRaw = useMemo(() => paintMap('raw'), [result, threads]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paintClean = useMemo(() => paintMap('clean'), [result, threads]);
  const origRef = useCanvasPaint(base.w, base.h, paintOriginal);
  const rawRef = useCanvasPaint(view.mode === 'threads' ? base.w : 0, base.h, paintRaw);
  const cleanRef = useCanvasPaint(view.mode === 'regions' ? base.w : 0, base.h, paintClean);

  const showOriginal = view.mode === 'original' || view.compare || !result;
  const mmPerPx = result?.working.mmPerPx ?? 1;
  const hoop = project.dimensions.hoop;
  const hoverRegion = view.hoverRegion !== null && result ? result.graph.regions[view.hoverRegion] : null;
  const selIdx = view.selectedThread && result ? result.palette.entries.findIndex((e) => e.thread.number === view.selectedThread) : -1;
  const strokePx = result ? outlineWidthMm(project.settings.outlineStrength) / mmPerPx : 1;
  const fabric = project.settings.fabric?.enabled ? project.settings.fabric.hex : null;

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith('image/')) void importImageFile(f); };

  if (!project.source) {
    return (
      <div className="canvas" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <div className="empty">
          <div className={`drop${over ? ' over' : ''}`}>
            <h1>Import a photograph to begin</h1>
            <p>Drop a JPG, PNG or WebP here, or use Import in the toolbar.</p>
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              Choose image<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importImageFile(f); }} />
            </label>
            <div className="fine">Everything is processed on this computer. Nothing is uploaded.</div>
            <div className="fine"><button className="btn quiet" onClick={() => void loadSample()}>Try the sample photograph</button></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={host} className="canvas" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onDoubleClick={fit}>
      <div className="stage" style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.k})`, width: base.w, height: base.h }}>
        {view.mode === 'pattern' && result && !view.compare && (
          <svg className="vec pat paper" width={base.w} height={base.h} viewBox={`0 0 ${base.w} ${base.h}`}>
            {fabric && <>
              <defs><pattern id="bare" width={2 / mmPerPx} height={2 / mmPerPx} patternUnits="userSpaceOnUse"><path d={`M0 ${2 / mmPerPx}L${2 / mmPerPx} 0`} stroke="#bbb" strokeWidth={0.12 / mmPerPx} /></pattern></defs>
              <rect width={base.w} height={base.h} fill={view.tintRegions ? fabric : 'url(#bare)'} opacity={view.tintRegions ? 0.35 : 1} />
            </>}
            <g fillRule="evenodd" strokeLinejoin="round" className={selIdx >= 0 ? 'has-selection' : ''}>
              {result.graph.regions.map((r) => {
                const t = threads[r.paletteIndex];
                const fill = view.tintRegions ? `rgb(${t.rgb.map((v) => Math.round(255 - (255 - v) * 0.16)).join(',')})` : '#fff';
                return <path key={r.id} d={r.pathD} fill={fill} stroke="#1a1a1a" strokeWidth={strokePx} vectorEffect="none"
                  className={`${view.hoverRegion === r.id ? 'hover' : ''} ${r.paletteIndex === selIdx ? 'sel' : ''}`}
                  onPointerEnter={() => setView({ hoverRegion: r.id })} onPointerLeave={() => setView({ hoverRegion: null })}
                  onClick={() => setView({ selectedThread: result.palette.entries[r.paletteIndex].thread.number })} />;
              })}
            </g>
            {result.lines.strokes.length > 0 && <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {result.lines.strokes.map((l) => <path key={l.id} d={pathsToD(l.paths)} stroke={view.tintRegions ? l.thread.hex : '#1a1a1a'} strokeWidth={Math.max(l.widthMm, 0.3) / mmPerPx} />)}
            </g>}
            {view.showLabels && <g transform={`scale(${1 / mmPerPx})`}>
              {result.pattern.labels.map((l) => l.tier === 'none' ? null : (
                <g key={l.regionId}>
                  {l.tier === 'leader' && l.leaderFrom && <>
                    <line x1={l.leaderFrom.x} y1={l.leaderFrom.y} x2={l.x} y2={l.y} stroke="#1a1a1a" strokeWidth={0.12} />
                    <circle cx={l.leaderFrom.x} cy={l.leaderFrom.y} r={0.25} fill="#1a1a1a" />
                    <rect x={l.x - l.text.length * l.fontMm * 0.31 - 0.3} y={l.y - l.fontMm * 0.6} width={l.text.length * l.fontMm * 0.62 + 0.6} height={l.fontMm * 1.2} fill="#fff" stroke="#1a1a1a" strokeWidth={0.1} />
                  </>}
                  <text x={l.x} y={l.y} fontSize={l.fontMm}>{l.text}</text>
                </g>
              ))}
            </g>}
            {view.showHoop && hoop && (hoop.kind === 'round'
              ? <circle cx={base.w / 2} cy={base.h / 2} r={hoop.diameterMm / 2 / mmPerPx} fill="none" stroke="#888" strokeWidth={0.2 / mmPerPx} strokeDasharray={`${1.2 / mmPerPx} ${0.8 / mmPerPx}`} />
              : <rect x={(base.w - hoop.widthMm / mmPerPx) / 2} y={(base.h - hoop.heightMm / mmPerPx) / 2} width={hoop.widthMm / mmPerPx} height={hoop.heightMm / mmPerPx} fill="none" stroke="#888" strokeWidth={0.2 / mmPerPx} strokeDasharray={`${1.2 / mmPerPx} ${0.8 / mmPerPx}`} />)}
          </svg>
        )}
        {fabric && (view.mode === 'threads' || view.mode === 'regions') && !view.compare && <div style={{ width: base.w, height: base.h, background: fabric }} aria-hidden />}
        {view.mode === 'threads' && !view.compare && <canvas ref={rawRef} width={base.w} height={base.h} />}
        {view.mode === 'regions' && !view.compare && <canvas ref={cleanRef} width={base.w} height={base.h} />}
        {(view.mode === 'threads' || view.mode === 'regions') && result && !view.compare && <LineLayerSvg lines={result.lines} mmPerPx={mmPerPx} width={base.w} height={base.h} />}
        {view.mode === 'regions' && result && !view.compare && (
          <svg className={`vec${selIdx >= 0 ? ' has-selection' : ''}`} width={base.w} height={base.h} viewBox={`0 0 ${base.w} ${base.h}`}>
            <g fillRule="evenodd" fill="transparent" stroke="rgba(0,0,0,0.45)" strokeWidth={0.6 / tf.k} strokeLinejoin="round">
              {result.graph.regions.map((r) => (
                <path key={r.id} d={r.pathD} className={`${view.hoverRegion === r.id ? 'hover' : ''} ${r.paletteIndex === selIdx ? 'sel' : ''}`}
                  fill={r.paletteIndex === selIdx ? 'transparent' : selIdx >= 0 ? 'rgba(15,15,16,0.6)' : 'transparent'}
                  onPointerEnter={() => setView({ hoverRegion: r.id })} onPointerLeave={() => setView({ hoverRegion: null })}
                  onClick={() => setView({ selectedThread: result.palette.entries[r.paletteIndex].thread.number })} />
              ))}
            </g>
          </svg>
        )}
        <canvas ref={origRef} width={base.w} height={base.h} style={{ display: showOriginal ? 'block' : 'none' }} />
        {view.showHoop && hoop && view.mode !== 'pattern' && result && (
          <svg width={base.w} height={base.h} viewBox={`0 0 ${base.w} ${base.h}`} style={{ pointerEvents: 'none' }}>
            {hoop.kind === 'round'
              ? <circle cx={base.w / 2} cy={base.h / 2} r={hoop.diameterMm / 2 / mmPerPx} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
              : <rect x={(base.w - hoop.widthMm / mmPerPx) / 2} y={(base.h - hoop.heightMm / mmPerPx) / 2} width={hoop.widthMm / mmPerPx} height={hoop.heightMm / mmPerPx} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />}
          </svg>
        )}
      </div>
      <div className="hud">
        <span className="num">{Math.round(tf.k * 100)}%</span>
        <span>{fmtMm(project.dimensions.widthMm)} × {fmtMm(project.dimensions.heightMm)} mm</span>
        {result && <span className="num">{result.working.width} × {result.working.height} px · {(1 / mmPerPx).toFixed(1)} px/mm</span>}
        <span>Hold <kbd>\</kbd> to compare · double-click to fit</span>
      </div>
      {hoverRegion && (
        <div className="readout" role="status">
          <i className="sw" style={{ background: threads[hoverRegion.paletteIndex].hex }} />
          <span className="num">DMC {threads[hoverRegion.paletteIndex].number}</span>
          <span>{threads[hoverRegion.paletteIndex].name}</span>
          <span className="num">#{hoverRegion.id + 1} · {hoverRegion.areaMm2 < 10 ? hoverRegion.areaMm2.toFixed(1) : Math.round(hoverRegion.areaMm2)} mm²</span>
        </div>
      )}
    </div>
  );
}

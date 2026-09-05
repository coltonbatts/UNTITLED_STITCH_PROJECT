import { useEffect, useRef, useState } from 'react';
import { redo, undo, updateProject, useAppState } from '@/app/store';
import { importImageFile } from '@/app/controller';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { buildPatternSvg } from '@/engine/export/svg';
import { buildThreadListCsv, buildThreadListText } from '@/engine/export/threadList';
import { downloadText, exportPng, printSvg } from './exports';
import { effectiveThreads } from './viewModel';

export function TopBar() {
  const s = useAppState();
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const result = s.result;
  const safeName = s.project.name.replace(/[^\w\- ]+/g, '').trim() || 'pattern';
  const lib = getDmcLibrary();
  const threads = result ? effectiveThreads(result.palette, s.project.paletteEdits, lib) : [];
  const svgOf = (mode: 'pattern' | 'color', legend = true) => result ? buildPatternSvg(result.graph, result.palette, threads, result.pattern, {
    mode, showLabels: s.view.showLabels, showHoop: s.view.showHoop, showLegend: legend, outlineStrength: s.project.settings.outlineStrength, projectName: s.project.name, fabricHex: s.project.settings.fabric?.enabled ? s.project.settings.fabric.hex : undefined,
    metadata: { settings: s.project.settings, dimensions: s.project.dimensions, paletteEdits: s.project.paletteEdits, engine: result.params },
  }) : '';
  const act = (fn: () => void) => () => { setMenu(false); fn(); };

  const statusText = s.status === 'running' ? `Processing${s.stage ? ` · ${s.stage}` : ''}…`
    : s.status === 'error' ? `Error: ${s.error}`
    : result ? `${Object.values(result.timingsMs).reduce((a, b) => a + b, 0).toFixed(0)} ms` : '';

  return (
    <header className="topbar">
      <input className="name" value={s.project.name} aria-label="Project name" onChange={(e) => updateProject({ name: e.target.value })} />
      <button className="btn quiet" onClick={undo} disabled={s.past.length === 0} title="Undo (⌘Z)">Undo</button>
      <button className="btn quiet" onClick={redo} disabled={s.future.length === 0} title="Redo (⇧⌘Z)">Redo</button>
      <div className="spacer" />
      <span className={`status${s.status === 'error' ? ' err' : ''}`} aria-live="polite">{statusText}</span>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importImageFile(f); e.target.value = ''; }} />
      <button className="btn" onClick={() => fileRef.current?.click()}>Import…</button>
      <div className="menu" ref={menuRef}>
        <button className="btn primary" disabled={!result} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>Export</button>
        {menu && result && (
          <div className="popover" role="menu">
            <button role="menuitem" onClick={act(() => downloadText(svgOf('pattern'), `${safeName}-pattern.svg`, 'image/svg+xml'))}>Pattern SVG (labels + legend)</button>
            <button role="menuitem" onClick={act(() => downloadText(svgOf('color', false), `${safeName}-colour.svg`, 'image/svg+xml'))}>Colour regions SVG</button>
            <button role="menuitem" onClick={act(() => printSvg(svgOf('pattern'), s.project.name))}>Print pattern… (PDF via browser)</button>
            <hr />
            <button role="menuitem" onClick={act(() => void exportPng(result, threads, 'threads', `${safeName}-threads.png`, s.project.settings.fabric?.enabled ? s.project.settings.fabric.hex : undefined))}>Thread approximation PNG</button>
            <button role="menuitem" onClick={act(() => void exportPng(result, threads, 'regions', `${safeName}-regions.png`, s.project.settings.fabric?.enabled ? s.project.settings.fabric.hex : undefined))}>Regions PNG</button>
            <hr />
            <button role="menuitem" onClick={act(() => downloadText(buildThreadListText(result.pattern.legend, s.project.name), `${safeName}-threads.txt`, 'text/plain'))}>DMC thread list (.txt)</button>
            <button role="menuitem" onClick={act(() => downloadText(buildThreadListCsv(result.pattern.legend), `${safeName}-threads.csv`, 'text/csv'))}>DMC thread list (.csv)</button>
            <div className="hint">SVG carries region ids, DMC numbers and project settings as metadata.</div>
          </div>
        )}
      </div>
    </header>
  );
}

import { useMemo, useState } from 'react';
import { setView, updatePaletteEdits, useAppState } from '@/app/store';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { rankThreads } from '@/engine/threads/match';
import { deltaE2000 } from '@/engine/color';
import { effectiveThreads } from './viewModel';

const LockIcon = () => <svg className="lock" viewBox="0 0 16 16" fill="currentColor" aria-label="locked"><path d="M4 7V5a4 4 0 118 0v2h1v7H3V7h1zm2 0h4V5a2 2 0 10-4 0v2z"/></svg>;

export function ThreadTray() {
  const s = useAppState();
  const lib = getDmcLibrary();
  const [query, setQuery] = useState('');
  const result = s.result;
  const edits = s.project.paletteEdits;
  const threads = useMemo(() => (result ? effectiveThreads(result.palette, edits, lib) : []), [result, edits, lib]);
  const legendByPalette = useMemo(() => new Map(result?.pattern.legend.map((l) => [l.paletteIndex, l]) ?? []), [result]);
  const selIdx = result && s.view.selectedThread ? result.palette.entries.findIndex((e) => e.thread.number === s.view.selectedThread) : -1;
  const sel = selIdx >= 0 && result ? result.palette.entries[selIdx] : null;
  const candidates = useMemo(() => (sel ? rankThreads(lib, sel.centroid, 10) : []), [sel, lib]);
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return lib.threads.filter((t) => t.number.toLowerCase().startsWith(q) || t.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query, lib]);

  if (!result) return <div className="tray"><div className="chips" /><div className="detail" /></div>;

  const gen = sel?.thread.number ?? null;
  const replacement = gen ? edits.replacements[gen] : undefined;
  const mergedInto = gen ? edits.merges[gen] : undefined;
  const locked = gen ? edits.locked.includes(gen) : false;
  const replace = (n: string | null) => updatePaletteEdits((e) => { const r = { ...e.replacements }; if (n && gen && n !== gen) r[gen] = n; else if (gen) delete r[gen]; return { ...e, replacements: r }; });
  const toggleLock = () => updatePaletteEdits((e) => ({ ...e, locked: locked ? e.locked.filter((n) => n !== gen) : [...e.locked, gen!] }));
  const merge = (into: string) => updatePaletteEdits((e) => ({ ...e, merges: { ...e.merges, [gen!]: into } }));
  const unmerge = () => updatePaletteEdits((e) => { const m = { ...e.merges }; delete m[gen!]; return { ...e, merges: m }; });

  return (
    <div className="tray">
      <div className="chips" role="listbox" aria-label="Thread palette">
        {result.palette.entries.map((e, i) => {
          const t = threads[i];
          const row = legendByPalette.get(i);
          const isMerged = !!edits.merges[e.thread.number];
          return (
            <button key={e.thread.number} role="option" aria-selected={i === selIdx} className={`chip${i === selIdx ? ' active' : ''}${isMerged ? ' merged' : ''}`}
              onClick={() => setView({ selectedThread: i === selIdx ? null : e.thread.number })}>
              <div className="sw" style={{ background: t.hex }}>
                {t.number !== e.thread.number && <div className="rep" style={{ background: e.thread.hex }} title={`Generated as ${e.thread.number}`} />}
                {edits.locked.includes(e.thread.number) && <LockIcon />}
              </div>
              <div className="body">
                <div className="n">{row ? `${row.index} · ` : ''}{t.number}</div>
                <div className="nm" title={t.name}>{t.name}</div>
                <div className="share">{isMerged ? `→ ${edits.merges[e.thread.number]}` : row ? `${(row.share * 100).toFixed(row.share < 0.1 ? 1 : 0)}% · ${row.regionCount} rgn` : 'unused'}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="detail">
        {sel && (
          <>
            <h3><i className="big" style={{ background: threads[selIdx].hex }} /><span className="num">DMC {threads[selIdx].number}</span><span className="dim">{threads[selIdx].name}</span></h3>
            <div className="dim">
              {replacement ? <>Generated as {sel.thread.number} ({sel.thread.name}); stitching with {replacement}. </> : null}
              ΔE₀₀ from image colour: <span className="num">{deltaE2000(lib.byNumber.get(threads[selIdx].number)!.lab, labFromOklabApprox(sel)).toFixed(1)}</span>
              {mergedInto ? <> · merged into {mergedInto}</> : null}
            </div>
            <div className="actions">
              <button className={`btn${locked ? ' active' : ''}`} onClick={toggleLock}>{locked ? 'Locked' : 'Lock'}</button>
              {replacement && <button className="btn" onClick={() => replace(null)}>Revert to {sel.thread.number}</button>}
              {mergedInto ? <button className="btn" onClick={unmerge}>Undo merge</button> : (
                <select className="select" value="" aria-label="Merge into" onChange={(e) => { if (e.target.value) merge(e.target.value); }}>
                  <option value="">Merge into…</option>
                  {result.palette.entries.filter((e) => e.thread.number !== gen && !edits.merges[e.thread.number]).map((e) => <option key={e.thread.number} value={e.thread.number}>{e.thread.number} {e.thread.name}</option>)}
                </select>
              )}
            </div>
            <div className="dim" style={{ marginBottom: 4 }}>Replace with a nearby thread:</div>
            <div className="cands">
              {candidates.map((c) => (
                <button key={c.thread.number} className={`cand${threads[selIdx].number === c.thread.number ? ' active' : ''}`} title={`${c.thread.name} · ΔE ${(c.distance * 100).toFixed(1)}`} onClick={() => replace(c.thread.number)}>
                  <i style={{ background: c.thread.hex }} />{c.thread.number}
                </button>
              ))}
            </div>
            <input className="input search" placeholder="Search DMC number or name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search threads" />
            {searched.length > 0 && <div className="cands">
              {searched.map((t) => <button key={t.number} className="cand" title={t.name} onClick={() => { replace(t.number); setQuery(''); }}><i style={{ background: t.hex }} />{t.number}</button>)}
            </div>}
          </>
        )}
      </div>
    </div>
  );
}

// The palette centroid is OKLab; convert through sRGB to CIELAB for the ΔE₀₀ readout.
import { oklabToRgb, rgbToLab } from '@/engine/color';
import type { PaletteEntry } from '@/engine/types';
function labFromOklabApprox(e: PaletteEntry) { return rgbToLab(oklabToRgb(e.centroid)); }

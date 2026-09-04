import type { ReactElement } from 'react';
import { setView, useAppState, type ViewMode } from '@/app/store';

const icons: Record<ViewMode, ReactElement> = {
  original: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="8" cy="9" r="1.5"/><path d="M3 14l4-3 3 2 4-4 3 3"/></svg>,
  threads: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="3.5"/><circle cx="13" cy="7" r="3.5"/><circle cx="10" cy="13" r="3.5"/></svg>,
  regions: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5c3-2 7-2 9 1s4 3 5 1v9H3z"/><path d="M3 11c3 1 6-1 8 1s4 1 6-1"/></svg>,
  pattern: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 9c4-3 7 3 14 0M7 3v14M12 12v5"/></svg>,
};
const modes: Array<{ mode: ViewMode; label: string; key: string }> = [
  { mode: 'original', label: 'Original', key: '1' },
  { mode: 'threads', label: 'Threads', key: '2' },
  { mode: 'regions', label: 'Regions', key: '3' },
  { mode: 'pattern', label: 'Pattern', key: '4' },
];

export function Rail() {
  const { view, status } = useAppState();
  const disabled = status === 'empty';
  return (
    <nav className="rail" aria-label="Views">
      {modes.map((m) => (
        <button key={m.mode} className={view.mode === m.mode ? 'active' : ''} disabled={disabled} aria-pressed={view.mode === m.mode}
          onClick={() => setView({ mode: m.mode })} title={`${m.label} (${m.key})`}>
          {icons[m.mode]}<span>{m.label}</span><kbd>{m.key}</kbd>
        </button>
      ))}
      <div className="gap" />
    </nav>
  );
}

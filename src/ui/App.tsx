import { useEffect } from 'react';
import { redo, setView, undo, useAppState } from '@/app/store';
import { restoreLastSession } from '@/app/controller';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { Rail } from './Rail';
import { ThreadTray } from './ThreadTray';
import { TopBar } from './TopBar';

export function App() {
  const status = useAppState().status;
  useEffect(() => { void restoreLastSession(); }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.key === '\\' && !e.repeat) { setView({ compare: true }); return; }
      if (status !== 'empty' && ['1', '2', '3', '4'].includes(e.key)) setView({ mode: (['original', 'threads', 'regions', 'pattern'] as const)[Number(e.key) - 1] });
      if (e.key === 'Escape') setView({ selectedThread: null });
    };
    const up = (e: KeyboardEvent) => { if (e.key === '\\') setView({ compare: false }); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [status]);
  return (
    <div className="app">
      <TopBar />
      <Rail />
      <Canvas />
      <Inspector />
      <ThreadTray />
    </div>
  );
}

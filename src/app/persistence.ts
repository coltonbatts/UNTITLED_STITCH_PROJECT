// Local persistence: the project record and the source image blob live in
// IndexedDB; the id of the last open project in localStorage. No backend.
import type { Project } from '@/engine/types';

const DB = 'needlepaint';
const VERSION = 1;
const LAST_KEY = 'needlepaint:lastProject';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  }));
}

export async function saveProject(project: Project): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.put(project));
  localStorage.setItem(LAST_KEY, project.id);
}
export async function saveImage(sourceId: string, blob: Blob): Promise<void> {
  await tx('images', 'readwrite', (s) => s.put(blob, sourceId));
}
export async function loadLastProject(): Promise<{ project: Project; image: Blob | null } | null> {
  const id = localStorage.getItem(LAST_KEY);
  if (!id) return null;
  const project = await tx<Project | undefined>('projects', 'readonly', (s) => s.get(id));
  if (!project) return null;
  const image = project.source ? (await tx<Blob | undefined>('images', 'readonly', (s) => s.get(project.source!.id))) ?? null : null;
  return { project, image };
}
export async function clearAll(): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.clear());
  await tx('images', 'readwrite', (s) => s.clear());
  localStorage.removeItem(LAST_KEY);
}

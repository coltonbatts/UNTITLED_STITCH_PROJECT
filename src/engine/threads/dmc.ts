import dataset from '../../data/dmc/dmc-floss.json';
import { buildThreadLibrary, type ThreadDataset } from './library';
import type { ThreadLibrary } from '../types';

let cached: ThreadLibrary | null = null;

/** The DMC library. Built lazily once per thread (main or worker). */
export function getDmcLibrary(): ThreadLibrary {
  if (!cached) cached = buildThreadLibrary(dataset as unknown as ThreadDataset);
  return cached;
}

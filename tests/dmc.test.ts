import { describe, expect, it } from 'vitest';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { nearestThread, rankThreads } from '@/engine/threads/match';
import { rgbToOklab } from '@/engine/color';

describe('DMC library', () => {
  const lib = getDmcLibrary();
  it('loads the documented 454 colours with unique numbers', () => {
    expect(lib.threads.length).toBe(454);
    expect(new Set(lib.threads.map((t) => t.number)).size).toBe(454);
    expect(lib.byNumber.get('310')?.name).toBe('Black');
    expect(lib.byNumber.get('B5200')?.rgb).toEqual([255, 255, 255]);
  });
  it('derives Lab and OKLab from RGB', () => {
    const t = lib.byNumber.get('310')!;
    expect(t.oklab[0]).toBeCloseTo(0, 5);
    expect(lib.byNumber.get('B5200')!.lab[0]).toBeCloseTo(100, 1);
  });
  it('nearest thread to a thread colour is that thread', () => {
    for (const n of ['310', '3799', '666', '798', 'Ecru', '3823']) {
      const t = lib.byNumber.get(n)!;
      expect(nearestThread(lib, rgbToOklab(t.rgb)).number).toBe(n);
    }
  });
  it('ranks candidates by perceptual distance', () => {
    const ranked = rankThreads(lib, rgbToOklab([0, 0, 0]), 5);
    expect(ranked[0].thread.number).toBe('310');
    expect(ranked[0].distance).toBe(0);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].distance).toBeGreaterThanOrEqual(ranked[i - 1].distance);
  });
});

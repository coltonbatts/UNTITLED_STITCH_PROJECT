import { describe, expect, it } from 'vitest';
import { rgbToOklab, oklabToRgb, rgbToLab, deltaE2000, oklabDistance } from '@/engine/color';

describe('colour science', () => {
  it('OKLab white has L≈1 and black L≈0', () => {
    expect(rgbToOklab([255, 255, 255])[0]).toBeCloseTo(1, 3);
    expect(rgbToOklab([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });
  it('sRGB → OKLab → sRGB round-trips within 1/255', () => {
    for (const c of [[12, 200, 90], [255, 0, 0], [30, 30, 30], [180, 140, 90]] as const) {
      const back = oklabToRgb(rgbToOklab([c[0], c[1], c[2]]));
      expect(Math.abs(back[0] - c[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(back[1] - c[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(back[2] - c[2])).toBeLessThanOrEqual(1);
    }
  });
  it('CIELAB of white is L=100 and neutral', () => {
    const lab = rgbToLab([255, 255, 255]);
    expect(lab[0]).toBeCloseTo(100, 1);
    expect(Math.abs(lab[1])).toBeLessThan(0.05);
    expect(Math.abs(lab[2])).toBeLessThan(0.05);
  });
  it('CIEDE2000 matches Sharma reference pairs', () => {
    // Sharma, Wu, Dalal (2005) test data, pairs 1 and 7.
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(deltaE2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 3);
  });
  it('OKLab distance is symmetric and zero for identical colours', () => {
    const a = rgbToOklab([100, 50, 20]);
    const b = rgbToOklab([20, 50, 100]);
    expect(oklabDistance(a, a)).toBe(0);
    expect(oklabDistance(a, b)).toBeCloseTo(oklabDistance(b, a), 10);
  });
});

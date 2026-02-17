import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  filterCollidingLabels,
  getAnnularCentroidRadius,
  getSliceLabelPoint,
  getSliceSweep
} from './chartGeometry';

describe('chartGeometry', () => {
  describe('getSliceSweep', () => {
    it('returns bounded positive sweep angles', () => {
      expect(getSliceSweep(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 8);
      expect(getSliceSweep(2, 1)).toBe(0);
      expect(getSliceSweep(0, 20)).toBeCloseTo(Math.PI * 2, 8);
    });
  });

  describe('getAnnularCentroidRadius', () => {
    it('returns a radius between inner and outer bounds', () => {
      const radius = getAnnularCentroidRadius(80, 150, Math.PI / 2);
      expect(radius).toBeGreaterThanOrEqual(80);
      expect(radius).toBeLessThanOrEqual(150);
    });

    it('falls back to midpoint for near-full circle sweeps', () => {
      const radius = getAnnularCentroidRadius(60, 120, Math.PI * 2 - 1e-6);
      expect(radius).toBeCloseTo(90, 5);
    });

    it('handles equal radii safely', () => {
      const radius = getAnnularCentroidRadius(100, 100, Math.PI / 3);
      expect(radius).toBe(100);
    });
  });

  describe('getSliceLabelPoint', () => {
    it('returns a point in the expected slice quadrant', () => {
      const point = getSliceLabelPoint(200, 200, 80, 140, -Math.PI / 2, 0);
      expect(point.x).toBeGreaterThan(200);
      expect(point.y).toBeLessThan(200);
      expect(point.radius).toBeGreaterThanOrEqual(80);
      expect(point.radius).toBeLessThanOrEqual(140);
    });
  });

  describe('angularDistance', () => {
    it('uses shortest wrap-around distance', () => {
      expect(angularDistance(0, Math.PI * 2 - 0.1)).toBeCloseTo(0.1, 8);
    });
  });

  describe('filterCollidingLabels', () => {
    it('drops smaller-value labels when angular spacing is too tight', () => {
      const labels = [
        { id: 'a', midAngle: 0, value: 120 },
        { id: 'b', midAngle: 0.05, value: 80 },
        { id: 'c', midAngle: 1.4, value: 40 }
      ];

      const filtered = filterCollidingLabels(labels, 0.1);
      const keptIds = filtered.map(label => label.id).sort();

      expect(keptIds).toEqual(['a', 'c']);
    });

    it('keeps all labels when they are sufficiently separated', () => {
      const labels = [
        { id: 'a', midAngle: 0, value: 80 },
        { id: 'b', midAngle: 1.0, value: 60 },
        { id: 'c', midAngle: 2.0, value: 40 }
      ];

      const filtered = filterCollidingLabels(labels, 0.1);
      expect(filtered).toHaveLength(3);
    });
  });
});

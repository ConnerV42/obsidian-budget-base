import { describe, expect, it } from 'vitest';
import {
  calculatePinchScale,
  clampMobileUiScale,
  DEFAULT_MOBILE_UI_SCALE,
  distanceBetweenPoints,
  MAX_MOBILE_UI_SCALE,
  MIN_MOBILE_UI_SCALE,
  normalizeMobileUiScale
} from './mobileUiScale';

describe('mobileUiScale', () => {
  describe('clampMobileUiScale', () => {
    it('uses default when value is invalid', () => {
      expect(clampMobileUiScale(Number.NaN)).toBe(DEFAULT_MOBILE_UI_SCALE);
      expect(clampMobileUiScale(undefined)).toBe(DEFAULT_MOBILE_UI_SCALE);
    });

    it('clamps below and above configured limits', () => {
      expect(clampMobileUiScale(0.1)).toBe(MIN_MOBILE_UI_SCALE);
      expect(clampMobileUiScale(2)).toBe(MAX_MOBILE_UI_SCALE);
    });
  });

  describe('normalizeMobileUiScale', () => {
    it('rounds to two decimals', () => {
      expect(normalizeMobileUiScale(1.234)).toBe(1.23);
      expect(normalizeMobileUiScale(1.235)).toBe(1.24);
    });
  });

  describe('distanceBetweenPoints', () => {
    it('returns euclidean distance', () => {
      expect(distanceBetweenPoints(0, 0, 3, 4)).toBe(5);
    });
  });

  describe('calculatePinchScale', () => {
    it('scales proportionally to pinch distance change', () => {
      expect(calculatePinchScale(1, 100, 120)).toBe(1.2);
      expect(calculatePinchScale(1, 100, 80)).toBe(0.8);
      expect(calculatePinchScale(1, 100, 20)).toBe(MIN_MOBILE_UI_SCALE);
    });

    it('guards against invalid distances', () => {
      expect(calculatePinchScale(1.1, 0, 200)).toBe(1.1);
      expect(calculatePinchScale(1.1, 100, -1)).toBe(1.1);
    });
  });
});

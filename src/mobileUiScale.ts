export const MIN_MOBILE_UI_SCALE = 0.5;
export const MAX_MOBILE_UI_SCALE = 1.35;
export const DEFAULT_MOBILE_UI_SCALE = 1;

export function clampMobileUiScale(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MOBILE_UI_SCALE;
  }

  return Math.max(MIN_MOBILE_UI_SCALE, Math.min(MAX_MOBILE_UI_SCALE, parsed));
}

export function normalizeMobileUiScale(value: number | undefined): number {
  return Number(clampMobileUiScale(value).toFixed(2));
}

export function distanceBetweenPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function calculatePinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number
): number {
  if (!Number.isFinite(startDistance) || startDistance <= 0) {
    return clampMobileUiScale(startScale);
  }

  if (!Number.isFinite(currentDistance) || currentDistance <= 0) {
    return clampMobileUiScale(startScale);
  }

  const scaleRatio = currentDistance / startDistance;
  return clampMobileUiScale(startScale * scaleRatio);
}

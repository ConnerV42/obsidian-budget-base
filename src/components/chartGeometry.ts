const FULL_CIRCLE = Math.PI * 2;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const normalizeAngle = (angle: number): number => {
  const normalized = angle % FULL_CIRCLE;
  return normalized < 0 ? normalized + FULL_CIRCLE : normalized;
};

export const angularDistance = (a: number, b: number): number => {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return diff > Math.PI ? FULL_CIRCLE - diff : diff;
};

export const getSliceSweep = (startAngle: number, endAngle: number): number => {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return 0;
  const rawSweep = endAngle - startAngle;
  if (rawSweep <= 0) return 0;
  return Math.min(rawSweep, FULL_CIRCLE);
};

export const getAnnularCentroidRadius = (
  innerRadius: number,
  outerRadius: number,
  sweepAngle: number
): number => {
  const minRadius = Math.min(innerRadius, outerRadius);
  const maxRadius = Math.max(innerRadius, outerRadius);

  if (maxRadius <= 0) return 0;
  if (maxRadius === minRadius) return maxRadius;

  const safeSweep = clamp(sweepAngle, 0, FULL_CIRCLE);
  if (safeSweep < 1e-6 || safeSweep > FULL_CIRCLE - 1e-4) {
    return (minRadius + maxRadius) / 2;
  }

  const outerSquared = maxRadius * maxRadius;
  const innerSquared = minRadius * minRadius;
  const denominator = outerSquared - innerSquared;
  if (Math.abs(denominator) < 1e-9) {
    return (minRadius + maxRadius) / 2;
  }

  const outerCubed = maxRadius * outerSquared;
  const innerCubed = minRadius * innerSquared;
  const radialFactor = (outerCubed - innerCubed) / denominator;
  const angleFactor = (4 * Math.sin(safeSweep / 2)) / (3 * safeSweep);
  const centroidRadius = angleFactor * radialFactor;

  return clamp(centroidRadius, minRadius, maxRadius);
};

export const getSliceLabelPoint = (
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const sweep = getSliceSweep(startAngle, endAngle);
  const midAngle = startAngle + sweep / 2;
  const minRadius = Math.min(innerRadius, outerRadius);
  const maxRadius = Math.max(innerRadius, outerRadius);
  const midpointRadius = (minRadius + maxRadius) / 2;
  const thickness = Math.max(0, maxRadius - minRadius);
  const sweepRatio = clamp(sweep / Math.PI, 0, 1);

  // Optical placement: move bigger slices inward so labels look centered by eye.
  const opticalFactor = clamp(0.52 - sweepRatio * 0.16, 0.36, 0.54);
  const opticalRadius = minRadius + thickness * opticalFactor;
  const inset = Math.max(6, (maxRadius - minRadius) * 0.12);
  const lowerBound = Math.min(minRadius + inset, maxRadius);
  const upperBound = Math.max(maxRadius - inset, lowerBound);
  const radius = clamp((midpointRadius + opticalRadius) / 2, lowerBound, upperBound);

  return {
    x: centerX + radius * Math.cos(midAngle),
    y: centerY + radius * Math.sin(midAngle),
    midAngle,
    sweep,
    radius
  };
};

type LabelLike = {
  midAngle: number;
  value: number;
};

export const filterCollidingLabels = <T extends LabelLike>(
  labels: T[],
  minAngleSeparation: number
): T[] => {
  if (labels.length < 2 || minAngleSeparation <= 0) return labels;

  const sorted = [...labels].sort((a, b) => a.midAngle - b.midAngle);
  let changed = true;

  while (changed && sorted.length > 1) {
    changed = false;

    for (let i = 0; i < sorted.length; i++) {
      const nextIndex = (i + 1) % sorted.length;
      const current = sorted[i];
      const next = sorted[nextIndex];
      const gap = angularDistance(current.midAngle, next.midAngle);

      if (gap >= minAngleSeparation) continue;

      if (current.value <= next.value) {
        sorted.splice(i, 1);
      } else {
        sorted.splice(nextIndex, 1);
      }
      changed = true;
      break;
    }
  }

  return sorted;
};

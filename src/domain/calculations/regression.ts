import { CALC_ENGINE_VERSION, DataProvenance } from '../models/types';
import { CalculationResult } from './calculationTypes';
import { isValidFiniteNumber } from './numericValidation';

export interface RegressionInputPoint {
  id: string;
  label: string;
  x: number | null | undefined;
  y: number | null | undefined;
  provenance?: DataProvenance;
}

export interface RegressionFittedPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  yHat: number;
  residual: number;
}

export type RegressionStatus =
  | 'fitted'
  | 'insufficient_points'
  | 'degenerate_x_variance'
  | 'constant_y';

export interface LinearRegressionData {
  regressionStatus: RegressionStatus;
  validCount: number;
  excludedCount: number;
  slope: number | null;
  intercept: number | null;
  rSquared: number | null;
  rss: number | null;
  tss: number | null;
  standardErrorOfEstimate: number | null;
  fittedPoints: RegressionFittedPoint[];
}

/**
 * Pure Ordinary Least Squares (OLS) linear regression (y = m*x + b).
 * - Never forces regression through the origin.
 * - Handles missing/non-finite observations, n < 2, identical x values, and constant y values.
 * - Explicitly labeled as exploratory numerical infrastructure, NOT analytical method validation.
 */
export function computeLinearRegression(
  points: RegressionInputPoint[],
  options: {
    calculationId?: string;
    xUnit: string;
    yUnit: string;
    containsSynthetic?: boolean;
  }
): CalculationResult<LinearRegressionData> {
  const validPoints: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    provenance?: DataProvenance;
  }> = [];
  let excludedCount = 0;

  for (const pt of points) {
    if (isValidFiniteNumber(pt.x) && isValidFiniteNumber(pt.y)) {
      validPoints.push({
        id: pt.id,
        label: pt.label,
        x: pt.x,
        y: pt.y,
        provenance: pt.provenance,
      });
    } else {
      excludedCount += 1;
    }
  }

  const n = validPoints.length;
  const inputRefs = validPoints.map((p) => p.id);
  const isSynthetic =
    Boolean(options.containsSynthetic) ||
    validPoints.some((p) => p.provenance === 'synthetic_demo');

  const assumptions = [
    'Unweighted Ordinary Least Squares (OLS) linear fit: y = slope · x + intercept.',
    'Intercept is freely estimated and never silently forced through the origin (0, 0).',
    'Exploratory numerical fit only: a high R² does not establish analytical method validity, linearity across unmeasured ranges, or calibration certification.',
  ];

  const validationMessages: string[] = [];
  if (excludedCount > 0) {
    validationMessages.push(
      `${excludedCount} point(s) with missing or non-finite coordinates were excluded.`
    );
  }
  if (isSynthetic) {
    validationMessages.push(
      'Contains synthetic demonstration data — numerical verification only, not experimental evidence.'
    );
  }

  const slopeUnit = `${options.yUnit} / ${options.xUnit}`;

  if (n < 2) {
    validationMessages.push(
      'Linear regression requires at least 2 valid (x, y) observation pairs.'
    );
    return {
      calculationId: options.calculationId ?? 'ols-linear-regression',
      calculationVersion: CALC_ENGINE_VERSION,
      inputRefs,
      value: {
        regressionStatus: 'insufficient_points',
        validCount: n,
        excludedCount,
        slope: null,
        intercept: null,
        rSquared: null,
        rss: null,
        tss: null,
        standardErrorOfEstimate: null,
        fittedPoints: [],
      },
      unit: slopeUnit,
      status: 'missing_inputs',
      provenance: 'unavailable',
      assumptions,
      validationMessages,
      reviewStatus: 'exploratory_only',
    };
  }

  const meanX = validPoints.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = validPoints.reduce((acc, p) => acc + p.y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let tss = 0;

  for (const pt of validPoints) {
    const dx = pt.x - meanX;
    const dy = pt.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    tss += dy * dy;
  }

  if (sxx === 0 || !Number.isFinite(sxx)) {
    validationMessages.push(
      'All valid observations share identical independent-variable (x) values; slope is undefined.'
    );
    return {
      calculationId: options.calculationId ?? 'ols-linear-regression',
      calculationVersion: CALC_ENGINE_VERSION,
      inputRefs,
      value: {
        regressionStatus: 'degenerate_x_variance',
        validCount: n,
        excludedCount,
        slope: null,
        intercept: null,
        rSquared: null,
        rss: null,
        tss,
        standardErrorOfEstimate: null,
        fittedPoints: [],
      },
      unit: slopeUnit,
      status: 'invalid_inputs',
      provenance: 'unavailable',
      assumptions,
      validationMessages,
      reviewStatus: 'exploratory_only',
    };
  }

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  const fittedPoints: RegressionFittedPoint[] = validPoints.map((pt) => {
    const yHat = slope * pt.x + intercept;
    const residual = pt.y - yHat;
    return {
      id: pt.id,
      label: pt.label,
      x: pt.x,
      y: pt.y,
      yHat,
      residual,
    };
  });

  const rss = fittedPoints.reduce((acc, p) => acc + p.residual * p.residual, 0);
  const standardErrorOfEstimate = n > 2 ? Math.sqrt(rss / (n - 2)) : null;

  let rSquared: number | null = null;
  let regressionStatus: RegressionStatus = 'fitted';

  if (tss === 0) {
    regressionStatus = 'constant_y';
    rSquared = null;
    validationMessages.push(
      'Dependent-variable (y) values are constant (TSS = 0); slope is 0 and R² is mathematically undefined.'
    );
  } else {
    // Clamp tiny floating-point overshoot (e.g. 1.0000000000000002 -> 1)
    const rawR2 = 1 - rss / tss;
    rSquared = Math.min(1, Math.max(0, rawR2));
  }

  if (n === 2) {
    validationMessages.push(
      'Only 2 points included: a line fits 2 points exactly with 0 degrees of freedom; residuals and standard error are not informative.'
    );
  }

  return {
    calculationId: options.calculationId ?? 'ols-linear-regression',
    calculationVersion: CALC_ENGINE_VERSION,
    inputRefs,
    value: {
      regressionStatus,
      validCount: n,
      excludedCount,
      slope,
      intercept,
      rSquared,
      rss,
      tss,
      standardErrorOfEstimate,
      fittedPoints,
    },
    unit: slopeUnit,
    status: 'available',
    provenance: isSynthetic ? 'synthetic_demo' : 'derived_calculated',
    assumptions,
    validationMessages,
    reviewStatus: 'exploratory_only',
  };
}

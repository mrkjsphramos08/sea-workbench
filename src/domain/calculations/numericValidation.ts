/**
 * Pure numeric parsing, validation, and scientific formatting helpers.
 * Guarantees separation between full-precision stored IEEE-754 numbers and display strings.
 */

export function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Safely parses user text input into a finite number or `null`.
 * Guarantees empty strings or malformed tokens never become `0`, `NaN`, or `Infinity`.
 * Preserves explicit `"0"` as `0`.
 */
export function parseOptionalNumber(
  raw: string | number | null | undefined
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Formats an optional numeric value cleanly for scientific tables and A4 reports.
 * Missing values are explicitly rendered as an em-dash rather than `0`.
 * Does NOT mutate stored precision.
 */
export function formatScientificNumber(
  value: number | null | undefined,
  decimals = 2,
  missingSymbol = '—'
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return missingSymbol;
  }
  return value.toFixed(decimals);
}

/**
 * Formats large or very small magnitudes in scientific notation when outside
 * the standard fixed-decimal readability band, while preserving zero as `0`.
 */
export function formatWithScientificNotation(
  value: number | null | undefined,
  options?: {
    fixedDecimals?: number;
    sigFigs?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
    missingSymbol?: string;
  }
): string {
  const missingSymbol = options?.missingSymbol ?? '—';
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return missingSymbol;
  }
  if (value === 0) {
    return (0).toFixed(options?.fixedDecimals ?? 2);
  }
  const abs = Math.abs(value);
  const upper = options?.upperThreshold ?? 1e5;
  const lower = options?.lowerThreshold ?? 1e-3;

  if (abs >= upper || abs < lower) {
    return value.toExponential(options?.sigFigs ?? 3);
  }
  return value.toFixed(options?.fixedDecimals ?? 2);
}

export interface NumericSeriesInspection {
  validValues: number[];
  missingCount: number;
  invalidCount: number;
}

export function inspectNumericSeries(
  values: Array<number | null | undefined>
): NumericSeriesInspection {
  const validValues: number[] = [];
  let missingCount = 0;
  let invalidCount = 0;

  for (const v of values) {
    if (v === null || v === undefined) {
      missingCount += 1;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      validValues.push(v);
    } else {
      invalidCount += 1;
    }
  }

  return { validValues, missingCount, invalidCount };
}

import {
  CALC_ENGINE_VERSION,
  DataProvenance,
  SurveyMeasurement,
} from '../models/types';
import { CalculationResult } from './calculationTypes';
import { inspectNumericSeries } from './numericValidation';

export interface DescriptiveStatsData {
  validCount: number;
  missingCount: number;
  invalidCount: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
  sampleVariance: number | null;
  sampleStdDev: number | null;
  sem: number | null;
  rsdPercent: number | null;
}

const NEAR_ZERO_MEAN_THRESHOLD = 1e-12;

export function computeDescriptiveStatistics(
  values: Array<number | null | undefined>,
  options: {
    calculationId?: string;
    unit: string;
    inputRefs?: string[];
    containsSynthetic?: boolean;
  }
): CalculationResult<DescriptiveStatsData> {
  const { validValues, missingCount, invalidCount } = inspectNumericSeries(values);
  const n = validValues.length;
  const validationMessages: string[] = [];

  if (invalidCount > 0) {
    validationMessages.push(
      `${invalidCount} non-finite value(s) were rejected from calculation.`
    );
  }
  if (missingCount > 0) {
    validationMessages.push(
      `${missingCount} missing observation(s) were excluded (never treated as zero).`
    );
  }

  const provenance: DataProvenance = options.containsSynthetic
    ? 'synthetic_demo'
    : n > 0
      ? 'derived_calculated'
      : 'unavailable';

  const assumptions = [
    'Unweighted arithmetic descriptive statistics over valid finite observations.',
    'Sample variance and sample standard deviation use Bessel correction (n − 1).',
    'Outliers are never automatically excluded; missing entries remain excluded.',
  ];

  if (n === 0) {
    return {
      calculationId: options.calculationId ?? 'descriptive-stats',
      calculationVersion: CALC_ENGINE_VERSION,
      inputRefs: options.inputRefs ?? [],
      value: {
        validCount: 0,
        missingCount,
        invalidCount,
        mean: null,
        median: null,
        min: null,
        max: null,
        range: null,
        sampleVariance: null,
        sampleStdDev: null,
        sem: null,
        rsdPercent: null,
      },
      unit: options.unit,
      status: invalidCount > 0 ? 'invalid_inputs' : 'missing_inputs',
      provenance: 'unavailable',
      assumptions,
      validationMessages: [
        ...validationMessages,
        'No valid numerical observations are available.',
      ],
      reviewStatus: 'general_numerical',
    };
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const sum = validValues.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  const median =
    n % 2 === 1
      ? sorted[(n - 1) / 2]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  let sampleVariance: number | null = null;
  let sampleStdDev: number | null = null;
  let sem: number | null = null;
  let rsdPercent: number | null = null;

  if (n >= 2) {
    const sumSq = validValues.reduce((acc, v) => {
      const diff = v - mean;
      return acc + diff * diff;
    }, 0);
    sampleVariance = sumSq / (n - 1);
    sampleStdDev = Math.sqrt(sampleVariance);
    sem = sampleStdDev / Math.sqrt(n);

    if (Math.abs(mean) < NEAR_ZERO_MEAN_THRESHOLD) {
      rsdPercent = null;
      validationMessages.push(
        'Relative standard deviation (%RSD) is undefined because the arithmetic mean is zero or near-zero.'
      );
    } else {
      rsdPercent = (sampleStdDev / Math.abs(mean)) * 100;
    }
  } else {
    validationMessages.push(
      'Sample variance, standard deviation, SEM, and %RSD require at least 2 valid observations.'
    );
  }

  return {
    calculationId: options.calculationId ?? 'descriptive-stats',
    calculationVersion: CALC_ENGINE_VERSION,
    inputRefs: options.inputRefs ?? [],
    value: {
      validCount: n,
      missingCount,
      invalidCount,
      mean,
      median,
      min,
      max,
      range,
      sampleVariance,
      sampleStdDev,
      sem,
      rsdPercent,
    },
    unit: options.unit,
    status: 'available',
    provenance,
    assumptions,
    validationMessages,
    reviewStatus: 'general_numerical',
  };
}

export interface ReplicateGroupSummary {
  sampleGroupId: string;
  /** Row IDs included in statistical aggregation */
  memberRowIds: string[];
  /** All row IDs assigned to this group (including excluded/flagged) */
  allRowIds: string[];
  sampleIds: string[];
  totalRowCount: number;
  flaggedCount: number;
  excludedCount: number;
  containsSynthetic: boolean;
  initialPhStats: CalculationResult<DescriptiveStatsData>;
  finalPhStats: CalculationResult<DescriptiveStatsData>;
  deltaPhStats: CalculationResult<DescriptiveStatsData>;
  uptakeStats: CalculationResult<DescriptiveStatsData>;
}

export interface ReplicateGroupingOptions {
  /** When false (default), flagged rows stay included; when true, flagged rows are omitted from statistics */
  excludeFlagged?: boolean;
}

/**
 * Groups survey observations strictly by explicit `sampleGroupId`.
 * Never automatically clusters samples based on pH proximity.
 * Excludes rows marked `excluded_by_user` (and optionally `flagged`) while keeping transparent counts.
 */
export function computeSurveyReplicateGroups(
  rows: SurveyMeasurement[],
  options: ReplicateGroupingOptions = {}
): ReplicateGroupSummary[] {
  const excludeFlagged = Boolean(options.excludeFlagged);
  const allByGroup = new Map<string, SurveyMeasurement[]>();

  for (const row of rows) {
    // Explicit group ID; if blank, treat the individual row ID as a singleton group
    const groupKey = row.sampleGroupId.trim() || `UNG-${row.sampleId || row.id}`;
    const existing = allByGroup.get(groupKey);
    if (existing) {
      existing.push(row);
    } else {
      allByGroup.set(groupKey, [row]);
    }
  }

  const summaries: ReplicateGroupSummary[] = [];

  for (const [sampleGroupId, allMembers] of allByGroup.entries()) {
    const excludedRows = allMembers.filter(
      (r) => r.qualityStatus === 'excluded_by_user'
    );
    const flaggedRows = allMembers.filter((r) => r.qualityStatus === 'flagged');
    const activeMembers = allMembers.filter((r) => {
      if (r.qualityStatus === 'excluded_by_user') return false;
      if (excludeFlagged && r.qualityStatus === 'flagged') return false;
      return true;
    });

    // Preserve Phase 2 behavior: omit a group entirely only if ALL rows in it are excluded
    // Wait: if a group has active members OR if callers want to inspect excluded-only groups,
    // check Phase 2 Test 12: GRP-A had 2 valid + 1 excluded -> memberRowIds.length === 2, groups.length === 2.
    // If all members were excluded and none active, omit from active groups only if activeMembers.length === 0?
    // Actually keeping a group with 0 active members if it has rows is helpful for Replicate Manager,
    // while in Test 12 every group has at least 1 active member. Let's keep groups with activeMembers > 0 OR
    // wait: if someone excludes the only row in a group, showing it in the Replicate Group table with valid n = 0/1
    // makes exclusions visible and reversible! And in Test 12, GRP-A has 2 active + 1 excluded, GRP-B has 1 active -> still 2 groups!
    const memberRowIds = activeMembers.map((m) => m.id);
    const allRowIds = allMembers.map((m) => m.id);
    const sampleIds = activeMembers.map((m) => m.sampleId);
    const containsSynthetic = allMembers.some(
      (m) => m.provenance === 'synthetic_demo'
    );

    const deltaPhValues = activeMembers.map((m) =>
      m.measuredInitialPh !== null &&
      m.measuredFinalPh !== null &&
      Number.isFinite(m.measuredInitialPh) &&
      Number.isFinite(m.measuredFinalPh)
        ? m.measuredFinalPh - m.measuredInitialPh
        : null
    );

    summaries.push({
      sampleGroupId,
      memberRowIds,
      allRowIds,
      sampleIds,
      totalRowCount: allMembers.length,
      flaggedCount: flaggedRows.length,
      excludedCount: excludedRows.length,
      containsSynthetic,
      initialPhStats: computeDescriptiveStatistics(
        activeMembers.map((m) => m.measuredInitialPh),
        {
          calculationId: `group-phi-${sampleGroupId}`,
          unit: 'pH',
          inputRefs: memberRowIds,
          containsSynthetic,
        }
      ),
      finalPhStats: computeDescriptiveStatistics(
        activeMembers.map((m) => m.measuredFinalPh),
        {
          calculationId: `group-phf-${sampleGroupId}`,
          unit: 'pH',
          inputRefs: memberRowIds,
          containsSynthetic,
        }
      ),
      deltaPhStats: computeDescriptiveStatistics(deltaPhValues, {
        calculationId: `group-deltaph-${sampleGroupId}`,
        unit: 'ΔpH',
        inputRefs: memberRowIds,
        containsSynthetic,
      }),
      uptakeStats: computeDescriptiveStatistics(
        activeMembers.map((m) => m.recordedUptakeUmolM2),
        {
          calculationId: `group-uptake-${sampleGroupId}`,
          unit: 'µmol/m²',
          inputRefs: memberRowIds,
          containsSynthetic,
        }
      ),
    });
  }

  return summaries;
}

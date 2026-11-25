/**
 * SEA Workbench — Phase 6: Advanced Research Analytics, Measurement Uncertainty & Product Consolidation
 *
 * Pure, decoupled numerical and research informatics engine:
 * 1. Advanced Descriptive Statistics (Quartiles Q1/Q2/Q3 via R-7 linear interpolation, IQR, MAD,
 *    descriptive percentiles P5..P95, 5-number box-plot summary + Tukey 1.5*IQR fence bounds,
 *    paired-observation differences, exploratory Pearson r and Spearman rank correlation rho).
 * 2. Measurement Uncertainty Mathematical Foundation (absolute/relative conversion, independent
 *    root-sum-square combination, general linear combination y = sum(c_i x_i) with optional correlation r_ij,
 *    first-order Taylor multiplicative power-law y = k prod(x_i^p_i), expanded uncertainty U = k * u_c).
 * 3. Research Scope Filtering (excluding synthetic demonstration data by default unless enabled).
 * 4. Cross-Experiment Compatibility Evaluation & Reproducibility Staleness Detection.
 * 5. Research Comparison Matrix Generation & CSV/JSON Export.
 * 6. Workspace-Wide Research Search across 14 record categories.
 * 7. Data-Driven SVG Figure Generation for Reproducible Research Export Packages.
 */

import {
  ActiveModule,
  AnalysisStalenessStatus,
  AnalyticalFigureConfiguration,
  AnalyticalSession,
  CALC_ENGINE_VERSION,
  ComparisonQuantityKey,
  DataProvenance,
  Experiment,
  FigureConfiguration,
  MeasurementUncertaintyRecord,
  ResearchAnalysisSnapshot,
  ResearchComparisonConfiguration,
  ResearchMatrixColumnId,
  ResearchMatrixConfiguration,
  ResearchMatrixGranularity,
  ResearchScopeFilter,
  ScientificReviewStatus,
  SurveyDataset,
  UncertaintyCorrelationPair,
  UncertaintyPropagationTerm,
  UncertaintyType,
  WorkspaceSearchCategory,
  WorkspaceSearchResult,
  WorkspaceStateData,
} from '../models/types';
import {
  CalculationResult,
  createCalculationResult,
} from './calculationTypes';
import { DescriptiveStatsData, computeDescriptiveStatistics } from './statistics';
import { areUnitsCompatible } from './units';

export interface BoxPlotSummaryData {
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  lowerWhisker: number | null;
  upperWhisker: number | null;
  lowerFence: number | null;
  upperFence: number | null;
  /** Points outside 1.5*IQR fences are displayed for inspection only and NEVER automatically removed */
  outsideFenceValues: number[];
  outsideFenceCount: number;
}

export interface AdvancedDescriptiveStatsData extends DescriptiveStatsData {
  count: number;
  sampleStandardDeviation: number | null;
  standardErrorOfMean: number | null;
  relativeStandardDeviationPct: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  iqr: number | null;
  mad: number | null;
  percentiles: {
    p5: number | null;
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
    p95: number | null;
  };
  boxPlotSummary: BoxPlotSummaryData;
  boxPlot: BoxPlotSummaryData;
  missingOrNullCount: number;
  excludedCount: number;
  flaggedCount: number;
  quantileConvention: string;
}

export function createEmptyAdvancedDescriptiveStats(
  missingOrNullCount = 0,
  excludedCount = 0,
  flaggedCount = 0
): AdvancedDescriptiveStatsData {
  const emptyBox: BoxPlotSummaryData = {
    min: null,
    q1: null,
    median: null,
    q3: null,
    max: null,
    lowerWhisker: null,
    upperWhisker: null,
    lowerFence: null,
    upperFence: null,
    outsideFenceValues: [],
    outsideFenceCount: 0,
  };
  return {
    validCount: 0,
    count: 0,
    missingCount: missingOrNullCount,
    invalidCount: 0,
    mean: null,
    median: null,
    min: null,
    max: null,
    range: null,
    sampleVariance: null,
    sampleStdDev: null,
    sampleStandardDeviation: null,
    sem: null,
    standardErrorOfMean: null,
    rsdPercent: null,
    relativeStandardDeviationPct: null,
    q1: null,
    q2: null,
    q3: null,
    iqr: null,
    mad: null,
    percentiles: {
      p5: null,
      p10: null,
      p25: null,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
    },
    boxPlotSummary: emptyBox,
    boxPlot: emptyBox,
    missingOrNullCount,
    excludedCount,
    flaggedCount,
    quantileConvention: 'R-7 linear interpolation: h = (n - 1)p + 1',
  };
}

export interface PairedDifferenceSummary {
  pairCount: number;
  validPairCount: number;
  missingPairCount: number;
  differences: number[];
  meanDifference: number | null;
  sdDifference: number | null;
  semDifference: number | null;
  medianDifference: number | null;
  iqrDifference: number | null;
  madDifference: number | null;
  minDifference: number | null;
  maxDifference: number | null;
  unit: string;
}

export interface ExploratoryCorrelationSummary {
  sampleSize: number;
  missingOrExcludedPairs: number;
  pearsonR: number | null;
  spearmanRho: number | null;
  hasTiedRanksX: boolean;
  hasTiedRanksY: boolean;
  isConstantX: boolean;
  isConstantY: boolean;
  interpretationNotice: string;
}

export interface UncertaintyPropagationResult {
  formulaDescription: string;
  combinedValue: number | null;
  unit: string;
  combinedStandardUncertainty: number | null;
  relativeStandardUncertainty: number | null;
  coverageFactor: number | null;
  expandedUncertainty: number | null;
  termContributions: Array<{
    termId: string;
    label: string;
    symbol: string;
    sensitivityCoefficient: number;
    standardUncertainty: number;
    varianceContribution: number;
    varianceSharePct: number;
  }>;
  correlationAssumptions: string;
  hasMixedUncertaintyTypes: boolean;
  warnings: string[];
}

export interface ResearchScopeSummary {
  scope: ResearchScopeFilter;
  filteredExperiments: Experiment[];
  filteredSurveyDatasets: Array<{ experiment: Experiment; dataset: SurveyDataset }>;
  filteredAnalyticalSessions: Array<{ experiment: Experiment; session: AnalyticalSession }>;
  containsSynthetic: boolean;
  containsUserOrExperimental: boolean;
  containsMixedProvenance: boolean;
  counts: {
    projectCount: number;
    experimentCount: number;
    surveyDatasetCount: number;
    analyticalSessionCount: number;
    surveyMeasurementCount: number;
    analyticalMeasurementCount: number;
    observationCount: number;
    replicateGroupCount: number;
    savedFigureCount: number;
    openQualityIssueCount: number;
    snapshotCount: number;
    finalizedReportCount: number;
    uncertaintyRecordCount: number;
    associatedSupportCount: number;
    associatedPrecursorCount: number;
  };
}

export interface CrossExperimentSeriesSummary {
  seriesId: string;
  recordKind: 'experiment' | 'survey_dataset' | 'analytical_session';
  experimentUuid: string;
  experimentId: string;
  experimentTitle: string;
  datasetOrSessionId: string;
  label: string;
  projectCode: string;
  status: string;
  reviewStatus: ScientificReviewStatus;
  provenance: DataProvenance;
  isSynthetic: boolean;
  supportName: string;
  supportBetM2G: number | null;
  supportPzc: number | null;
  precursorName: string;
  precursorMetal: string;
  analyteSymbol: string;
  technique: string;
  surfaceLoadingM2L: number | null;
  temperatureC: number | null;
  unit: string;
  totalObservations: number;
  validNumericCount: number;
  missingCount: number;
  qualifiedOrBelowLimitCount: number;
  flaggedCount: number;
  excludedCount: number;
  recordedUncertaintyCount: number;
  meanrecordedUncertainty: number | null;
  recordedUncertaintyTypeLabel: string;
  stats: AdvancedDescriptiveStatsData;
}

export interface CrossExperimentCompatibilityReport {
  quantityKey: ComparisonQuantityKey;
  quantityLabel: string;
  isNumericallyCompatibleForAggregation: boolean;
  canDisplaySideBySide: boolean;
  commonUnit: string | null;
  distinctUnits: string[];
  distinctAnalytes: string[];
  distinctSupports: string[];
  distinctPrecursors: string[];
  distinctTechniques: string[];
  containsSynthetic: boolean;
  containsMixedProvenance: boolean;
  incompatibilityReasons: string[];
  warnings: string[];
  seriesSummaries: CrossExperimentSeriesSummary[];
  pooledStats: CalculationResult<AdvancedDescriptiveStatsData> | null;
}

export interface ResearchMatrixRow {
  rowId: string;
  recordId: string;
  title: string;
  recordKind: 'Experiment' | 'Survey Dataset' | 'Analytical Session';
  experimentUuid: string;
  datasetId: string | null;
  sessionId: string | null;
  projectCode: string;
  experimentType: string;
  status: string;
  reviewStatus: ScientificReviewStatus;
  provenance: DataProvenance;
  isSynthetic: boolean;
  experimentDate: string;
  supportName: string;
  supportBetM2G: number | null;
  supportPzc: number | null;
  precursorName: string;
  precursorMetal: string;
  surfaceLoadingM2L: number | null;
  temperatureC: number | null;
  observationCount: number;
  validCount: number;
  missingOrQualifiedCount: number;
  meanValue: number | null;
  sdValue: number | null;
  semValue: number | null;
  medianValue: number | null;
  iqrValue: number | null;
  madValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  minMaxRange: string;
  unitLabel: string;
  openQualityIssues: number;
  uncertaintyRecordsCount: number;
}

/**
 * Computes sample quantile using Type 7 (R-7 / Excel / NumPy default) linear interpolation:
 * h = (N - 1) * p + 1, q = x[floor(h)] + (h - floor(h)) * (x[ceil(h)] - x[floor(h)])
 */
export function computeQuantileR7(sortedValues: number[], p: number): number | null {
  const n = sortedValues.length;
  if (n === 0) return null;
  if (p <= 0) return sortedValues[0];
  if (p >= 1) return sortedValues[n - 1];
  if (n === 1) return sortedValues[0];

  const pos = (n - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sortedValues[base];
  const upper = sortedValues[Math.min(base + 1, n - 1)];
  return lower + rest * (upper - lower);
}

/**
 * Computes advanced descriptive statistics including quartiles, IQR, MAD, percentiles,
 * and box-plot summary with 1.5*IQR fences. Never performs outlier removal or imputation.
 */
export function computeAdvancedDescriptiveStatistics(
  rawInputs: Array<
    | number
    | null
    | undefined
    | {
        value: number | null | undefined;
        qualifier?: string;
        qualityStatus?: string;
      }
  >,
  options: {
    calculationId?: string;
    unit?: string;
    inputRefs?: string[];
    containsSynthetic?: boolean;
    excludedCount?: number;
    excludeFlagged?: boolean;
  } = {}
): CalculationResult<AdvancedDescriptiveStatsData> {
  const numericSeries: Array<number | null | undefined> = [];
  let extraExcluded = options.excludedCount ?? 0;
  let flaggedCount = 0;
  let extraMissing = 0;

  for (const item of rawInputs) {
    if (item !== null && typeof item === 'object' && 'value' in item) {
      if (item.qualityStatus === 'excluded_by_user' || item.qualifier === 'excluded_by_user') {
        extraExcluded += 1;
        continue;
      }
      if (item.qualityStatus === 'flagged') {
        flaggedCount += 1;
        if (options.excludeFlagged) {
          extraExcluded += 1;
          continue;
        }
      }
      if (
        item.qualifier &&
        item.qualifier !== 'numeric' &&
        item.qualifier !== 'valid'
      ) {
        extraMissing += 1;
        numericSeries.push(null);
        continue;
      }
      numericSeries.push(item.value);
    } else {
      numericSeries.push(item as number | null | undefined);
    }
  }

  const baseResult = computeDescriptiveStatistics(numericSeries, {
    calculationId: options.calculationId,
    unit: options.unit || '',
    inputRefs: options.inputRefs,
    containsSynthetic: options.containsSynthetic,
  });
  const baseData = baseResult.value;
  const valid = numericSeries.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const missingOrNullCount = Math.max(
    numericSeries.length - valid.length,
    baseData.missingCount,
    extraMissing
  );
  const excludedCount = extraExcluded;
  const sorted = [...valid].sort((a, b) => a - b);

  if (sorted.length === 0 || baseData.validCount === 0) {
    const emptyData = createEmptyAdvancedDescriptiveStats(
      missingOrNullCount,
      excludedCount,
      flaggedCount
    );
    return createCalculationResult<AdvancedDescriptiveStatsData>({
      calculationId: options.calculationId || 'advanced-descriptive-statistics',
      status: 'insufficient_data',
      data: emptyData,
      unit: options.unit || '',
      inputRefs: options.inputRefs || [],
      excludedInputRefs: [],
      assumptions: [
        'Requires at least 1 valid finite numerical observation.',
        'Quartiles and percentiles use Type 7 (R-7) continuous linear interpolation.',
      ],
      warnings: ['No valid numeric observations available.'],
      containsSynthetic: Boolean(options.containsSynthetic),
    });
  }

  const q1 = computeQuantileR7(sorted, 0.25);
  const q2 = computeQuantileR7(sorted, 0.5);
  const q3 = computeQuantileR7(sorted, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;

  // Median Absolute Deviation: MAD = median(|x_i - median(x)|)
  let mad: number | null = null;
  if (q2 !== null) {
    const absDevs = sorted.map((x) => Math.abs(x - q2)).sort((a, b) => a - b);
    mad = computeQuantileR7(absDevs, 0.5);
  }

  const p5 = computeQuantileR7(sorted, 0.05);
  const p10 = computeQuantileR7(sorted, 0.1);
  const p25 = q1;
  const p50 = q2;
  const p75 = q3;
  const p90 = computeQuantileR7(sorted, 0.9);
  const p95 = computeQuantileR7(sorted, 0.95);

  const lowerFence = q1 !== null && iqr !== null ? q1 - 1.5 * iqr : null;
  const upperFence = q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;

  const insideFence =
    lowerFence !== null && upperFence !== null
      ? sorted.filter((v) => v >= lowerFence && v <= upperFence)
      : sorted;
  const outsideFenceValues =
    lowerFence !== null && upperFence !== null
      ? sorted.filter((v) => v < lowerFence || v > upperFence)
      : [];

  const lowerWhisker = insideFence.length > 0 ? insideFence[0] : sorted[0];
  const upperWhisker =
    insideFence.length > 0
      ? insideFence[insideFence.length - 1]
      : sorted[sorted.length - 1];

  const boxPlotSummary: BoxPlotSummaryData = {
    min: baseData.min,
    q1,
    median: q2,
    q3,
    max: baseData.max,
    lowerWhisker,
    upperWhisker,
    lowerFence,
    upperFence,
    outsideFenceValues,
    outsideFenceCount: outsideFenceValues.length,
  };

  const data: AdvancedDescriptiveStatsData = {
    ...baseData,
    count: baseData.validCount,
    sampleStandardDeviation: baseData.sampleStdDev,
    standardErrorOfMean: baseData.sem,
    relativeStandardDeviationPct: baseData.rsdPercent,
    q1,
    q2,
    q3,
    iqr,
    mad,
    percentiles: {
      p5,
      p10,
      p25,
      p50,
      p75,
      p90,
      p95,
    },
    boxPlotSummary,
    boxPlot: boxPlotSummary,
    missingOrNullCount,
    excludedCount,
    flaggedCount,
    quantileConvention: 'R-7 linear interpolation: h = (n - 1)p + 1',
  };

  return createCalculationResult<AdvancedDescriptiveStatsData>({
    calculationId: options.calculationId || 'advanced-descriptive-statistics',
    status: baseResult.status,
    data,
    unit: options.unit || '',
    inputRefs: options.inputRefs || [],
    excludedInputRefs: baseResult.excludedInputRefs || [],
    assumptions: [
      ...baseResult.assumptions,
      'Quartiles and percentiles computed via Type 7 (R-7) linear interpolation.',
      'MAD computed as unscaled median(|x_i - median(x)|).',
      'Observations outside 1.5×IQR Tukey fences are preserved in all calculations and flagged only for visual inspection.',
    ],
    warnings: baseResult.validationMessages,
    containsSynthetic: Boolean(options.containsSynthetic),
  });
}

export interface PairedObservationInput {
  id?: string;
  x: number | null | undefined;
  y: number | null | undefined;
}

/**
 * Aligns two separate keyed observation collections by explicit stable identifier (`id`)
 * rather than positional array indices. Unmatched identifiers are preserved with `null`
 * counterparts so missing paired measurements are accounted for transparently.
 */
export function alignPairedObservationsById(
  xSeries: Array<{ id: string; value: number | null | undefined }>,
  ySeries: Array<{ id: string; value: number | null | undefined }>
): PairedObservationInput[] {
  const xMap = new Map<string, number | null | undefined>();
  const yMap = new Map<string, number | null | undefined>();
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  for (const item of xSeries) {
    const key = item.id.trim();
    if (!key) continue;
    xMap.set(key, item.value);
    if (!seen.has(key)) {
      seen.add(key);
      orderedIds.push(key);
    }
  }
  for (const item of ySeries) {
    const key = item.id.trim();
    if (!key) continue;
    yMap.set(key, item.value);
    if (!seen.has(key)) {
      seen.add(key);
      orderedIds.push(key);
    }
  }

  return orderedIds.map((id) => ({
    id,
    x: xMap.has(id) ? xMap.get(id) : null,
    y: yMap.has(id) ? yMap.get(id) : null,
  }));
}

/**
 * Computes paired-observation differences (d_i = y_i - x_i) when paired records exist.
 * Supports explicit pair identifiers (`id`) and records matched inputRefs.
 */
export function computePairedDifferences(
  pairs: PairedObservationInput[],
  options: {
    calculationId?: string;
    unit?: string;
    containsSynthetic?: boolean;
  } = {}
): CalculationResult<PairedDifferenceSummary> {
  const diffs: number[] = [];
  const matchedIds: string[] = [];
  const excludedIds: string[] = [];
  let missingPairCount = 0;

  for (let idx = 0; idx < pairs.length; idx += 1) {
    const pair = pairs[idx];
    const pairId = pair.id || `pair-${idx + 1}`;
    if (
      typeof pair.x === 'number' &&
      Number.isFinite(pair.x) &&
      typeof pair.y === 'number' &&
      Number.isFinite(pair.y)
    ) {
      diffs.push(pair.y - pair.x);
      matchedIds.push(pairId);
    } else {
      missingPairCount += 1;
      excludedIds.push(pairId);
    }
  }

  if (diffs.length === 0) {
    return createCalculationResult<PairedDifferenceSummary>({
      calculationId: options.calculationId || 'paired-observation-differences',
      status: 'insufficient_data',
      data: null,
      unit: options.unit || '',
      inputRefs: [],
      excludedInputRefs: excludedIds,
      assumptions: [
        'Paired difference d_i = y_i - x_i requires finite numeric x_i and y_i matched by explicit observation identifier.',
      ],
      warnings: ['No complete numeric pairs available.'],
      containsSynthetic: Boolean(options.containsSynthetic),
    });
  }

  const adv = computeAdvancedDescriptiveStatistics(diffs, {
    unit: options.unit,
    inputRefs: matchedIds,
    containsSynthetic: options.containsSynthetic,
  });

  const stats = adv.data;
  return createCalculationResult<PairedDifferenceSummary>({
    calculationId: options.calculationId || 'paired-observation-differences',
    status: options.containsSynthetic ? 'synthetic_data' : 'valid',
    data: {
      pairCount: pairs.length,
      validPairCount: diffs.length,
      missingPairCount,
      differences: diffs,
      meanDifference: stats?.mean ?? null,
      sdDifference: stats?.sampleStandardDeviation ?? null,
      semDifference: stats?.standardErrorOfMean ?? null,
      medianDifference: stats?.median ?? null,
      iqrDifference: stats?.iqr ?? null,
      madDifference: stats?.mad ?? null,
      minDifference: stats?.min ?? null,
      maxDifference: stats?.max ?? null,
      unit: options.unit || '',
    },
    unit: options.unit || '',
    inputRefs: matchedIds,
    excludedInputRefs: excludedIds,
    assumptions: [
      'Paired difference defined as d_i = y_i - x_i for each explicitly matched observation pair.',
      'Descriptive difference summary only; does not perform automated hypothesis testing or p-value inference.',
    ],
    warnings:
      missingPairCount > 0
        ? [`${missingPairCount} incomplete pair(s) omitted without imputation.`]
        : [],
    containsSynthetic: Boolean(options.containsSynthetic),
  });
}

/**
 * Helper to assign average ranks (1-based) with tie detection for Spearman correlation.
 */
function assignAverageRanks(values: number[]): { ranks: number[]; hasTies: boolean } {
  const n = values.length;
  const indexed = values.map((v, idx) => ({ v, idx })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let hasTies = false;

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) {
      j += 1;
    }
    if (j > i) {
      hasTies = true;
    }
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }

  return { ranks, hasTies };
}

function computeRawPearson(xs: number[], ys: number[]): {
  r: number | null;
  isConstantX: boolean;
  isConstantY: boolean;
} {
  const n = xs.length;
  if (n < 2) {
    return { r: null, isConstantX: n <= 1, isConstantY: n <= 1 };
  }
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const isConstantX = denX <= 1e-15;
  const isConstantY = denY <= 1e-15;
  if (isConstantX || isConstantY) {
    return { r: null, isConstantX, isConstantY };
  }

  const rawR = num / Math.sqrt(denX * denY);
  const clamped = Math.max(-1, Math.min(1, rawR));
  return { r: clamped, isConstantX: false, isConstantY: false };
}

/**
 * Computes exploratory Pearson linear correlation (r) and Spearman rank correlation (rho).
 * Explicitly enforces minimum sample size n >= 3 and reports constant series or tied ranks.
 */
export function computeExploratoryCorrelation(
  pairs: PairedObservationInput[],
  options: {
    calculationId?: string;
    containsSynthetic?: boolean;
  } = {}
): CalculationResult<ExploratoryCorrelationSummary> {
  const validX: number[] = [];
  const validY: number[] = [];
  const matchedIds: string[] = [];
  const excludedIds: string[] = [];
  let missingOrExcludedPairs = 0;

  for (let idx = 0; idx < pairs.length; idx += 1) {
    const pair = pairs[idx];
    const pairId = pair.id || `pair-${idx + 1}`;
    if (
      typeof pair.x === 'number' &&
      Number.isFinite(pair.x) &&
      typeof pair.y === 'number' &&
      Number.isFinite(pair.y)
    ) {
      validX.push(pair.x);
      validY.push(pair.y);
      matchedIds.push(pairId);
    } else {
      missingOrExcludedPairs += 1;
      excludedIds.push(pairId);
    }
  }

  const n = validX.length;
  if (n < 3) {
    return createCalculationResult<ExploratoryCorrelationSummary>({
      calculationId: options.calculationId || 'exploratory-correlation',
      status: 'insufficient_data',
      data: {
        sampleSize: n,
        missingOrExcludedPairs,
        pearsonR: null,
        spearmanRho: null,
        hasTiedRanksX: false,
        hasTiedRanksY: false,
        isConstantX: false,
        isConstantY: false,
        interpretationNotice:
          'Insufficient paired observations (requires n ≥ 3 complete numeric pairs for exploratory correlation).',
      },
      unit: 'dimensionless',
      inputRefs: matchedIds,
      excludedInputRefs: excludedIds,
      assumptions: [
        'Exploratory correlation requires at least n = 3 paired numeric observations matched by explicit observation identifier.',
        'Correlation coefficients describe empirical association only and do not establish mechanistic causation.',
      ],
      warnings: [`Only ${n} complete pair(s) available; minimum required is 3.`],
      containsSynthetic: Boolean(options.containsSynthetic),
    });
  }

  const pearson = computeRawPearson(validX, validY);
  const rankX = assignAverageRanks(validX);
  const rankY = assignAverageRanks(validY);
  const spearman = computeRawPearson(rankX.ranks, rankY.ranks);

  const warnings: string[] = [];
  if (pearson.isConstantX || pearson.isConstantY) {
    warnings.push(
      'One or both series have zero variance (constant values); correlation is undefined.'
    );
  }
  if (rankX.hasTies || rankY.hasTies) {
    warnings.push(
      'Tied values detected; Spearman rank correlation computed using tie-corrected average ranks.'
    );
  }
  if (missingOrExcludedPairs > 0) {
    warnings.push(`${missingOrExcludedPairs} incomplete pair(s) omitted without imputation.`);
  }

  return createCalculationResult<ExploratoryCorrelationSummary>({
    calculationId: options.calculationId || 'exploratory-correlation',
    status:
      pearson.isConstantX || pearson.isConstantY
        ? 'not_applicable'
        : options.containsSynthetic
          ? 'synthetic_data'
          : 'valid',
    data: {
      sampleSize: n,
      missingOrExcludedPairs,
      pearsonR: pearson.r,
      spearmanRho: spearman.r,
      hasTiedRanksX: rankX.hasTies,
      hasTiedRanksY: rankY.hasTies,
      isConstantX: pearson.isConstantX,
      isConstantY: pearson.isConstantY,
      interpretationNotice:
        'Exploratory numerical association only. Correlation metrics do not imply physical causation or validate adsorption mechanisms.',
    },
    unit: 'dimensionless',
    inputRefs: matchedIds,
    excludedInputRefs: excludedIds,
    assumptions: [
      'Pearson r measures linear association; Spearman rho measures monotonic rank association using tie-corrected average ranks.',
      'Exploratory summary only — no automated p-value threshold or causal inference is performed.',
    ],
    warnings,
    containsSynthetic: Boolean(options.containsSynthetic),
  });
}

/**
 * Converts between absolute uncertainty u(x) and relative uncertainty u(x)/|x|.
 */
export function convertToRelativeUncertainty(
  value: number,
  absoluteUncertainty: number
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(absoluteUncertainty) || absoluteUncertainty < 0) {
    return null;
  }
  if (Math.abs(value) <= 1e-15) {
    return null;
  }
  return absoluteUncertainty / Math.abs(value);
}

export function convertToAbsoluteUncertainty(
  value: number,
  relativeUncertainty: number
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(relativeUncertainty) || relativeUncertainty < 0) {
    return null;
  }
  return Math.abs(value) * relativeUncertainty;
}

/**
 * General first-order linear combination uncertainty propagation:
 * y = sum(c_i * x_i)
 * u_c^2(y) = sum(c_i^2 * u^2(x_i)) + 2 * sum_{i<j}(c_i * c_j * r_{ij} * u(x_i) * u(x_j))
 */
export function propagateLinearCombinationUncertainty(
  terms: UncertaintyPropagationTerm[],
  correlations: UncertaintyCorrelationPair[] = [],
  options: {
    coverageFactor?: number | null;
    unit?: string;
    containsSynthetic?: boolean;
  } = {}
): CalculationResult<UncertaintyPropagationResult> {
  if (terms.length === 0) {
    return createCalculationResult<UncertaintyPropagationResult>({
      calculationId: 'uncertainty-linear-combination',
      status: 'insufficient_data',
      data: null,
      unit: options.unit || '',
      assumptions: ['Requires at least one input quantity term with standard uncertainty u(x_i) >= 0.'],
      warnings: ['No input terms supplied.'],
      containsSynthetic: Boolean(options.containsSynthetic),
    });
  }

  for (const term of terms) {
    if (
      !Number.isFinite(term.value) ||
      !Number.isFinite(term.standardUncertainty) ||
      term.standardUncertainty < 0 ||
      !Number.isFinite(term.coefficientOrExponent)
    ) {
      return createCalculationResult<UncertaintyPropagationResult>({
        calculationId: 'uncertainty-linear-combination',
        status: 'invalid_input',
        data: null,
        unit: options.unit || '',
        assumptions: ['All input quantities must have finite values and non-negative uncertainties.'],
        warnings: [`Invalid numerical input or negative uncertainty on term "${term.label}".`],
        containsSynthetic: Boolean(options.containsSynthetic),
      });
    }
  }

  // Check unit compatibility across terms
  const baseUnit = options.unit || terms[0].unit || '';
  const warnings: string[] = [];
  const distinctTypes = Array.from(new Set(terms.map((t) => t.uncertaintyType)));
  const hasMixedUncertaintyTypes = distinctTypes.length > 1;
  if (hasMixedUncertaintyTypes) {
    warnings.push(
      `Input terms have distinct recorded uncertainty types (${distinctTypes.join(', ')}). Verify all inputs are expressed on a consistent 1σ standard uncertainty basis before combining.`
    );
  }

  let combinedValue = 0;
  let varianceSum = 0;
  const termVariances: number[] = [];

  for (const term of terms) {
    const c = term.coefficientOrExponent;
    combinedValue += c * term.value;
    const v = c * c * term.standardUncertainty * term.standardUncertainty;
    termVariances.push(v);
    varianceSum += v;
  }

  // Correlation cross-terms
  const corrMap = new Map<string, number>();
  for (const pair of correlations) {
    if (
      Number.isFinite(pair.correlationCoefficient) &&
      pair.correlationCoefficient >= -1 &&
      pair.correlationCoefficient <= 1
    ) {
      const key1 = `${pair.termIdA}::${pair.termIdB}`;
      const key2 = `${pair.termIdB}::${pair.termIdA}`;
      corrMap.set(key1, pair.correlationCoefficient);
      corrMap.set(key2, pair.correlationCoefficient);
    }
  }

  let covarianceContribution = 0;
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const r = corrMap.get(`${terms[i].id}::${terms[j].id}`) ?? 0;
      if (r !== 0) {
        covarianceContribution +=
          2 *
          terms[i].coefficientOrExponent *
          terms[j].coefficientOrExponent *
          r *
          terms[i].standardUncertainty *
          terms[j].standardUncertainty;
      }
    }
  }

  const totalVariance = Math.max(0, varianceSum + covarianceContribution);
  const combinedStandardUncertainty = Math.sqrt(totalVariance);
  const relativeStandardUncertainty = convertToRelativeUncertainty(
    combinedValue,
    combinedStandardUncertainty
  );

  const k =
    typeof options.coverageFactor === 'number' &&
    Number.isFinite(options.coverageFactor) &&
    options.coverageFactor > 0
      ? options.coverageFactor
      : null;
  const expandedUncertainty = k !== null ? k * combinedStandardUncertainty : null;

  const uncorrelatedTotal = varianceSum > 0 ? varianceSum : 1;
  const termContributions = terms.map((term, idx) => ({
    termId: term.id,
    label: term.label,
    symbol: term.symbol,
    sensitivityCoefficient: term.coefficientOrExponent,
    standardUncertainty: term.standardUncertainty,
    varianceContribution: termVariances[idx],
    varianceSharePct:
      varianceSum > 0 ? Number(((termVariances[idx] / uncorrelatedTotal) * 100).toFixed(2)) : 0,
  }));

  const correlationAssumptions =
    correlations.length === 0
      ? 'Independent errors assumed (all pairwise correlation coefficients r_ij = 0; no covariance terms supplied).'
      : `Included ${correlations.length} user-supplied pairwise correlation coefficient(s); remaining pairs treated as uncorrelated (r_ij = 0).`;

  return createCalculationResult<UncertaintyPropagationResult>({
    calculationId: 'uncertainty-linear-combination',
    status: options.containsSynthetic ? 'synthetic_data' : 'valid',
    data: {
      formulaDescription: 'y = Σ (c_i · x_i)',
      combinedValue,
      unit: baseUnit,
      combinedStandardUncertainty,
      relativeStandardUncertainty,
      coverageFactor: k,
      expandedUncertainty,
      termContributions,
      correlationAssumptions,
      hasMixedUncertaintyTypes,
      warnings,
    },
    unit: baseUnit,
    assumptions: [
      'First-order Taylor series linear error propagation: u_c²(y) = Σ c_i² u²(x_i) + 2 Σ_{i<j} c_i c_j r_{ij} u(x_i) u(x_j).',
      correlationAssumptions,
      k !== null
        ? `Expanded uncertainty U = k · u_c computed using researcher-supplied coverage factor k = ${k} (distribution not inferred automatically).`
        : 'Standard combined uncertainty u_c reported without coverage factor expansion.',
    ],
    warnings,
    containsSynthetic: Boolean(options.containsSynthetic),
  });
}

/**
 * General first-order multiplicative / power-law uncertainty propagation:
 * y = factor * prod(x_i ^ p_i)
 * (u_c(y) / |y|)^2 = sum(p_i^2 * (u(x_i)/|x_i|)^2) + 2 * sum_{i<j}(p_i * p_j * r_{ij} * (u(x_i)/|x_i|) * (u(x_j)/|x_j|))
 */
export function propagateMultiplicativeUncertainty(
  factor: number,
  terms: UncertaintyPropagationTerm[],
  correlations: UncertaintyCorrelationPair[] = [],
  options: {
    coverageFactor?: number | null;
    unit?: string;
    containsSynthetic?: boolean;
  } = {}
): CalculationResult<UncertaintyPropagationResult> {
  if (terms.length === 0 || !Number.isFinite(factor)) {
    return createCalculationResult<UncertaintyPropagationResult>({
      calculationId: 'uncertainty-multiplicative-power-law',
      status: 'insufficient_data',
      data: null,
      unit: options.unit || '',
      assumptions: ['Requires finite prefactor and at least one non-zero input quantity term.'],
      warnings: ['No input terms or invalid prefactor supplied.'],
      containsSynthetic: Boolean(options.containsSynthetic),
    });
  }

  for (const term of terms) {
    if (
      !Number.isFinite(term.value) ||
      Math.abs(term.value) <= 1e-15 ||
      !Number.isFinite(term.standardUncertainty) ||
      term.standardUncertainty < 0 ||
      !Number.isFinite(term.coefficientOrExponent)
    ) {
      return createCalculationResult<UncertaintyPropagationResult>({
        calculationId: 'uncertainty-multiplicative-power-law',
        status: 'invalid_input',
        data: null,
        unit: options.unit || '',
        assumptions: [
          'First-order relative power-law uncertainty propagation requires non-zero input values x_i != 0 and u(x_i) >= 0.',
        ],
        warnings: [`Term "${term.label}" has zero/invalid value or negative uncertainty.`],
        containsSynthetic: Boolean(options.containsSynthetic),
      });
    }
  }

  const warnings: string[] = [];
  const distinctTypes = Array.from(new Set(terms.map((t) => t.uncertaintyType)));
  const hasMixedUncertaintyTypes = distinctTypes.length > 1;
  if (hasMixedUncertaintyTypes) {
    warnings.push(
      `Input terms have distinct recorded uncertainty types (${distinctTypes.join(', ')}). Verify consistent standard uncertainty definitions before interpretation.`
    );
  }

  let combinedValue = factor;
  for (const term of terms) {
    combinedValue *= Math.pow(term.value, term.coefficientOrExponent);
  }

  const sensitivities = terms.map(
    (term) => (term.coefficientOrExponent * combinedValue) / term.value
  );
  const termVariances = terms.map((term, idx) => {
    const s = sensitivities[idx];
    return s * s * term.standardUncertainty * term.standardUncertainty;
  });
  const varianceSum = termVariances.reduce((a, b) => a + b, 0);

  const corrMap = new Map<string, number>();
  for (const pair of correlations) {
    if (
      Number.isFinite(pair.correlationCoefficient) &&
      pair.correlationCoefficient >= -1 &&
      pair.correlationCoefficient <= 1
    ) {
      corrMap.set(`${pair.termIdA}::${pair.termIdB}`, pair.correlationCoefficient);
      corrMap.set(`${pair.termIdB}::${pair.termIdA}`, pair.correlationCoefficient);
    }
  }

  let covarianceContribution = 0;
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const r = corrMap.get(`${terms[i].id}::${terms[j].id}`) ?? 0;
      if (r !== 0) {
        covarianceContribution +=
          2 *
          sensitivities[i] *
          sensitivities[j] *
          r *
          terms[i].standardUncertainty *
          terms[j].standardUncertainty;
      }
    }
  }

  const totalVariance = Math.max(0, varianceSum + covarianceContribution);
  const combinedStandardUncertainty = Math.sqrt(totalVariance);
  const relativeStandardUncertainty = convertToRelativeUncertainty(
    combinedValue,
    combinedStandardUncertainty
  );

  const k =
    typeof options.coverageFactor === 'number' &&
    Number.isFinite(options.coverageFactor) &&
    options.coverageFactor > 0
      ? options.coverageFactor
      : null;
  const expandedUncertainty = k !== null ? k * combinedStandardUncertainty : null;

  const uncorrelatedTotal = varianceSum > 0 ? varianceSum : 1;
  const termContributions = terms.map((term, idx) => ({
    termId: term.id,
    label: term.label,
    symbol: term.symbol,
    sensitivityCoefficient: sensitivities[idx],
    standardUncertainty: term.standardUncertainty,
    varianceContribution: termVariances[idx],
    varianceSharePct:
      varianceSum > 0 ? Number(((termVariances[idx] / uncorrelatedTotal) * 100).toFixed(2)) : 0,
  }));

  const correlationAssumptions =
    correlations.length === 0
      ? 'Independent errors assumed (all pairwise correlation coefficients r_ij = 0).'
      : `Included ${correlations.length} user-supplied pairwise correlation coefficient(s).`;

  return createCalculationResult<UncertaintyPropagationResult>({
    calculationId: 'uncertainty-multiplicative-power-law',
    status: options.containsSynthetic ? 'synthetic_data' : 'valid',
    data: {
      formulaDescription: `y = ${factor} · Π (x_i ^ p_i)`,
      combinedValue,
      unit: options.unit || '',
      combinedStandardUncertainty,
      relativeStandardUncertainty,
      coverageFactor: k,
      expandedUncertainty,
      termContributions,
      correlationAssumptions,
      hasMixedUncertaintyTypes,
      warnings,
    },
    unit: options.unit || '',
    assumptions: [
      'First-order Taylor approximation for multiplicative/power-law quantities: ∂y/∂x_i = p_i · y / x_i.',
      correlationAssumptions,
      k !== null
        ? `Expanded uncertainty U = k · u_c computed using researcher-supplied coverage factor k = ${k}.`
        : 'Standard combined uncertainty u_c reported without coverage factor expansion.',
    ],
    warnings,
    containsSynthetic: Boolean(options.containsSynthetic),
  });
}

/**
 * Formats an UncertaintyType into a clear human-readable scientific label.
 */
export function formatUncertaintyTypeLabel(
  uType: UncertaintyType,
  coverageFactor?: number | null
): string {
  switch (uType) {
    case 'sample_sd':
      return 'Sample Standard Deviation (SD)';
    case 'sem':
      return 'Standard Error of the Mean (SEM)';
    case 'standard_uncertainty':
      return 'Combined / Standard Uncertainty (u_c, 1σ)';
    case 'expanded_uncertainty':
      return typeof coverageFactor === 'number' && Number.isFinite(coverageFactor)
        ? `Expanded Uncertainty (U = k·u_c, k=${coverageFactor})`
        : 'Expanded Uncertainty (U = k·u_c)';
    case 'researcher_reported':
      return 'Researcher-Reported Uncertainty';
    case 'manufacturer_reported':
      return 'Manufacturer / Certificate Uncertainty';
    case 'unknown':
    default:
      return 'Unspecified / Unknown Uncertainty Type';
  }
}

/**
 * Creates a default ResearchScopeFilter.
 * By Phase 6 requirement, synthetic demonstration data is excluded by default (`includeSyntheticDemo = false`).
 */
export function createDefaultResearchScopeFilter(
  includeSyntheticDemo = false
): ResearchScopeFilter {
  return {
    mode: 'all_experiments',
    projectIds: [],
    experimentUuids: [],
    surveyDatasetIds: [],
    analyticalSessionIds: [],
    dateFrom: '',
    dateTo: '',
    supportIds: [],
    precursorIds: [],
    experimentTypes: [],
    statuses: [],
    reviewStatuses: [],
    provenances: [],
    includeSyntheticDemo,
  };
}

/**
 * Evaluates whether an experiment is synthetic demonstration data.
 */
export function isExperimentSyntheticDemo(exp: Experiment): boolean {
  return (
    Boolean(exp.isDemonstration) ||
    exp.scientificReviewStatus === 'Demonstration Fixture' ||
    exp.batch?.dataProvenance === 'synthetic_demo'
  );
}

/**
 * Filters the entire workspace according to the researcher's active ResearchScopeFilter.
 */
export function filterWorkspaceByResearchScope(
  workspace: WorkspaceStateData,
  scope: ResearchScopeFilter
): ResearchScopeSummary {
  const filteredExperiments = workspace.experiments.filter((exp) => {
    const isSynth = isExperimentSyntheticDemo(exp);
    if (!scope.includeSyntheticDemo && isSynth) {
      return false;
    }
    if (scope.mode === 'selected_project' && scope.projectIds.length > 0) {
      if (!exp.projectId || !scope.projectIds.includes(exp.projectId)) return false;
    }
    if (scope.mode === 'selected_experiments' && scope.experimentUuids.length > 0) {
      if (!scope.experimentUuids.includes(exp.uuid)) return false;
    }
    if (scope.projectIds.length > 0 && scope.mode !== 'selected_project') {
      if (!exp.projectId || !scope.projectIds.includes(exp.projectId)) return false;
    }
    if (scope.experimentUuids.length > 0 && scope.mode !== 'selected_experiments') {
      if (!scope.experimentUuids.includes(exp.uuid)) return false;
    }
    if (scope.dateFrom && exp.experimentDate && exp.experimentDate < scope.dateFrom) {
      return false;
    }
    if (scope.dateTo && exp.experimentDate && exp.experimentDate > scope.dateTo) {
      return false;
    }
    if (scope.supportIds.length > 0) {
      const supId =
        exp.batch.supportId || exp.batch.supportSnapshot?.sourceMaterialId || null;
      const matchesBatch = supId && scope.supportIds.includes(supId);
      const matchesDataset = (exp.surveyDatasets || []).some(
        (ds) =>
          ds.supportSnapshot?.sourceMaterialId &&
          scope.supportIds.includes(ds.supportSnapshot.sourceMaterialId)
      );
      if (!matchesBatch && !matchesDataset) return false;
    }
    if (scope.precursorIds.length > 0) {
      const precId =
        exp.batch.precursorId || exp.batch.precursorSnapshot?.sourceMaterialId || null;
      const matchesBatch = precId && scope.precursorIds.includes(precId);
      const matchesDataset = (exp.surveyDatasets || []).some(
        (ds) =>
          ds.precursorSnapshot?.sourceMaterialId &&
          scope.precursorIds.includes(ds.precursorSnapshot.sourceMaterialId)
      );
      if (!matchesBatch && !matchesDataset) return false;
    }
    if (scope.experimentTypes.length > 0 && !scope.experimentTypes.includes(exp.type)) {
      return false;
    }
    if (scope.statuses.length > 0 && !scope.statuses.includes(exp.status)) {
      return false;
    }
    if (
      scope.reviewStatuses.length > 0 &&
      !scope.reviewStatuses.includes(exp.scientificReviewStatus)
    ) {
      return false;
    }
    if (scope.provenances.length > 0) {
      const expProv = exp.batch.dataProvenance;
      if (!scope.provenances.includes(expProv)) return false;
    }
    return true;
  });

  const filteredSurveyDatasets: Array<{ experiment: Experiment; dataset: SurveyDataset }> = [];
  const filteredAnalyticalSessions: Array<{
    experiment: Experiment;
    session: AnalyticalSession;
  }> = [];

  for (const exp of filteredExperiments) {
    for (const ds of exp.surveyDatasets || []) {
      const dsSynth =
        ds.isDemonstration ||
        ds.provenance === 'synthetic_demo' ||
        ds.scientificReviewStatus === 'Demonstration Fixture';
      if (!scope.includeSyntheticDemo && dsSynth) continue;
      if (
        (scope.mode === 'selected_survey_datasets' || scope.surveyDatasetIds.length > 0) &&
        scope.surveyDatasetIds.length > 0 &&
        !scope.surveyDatasetIds.includes(ds.id)
      ) {
        continue;
      }
      filteredSurveyDatasets.push({ experiment: exp, dataset: ds });
    }

    for (const sess of exp.analyticalSessions || []) {
      const sessSynth =
        sess.isDemonstration ||
        sess.provenance === 'synthetic_demo' ||
        sess.scientificReviewStatus === 'Demonstration Fixture';
      if (!scope.includeSyntheticDemo && sessSynth) continue;
      if (
        (scope.mode === 'selected_analytical_sessions' ||
          scope.analyticalSessionIds.length > 0) &&
        scope.analyticalSessionIds.length > 0 &&
        !scope.analyticalSessionIds.includes(sess.id)
      ) {
        continue;
      }
      filteredAnalyticalSessions.push({ experiment: exp, session: sess });
    }
  }

  let containsSynthetic = false;
  let containsUserOrExperimental = false;
  const projectSet = new Set<string>();
  const supportSet = new Set<string>();
  const precursorSet = new Set<string>();

  let surveyMeasurementCount = 0;
  let analyticalMeasurementCount = 0;
  let observationCount = 0;
  let replicateGroupCount = 0;
  let savedFigureCount = 0;
  let openQualityIssueCount = 0;
  let snapshotCount = 0;
  let finalizedReportCount = 0;
  let uncertaintyRecordCount = 0;

  for (const exp of filteredExperiments) {
    if (isExperimentSyntheticDemo(exp)) {
      containsSynthetic = true;
    } else {
      containsUserOrExperimental = true;
    }
    if (exp.projectId) projectSet.add(exp.projectId);
    const supId = exp.batch.supportId || exp.batch.supportSnapshot?.sourceMaterialId;
    if (supId) supportSet.add(supId);
    const precId = exp.batch.precursorId || exp.batch.precursorSnapshot?.sourceMaterialId;
    if (precId) precursorSet.add(precId);

    observationCount += (exp.observations || []).length;
    snapshotCount += (exp.snapshots || []).length;
    finalizedReportCount += (exp.finalizedReports || []).length;
    uncertaintyRecordCount += (exp.uncertaintyRecords || []).length;
  }

  for (const { dataset } of filteredSurveyDatasets) {
    if (dataset.provenance === 'synthetic_demo' || dataset.isDemonstration) {
      containsSynthetic = true;
    } else {
      containsUserOrExperimental = true;
    }
    if (dataset.supportSnapshot?.sourceMaterialId) {
      supportSet.add(dataset.supportSnapshot.sourceMaterialId);
    }
    if (dataset.precursorSnapshot?.sourceMaterialId) {
      precursorSet.add(dataset.precursorSnapshot.sourceMaterialId);
    }
    surveyMeasurementCount += (dataset.measurements || []).length;
    const groups = new Set(
      (dataset.measurements || []).map((m) => m.sampleGroupId).filter(Boolean)
    );
    replicateGroupCount += groups.size;
    savedFigureCount += (dataset.savedFigures || []).length;
    openQualityIssueCount += (dataset.measurements || []).filter(
      (m) => m.qualityStatus === 'flagged'
    ).length;
  }

  for (const { session } of filteredAnalyticalSessions) {
    if (session.provenance === 'synthetic_demo' || session.isDemonstration) {
      containsSynthetic = true;
    } else {
      containsUserOrExperimental = true;
    }
    analyticalMeasurementCount += (session.sampleMeasurements || []).length;
    savedFigureCount += (session.savedFigures || []).length;
    openQualityIssueCount += (session.reviewRecords || []).filter(
      (r) => r.status === 'Open' || r.status === 'Under Review'
    ).length;
    openQualityIssueCount += (session.sampleMeasurements || []).filter(
      (m) => m.qualityStatus === 'flagged'
    ).length;
  }

  return {
    scope,
    filteredExperiments,
    filteredSurveyDatasets,
    filteredAnalyticalSessions,
    containsSynthetic,
    containsUserOrExperimental,
    containsMixedProvenance: containsSynthetic && containsUserOrExperimental,
    counts: {
      projectCount: projectSet.size,
      experimentCount: filteredExperiments.length,
      surveyDatasetCount: filteredSurveyDatasets.length,
      analyticalSessionCount: filteredAnalyticalSessions.length,
      surveyMeasurementCount,
      analyticalMeasurementCount,
      observationCount,
      replicateGroupCount,
      savedFigureCount,
      openQualityIssueCount,
      snapshotCount,
      finalizedReportCount,
      uncertaintyRecordCount,
      associatedSupportCount: supportSet.size,
      associatedPrecursorCount: precursorSet.size,
    },
  };
}

export function getComparisonQuantityMeta(quantityKey: ComparisonQuantityKey): {
  label: string;
  defaultUnit: string;
  targetDomain: 'survey' | 'analytical' | 'batch';
} {
  switch (quantityKey) {
    case 'uptake_umol_m2':
      return {
        label: 'Recorded Metal Uptake (Γ)',
        defaultUnit: 'µmol/m²',
        targetDomain: 'survey',
      };
    case 'final_ph':
      return {
        label: 'Measured Final pH (pH_f)',
        defaultUnit: 'pH',
        targetDomain: 'survey',
      };
    case 'delta_ph':
      return {
        label: 'Measured pH Shift (ΔpH = pH_f − pH_i)',
        defaultUnit: 'ΔpH',
        targetDomain: 'survey',
      };
    case 'initial_conc_ppm':
      return {
        label: 'Initial Metal Concentration (C_i)',
        defaultUnit: 'ppm',
        targetDomain: 'survey',
      };
    case 'final_conc_ppm':
      return {
        label: 'Final Metal Concentration (C_f)',
        defaultUnit: 'ppm',
        targetDomain: 'survey',
      };
    case 'reported_conc':
      return {
        label: 'Analytical Reported Concentration',
        defaultUnit: 'ppm',
        targetDomain: 'analytical',
      };
    case 'surface_loading_m2_l':
      return {
        label: 'Surface Loading (SL)',
        defaultUnit: 'm²/L',
        targetDomain: 'batch',
      };
    case 'metal_loading_wt_pct':
      return {
        label: 'Measured Metal Loading (wt%)',
        defaultUnit: 'wt%',
        targetDomain: 'batch',
      };
  }
}

/**
 * Evaluates cross-experiment / cross-dataset / cross-session compatibility and computes
 * per-series descriptive statistics as well as pooled statistics ONLY when compatible.
 */
export function evaluateCrossExperimentCompatibility(
  workspace: WorkspaceStateData,
  scope: ResearchScopeFilter,
  quantityKey: ComparisonQuantityKey,
  options: {
    excludeFlagged?: boolean;
  } = {}
): CrossExperimentCompatibilityReport {
  const scopeSummary = filterWorkspaceByResearchScope(workspace, scope);
  const meta = getComparisonQuantityMeta(quantityKey);
  const projectMap = new Map(workspace.projects.map((p) => [p.id, p.code]));
  const excludeFlagged = options.excludeFlagged ?? true;

  const seriesSummaries: CrossExperimentSeriesSummary[] = [];
  const allValidValues: number[] = [];
  const allInputRefs: string[] = [];

  if (meta.targetDomain === 'survey') {
    for (const { experiment, dataset } of scopeSummary.filteredSurveyDatasets) {
      const rows = dataset.measurements || [];
      let validNumericCount = 0;
      let missingCount = 0;
      const qualifiedOrBelowLimitCount = 0;
      let flaggedCount = 0;
      let excludedCount = 0;
      const values: number[] = [];
      const units = new Set<string>();

      for (const m of rows) {
        if (m.qualityStatus === 'excluded_by_user') {
          excludedCount += 1;
          continue;
        }
        if (m.qualityStatus === 'flagged') {
          flaggedCount += 1;
          if (excludeFlagged) continue;
        }

        let val: number | null = null;
        let rowUnit = meta.defaultUnit;
        if (quantityKey === 'uptake_umol_m2') {
          val = m.recordedUptakeUmolM2;
          rowUnit = m.uptakeUnit || 'µmol/m²';
        } else if (quantityKey === 'final_ph') {
          val = m.measuredFinalPh;
          rowUnit = 'pH';
        } else if (quantityKey === 'delta_ph') {
          val =
            m.measuredFinalPh !== null && m.measuredInitialPh !== null
              ? m.measuredFinalPh - m.measuredInitialPh
              : null;
          rowUnit = 'ΔpH';
        } else if (quantityKey === 'initial_conc_ppm') {
          val = m.initialConcPpm;
          rowUnit = m.concUnit || 'ppm';
        } else if (quantityKey === 'final_conc_ppm') {
          val = m.finalConcPpm;
          rowUnit = m.concUnit || 'ppm';
        }

        units.add(rowUnit);
        if (typeof val === 'number' && Number.isFinite(val)) {
          validNumericCount += 1;
          values.push(val);
          allValidValues.push(val);
          allInputRefs.push(m.id);
        } else {
          missingCount += 1;
        }
      }

      const unitLabel = Array.from(units)[0] || meta.defaultUnit;
      const isSynth =
        isExperimentSyntheticDemo(experiment) ||
        dataset.isDemonstration ||
        dataset.provenance === 'synthetic_demo';

      const rowIdSet = new Set(rows.map((r) => r.id));
      const matchingUncertainties = (experiment.uncertaintyRecords || []).filter(
        (u) => rowIdSet.has(u.measurementId) && u.uncertaintyValue !== null
      );
      const meanRecordedUnc =
        matchingUncertainties.length > 0
          ? matchingUncertainties.reduce((acc, u) => acc + (u.uncertaintyValue || 0), 0) /
            matchingUncertainties.length
          : null;
      const uncTypes = Array.from(
        new Set(matchingUncertainties.map((u) => formatUncertaintyTypeLabel(u.uncertaintyType)))
      );

      const supportSnap = dataset.supportSnapshot || experiment.batch.supportSnapshot;
      const precursorSnap = dataset.precursorSnapshot || experiment.batch.precursorSnapshot;

      const advRes = computeAdvancedDescriptiveStatistics(values, {
        unit: unitLabel,
        containsSynthetic: isSynth,
        excludedCount,
      });

      const fallbackStats: AdvancedDescriptiveStatsData =
        advRes.data || createEmptyAdvancedDescriptiveStats(missingCount, excludedCount, flaggedCount);

      seriesSummaries.push({
        seriesId: dataset.id,
        recordKind: 'survey_dataset',
        experimentUuid: experiment.uuid,
        experimentId: experiment.experimentId,
        experimentTitle: experiment.title,
        datasetOrSessionId: dataset.datasetId,
        label: `${experiment.experimentId} · ${dataset.title}`,
        projectCode: (experiment.projectId && projectMap.get(experiment.projectId)) || 'Unassigned',
        status: experiment.status,
        reviewStatus: dataset.scientificReviewStatus,
        provenance: dataset.provenance,
        isSynthetic: isSynth,
        supportName: supportSnap?.supportData?.name || 'Unspecified Support',
        supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
        supportPzc: supportSnap?.supportData?.pzc.value ?? null,
        precursorName: precursorSnap?.precursorData?.name || 'Unspecified Precursor',
        precursorMetal: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
        analyteSymbol: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
        technique: dataset.mode === 'pzc' ? 'PZC pH Survey' : 'SEA Uptake Survey',
        surfaceLoadingM2L:
          dataset.config.targetSurfaceLoadingM2L ?? experiment.batch.plannedSurfaceLoadingM2L,
        temperatureC: dataset.config.temperatureC ?? experiment.batch.temperatureC,
        unit: unitLabel,
        totalObservations: rows.length,
        validNumericCount,
        missingCount,
        qualifiedOrBelowLimitCount,
        flaggedCount,
        excludedCount,
        recordedUncertaintyCount: matchingUncertainties.length,
        meanrecordedUncertainty: meanRecordedUnc,
        recordedUncertaintyTypeLabel: uncTypes.join(', ') || 'None recorded',
        stats: fallbackStats,
      });
    }
  } else if (meta.targetDomain === 'analytical') {
    for (const { experiment, session } of scopeSummary.filteredAnalyticalSessions) {
      const rows = session.sampleMeasurements || [];
      let validNumericCount = 0;
      let missingCount = 0;
      let qualifiedOrBelowLimitCount = 0;
      let flaggedCount = 0;
      let excludedCount = 0;
      const values: number[] = [];
      const units = new Set<string>();
      const analytes = new Set<string>();

      for (const m of rows) {
        if (
          m.qualityStatus === 'excluded_by_user' ||
          m.valueQualifier === 'excluded_by_user'
        ) {
          excludedCount += 1;
          continue;
        }
        if (m.qualityStatus === 'flagged') {
          flaggedCount += 1;
          if (excludeFlagged) continue;
        }
        if (m.analyte) analytes.add(m.analyte);
        if (m.concUnit) units.add(m.concUnit);

        const q = m.valueQualifier;
        if (
          q === 'below_lod' ||
          q === 'below_loq' ||
          q === 'not_detected' ||
          q === 'instrument_invalid'
        ) {
          qualifiedOrBelowLimitCount += 1;
          continue;
        }
        if (q === 'missing' || q === 'not_measured') {
          missingCount += 1;
          continue;
        }

        if (typeof m.reportedConc === 'number' && Number.isFinite(m.reportedConc)) {
          validNumericCount += 1;
          values.push(m.reportedConc);
          allValidValues.push(m.reportedConc);
          allInputRefs.push(m.id);
        } else {
          missingCount += 1;
        }
      }

      const unitLabel = Array.from(units)[0] || meta.defaultUnit;
      const isSynth =
        isExperimentSyntheticDemo(experiment) ||
        session.isDemonstration ||
        session.provenance === 'synthetic_demo';

      const rowIdSet = new Set(rows.map((r) => r.id));
      const matchingUncertainties = (experiment.uncertaintyRecords || []).filter(
        (u) => rowIdSet.has(u.measurementId) && u.uncertaintyValue !== null
      );
      const meanRecordedUnc =
        matchingUncertainties.length > 0
          ? matchingUncertainties.reduce((acc, u) => acc + (u.uncertaintyValue || 0), 0) /
            matchingUncertainties.length
          : null;
      const uncTypes = Array.from(
        new Set(matchingUncertainties.map((u) => formatUncertaintyTypeLabel(u.uncertaintyType)))
      );

      const supportSnap = experiment.batch.supportSnapshot;
      const precursorSnap = experiment.batch.precursorSnapshot;

      const advRes = computeAdvancedDescriptiveStatistics(values, {
        unit: unitLabel,
        containsSynthetic: isSynth,
        excludedCount,
      });

      const fallbackStats: AdvancedDescriptiveStatsData =
        advRes.data ||
        createEmptyAdvancedDescriptiveStats(
          missingCount + qualifiedOrBelowLimitCount,
          excludedCount,
          flaggedCount
        );

      seriesSummaries.push({
        seriesId: session.id,
        recordKind: 'analytical_session',
        experimentUuid: experiment.uuid,
        experimentId: experiment.experimentId,
        experimentTitle: experiment.title,
        datasetOrSessionId: session.sessionId,
        label: `${experiment.experimentId} · ${session.title}`,
        projectCode: (experiment.projectId && projectMap.get(experiment.projectId)) || 'Unassigned',
        status: experiment.status,
        reviewStatus: session.scientificReviewStatus,
        provenance: session.provenance,
        isSynthetic: isSynth,
        supportName: supportSnap?.supportData?.name || 'Unspecified Support',
        supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
        supportPzc: supportSnap?.supportData?.pzc.value ?? null,
        precursorName: precursorSnap?.precursorData?.name || 'Unspecified Precursor',
        precursorMetal: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
        analyteSymbol:
          Array.from(analytes).join(', ') ||
          session.analytes[0]?.symbol ||
          'Unspecified',
        technique: session.technique,
        surfaceLoadingM2L: experiment.batch.plannedSurfaceLoadingM2L,
        temperatureC: experiment.batch.temperatureC,
        unit: unitLabel,
        totalObservations: rows.length,
        validNumericCount,
        missingCount,
        qualifiedOrBelowLimitCount,
        flaggedCount,
        excludedCount,
        recordedUncertaintyCount: matchingUncertainties.length,
        meanrecordedUncertainty: meanRecordedUnc,
        recordedUncertaintyTypeLabel: uncTypes.join(', ') || 'None recorded',
        stats: fallbackStats,
      });
    }
  } else {
    // Batch parameter comparison across experiments
    for (const experiment of scopeSummary.filteredExperiments) {
      const val =
        quantityKey === 'surface_loading_m2_l'
          ? experiment.batch.actualSurfaceLoadingM2L ??
            experiment.batch.plannedSurfaceLoadingM2L
          : experiment.batch.actualMeasuredMetalLoadingWtPct ??
            experiment.batch.plannedTargetMetalLoadingWtPct;

      const values = typeof val === 'number' && Number.isFinite(val) ? [val] : [];
      if (values.length > 0) {
        allValidValues.push(values[0]);
        allInputRefs.push(experiment.uuid);
      }

      const isSynth = isExperimentSyntheticDemo(experiment);
      const supportSnap = experiment.batch.supportSnapshot;
      const precursorSnap = experiment.batch.precursorSnapshot;
      const advRes = computeAdvancedDescriptiveStatistics(values, {
        unit: meta.defaultUnit,
        containsSynthetic: isSynth,
      });

      if (advRes.data) {
        seriesSummaries.push({
          seriesId: experiment.uuid,
          recordKind: 'experiment',
          experimentUuid: experiment.uuid,
          experimentId: experiment.experimentId,
          experimentTitle: experiment.title,
          datasetOrSessionId: experiment.experimentId,
          label: `${experiment.experimentId} · ${experiment.title}`,
          projectCode:
            (experiment.projectId && projectMap.get(experiment.projectId)) || 'Unassigned',
          status: experiment.status,
          reviewStatus: experiment.scientificReviewStatus,
          provenance: experiment.batch.dataProvenance,
          isSynthetic: isSynth,
          supportName: supportSnap?.supportData?.name || 'Unspecified Support',
          supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
          supportPzc: supportSnap?.supportData?.pzc.value ?? null,
          precursorName: precursorSnap?.precursorData?.name || 'Unspecified Precursor',
          precursorMetal: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
          analyteSymbol: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
          technique: experiment.type,
          surfaceLoadingM2L:
            experiment.batch.actualSurfaceLoadingM2L ??
            experiment.batch.plannedSurfaceLoadingM2L,
          temperatureC: experiment.batch.temperatureC,
          unit: meta.defaultUnit,
          totalObservations: 1,
          validNumericCount: values.length,
          missingCount: values.length === 0 ? 1 : 0,
          qualifiedOrBelowLimitCount: 0,
          flaggedCount: 0,
          excludedCount: 0,
          recordedUncertaintyCount: (experiment.uncertaintyRecords || []).length,
          meanrecordedUncertainty: null,
          recordedUncertaintyTypeLabel: 'Batch record',
          stats: advRes.data,
        });
      }
    }
  }

  const distinctUnits = Array.from(new Set(seriesSummaries.map((s) => s.unit).filter(Boolean)));
  const distinctAnalytes = Array.from(
    new Set(seriesSummaries.map((s) => s.analyteSymbol).filter(Boolean))
  );
  const distinctSupports = Array.from(
    new Set(seriesSummaries.map((s) => s.supportName).filter(Boolean))
  );
  const distinctPrecursors = Array.from(
    new Set(seriesSummaries.map((s) => s.precursorName).filter(Boolean))
  );
  const distinctTechniques = Array.from(
    new Set(seriesSummaries.map((s) => s.technique).filter(Boolean))
  );

  const incompatibilityReasons: string[] = [];
  const warnings: string[] = [];

  // Check unit compatibility
  if (distinctUnits.length > 1) {
    const firstUnit = distinctUnits[0];
    const allUnitsCompatible = distinctUnits.every(
      (u) => u === firstUnit || areUnitsCompatible(firstUnit, u)
    );
    if (!allUnitsCompatible) {
      incompatibilityReasons.push(
        `Incompatible measurement units across selected records (${distinctUnits.join(' vs. ')}). Numerical pooling is blocked.`
      );
    } else {
      warnings.push(
        `Multiple unit representations detected (${distinctUnits.join(', ')}); inspect unit scaling before pooled comparison.`
      );
    }
  }

  if (meta.targetDomain === 'analytical' && distinctAnalytes.length > 1) {
    incompatibilityReasons.push(
      `Multiple distinct analytes selected (${distinctAnalytes.join(', ')}). Pooled numerical aggregation across different chemical elements is blocked.`
    );
  }

  if (scopeSummary.containsMixedProvenance) {
    warnings.push(
      'Mixed data provenance: selection combines user/experimental records with synthetic demonstration fixtures.'
    );
  }

  if (distinctSupports.length > 1) {
    warnings.push(
      `Comparison spans multiple catalyst supports (${distinctSupports.join(', ')}) with distinct surface areas and PZC reference properties.`
    );
  }

  if (distinctPrecursors.length > 1) {
    warnings.push(
      `Comparison spans multiple metal precursors (${distinctPrecursors.join(', ')}).`
    );
  }

  const isNumericallyCompatibleForAggregation =
    incompatibilityReasons.length === 0 && allValidValues.length > 0;

  const pooledStats = isNumericallyCompatibleForAggregation
    ? computeAdvancedDescriptiveStatistics(allValidValues, {
        calculationId: `pooled-comparison-${quantityKey}`,
        unit: distinctUnits[0] || meta.defaultUnit,
        inputRefs: allInputRefs,
        containsSynthetic: scopeSummary.containsSynthetic,
      })
    : null;

  return {
    quantityKey,
    quantityLabel: meta.label,
    isNumericallyCompatibleForAggregation,
    canDisplaySideBySide: true,
    commonUnit: distinctUnits.length === 1 ? distinctUnits[0] : null,
    distinctUnits,
    distinctAnalytes,
    distinctSupports,
    distinctPrecursors,
    distinctTechniques,
    containsSynthetic: scopeSummary.containsSynthetic,
    containsMixedProvenance: scopeSummary.containsMixedProvenance,
    incompatibilityReasons,
    warnings,
    seriesSummaries,
    pooledStats,
  };
}

/**
 * Computes a deterministic content hash for a research scope or analysis selection
 * so saved comparison configurations, matrices, and analysis snapshots detect staleness.
 */
export function computeResearchScopeContentHash(
  workspace: WorkspaceStateData,
  scope: ResearchScopeFilter,
  quantityKey: ComparisonQuantityKey = 'uptake_umol_m2'
): string {
  const summary = filterWorkspaceByResearchScope(workspace, scope);
  const tokens: string[] = [
    `q:${quantityKey}`,
    `synth:${scope.includeSyntheticDemo}`,
    `exps:${summary.filteredExperiments.map((e) => `${e.uuid}@${e.updatedAt}@${(e.uncertaintyRecords || []).length}`).join(',')}`,
    `ds:${summary.filteredSurveyDatasets
      .map(
        ({ dataset }) =>
          `${dataset.id}@${dataset.updatedAt}@${dataset.measurements.map((m) => `${m.id}:${m.recordedUptakeUmolM2}:${m.measuredFinalPh}:${m.qualityStatus}`).join(';')}`
      )
      .join('|')}`,
    `sess:${summary.filteredAnalyticalSessions
      .map(
        ({ session }) =>
          `${session.id}@${session.updatedAt}@${session.sampleMeasurements.map((m) => `${m.id}:${m.reportedConc}:${m.valueQualifier}:${m.qualityStatus}`).join(';')}`
      )
      .join('|')}`,
  ];
  const raw = tokens.join('#');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `rsh-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Evaluates whether a saved comparison configuration, matrix configuration, or analysis snapshot
 * is current (`saved_current`), stale (`requires_regeneration`), or missing source records (`source_unavailable`).
 */
export function evaluateResearchAnalysisStaleness(
  workspace: WorkspaceStateData,
  record: {
    scope: ResearchScopeFilter;
    quantityKey?: ComparisonQuantityKey;
    sourceContentHash: string;
    selectedExperimentUuids?: string[];
    selectedSurveyDatasetIds?: string[];
    selectedAnalyticalSessionIds?: string[];
    includedExperimentUuids?: string[];
    includedSurveyDatasetIds?: string[];
    includedAnalyticalSessionIds?: string[];
  }
): { status: AnalysisStalenessStatus; reason: string } {
  const expIds =
    record.selectedExperimentUuids ||
    record.includedExperimentUuids ||
    record.scope.experimentUuids ||
    [];
  const dsIds =
    record.selectedSurveyDatasetIds ||
    record.includedSurveyDatasetIds ||
    record.scope.surveyDatasetIds ||
    [];
  const sessIds =
    record.selectedAnalyticalSessionIds ||
    record.includedAnalyticalSessionIds ||
    record.scope.analyticalSessionIds ||
    [];

  const existingExpSet = new Set(workspace.experiments.map((e) => e.uuid));
  const existingDsSet = new Set(
    workspace.experiments.flatMap((e) => (e.surveyDatasets || []).map((d) => d.id))
  );
  const existingSessSet = new Set(
    workspace.experiments.flatMap((e) => (e.analyticalSessions || []).map((s) => s.id))
  );

  for (const id of expIds) {
    if (!existingExpSet.has(id)) {
      return {
        status: 'source_unavailable',
        reason: `Referenced experiment (${id}) is no longer present in the workspace.`,
      };
    }
  }
  for (const id of dsIds) {
    if (!existingDsSet.has(id)) {
      return {
        status: 'source_unavailable',
        reason: `Referenced survey dataset (${id}) was deleted or is unavailable.`,
      };
    }
  }
  for (const id of sessIds) {
    if (!existingSessSet.has(id)) {
      return {
        status: 'source_unavailable',
        reason: `Referenced analytical session (${id}) was deleted or is unavailable.`,
      };
    }
  }

  const currentHash = computeResearchScopeContentHash(
    workspace,
    record.scope,
    record.quantityKey || 'uptake_umol_m2'
  );
  if (record.sourceContentHash && record.sourceContentHash !== currentHash) {
    return {
      status: 'requires_regeneration',
      reason:
        'Underlying experimental measurements, quality exclusions, or metadata have changed since this configuration was saved.',
    };
  }

  return {
    status: 'saved_current',
    reason: 'Saved analysis configuration matches current source records.',
  };
}

export const DEFAULT_RESEARCH_MATRIX_COLUMNS: ResearchMatrixColumnId[] = [
  'recordId',
  'title',
  'recordKind',
  'projectCode',
  'status',
  'reviewStatus',
  'provenance',
  'supportName',
  'supportBetM2G',
  'supportPzc',
  'precursorName',
  'surfaceLoadingM2L',
  'validCount',
  'missingOrQualifiedCount',
  'meanValue',
  'sdValue',
  'medianValue',
  'iqrValue',
  'unitLabel',
  'openQualityIssues',
  'uncertaintyRecordsCount',
];

export const RESEARCH_MATRIX_COLUMN_LABELS: Record<ResearchMatrixColumnId, string> = {
  recordId: 'Record ID',
  title: 'Title',
  recordKind: 'Record Type',
  projectCode: 'Project',
  experimentType: 'Experiment Type',
  status: 'Lifecycle Status',
  reviewStatus: 'Review Status',
  provenance: 'Provenance',
  experimentDate: 'Date',
  supportName: 'Support Material',
  supportBetM2G: 'Support BET (m²/g)',
  supportPzc: 'Support PZC',
  precursorName: 'Precursor Material',
  precursorMetal: 'Metal',
  surfaceLoadingM2L: 'Surface Loading (m²/L)',
  temperatureC: 'Temp (°C)',
  observationCount: 'Total Obs.',
  validCount: 'Valid N',
  missingOrQualifiedCount: 'Missing / Qualified',
  meanValue: 'Mean',
  sdValue: 'Sample SD',
  semValue: 'SEM',
  medianValue: 'Median (Q2)',
  iqrValue: 'IQR (Q3−Q1)',
  madValue: 'MAD',
  minMaxRange: 'Min – Max',
  unitLabel: 'Unit',
  openQualityIssues: 'Open Review Flags',
  uncertaintyRecordsCount: 'Uncertainty Records',
};

/**
 * Builds structured rows for the Research Comparison Matrix at the chosen granularity.
 */
export function buildResearchMatrixRows(
  workspace: WorkspaceStateData,
  scope: ResearchScopeFilter,
  granularity: ResearchMatrixGranularity = 'survey_dataset',
  quantityKey: ComparisonQuantityKey = 'uptake_umol_m2'
): ResearchMatrixRow[] {
  const scopeSummary = filterWorkspaceByResearchScope(workspace, scope);
  const projectMap = new Map(workspace.projects.map((p) => [p.id, p.code]));
  const meta = getComparisonQuantityMeta(quantityKey);
  const rows: ResearchMatrixRow[] = [];

  if (granularity === 'experiment') {
    for (const exp of scopeSummary.filteredExperiments) {
      const supportSnap = exp.batch.supportSnapshot;
      const precursorSnap = exp.batch.precursorSnapshot;
      const isSynth = isExperimentSyntheticDemo(exp);

      // Gather values from active or all survey datasets / analytical sessions matching quantityKey
      const values: number[] = [];
      let totalObs = 0;
      let missingOrQual = 0;
      let unitLabel = meta.defaultUnit;

      if (meta.targetDomain === 'survey') {
        for (const ds of exp.surveyDatasets || []) {
          for (const m of ds.measurements || []) {
            totalObs += 1;
            if (m.qualityStatus === 'excluded_by_user') {
              missingOrQual += 1;
              continue;
            }
            const val =
              quantityKey === 'uptake_umol_m2'
                ? m.recordedUptakeUmolM2
                : quantityKey === 'final_ph'
                  ? m.measuredFinalPh
                  : quantityKey === 'delta_ph'
                    ? m.measuredFinalPh !== null && m.measuredInitialPh !== null
                      ? m.measuredFinalPh - m.measuredInitialPh
                      : null
                    : quantityKey === 'initial_conc_ppm'
                      ? m.initialConcPpm
                      : m.finalConcPpm;
            if (m.uptakeUnit && quantityKey === 'uptake_umol_m2') unitLabel = m.uptakeUnit;
            if (typeof val === 'number' && Number.isFinite(val)) {
              values.push(val);
            } else {
              missingOrQual += 1;
            }
          }
        }
      } else if (meta.targetDomain === 'analytical') {
        for (const sess of exp.analyticalSessions || []) {
          for (const m of sess.sampleMeasurements || []) {
            totalObs += 1;
            if (m.concUnit) unitLabel = m.concUnit;
            if (
              m.qualityStatus === 'excluded_by_user' ||
              m.valueQualifier === 'below_lod' ||
              m.valueQualifier === 'below_loq' ||
              m.valueQualifier === 'not_detected' ||
              m.valueQualifier === 'instrument_invalid'
            ) {
              missingOrQual += 1;
              continue;
            }
            if (typeof m.reportedConc === 'number' && Number.isFinite(m.reportedConc)) {
              values.push(m.reportedConc);
            } else {
              missingOrQual += 1;
            }
          }
        }
      } else {
        totalObs = 1;
        const val =
          quantityKey === 'surface_loading_m2_l'
            ? exp.batch.actualSurfaceLoadingM2L ?? exp.batch.plannedSurfaceLoadingM2L
            : exp.batch.actualMeasuredMetalLoadingWtPct ??
              exp.batch.plannedTargetMetalLoadingWtPct;
        if (typeof val === 'number' && Number.isFinite(val)) {
          values.push(val);
        } else {
          missingOrQual = 1;
        }
      }

      const adv = computeAdvancedDescriptiveStatistics(values, {
        unit: unitLabel,
        containsSynthetic: isSynth,
      }).data;

      const openQualityIssues =
        (exp.surveyDatasets || []).reduce(
          (acc, ds) =>
            acc + (ds.measurements || []).filter((m) => m.qualityStatus === 'flagged').length,
          0
        ) +
        (exp.analyticalSessions || []).reduce(
          (acc, s) =>
            acc +
            (s.reviewRecords || []).filter(
              (r) => r.status === 'Open' || r.status === 'Under Review'
            ).length,
          0
        );

      rows.push({
        rowId: exp.uuid,
        recordId: exp.experimentId,
        title: exp.title,
        recordKind: 'Experiment',
        experimentUuid: exp.uuid,
        datasetId: null,
        sessionId: null,
        projectCode: (exp.projectId && projectMap.get(exp.projectId)) || 'Unassigned',
        experimentType: exp.type,
        status: exp.status,
        reviewStatus: exp.scientificReviewStatus,
        provenance: exp.batch.dataProvenance,
        isSynthetic: isSynth,
        experimentDate: exp.experimentDate,
        supportName: supportSnap?.supportData?.name || 'Unspecified',
        supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
        supportPzc: supportSnap?.supportData?.pzc.value ?? null,
        precursorName: precursorSnap?.precursorData?.name || 'Unspecified',
        precursorMetal: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
        surfaceLoadingM2L:
          exp.batch.actualSurfaceLoadingM2L ?? exp.batch.plannedSurfaceLoadingM2L,
        temperatureC: exp.batch.temperatureC,
        observationCount: totalObs,
        validCount: values.length,
        missingOrQualifiedCount: missingOrQual,
        meanValue: adv?.mean ?? null,
        sdValue: adv?.sampleStandardDeviation ?? null,
        semValue: adv?.standardErrorOfMean ?? null,
        medianValue: adv?.median ?? null,
        iqrValue: adv?.iqr ?? null,
        madValue: adv?.mad ?? null,
        minValue: adv?.min ?? null,
        maxValue: adv?.max ?? null,
        minMaxRange:
          adv && adv.min !== null && adv.max !== null
            ? `${adv.min.toFixed(2)} – ${adv.max.toFixed(2)}`
            : 'N/A',
        unitLabel,
        openQualityIssues,
        uncertaintyRecordsCount: (exp.uncertaintyRecords || []).length,
      });
    }
  } else if (granularity === 'survey_dataset') {
    for (const { experiment, dataset } of scopeSummary.filteredSurveyDatasets) {
      const supportSnap = dataset.supportSnapshot || experiment.batch.supportSnapshot;
      const precursorSnap = dataset.precursorSnapshot || experiment.batch.precursorSnapshot;
      const isSynth =
        isExperimentSyntheticDemo(experiment) ||
        dataset.isDemonstration ||
        dataset.provenance === 'synthetic_demo';

      const values: number[] = [];
      let missingOrQual = 0;
      let unitLabel = meta.defaultUnit;

      for (const m of dataset.measurements || []) {
        if (m.qualityStatus === 'excluded_by_user') {
          missingOrQual += 1;
          continue;
        }
        const val =
          quantityKey === 'final_ph'
            ? m.measuredFinalPh
            : quantityKey === 'delta_ph'
              ? m.measuredFinalPh !== null && m.measuredInitialPh !== null
                ? m.measuredFinalPh - m.measuredInitialPh
                : null
              : quantityKey === 'initial_conc_ppm'
                ? m.initialConcPpm
                : quantityKey === 'final_conc_ppm'
                  ? m.finalConcPpm
                  : m.recordedUptakeUmolM2;
        if (quantityKey === 'uptake_umol_m2' && m.uptakeUnit) unitLabel = m.uptakeUnit;
        if (typeof val === 'number' && Number.isFinite(val)) {
          values.push(val);
        } else {
          missingOrQual += 1;
        }
      }

      const adv = computeAdvancedDescriptiveStatistics(values, {
        unit: unitLabel,
        containsSynthetic: isSynth,
      }).data;

      const rowIdSet = new Set((dataset.measurements || []).map((m) => m.id));
      const uncCount = (experiment.uncertaintyRecords || []).filter((u) =>
        rowIdSet.has(u.measurementId)
      ).length;

      rows.push({
        rowId: dataset.id,
        recordId: `${experiment.experimentId}/${dataset.datasetId}`,
        title: dataset.title,
        recordKind: 'Survey Dataset',
        experimentUuid: experiment.uuid,
        datasetId: dataset.id,
        sessionId: null,
        projectCode:
          (experiment.projectId && projectMap.get(experiment.projectId)) || 'Unassigned',
        experimentType: experiment.type,
        status: dataset.status,
        reviewStatus: dataset.scientificReviewStatus,
        provenance: dataset.provenance,
        isSynthetic: isSynth,
        experimentDate: experiment.experimentDate,
        supportName: supportSnap?.supportData?.name || 'Unspecified',
        supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
        supportPzc: supportSnap?.supportData?.pzc.value ?? null,
        precursorName: precursorSnap?.precursorData?.name || 'Unspecified',
        precursorMetal: precursorSnap?.precursorData?.metalIdentity || 'Unspecified',
        surfaceLoadingM2L:
          dataset.config.targetSurfaceLoadingM2L ?? experiment.batch.plannedSurfaceLoadingM2L,
        temperatureC: dataset.config.temperatureC ?? experiment.batch.temperatureC,
        observationCount: (dataset.measurements || []).length,
        validCount: values.length,
        missingOrQualifiedCount: missingOrQual,
        meanValue: adv?.mean ?? null,
        sdValue: adv?.sampleStandardDeviation ?? null,
        semValue: adv?.standardErrorOfMean ?? null,
        medianValue: adv?.median ?? null,
        iqrValue: adv?.iqr ?? null,
        madValue: adv?.mad ?? null,
        minValue: adv?.min ?? null,
        maxValue: adv?.max ?? null,
        minMaxRange:
          adv && adv.min !== null && adv.max !== null
            ? `${adv.min.toFixed(2)} – ${adv.max.toFixed(2)}`
            : 'N/A',
        unitLabel,
        openQualityIssues: (dataset.measurements || []).filter(
          (m) => m.qualityStatus === 'flagged'
        ).length,
        uncertaintyRecordsCount: uncCount,
      });
    }
  } else {
    for (const { experiment, session } of scopeSummary.filteredAnalyticalSessions) {
      const supportSnap = experiment.batch.supportSnapshot;
      const precursorSnap = experiment.batch.precursorSnapshot;
      const isSynth =
        isExperimentSyntheticDemo(experiment) ||
        session.isDemonstration ||
        session.provenance === 'synthetic_demo';

      const values: number[] = [];
      let missingOrQual = 0;
      let unitLabel = 'ppm';

      for (const m of session.sampleMeasurements || []) {
        if (m.concUnit) unitLabel = m.concUnit;
        if (
          m.qualityStatus === 'excluded_by_user' ||
          m.valueQualifier === 'below_lod' ||
          m.valueQualifier === 'below_loq' ||
          m.valueQualifier === 'not_detected' ||
          m.valueQualifier === 'instrument_invalid'
        ) {
          missingOrQual += 1;
          continue;
        }
        if (typeof m.reportedConc === 'number' && Number.isFinite(m.reportedConc)) {
          values.push(m.reportedConc);
        } else {
          missingOrQual += 1;
        }
      }

      const adv = computeAdvancedDescriptiveStatistics(values, {
        unit: unitLabel,
        containsSynthetic: isSynth,
      }).data;

      const rowIdSet = new Set((session.sampleMeasurements || []).map((m) => m.id));
      const uncCount = (experiment.uncertaintyRecords || []).filter((u) =>
        rowIdSet.has(u.measurementId)
      ).length;

      rows.push({
        rowId: session.id,
        recordId: `${experiment.experimentId}/${session.sessionId}`,
        title: session.title,
        recordKind: 'Analytical Session',
        experimentUuid: experiment.uuid,
        datasetId: null,
        sessionId: session.id,
        projectCode:
          (experiment.projectId && projectMap.get(experiment.projectId)) || 'Unassigned',
        experimentType: `${session.technique} (${session.instrumentModel || 'Analytical'})`,
        status: session.status,
        reviewStatus: session.scientificReviewStatus,
        provenance: session.provenance,
        isSynthetic: isSynth,
        experimentDate: session.analysisDate || experiment.experimentDate,
        supportName: supportSnap?.supportData?.name || 'Unspecified',
        supportBetM2G: supportSnap?.supportData?.betSurfaceArea.value ?? null,
        supportPzc: supportSnap?.supportData?.pzc.value ?? null,
        precursorName: precursorSnap?.precursorData?.name || 'Unspecified',
        precursorMetal:
          session.analytes[0]?.symbol ||
          precursorSnap?.precursorData?.metalIdentity ||
          'Unspecified',
        surfaceLoadingM2L: experiment.batch.plannedSurfaceLoadingM2L,
        temperatureC: experiment.batch.temperatureC,
        observationCount: (session.sampleMeasurements || []).length,
        validCount: values.length,
        missingOrQualifiedCount: missingOrQual,
        meanValue: adv?.mean ?? null,
        sdValue: adv?.sampleStandardDeviation ?? null,
        semValue: adv?.standardErrorOfMean ?? null,
        medianValue: adv?.median ?? null,
        iqrValue: adv?.iqr ?? null,
        madValue: adv?.mad ?? null,
        minValue: adv?.min ?? null,
        maxValue: adv?.max ?? null,
        minMaxRange:
          adv && adv.min !== null && adv.max !== null
            ? `${adv.min.toFixed(2)} – ${adv.max.toFixed(2)}`
            : 'N/A',
        unitLabel,
        openQualityIssues: (session.reviewRecords || []).filter(
          (r) => r.status === 'Open' || r.status === 'Under Review'
        ).length,
        uncertaintyRecordsCount: uncCount,
      });
    }
  }

  return rows;
}

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) on exported CSV text cells
 * while preserving valid signed numbers (e.g. -1.25, +0.45) and censored tokens (<LOD)
 * losslessly. Non-numeric strings starting with =, +, -, @, \t, or \r are prefixed with `'`.
 */
export function sanitizeSpreadsheetCell(str: string): string {
  if (!str) return str;
  const first = str[0];
  if (
    first === '=' ||
    first === '+' ||
    first === '-' ||
    first === '@' ||
    first === '\t' ||
    first === '\r'
  ) {
    // Allow legitimate signed finite numbers (e.g. "-0.42", "+1.5e-3") without prefixing
    if ((first === '-' || first === '+') && /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(str.trim())) {
      return str;
    }
    return `'${str}`;
  }
  return str;
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : '';
  }
  const safeStr = sanitizeSpreadsheetCell(String(val));
  if (safeStr.includes(',') || safeStr.includes('"') || safeStr.includes('\n') || safeStr.includes('\r')) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

export function formatMatrixCellValue(
  row: ResearchMatrixRow,
  col: ResearchMatrixColumnId
): string | number | null {
  switch (col) {
    case 'recordId':
      return row.recordId;
    case 'title':
      return row.title;
    case 'recordKind':
      return row.recordKind;
    case 'projectCode':
      return row.projectCode;
    case 'experimentType':
      return row.experimentType;
    case 'status':
      return row.status;
    case 'reviewStatus':
      return row.reviewStatus;
    case 'provenance':
      return row.provenance;
    case 'experimentDate':
      return row.experimentDate;
    case 'supportName':
      return row.supportName;
    case 'supportBetM2G':
      return row.supportBetM2G !== null ? Number(row.supportBetM2G.toFixed(2)) : null;
    case 'supportPzc':
      return row.supportPzc !== null ? Number(row.supportPzc.toFixed(2)) : null;
    case 'precursorName':
      return row.precursorName;
    case 'precursorMetal':
      return row.precursorMetal;
    case 'surfaceLoadingM2L':
      return row.surfaceLoadingM2L !== null ? Number(row.surfaceLoadingM2L.toFixed(1)) : null;
    case 'temperatureC':
      return row.temperatureC !== null ? Number(row.temperatureC.toFixed(1)) : null;
    case 'observationCount':
      return row.observationCount;
    case 'validCount':
      return row.validCount;
    case 'missingOrQualifiedCount':
      return row.missingOrQualifiedCount;
    case 'meanValue':
      return row.meanValue !== null ? Number(row.meanValue.toFixed(4)) : null;
    case 'sdValue':
      return row.sdValue !== null ? Number(row.sdValue.toFixed(4)) : null;
    case 'semValue':
      return row.semValue !== null ? Number(row.semValue.toFixed(4)) : null;
    case 'medianValue':
      return row.medianValue !== null ? Number(row.medianValue.toFixed(4)) : null;
    case 'iqrValue':
      return row.iqrValue !== null ? Number(row.iqrValue.toFixed(4)) : null;
    case 'madValue':
      return row.madValue !== null ? Number(row.madValue.toFixed(4)) : null;
    case 'minMaxRange':
      return row.minMaxRange;
    case 'unitLabel':
      return row.unitLabel;
    case 'openQualityIssues':
      return row.openQualityIssues;
    case 'uncertaintyRecordsCount':
      return row.uncertaintyRecordsCount;
  }
}

export function exportResearchMatrixCsv(
  rows: ResearchMatrixRow[],
  columns: ResearchMatrixColumnId[] = DEFAULT_RESEARCH_MATRIX_COLUMNS
): string {
  const header = columns.map((c) => escapeCsvField(RESEARCH_MATRIX_COLUMN_LABELS[c])).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(formatMatrixCellValue(row, c))).join(',')
  );
  return [header, ...lines].join('\n');
}

export function exportResearchMatrixJson(
  rows: ResearchMatrixRow[],
  columns: ResearchMatrixColumnId[] = DEFAULT_RESEARCH_MATRIX_COLUMNS,
  config?: Partial<ResearchMatrixConfiguration>
): string {
  return JSON.stringify(
    {
      format: 'sea-workbench-research-matrix',
      calcEngineVersion: CALC_ENGINE_VERSION,
      exportedAt: new Date().toISOString(),
      configuration: config || null,
      columns,
      rowCount: rows.length,
      rows,
    },
    null,
    2
  );
}

export function exportUncertaintyRecordsCsv(
  records: MeasurementUncertaintyRecord[]
): string {
  const headers = [
    'id',
    'experimentUuid',
    'targetKind',
    'measurementId',
    'measurementLabel',
    'quantityName',
    'value',
    'unit',
    'uncertaintyValue',
    'uncertaintyUnit',
    'uncertaintyType',
    'coverageFactor',
    'source',
    'reference',
    'conditions',
    'provenance',
    'reviewStatus',
    'notes',
  ];
  const lines = records.map((r) =>
    [
      r.id,
      r.experimentUuid,
      r.targetKind,
      r.measurementId,
      r.measurementLabel,
      r.quantityName,
      r.value,
      r.unit,
      r.uncertaintyValue,
      r.uncertaintyUnit,
      r.uncertaintyType,
      r.coverageFactor,
      r.source,
      r.reference,
      r.conditions,
      r.provenance,
      r.reviewStatus,
      r.notes,
    ]
      .map(escapeCsvField)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

/**
 * Performs fast local search across all 14 workspace entity types.
 * Never duplicates records or invents missing matches.
 */
export function searchWorkspaceRecords(
  workspace: WorkspaceStateData,
  rawQuery: string,
  options: {
    categoryFilter?: WorkspaceSearchCategory | 'all';
    includeSyntheticDemo?: boolean;
    limit?: number;
  } = {}
): WorkspaceSearchResult[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const categoryFilter = options.categoryFilter || 'all';
  const includeSyntheticDemo = options.includeSyntheticDemo ?? true;
  const limit = options.limit ?? 120;
  const results: WorkspaceSearchResult[] = [];
  const projectMap = new Map(workspace.projects.map((p) => [p.id, p]));

  const matches = (...fields: Array<string | number | null | undefined>): string | null => {
    for (const f of fields) {
      if (f === null || f === undefined) continue;
      const str = String(f);
      if (str.toLowerCase().includes(q)) {
        return str.length > 110 ? `${str.slice(0, 107)}...` : str;
      }
    }
    return null;
  };

  const allowCat = (cat: WorkspaceSearchCategory) =>
    categoryFilter === 'all' || categoryFilter === cat;

  // 1. Projects
  if (allowCat('project')) {
    for (const proj of workspace.projects) {
      if (!includeSyntheticDemo && proj.isDemonstration) continue;
      const snippet = matches(proj.code, proj.name, proj.description, proj.principalInvestigator);
      if (snippet) {
        results.push({
          id: `proj-${proj.id}`,
          category: 'project',
          categoryLabel: 'Research Project',
          title: `${proj.code} — ${proj.name}`,
          subtitle: `PI: ${proj.principalInvestigator || 'Unspecified'}`,
          experimentUuid: null,
          experimentIdLabel: null,
          projectId: proj.id,
          projectLabel: proj.code,
          matchingSnippet: snippet,
          provenance: proj.isDemonstration ? 'synthetic_demo' : 'user_entered',
          isAvailable: true,
          targetModule: 'library',
          targetRecordId: proj.id,
        });
      }
    }
  }

  // 2. Supports & Support References
  if (allowCat('support') || allowCat('reference')) {
    for (const sup of workspace.supports) {
      if (!includeSyntheticDemo && sup.provenance === 'synthetic_demo') continue;
      if (allowCat('support')) {
        const snippet = matches(
          sup.id,
          sup.name,
          sup.composition,
          sup.supplierOrGrade,
          sup.notes
        );
        if (snippet) {
          results.push({
            id: `sup-${sup.id}`,
            category: 'support',
            categoryLabel: 'Support Material',
            title: `${sup.name} (${sup.composition})`,
            subtitle: `BET: ${sup.betSurfaceArea.value ?? 'N/A'} ${sup.betSurfaceArea.unit} · PZC: ${sup.pzc.value ?? 'N/A'}`,
            experimentUuid: null,
            experimentIdLabel: null,
            projectId: null,
            projectLabel: null,
            matchingSnippet: snippet,
            provenance: sup.provenance,
            isAvailable: true,
            targetModule: 'databases',
            targetRecordId: sup.id,
          });
        }
      }
      if (allowCat('reference')) {
        for (const ref of sup.references || []) {
          const refHit = matches(ref.title, ref.authorOrOrganization, ref.doiOrUrl, ref.relevantProperty, ref.notes);
          if (refHit) {
            results.push({
              id: `ref-sup-${sup.id}-${ref.id}`,
              category: 'reference',
              categoryLabel: 'Scientific Reference',
              title: ref.title,
              subtitle: `${ref.authorOrOrganization} (${ref.year ?? 'n.d.'}) · Linked to ${sup.name}`,
              experimentUuid: null,
              experimentIdLabel: null,
              projectId: null,
              projectLabel: null,
              matchingSnippet: refHit,
              provenance: sup.provenance,
              isAvailable: true,
              targetModule: 'databases',
              targetRecordId: sup.id,
            });
          }
        }
      }
    }
  }

  // 3. Precursors & Precursor References
  if (allowCat('precursor') || allowCat('reference')) {
    for (const prec of workspace.precursors) {
      if (!includeSyntheticDemo && prec.provenance === 'synthetic_demo') continue;
      if (allowCat('precursor')) {
        const snippet = matches(
          prec.id,
          prec.name,
          prec.formula,
          prec.metalIdentity,
          prec.casNumber,
          prec.notes
        );
        if (snippet) {
          results.push({
            id: `prec-${prec.id}`,
            category: 'precursor',
            categoryLabel: 'Precursor Material',
            title: `${prec.name} (${prec.formula})`,
            subtitle: `Metal: ${prec.metalIdentity} · Charge: ${prec.chargeClassification}`,
            experimentUuid: null,
            experimentIdLabel: null,
            projectId: null,
            projectLabel: null,
            matchingSnippet: snippet,
            provenance: prec.provenance,
            isAvailable: true,
            targetModule: 'databases',
            targetRecordId: prec.id,
          });
        }
      }
      if (allowCat('reference')) {
        for (const ref of prec.references || []) {
          const refHit = matches(ref.title, ref.authorOrOrganization, ref.doiOrUrl, ref.relevantProperty, ref.notes);
          if (refHit) {
            results.push({
              id: `ref-prec-${prec.id}-${ref.id}`,
              category: 'reference',
              categoryLabel: 'Scientific Reference',
              title: ref.title,
              subtitle: `${ref.authorOrOrganization} (${ref.year ?? 'n.d.'}) · Linked to ${prec.name}`,
              experimentUuid: null,
              experimentIdLabel: null,
              projectId: null,
              projectLabel: null,
              matchingSnippet: refHit,
              provenance: prec.provenance,
              isAvailable: true,
              targetModule: 'databases',
              targetRecordId: prec.id,
            });
          }
        }
      }
    }
  }

  // 4. Experiments and nested entities
  for (const exp of workspace.experiments) {
    const isSynth = isExperimentSyntheticDemo(exp);
    if (!includeSyntheticDemo && isSynth) continue;

    const proj = exp.projectId ? projectMap.get(exp.projectId) : null;
    const projLabel = proj ? proj.code : null;

    if (allowCat('experiment')) {
      const expHit = matches(
        exp.experimentId,
        exp.title,
        exp.objective,
        exp.researcher,
        exp.status,
        exp.tags.join(' '),
        exp.generalObservations
      );
      if (expHit) {
        results.push({
          id: `exp-${exp.uuid}`,
          category: 'experiment',
          categoryLabel: 'Experiment Record',
          title: `${exp.experimentId} — ${exp.title}`,
          subtitle: `${exp.type} · ${exp.status} · Researcher: ${exp.researcher}`,
          experimentUuid: exp.uuid,
          experimentIdLabel: exp.experimentId,
          projectId: exp.projectId,
          projectLabel: projLabel,
          matchingSnippet: expHit,
          provenance: exp.batch.dataProvenance,
          isAvailable: true,
          targetModule: 'overview',
          targetRecordId: exp.uuid,
        });
      }
    }

    // Survey Datasets, Measurements, Interpretations, Saved Figures
    for (const ds of exp.surveyDatasets || []) {
      if (allowCat('survey_dataset')) {
        const dsHit = matches(ds.datasetId, ds.title, ds.objective, ds.notes, ds.researcher);
        if (dsHit) {
          results.push({
            id: `ds-${ds.id}`,
            category: 'survey_dataset',
            categoryLabel: 'Survey Dataset',
            title: `${ds.datasetId} — ${ds.title}`,
            subtitle: `${exp.experimentId} · Mode: ${ds.mode.toUpperCase()} · ${ds.measurements.length} pts`,
            experimentUuid: exp.uuid,
            experimentIdLabel: exp.experimentId,
            projectId: exp.projectId,
            projectLabel: projLabel,
            matchingSnippet: dsHit,
            provenance: ds.provenance,
            isAvailable: true,
            targetModule: 'uptake-survey',
            targetDatasetId: ds.id,
          });
        }
      }

      if (allowCat('sample') || allowCat('measurement')) {
        for (const m of ds.measurements || []) {
          const mHit = matches(
            m.sampleId,
            m.sampleGroupId,
            m.notes,
            m.exclusionReason,
            m.recordedUptakeUmolM2 !== null ? `${m.recordedUptakeUmolM2} ${m.uptakeUnit || 'µmol/m²'}` : null
          );
          if (mHit) {
            const cat: WorkspaceSearchCategory = allowCat('sample') ? 'sample' : 'measurement';
            results.push({
              id: `sm-${m.id}`,
              category: cat,
              categoryLabel: cat === 'sample' ? 'Sample ID' : 'Survey Measurement',
              title: `${m.sampleId} (${ds.datasetId})`,
              subtitle: `pH_f: ${m.measuredFinalPh ?? '—'} · Γ: ${m.recordedUptakeUmolM2 ?? '—'} ${m.uptakeUnit || 'µmol/m²'}`,
              experimentUuid: exp.uuid,
              experimentIdLabel: exp.experimentId,
              projectId: exp.projectId,
              projectLabel: projLabel,
              matchingSnippet: mHit,
              provenance: m.provenance,
              isAvailable: true,
              targetModule: 'uptake-survey',
              targetDatasetId: ds.id,
              targetRecordId: m.id,
            });
          }
        }
      }

      if (allowCat('interpretation')) {
        for (const ann of ds.annotations || []) {
          const annHit = matches(ann.title, ann.body, ann.category, ann.author);
          if (annHit) {
            results.push({
              id: `ann-${ann.id}`,
              category: 'interpretation',
              categoryLabel: 'Research Interpretation',
              title: ann.title,
              subtitle: `${exp.experimentId} · ${ds.datasetId} · ${ann.author}`,
              experimentUuid: exp.uuid,
              experimentIdLabel: exp.experimentId,
              projectId: exp.projectId,
              projectLabel: projLabel,
              matchingSnippet: annHit,
              provenance: ds.provenance,
              isAvailable: true,
              targetModule: 'uptake-survey',
              targetDatasetId: ds.id,
              targetRecordId: ann.id,
            });
          }
        }
      }

      if (allowCat('figure')) {
        for (const fig of ds.savedFigures || []) {
          const figHit = matches(fig.name, fig.title, fig.plotType, fig.xAxisTitle, fig.yAxisTitle);
          if (figHit) {
            results.push({
              id: `sfig-${fig.id}`,
              category: 'figure',
              categoryLabel: 'Saved Survey Figure',
              title: fig.name || fig.title,
              subtitle: `${exp.experimentId} · ${ds.datasetId} · ${fig.plotType}`,
              experimentUuid: exp.uuid,
              experimentIdLabel: exp.experimentId,
              projectId: exp.projectId,
              projectLabel: projLabel,
              matchingSnippet: figHit,
              provenance: ds.provenance,
              isAvailable: true,
              targetModule: 'uptake-survey',
              targetDatasetId: ds.id,
              targetRecordId: fig.id,
            });
          }
        }
      }
    }

    // Analytical Sessions, Sample Measurements, Saved Figures
    for (const sess of exp.analyticalSessions || []) {
      if (allowCat('analytical_session')) {
        const sessHit = matches(
          sess.sessionId,
          sess.title,
          sess.technique,
          sess.instrumentModel,
          sess.analyst,
          sess.notes,
          sess.observations
        );
        if (sessHit) {
          results.push({
            id: `sess-${sess.id}`,
            category: 'analytical_session',
            categoryLabel: 'Analytical Session',
            title: `${sess.sessionId} — ${sess.title}`,
            subtitle: `${exp.experimentId} · ${sess.technique} · ${sess.sampleMeasurements.length} samples`,
            experimentUuid: exp.uuid,
            experimentIdLabel: exp.experimentId,
            projectId: exp.projectId,
            projectLabel: projLabel,
            matchingSnippet: sessHit,
            provenance: sess.provenance,
            isAvailable: true,
            targetModule: 'analytical',
            targetSessionId: sess.id,
          });
        }
      }

      if (allowCat('measurement') || allowCat('sample')) {
        for (const m of sess.sampleMeasurements || []) {
          const mHit = matches(
            m.sampleId,
            m.linkedSurveySampleId,
            m.analyte,
            m.notes,
            m.originalValueToken,
            m.instrumentFlag
          );
          if (mHit) {
            results.push({
              id: `am-${m.id}`,
              category: 'measurement',
              categoryLabel: 'Analytical Measurement',
              title: `${m.sampleId} (${m.analyte} · ${m.stage})`,
              subtitle: `${sess.sessionId} · Conc: ${m.reportedConc ?? m.originalValueToken ?? '—'} ${m.concUnit}`,
              experimentUuid: exp.uuid,
              experimentIdLabel: exp.experimentId,
              projectId: exp.projectId,
              projectLabel: projLabel,
              matchingSnippet: mHit,
              provenance: m.provenance,
              isAvailable: true,
              targetModule: 'analytical',
              targetSessionId: sess.id,
              targetRecordId: m.id,
            });
          }
        }
      }

      if (allowCat('figure')) {
        for (const fig of sess.savedFigures || []) {
          const figHit = matches(fig.name, fig.title, fig.plotType);
          if (figHit) {
            results.push({
              id: `afig-${fig.id}`,
              category: 'figure',
              categoryLabel: 'Saved Analytical Figure',
              title: fig.name || fig.title,
              subtitle: `${exp.experimentId} · ${sess.sessionId} · ${fig.plotType}`,
              experimentUuid: exp.uuid,
              experimentIdLabel: exp.experimentId,
              projectId: exp.projectId,
              projectLabel: projLabel,
              matchingSnippet: figHit,
              provenance: sess.provenance,
              isAvailable: true,
              targetModule: 'analytical',
              targetSessionId: sess.id,
              targetRecordId: fig.id,
            });
          }
        }
      }
    }

    // Experimental Observations
    if (allowCat('observation')) {
      for (const obs of exp.observations || []) {
        const obsHit = matches(obs.text, obs.category, obs.author);
        if (obsHit) {
          results.push({
            id: `obs-${obs.id}`,
            category: 'observation',
            categoryLabel: 'Experimental Observation',
            title: `${obs.category} (${obs.author})`,
            subtitle: `${exp.experimentId} · ${obs.timestamp.slice(0, 16).replace('T', ' ')}`,
            experimentUuid: exp.uuid,
            experimentIdLabel: exp.experimentId,
            projectId: exp.projectId,
            projectLabel: projLabel,
            matchingSnippet: obsHit,
            provenance: obs.provenance,
            isAvailable: true,
            targetModule: 'overview',
            targetRecordId: obs.id,
          });
        }
      }
    }

    // Snapshots
    if (allowCat('snapshot')) {
      for (const snap of exp.snapshots || []) {
        const snapHit = matches(snap.snapshotId, snap.name, snap.description, snap.researcher);
        if (snapHit) {
          results.push({
            id: `snap-${snap.snapshotId}`,
            category: 'snapshot',
            categoryLabel: 'Experiment Snapshot',
            title: `${snap.name} (${snap.snapshotId})`,
            subtitle: `${exp.experimentId} · Captured ${snap.capturedAt.slice(0, 10)}`,
            experimentUuid: exp.uuid,
            experimentIdLabel: exp.experimentId,
            projectId: exp.projectId,
            projectLabel: projLabel,
            matchingSnippet: snapHit,
            provenance: isSynth ? 'synthetic_demo' : 'user_entered',
            isAvailable: true,
            targetModule: 'overview',
            targetRecordId: snap.snapshotId,
          });
        }
      }
    }

    // Finalized Reports
    if (allowCat('report')) {
      for (const rep of exp.finalizedReports || []) {
        const repHit = matches(rep.title, rep.reportType, rep.snapshotName, rep.notes, rep.researcher);
        if (repHit) {
          const snapshotExists = (exp.snapshots || []).some(
            (s) => s.snapshotId === rep.snapshotId
          );
          results.push({
            id: `rep-${rep.id}`,
            category: 'report',
            categoryLabel: 'Finalized Report',
            title: `${rep.title} (v${rep.versionNumber})`,
            subtitle: `${exp.experimentId} · Bound to ${rep.snapshotName}`,
            experimentUuid: exp.uuid,
            experimentIdLabel: exp.experimentId,
            projectId: exp.projectId,
            projectLabel: projLabel,
            matchingSnippet: repHit,
            provenance: isSynth ? 'synthetic_demo' : 'user_entered',
            isAvailable: snapshotExists,
            targetModule: 'lab-report',
            targetRecordId: rep.id,
          });
        }
      }
    }

    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

/**
 * Data-Driven SVG Figure Generator for Research Packages (§4 & §14):
 * Generates genuine plotted vector SVG charts directly from SurveyDataset or AnalyticalSession
 * measurements so exported `.zip` packages always contain publication-grade plotted figures.
 */
function xmlEsc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildDataDrivenSurveyFigureSvg(
  experiment: Experiment,
  dataset: SurveyDataset,
  figure: FigureConfiguration
): string {
  const width = figure.exportWidthPx || 820;
  const height = figure.exportHeightPx || 520;
  const padLeft = 78;
  const padRight = 36;
  const padTop = 64;
  const padBottom = 86;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const validRows = (dataset.measurements || []).filter(
    (m) => m.qualityStatus !== 'excluded_by_user'
  );
  const points: Array<{ x: number; y: number; label: string; unc: number }> = [];
  const uncMap = new Map(
    (experiment.uncertaintyRecords || [])
      .filter((u) => u.uncertaintyValue !== null)
      .map((u) => [u.measurementId, u.uncertaintyValue as number])
  );

  for (const m of validRows) {
    const x =
      figure.plotType === 'pzc_final_vs_initial' || figure.plotType === 'pzc_delta_vs_initial'
        ? m.measuredInitialPh
        : m.measuredFinalPh ?? m.measuredInitialPh;
    const y =
      figure.plotType === 'pzc_final_vs_initial'
        ? m.measuredFinalPh
        : figure.plotType === 'pzc_delta_vs_initial'
          ? m.measuredFinalPh !== null && m.measuredInitialPh !== null
            ? m.measuredFinalPh - m.measuredInitialPh
            : null
          : m.recordedUptakeUmolM2;

    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      points.push({
        x,
        y,
        label: m.sampleId,
        unc: uncMap.get(m.id) ?? 0,
      });
    }
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin =
    figure.xMin !== null
      ? figure.xMin
      : xs.length > 0
        ? Math.floor(Math.min(...xs) * 10) / 10 - 0.5
        : 0;
  const xMax =
    figure.xMax !== null
      ? figure.xMax
      : xs.length > 0
        ? Math.ceil(Math.max(...xs) * 10) / 10 + 0.5
        : 14;
  const yMin =
    figure.yMin !== null
      ? figure.yMin
      : ys.length > 0
        ? Math.min(0, Math.floor(Math.min(...ys) * 10) / 10)
        : 0;
  const yMax =
    figure.yMax !== null
      ? figure.yMax
      : ys.length > 0
        ? Math.ceil(Math.max(...ys) * 1.15 * 10) / 10 || 1
        : 5;

  const spanX = Math.max(1e-6, xMax - xMin);
  const spanY = Math.max(1e-6, yMax - yMin);
  const toSvgX = (x: number) => padLeft + ((x - xMin) / spanX) * plotW;
  const toSvgY = (y: number) => padTop + plotH - ((y - yMin) / spanY) * plotH;

  const color = figure.grayscaleMode ? '#111827' : figure.primaryColor || '#0F52BA';
  const sortedPts = [...points].sort((a, b) => a.x - b.x);

  const gridLines: string[] = [];
  for (let i = 0; i <= 5; i += 1) {
    const xv = xMin + (spanX * i) / 5;
    const yv = yMin + (spanY * i) / 5;
    const sx = toSvgX(xv);
    const sy = toSvgY(yv);
    if (figure.showGridlines) {
      gridLines.push(
        `<line x1="${sx.toFixed(1)}" y1="${padTop}" x2="${sx.toFixed(1)}" y2="${padTop + plotH}" stroke="#E5E7EB" stroke-dasharray="3 3" />`,
        `<line x1="${padLeft}" y1="${sy.toFixed(1)}" x2="${padLeft + plotW}" y2="${sy.toFixed(1)}" stroke="#E5E7EB" stroke-dasharray="3 3" />`
      );
    }
    gridLines.push(
      `<text x="${sx.toFixed(1)}" y="${padTop + plotH + 18}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${xv.toFixed(1)}</text>`,
      `<text x="${padLeft - 8}" y="${(sy + 3).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${yv.toFixed(2)}</text>`
    );
  }

  const polyline =
    (figure.showLines || figure.plotType === 'scatter_line') && sortedPts.length > 1
      ? `<polyline fill="none" stroke="${color}" stroke-width="1.75" points="${sortedPts
          .map((p) => `${toSvgX(p.x).toFixed(1)},${toSvgY(p.y).toFixed(1)}`)
          .join(' ')}" />`
      : '';

  const markerElements = sortedPts
    .map((p) => {
      const cx = toSvgX(p.x);
      const cy = toSvgY(p.y);
      const errBar =
        p.unc > 0
          ? `<line x1="${cx.toFixed(1)}" y1="${toSvgY(p.y - p.unc).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${toSvgY(p.y + p.unc).toFixed(1)}" stroke="${color}" stroke-width="1.2" />`
          : '';
      return `${errBar}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${figure.markerSize || 4.5}" fill="${color}" stroke="#FFFFFF" stroke-width="1" />`;
    })
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FFFFFF" stroke="#E5E7EB" />
  <text x="${padLeft}" y="28" font-family="IBM Plex Sans, sans-serif" font-size="14" font-weight="600" fill="#111827">${xmlEsc(figure.title || figure.name)}</text>
  <text x="${padLeft}" y="46" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${xmlEsc(experiment.experimentId)} · ${xmlEsc(dataset.datasetId)} · Plot: ${xmlEsc(figure.plotType)} · N=${points.length}</text>
  ${gridLines.join('\n  ')}
  <rect x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="none" stroke="#111827" stroke-width="1" />
  ${polyline}
  ${markerElements}
  <text x="${padLeft + plotW / 2}" y="${padTop + plotH + 42}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="600" fill="#111827">${xmlEsc(figure.xAxisTitle)} ${figure.xAxisUnit ? `(${xmlEsc(figure.xAxisUnit)})` : ''}</text>
  <text x="20" y="${padTop + plotH / 2}" text-anchor="middle" transform="rotate(-90 20 ${padTop + plotH / 2})" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="600" fill="#111827">${xmlEsc(figure.yAxisTitle)} ${figure.yAxisUnit ? `(${xmlEsc(figure.yAxisUnit)})` : ''}</text>
  <text x="${padLeft}" y="${height - 16}" font-family="IBM Plex Mono, monospace" font-size="9" fill="#6B7280">Provenance: ${xmlEsc(dataset.provenance)} | Review: ${xmlEsc(dataset.scientificReviewStatus)} | Engine: ${xmlEsc(CALC_ENGINE_VERSION)}</text>
</svg>`;
}

export function buildDataDrivenAnalyticalFigureSvg(
  experiment: Experiment,
  session: AnalyticalSession,
  figure: AnalyticalFigureConfiguration
): string {
  const width = figure.exportWidthPx || 820;
  const height = figure.exportHeightPx || 520;
  const padLeft = 78;
  const padRight = 36;
  const padTop = 64;
  const padBottom = 86;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const cal =
    session.calibrationDatasets.find((c) => c.id === session.activeCalibrationDatasetId) ||
    session.calibrationDatasets[0];

  const points: Array<{ x: number; y: number; label: string }> = [];
  if (
    figure.plotType === 'calibration_scatter' ||
    figure.plotType === 'calibration_regression' ||
    figure.plotType === 'residuals_vs_conc' ||
    figure.plotType === 'residuals_vs_fitted'
  ) {
    for (const s of cal?.standards || []) {
      if (
        s.qualityStatus !== 'excluded_by_user' &&
        typeof s.nominalConc === 'number' &&
        typeof s.instrumentResponse === 'number'
      ) {
        points.push({ x: s.nominalConc, y: s.instrumentResponse, label: s.standardId });
      }
    }
  } else {
    let idx = 1;
    for (const m of session.sampleMeasurements || []) {
      if (
        m.qualityStatus !== 'excluded_by_user' &&
        typeof m.reportedConc === 'number' &&
        Number.isFinite(m.reportedConc)
      ) {
        points.push({ x: idx, y: m.reportedConc, label: m.sampleId });
        idx += 1;
      }
    }
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = xs.length > 0 ? Math.min(0, Math.min(...xs)) : 0;
  const xMax = xs.length > 0 ? Math.max(...xs) * 1.1 || 10 : 10;
  const yMin = ys.length > 0 ? Math.min(0, Math.min(...ys)) : 0;
  const yMax = ys.length > 0 ? Math.max(...ys) * 1.15 || 100 : 100;

  const spanX = Math.max(1e-6, xMax - xMin);
  const spanY = Math.max(1e-6, yMax - yMin);
  const toSvgX = (x: number) => padLeft + ((x - xMin) / spanX) * plotW;
  const toSvgY = (y: number) => padTop + plotH - ((y - yMin) / spanY) * plotH;
  const color = figure.grayscaleMode ? '#111827' : figure.primaryColor || '#0F52BA';

  const gridLines: string[] = [];
  for (let i = 0; i <= 5; i += 1) {
    const xv = xMin + (spanX * i) / 5;
    const yv = yMin + (spanY * i) / 5;
    const sx = toSvgX(xv);
    const sy = toSvgY(yv);
    if (figure.showGridlines) {
      gridLines.push(
        `<line x1="${sx.toFixed(1)}" y1="${padTop}" x2="${sx.toFixed(1)}" y2="${padTop + plotH}" stroke="#E5E7EB" stroke-dasharray="3 3" />`,
        `<line x1="${padLeft}" y1="${sy.toFixed(1)}" x2="${padLeft + plotW}" y2="${sy.toFixed(1)}" stroke="#E5E7EB" stroke-dasharray="3 3" />`
      );
    }
    gridLines.push(
      `<text x="${sx.toFixed(1)}" y="${padTop + plotH + 18}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${xv.toFixed(1)}</text>`,
      `<text x="${padLeft - 8}" y="${(sy + 3).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${yv.toFixed(1)}</text>`
    );
  }

  const markerElements = points
    .map(
      (p) =>
        `<circle cx="${toSvgX(p.x).toFixed(1)}" cy="${toSvgY(p.y).toFixed(1)}" r="${figure.markerSize || 4.5}" fill="${color}" stroke="#FFFFFF" stroke-width="1" />`
    )
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FFFFFF" stroke="#E5E7EB" />
  <text x="${padLeft}" y="28" font-family="IBM Plex Sans, sans-serif" font-size="14" font-weight="600" fill="#111827">${xmlEsc(figure.title || figure.name)}</text>
  <text x="${padLeft}" y="46" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4B5563">${xmlEsc(experiment.experimentId)} · ${xmlEsc(session.sessionId)} · ${xmlEsc(session.technique)} · N=${points.length}</text>
  ${gridLines.join('\n  ')}
  <rect x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="none" stroke="#111827" stroke-width="1" />
  ${markerElements}
  <text x="${padLeft + plotW / 2}" y="${padTop + plotH + 42}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="600" fill="#111827">${xmlEsc(figure.xAxisTitle)} ${figure.xAxisUnit ? `(${xmlEsc(figure.xAxisUnit)})` : ''}</text>
  <text x="20" y="${padTop + plotH / 2}" text-anchor="middle" transform="rotate(-90 20 ${padTop + plotH / 2})" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="600" fill="#111827">${xmlEsc(figure.yAxisTitle)} ${figure.yAxisUnit ? `(${xmlEsc(figure.yAxisUnit)})` : ''}</text>
  <text x="${padLeft}" y="${height - 16}" font-family="IBM Plex Mono, monospace" font-size="9" fill="#6B7280">Provenance: ${xmlEsc(session.provenance)} | Review: ${xmlEsc(session.scientificReviewStatus)} | Engine: ${xmlEsc(CALC_ENGINE_VERSION)}</text>
</svg>`;
}

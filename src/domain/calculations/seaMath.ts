/**
 * SEA Workbench — Centralized Scientific Calculation & Numerical Analysis Entry Point (`seaMath.ts`)
 *
 * Phase 3 Architecture:
 * - Reuses Phase 2 general numerical infrastructure (descriptive statistics, replicate grouping,
 *   exploratory OLS linear regression, explicit unit conversion, and traceable analytical linkage).
 * - Adds survey completeness diagnostics, descriptive multi-dataset comparison, and distribution binning.
 * - Preserves strict scientific review boundaries: domain-specific SEA stoichiometry,
 *   isotherm/RPA charging models, and analytical method validation remain explicitly marked
 *   `pending_scientific_review` until independently validated.
 */

import {
  AnalyticalConfiguration,
  BatchConfiguration,
  CALC_ENGINE_VERSION,
  CalibrationStandard,
  DataProvenance,
  InstrumentMeasurement,
  SurveyMeasurement,
} from '../models/types';
import {
  CalculationResult,
  CalculationResultStatus,
} from './calculationTypes';
import {
  LinearRegressionData,
  computeLinearRegression,
} from './regression';
import {
  DescriptiveStatsData,
  ReplicateGroupSummary,
  ReplicateGroupingOptions,
  computeDescriptiveStatistics,
  computeSurveyReplicateGroups,
} from './statistics';
import { convertUnit } from './units';

export * from './calculationTypes';
export * from './numericValidation';
export * from './units';
export * from './statistics';
export * from './regression';
export * from './surveyAnalysis';

export type CalculationStatus =
  | 'unavailable_phase_1'
  | 'pending_scientific_review'
  | 'insufficient_inputs'
  | 'ready';

export interface CalculationFieldResult<T = number | null> {
  key: string;
  label: string;
  value: T;
  unit: string;
  status: CalculationStatus;
  resultStatus: CalculationResultStatus;
  provenance: DataProvenance;
  engineVersion: string;
  reason: string;
}

export interface BatchCalculationSummary {
  engineVersion: string;
  status: CalculationStatus;
  notice: string;
  inputCompleteness: {
    hasSupportSnapshot: boolean;
    hasPrecursorSnapshot: boolean;
    hasPlannedMass: boolean;
    hasPlannedVolume: boolean;
    hasTargetLoading: boolean;
    hasInitialPh: boolean;
    completedCount: number;
    totalCount: number;
  };
  fields: CalculationFieldResult[];
}

export interface SurveyPointSummary {
  rowId: string;
  sampleId: string;
  sampleGroupId: string;
  replicateId: string;
  initialPh: number | null;
  finalPh: number | null;
  deltaPhStatus: CalculationStatus;
  recordedDeltaPh: number | null;
  initialConcPpm: number | null;
  finalConcPpm: number | null;
  recordedUptakeUmolM2: number | null;
  uptakeUnit: string;
  provenance: DataProvenance;
  qualityStatus: SurveyMeasurement['qualityStatus'];
  exclusionReason?: string;
  linkedInitialMeasurementId: string | null;
  linkedFinalMeasurementId: string | null;
  notes: string;
}

export interface AnalyticalLinkStatus {
  surveyRowId: string;
  stage: 'Initial' | 'Final';
  linkedMeasurementId: string | null;
  linkedRecord: InstrumentMeasurement | null;
  sourceUnavailable: boolean;
  linkedEffectiveConcPpm: number | null;
  surveyRecordedConcPpm: number | null;
  hasDiscrepancy: boolean;
  discrepancyDeltaPpm: number | null;
  conversionError: string | null;
}

export interface AnalyticalBoundarySummary {
  engineVersion: string;
  status: CalculationStatus;
  notice: string;
  calibrationPointCount: number;
  validCalibrationPoints: number;
  initialSampleCount: number;
  finalSampleCount: number;
  blankOrControlCount: number;
  calibrationRegression: CalculationResult<LinearRegressionData>;
  fields: CalculationFieldResult[];
}

export interface SurveyDatasetAnalysis {
  engineVersion: string;
  containsSynthetic: boolean;
  totalRows: number;
  includedRows: number;
  flaggedCount: number;
  excludedByUserCount: number;
  excludeFlaggedApplied: boolean;
  initialPhStats: CalculationResult<DescriptiveStatsData>;
  finalPhStats: CalculationResult<DescriptiveStatsData>;
  deltaPhStats: CalculationResult<DescriptiveStatsData>;
  uptakeStats: CalculationResult<DescriptiveStatsData>;
  replicateGroups: ReplicateGroupSummary[];
}

/**
 * Evaluates Batch Synthesis input completeness and explicitly separates recorded
 * values from SEA stoichiometric / electrostatic models pending scientific review.
 */
export function evaluateBatchSynthesisBoundary(
  batch: BatchConfiguration
): BatchCalculationSummary {
  const hasSupportSnapshot = Boolean(batch.supportSnapshot?.supportData);
  const hasPrecursorSnapshot = Boolean(batch.precursorSnapshot?.precursorData);
  const hasPlannedMass = batch.plannedSupportMassG !== null;
  const hasPlannedVolume = batch.plannedSolutionVolumeMl !== null;
  const hasTargetLoading = batch.plannedTargetMetalLoadingWtPct !== null;
  const hasInitialPh = batch.plannedInitialPh !== null;

  const flags = [
    hasSupportSnapshot,
    hasPrecursorSnapshot,
    hasPlannedMass,
    hasPlannedVolume,
    hasTargetLoading,
    hasInitialPh,
  ];
  const completedCount = flags.filter(Boolean).length;

  const fields: CalculationFieldResult[] = [
    {
      key: 'required_precursor_mass',
      label: 'Required Precursor Mass',
      value: null,
      unit: 'mg',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason:
        'Pending independent review of stoichiometric precursor mass & hydration solver.',
    },
    {
      key: 'computed_surface_loading',
      label: 'Computed Surface Loading (SL)',
      value: null,
      unit: 'm²/L',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason:
        'Pending independent review of BET/slurry surface-loading calculation.',
    },
    {
      key: 'theoretical_monolayer_uptake',
      label: 'Theoretical Electrostatic Uptake Bound',
      value: null,
      unit: 'µmol/m²',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason: 'Pending independent review of SEA RPA / surface-charging model.',
    },
    {
      key: 'electrostatic_regime',
      label: 'pH vs. PZC Regime Classification',
      value: null,
      unit: 'pH',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason:
        'Pending validated PZC and precursor speciation equilibrium rules.',
    },
  ];

  return {
    engineVersion: CALC_ENGINE_VERSION,
    status: 'unavailable_phase_1',
    notice:
      'Scientific Review Boundary: Automated SEA stoichiometry, precursor dosing, and surface-charging models remain disabled pending independent specialist validation.',
    inputCompleteness: {
      hasSupportSnapshot,
      hasPrecursorSnapshot,
      hasPlannedMass,
      hasPlannedVolume,
      hasTargetLoading,
      hasInitialPh,
      completedCount,
      totalCount: flags.length,
    },
    fields,
  };
}

/**
 * Prepares discrete survey measurement points for plotting without inventing
 * missing values or fitting unreviewed isotherms.
 */
export function buildSurveyChartSeries(
  rows: SurveyMeasurement[],
  options: ReplicateGroupingOptions = {}
): SurveyPointSummary[] {
  const excludeFlagged = Boolean(options.excludeFlagged);
  return rows
    .filter((row) => {
      if (row.qualityStatus === 'excluded_by_user') return false;
      if (excludeFlagged && row.qualityStatus === 'flagged') return false;
      return true;
    })
    .map((row) => {
      const hasBothPh =
        row.measuredInitialPh !== null &&
        row.measuredFinalPh !== null &&
        Number.isFinite(row.measuredInitialPh) &&
        Number.isFinite(row.measuredFinalPh);

      return {
        rowId: row.id,
        sampleId: row.sampleId,
        sampleGroupId: row.sampleGroupId,
        replicateId: row.replicateId,
        initialPh: row.measuredInitialPh,
        finalPh: row.measuredFinalPh,
        deltaPhStatus: hasBothPh ? 'ready' : 'insufficient_inputs',
        recordedDeltaPh: hasBothPh
          ? Number(
              (
                (row.measuredFinalPh as number) -
                (row.measuredInitialPh as number)
              ).toFixed(3)
            )
          : null,
        initialConcPpm: row.initialConcPpm,
        finalConcPpm: row.finalConcPpm,
        recordedUptakeUmolM2: row.recordedUptakeUmolM2,
        uptakeUnit: row.uptakeUnit || 'µmol/m²',
        provenance: row.provenance,
        qualityStatus: row.qualityStatus,
        exclusionReason: row.exclusionReason,
        linkedInitialMeasurementId: row.linkedInitialMeasurementId,
        linkedFinalMeasurementId: row.linkedFinalMeasurementId,
        notes: row.notes,
      };
    });
}

/**
 * Computes dataset-level descriptive statistics and explicit replicate-group summaries
 * directly from survey measurements, honoring explicit exclusion settings.
 */
export function analyzeSurveyDataset(
  rows: SurveyMeasurement[],
  options: ReplicateGroupingOptions = {}
): SurveyDatasetAnalysis {
  const excludeFlagged = Boolean(options.excludeFlagged);
  const flaggedCount = rows.filter((r) => r.qualityStatus === 'flagged').length;
  const excludedByUserCount = rows.filter(
    (r) => r.qualityStatus === 'excluded_by_user'
  ).length;
  const included = rows.filter((r) => {
    if (r.qualityStatus === 'excluded_by_user') return false;
    if (excludeFlagged && r.qualityStatus === 'flagged') return false;
    return true;
  });
  const containsSynthetic = included.some(
    (r) => r.provenance === 'synthetic_demo'
  );
  const inputRefs = included.map((r) => r.id);

  const deltaPhValues = included.map((r) =>
    r.measuredInitialPh !== null &&
    r.measuredFinalPh !== null &&
    Number.isFinite(r.measuredInitialPh) &&
    Number.isFinite(r.measuredFinalPh)
      ? r.measuredFinalPh - r.measuredInitialPh
      : null
  );

  return {
    engineVersion: CALC_ENGINE_VERSION,
    containsSynthetic,
    totalRows: rows.length,
    includedRows: included.length,
    flaggedCount,
    excludedByUserCount,
    excludeFlaggedApplied: excludeFlagged,
    initialPhStats: computeDescriptiveStatistics(
      included.map((r) => r.measuredInitialPh),
      {
        calculationId: 'survey-initial-ph-stats',
        unit: 'pH',
        inputRefs,
        containsSynthetic,
      }
    ),
    finalPhStats: computeDescriptiveStatistics(
      included.map((r) => r.measuredFinalPh),
      {
        calculationId: 'survey-final-ph-stats',
        unit: 'pH',
        inputRefs,
        containsSynthetic,
      }
    ),
    deltaPhStats: computeDescriptiveStatistics(deltaPhValues, {
      calculationId: 'survey-delta-ph-stats',
      unit: 'ΔpH',
      inputRefs,
      containsSynthetic,
    }),
    uptakeStats: computeDescriptiveStatistics(
      included.map((r) => r.recordedUptakeUmolM2),
      {
        calculationId: 'survey-uptake-stats',
        unit: 'µmol/m²',
        inputRefs,
        containsSynthetic,
      }
    ),
    replicateGroups: computeSurveyReplicateGroups(rows, { excludeFlagged }),
  };
}

/**
 * Resolves explicit links between SurveyMeasurement rows and InstrumentMeasurement
 * records via stable internal IDs. Detects missing/deleted source records and
 * numerical discrepancies without silently overwriting user-entered survey records.
 */
export function resolveSurveyAnalyticalLinks(
  surveyRows: SurveyMeasurement[],
  instrumentRows: InstrumentMeasurement[],
  tolerancePpm = 0.05
): Record<string, { initial: AnalyticalLinkStatus; final: AnalyticalLinkStatus }> {
  const instrumentById = new Map<string, InstrumentMeasurement>();
  for (const m of instrumentRows) {
    instrumentById.set(m.id, m);
  }

  const buildLink = (
    row: SurveyMeasurement,
    stage: 'Initial' | 'Final'
  ): AnalyticalLinkStatus => {
    const linkedId =
      stage === 'Initial'
        ? row.linkedInitialMeasurementId
        : row.linkedFinalMeasurementId;
    const surveyConc =
      stage === 'Initial' ? row.initialConcPpm : row.finalConcPpm;

    if (!linkedId) {
      return {
        surveyRowId: row.id,
        stage,
        linkedMeasurementId: null,
        linkedRecord: null,
        sourceUnavailable: false,
        linkedEffectiveConcPpm: null,
        surveyRecordedConcPpm: surveyConc,
        hasDiscrepancy: false,
        discrepancyDeltaPpm: null,
        conversionError: null,
      };
    }

    const record = instrumentById.get(linkedId) ?? null;
    if (!record) {
      return {
        surveyRowId: row.id,
        stage,
        linkedMeasurementId: linkedId,
        linkedRecord: null,
        sourceUnavailable: true,
        linkedEffectiveConcPpm: null,
        surveyRecordedConcPpm: surveyConc,
        hasDiscrepancy: false,
        discrepancyDeltaPpm: null,
        conversionError: null,
      };
    }

    if (record.reportedConc === null || !Number.isFinite(record.reportedConc)) {
      return {
        surveyRowId: row.id,
        stage,
        linkedMeasurementId: linkedId,
        linkedRecord: record,
        sourceUnavailable: false,
        linkedEffectiveConcPpm: null,
        surveyRecordedConcPpm: surveyConc,
        hasDiscrepancy: false,
        discrepancyDeltaPpm: null,
        conversionError: null,
      };
    }

    const conv = convertUnit(record.reportedConc, record.concUnit || 'ppm', 'ppm');
    if (!conv.ok || conv.value === null) {
      return {
        surveyRowId: row.id,
        stage,
        linkedMeasurementId: linkedId,
        linkedRecord: record,
        sourceUnavailable: false,
        linkedEffectiveConcPpm: null,
        surveyRecordedConcPpm: surveyConc,
        hasDiscrepancy: false,
        discrepancyDeltaPpm: null,
        conversionError: conv.error,
      };
    }

    const dilution =
      record.dilutionFactor !== null &&
      Number.isFinite(record.dilutionFactor) &&
      record.dilutionFactor > 0
        ? record.dilutionFactor
        : 1;
    const effectivePpm = conv.value * dilution;

    let hasDiscrepancy = false;
    let discrepancyDeltaPpm: number | null = null;
    if (surveyConc !== null && Number.isFinite(surveyConc)) {
      discrepancyDeltaPpm = surveyConc - effectivePpm;
      hasDiscrepancy = Math.abs(discrepancyDeltaPpm) > tolerancePpm;
    }

    return {
      surveyRowId: row.id,
      stage,
      linkedMeasurementId: linkedId,
      linkedRecord: record,
      sourceUnavailable: false,
      linkedEffectiveConcPpm: effectivePpm,
      surveyRecordedConcPpm: surveyConc,
      hasDiscrepancy,
      discrepancyDeltaPpm,
      conversionError: null,
    };
  };

  const result: Record<
    string,
    { initial: AnalyticalLinkStatus; final: AnalyticalLinkStatus }
  > = {};
  for (const row of surveyRows) {
    result[row.id] = {
      initial: buildLink(row, 'Initial'),
      final: buildLink(row, 'Final'),
    };
  }
  return result;
}

/**
 * Evaluates exploratory OLS linear regression on Calibration Standards plus
 * explicit scientific review boundaries for analytical method validation.
 */
export function evaluateAnalyticalBoundary(
  standards: CalibrationStandard[],
  samples: InstrumentMeasurement[],
  config?: AnalyticalConfiguration
): AnalyticalBoundarySummary {
  const includedStandards = standards.filter(
    (s) => s.qualityStatus !== 'excluded_by_user'
  );
  const validCalibrationPoints = includedStandards.filter(
    (s) => s.nominalConc !== null && s.instrumentResponse !== null
  ).length;
  const initialSampleCount = samples.filter((s) => s.stage === 'Initial').length;
  const finalSampleCount = samples.filter((s) => s.stage === 'Final').length;
  const blankOrControlCount = samples.filter(
    (s) => s.stage === 'Blank' || s.stage === 'Control'
  ).length;

  const xUnit =
    includedStandards[0]?.unit || config?.calibrationUnits || 'mg/L (ppm)';
  const yUnit = includedStandards[0]?.responseUnit || 'cps';

  const calibrationRegression = computeLinearRegression(
    includedStandards.map((s) => ({
      id: s.id,
      label: s.standardId,
      x: s.nominalConc,
      y: s.instrumentResponse,
      provenance: s.provenance,
    })),
    {
      calculationId: 'calibration-ols-exploratory',
      xUnit,
      yUnit,
      containsSynthetic:
        config?.dataProvenance === 'synthetic_demo' ||
        includedStandards.some((s) => s.provenance === 'synthetic_demo'),
    }
  );

  const fields: CalculationFieldResult[] = [
    {
      key: 'lod_loq',
      label: 'Method LOD / LOQ',
      value: null,
      unit: 'mg/L (ppm)',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason:
        'Requires independently reviewed blank-variance analytical method validation.',
    },
    {
      key: 'dilution_corrected_uptake',
      label: 'Validated Dilution-Corrected Metal Uptake',
      value: null,
      unit: 'wt% / µmol·m⁻²',
      status: 'unavailable_phase_1',
      resultStatus: 'pending_scientific_review',
      provenance: 'unavailable',
      engineVersion: CALC_ENGINE_VERSION,
      reason:
        'Requires reviewed mass-balance uptake derivation and analytical QA rules.',
    },
  ];

  return {
    engineVersion: CALC_ENGINE_VERSION,
    status: 'unavailable_phase_1',
    notice:
      'Exploratory OLS regression is provided for general numerical inspection only. Method validation (LOD/LOQ, matrix spike recovery, and dilution-corrected uptake certification) remains pending scientific review.',
    calibrationPointCount: standards.length,
    validCalibrationPoints,
    initialSampleCount,
    finalSampleCount,
    blankOrControlCount,
    calibrationRegression,
    fields,
  };
}

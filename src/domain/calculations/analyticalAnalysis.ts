/**
 * SEA Workbench — Phase 4 Analytical Chemistry Numerical Analysis & Diagnostics
 *
 * Strictly reuses Phase 2 `computeLinearRegression`, `computeDescriptiveStatistics`,
 * and `areUnitsCompatible` / `convertUnit` without duplicating mathematical engines.
 *
 * Scientific Review Boundaries:
 * - Calibration regression is strictly labeled "Exploratory Numerical Analysis — Not Analytical Method Validation".
 * - LOD, LOQ, recovery acceptance criteria, and automated method validation remain disabled.
 * - Dilution diagnostics flag conflicts and double-correction risks without generating chemical recipes.
 */

import {
  AnalyticalFigureConfiguration,
  AnalyticalFigurePlotType,
  AnalyticalQualityIssueCategory,
  AnalyticalReviewRecord,
  AnalyticalReviewStatus,
  AnalyticalSession,
  CALC_ENGINE_VERSION,
  CalibrationDataset,
  CalibrationStandard,
  DataProvenance,
  DilutionRecord,
  Experiment,
  InstrumentMeasurement,
  SurveyMeasurement,
} from '../models/types';
import {
  getAllExperimentInstrumentMeasurements,
  getAllExperimentSurveyMeasurements,
} from '../models/projections';
import { CalculationResult } from './calculationTypes';
import { LinearRegressionData, computeLinearRegression } from './regression';
import { DescriptiveStatsData, computeDescriptiveStatistics } from './statistics';
import { areUnitsCompatible, convertUnit } from './units';

export interface CalibrationReplicateLevelSummary {
  levelKey: string;
  nominalConc: number;
  unit: string;
  responseUnit: string;
  totalCount: number;
  includedCount: number;
  excludedCount: number;
  responseStats: CalculationResult<DescriptiveStatsData>;
  standardIds: string[];
}

export interface CalibrationDatasetAnalysis {
  engineVersion: string;
  calibrationDatasetId: string;
  calibrationCode: string;
  analyteId: string | null;
  totalStandards: number;
  includedCount: number;
  excludedCount: number;
  flaggedCount: number;
  missingCount: number;
  blankCount: number;
  containsSynthetic: boolean;
  regression: CalculationResult<LinearRegressionData>;
  replicateLevels: CalibrationReplicateLevelSummary[];
  /** Residual-vs-concentration & residual-vs-fitted points aligned with source standard IDs */
  diagnosticPoints: Array<{
    id: string;
    standardId: string;
    nominalConc: number;
    observedResponse: number;
    fittedResponse: number;
    residual: number;
    qualityStatus: CalibrationStandard['qualityStatus'];
    provenance: DataProvenance;
  }>;
}

export interface DilutionDiagnosticIssue {
  id: string;
  dilutionRecordId: string;
  sampleId: string;
  sampleMeasurementId: string | null;
  severity: 'warning' | 'conflict' | 'incomplete';
  kind:
    | 'missing_factor'
    | 'invalid_volume'
    | 'volume_ratio_conflict'
    | 'duplicate_correction_risk'
    | 'sample_factor_mismatch'
    | 'unlinked_dilution_record';
  message: string;
  impliedFactorFromVolumes: number | null;
  recordedFactor: number | null;
}

export interface DetectedAnalyticalIssue {
  issueKey: string;
  category: AnalyticalQualityIssueCategory;
  sessionId: string;
  recordId: string;
  recordLabel: string;
  description: string;
  provenance: DataProvenance;
  targetTab: 'overview' | 'calibration' | 'samples' | 'dilutions' | 'quality';
  persistedReview: AnalyticalReviewRecord | null;
  effectiveStatus: AnalyticalReviewStatus;
}

export interface AnalyticalSessionOverview {
  engineVersion: string;
  sessionId: string;
  totalAnalytes: number;
  totalCalibrationDatasets: number;
  analyzableCalibrationDatasets: number;
  totalSampleMeasurements: number;
  validSampleMeasurements: number;
  missingValueSamples: number;
  flaggedSamples: number;
  excludedSamples: number;
  instrumentWarningSamples: number;
  dilutionRecordCount: number;
  dilutionConflictCount: number;
  linkedSurveyCount: number;
  discrepancyLinkCount: number;
  unresolvedLinkCount: number;
  openQualityIssueCount: number;
  provenanceDistribution: Record<DataProvenance, number>;
  /** Explicitly separates factual states — never produces a single misleading validity score */
  statusDistinction: {
    hasCompleteMetadata: boolean;
    missingMetadataFields: string[];
    hasMathematicallyAnalyzableCalibration: boolean;
    hasResearcherReviewedRecords: boolean;
    isIndependentlyValidatedMethod: false;
  };
  containsSynthetic: boolean;
}

export interface SurveyLinkMatchSuggestion {
  instrumentMeasurementId: string;
  instrumentSampleId: string;
  instrumentStage: InstrumentMeasurement['stage'];
  candidateMatches: Array<{
    surveyDatasetId: string;
    surveyDatasetCode: string;
    surveyMeasurementId: string;
    surveySampleId: string;
    targetStage: 'Initial' | 'Final';
    matchReason: 'exact_sample_id' | 'linked_label_match';
  }>;
  isAmbiguous: boolean;
}

export interface AnalyticalSessionComparisonEntry {
  sessionId: string;
  sessionCode: string;
  title: string;
  technique: string;
  instrumentLabel: string;
  analyteSymbol: string;
  wavelengthNm: number | null;
  concUnit: string;
  provenance: DataProvenance;
  isDemonstration: boolean;
  sampleCount: number;
  includedSampleCount: number;
  flaggedCount: number;
  excludedCount: number;
  missingCount: number;
  concentrationStats: CalculationResult<DescriptiveStatsData>;
  calibrationR2: number | null;
  calibrationSlope: number | null;
  calibrationIntercept: number | null;
  calibrationResidualMaxAbs: number | null;
  openQualityIssues: number;
  valuesForPlot: Array<{
    id: string;
    sampleId: string;
    stage: string;
    value: number;
    unit: string;
  }>;
}

export interface AnalyticalSessionComparisonSummary {
  engineVersion: string;
  entries: AnalyticalSessionComparisonEntry[];
  warnings: string[];
  hasIncompatibleUnits: boolean;
  unitSummary: string[];
  containsSynthetic: boolean;
}

/**
 * Evaluates a single CalibrationDataset using Phase 2 `computeLinearRegression`
 * and `computeDescriptiveStatistics` (zero duplicated math).
 */
export function analyzeCalibrationDataset(
  dataset: CalibrationDataset | null
): CalibrationDatasetAnalysis | null {
  if (!dataset) return null;

  const standards = dataset.standards ?? [];
  const excludedCount = standards.filter(
    (s) => s.qualityStatus === 'excluded_by_user'
  ).length;
  const flaggedCount = standards.filter(
    (s) => s.qualityStatus === 'flagged'
  ).length;
  const blankCount = standards.filter(
    (s) => s.isBlank || s.nominalConc === 0
  ).length;

  const included = standards.filter(
    (s) => s.qualityStatus !== 'excluded_by_user'
  );
  const missingCount = included.filter(
    (s) =>
      s.nominalConc === null ||
      !Number.isFinite(s.nominalConc) ||
      s.instrumentResponse === null ||
      !Number.isFinite(s.instrumentResponse)
  ).length;

  const containsSynthetic =
    dataset.provenance === 'synthetic_demo' ||
    standards.some((s) => s.provenance === 'synthetic_demo');

  const xUnit = dataset.concUnit || included[0]?.unit || 'ppm';
  const yUnit = dataset.responseUnit || included[0]?.responseUnit || 'cps';

  const regression = computeLinearRegression(
    included.map((s) => ({
      id: s.id,
      label: s.standardId,
      x: s.nominalConc,
      y: s.instrumentResponse,
      provenance: s.provenance,
    })),
    {
      calculationId: `calibration-ols-${dataset.calibrationId}`,
      xUnit,
      yUnit,
      containsSynthetic,
    }
  );

  // Build replicate level summaries by exact nominal concentration value (explicit grouping)
  const levelMap = new Map<string, CalibrationStandard[]>();
  for (const s of standards) {
    if (s.nominalConc === null || !Number.isFinite(s.nominalConc)) continue;
    const key = s.replicateGroupId?.trim() || `${s.nominalConc}`;
    const arr = levelMap.get(key) ?? [];
    arr.push(s);
    levelMap.set(key, arr);
  }

  const replicateLevels: CalibrationReplicateLevelSummary[] = Array.from(
    levelMap.entries()
  )
    .map(([levelKey, groupRows]) => {
      const validRows = groupRows.filter(
        (r) => r.qualityStatus !== 'excluded_by_user'
      );
      const nominalConc = groupRows[0]?.nominalConc ?? 0;
      return {
        levelKey,
        nominalConc,
        unit: groupRows[0]?.unit || xUnit,
        responseUnit: groupRows[0]?.responseUnit || yUnit,
        totalCount: groupRows.length,
        includedCount: validRows.length,
        excludedCount: groupRows.length - validRows.length,
        responseStats: computeDescriptiveStatistics(
          validRows.map((r) => r.instrumentResponse),
          {
            calculationId: `cal-level-${dataset.calibrationId}-${levelKey}`,
            unit: yUnit,
            inputRefs: validRows.map((r) => r.id),
            containsSynthetic,
          }
        ),
        standardIds: groupRows.map((r) => r.standardId),
      };
    })
    .sort((a, b) => a.nominalConc - b.nominalConc);

  const stdById = new Map(standards.map((s) => [s.id, s]));
  const diagnosticPoints =
    regression.value.fittedPoints.map((pt) => {
      const src = stdById.get(pt.id);
      return {
        id: pt.id,
        standardId: pt.label,
        nominalConc: pt.x,
        observedResponse: pt.y,
        fittedResponse: pt.yHat,
        residual: pt.residual,
        qualityStatus: src?.qualityStatus ?? 'valid',
        provenance: src?.provenance ?? dataset.provenance,
      };
    }) ?? [];

  return {
    engineVersion: CALC_ENGINE_VERSION,
    calibrationDatasetId: dataset.id,
    calibrationCode: dataset.calibrationId,
    analyteId: dataset.analyteId,
    totalStandards: standards.length,
    includedCount: included.length - missingCount,
    excludedCount,
    flaggedCount,
    missingCount,
    blankCount,
    containsSynthetic,
    regression,
    replicateLevels,
    diagnosticPoints,
  };
}

/**
 * Evaluates DilutionRecord consistency and double-correction risks.
 * Strictly traceable documentation diagnostics — never generates chemical preparation recipes.
 */
export function evaluateDilutionConsistency(
  session: AnalyticalSession
): DilutionDiagnosticIssue[] {
  const issues: DilutionDiagnosticIssue[] = [];
  const sampleById = new Map(
    (session.sampleMeasurements ?? []).map((m) => [m.id, m])
  );

  for (const rec of session.dilutionRecords ?? []) {
    const linkedSample = rec.sampleMeasurementId
      ? sampleById.get(rec.sampleMeasurementId) ?? null
      : null;

    if (rec.sampleMeasurementId && !linkedSample) {
      issues.push({
        id: `dil-unlinked-${rec.id}`,
        dilutionRecordId: rec.id,
        sampleId: rec.sampleId,
        sampleMeasurementId: rec.sampleMeasurementId,
        severity: 'warning',
        kind: 'unlinked_dilution_record',
        message: `Dilution record for ${rec.sampleId} references an analytical sample ID that is no longer present in this session.`,
        impliedFactorFromVolumes: null,
        recordedFactor: rec.dilutionFactor,
      });
    }

    if (
      rec.dilutionFactor === null ||
      !Number.isFinite(rec.dilutionFactor) ||
      rec.dilutionFactor <= 0
    ) {
      issues.push({
        id: `dil-missing-${rec.id}`,
        dilutionRecordId: rec.id,
        sampleId: rec.sampleId,
        sampleMeasurementId: rec.sampleMeasurementId,
        severity: 'incomplete',
        kind: 'missing_factor',
        message: `Recorded dilution factor for ${rec.sampleId} is missing or non-positive.`,
        impliedFactorFromVolumes: null,
        recordedFactor: rec.dilutionFactor,
      });
    }

    if (
      (rec.sourceVolumeMl !== null && rec.sourceVolumeMl <= 0) ||
      (rec.finalVolumeMl !== null && rec.finalVolumeMl <= 0) ||
      (rec.sourceVolumeMl !== null &&
        rec.finalVolumeMl !== null &&
        rec.finalVolumeMl < rec.sourceVolumeMl)
    ) {
      issues.push({
        id: `dil-vol-${rec.id}`,
        dilutionRecordId: rec.id,
        sampleId: rec.sampleId,
        sampleMeasurementId: rec.sampleMeasurementId,
        severity: 'conflict',
        kind: 'invalid_volume',
        message: `Recorded source volume (${rec.sourceVolumeMl ?? '—'} mL) and final volume (${rec.finalVolumeMl ?? '—'} mL) for ${rec.sampleId} are physically inconsistent.`,
        impliedFactorFromVolumes: null,
        recordedFactor: rec.dilutionFactor,
      });
    } else if (
      rec.sourceVolumeMl !== null &&
      rec.finalVolumeMl !== null &&
      rec.sourceVolumeMl > 0 &&
      rec.finalVolumeMl > 0 &&
      rec.dilutionFactor !== null &&
      rec.dilutionFactor > 0
    ) {
      const implied = rec.finalVolumeMl / rec.sourceVolumeMl;
      const relDiff = Math.abs(implied - rec.dilutionFactor) / rec.dilutionFactor;
      if (relDiff > 0.02) {
        issues.push({
          id: `dil-conflict-${rec.id}`,
          dilutionRecordId: rec.id,
          sampleId: rec.sampleId,
          sampleMeasurementId: rec.sampleMeasurementId,
          severity: 'conflict',
          kind: 'volume_ratio_conflict',
          message: `Volume ratio (${rec.finalVolumeMl}/${rec.sourceVolumeMl} = ${implied.toFixed(2)}×) conflicts with recorded dilution factor (${rec.dilutionFactor}×) for ${rec.sampleId}.`,
          impliedFactorFromVolumes: Number(implied.toFixed(4)),
          recordedFactor: rec.dilutionFactor,
        });
      }
    }

    if (
      rec.reportedValueBasis === 'already_dilution_corrected' &&
      rec.dilutionFactor !== null &&
      rec.dilutionFactor > 1
    ) {
      issues.push({
        id: `dil-dup-${rec.id}`,
        dilutionRecordId: rec.id,
        sampleId: rec.sampleId,
        sampleMeasurementId: rec.sampleMeasurementId,
        severity: 'warning',
        kind: 'duplicate_correction_risk',
        message: `Instrument output for ${rec.sampleId} is marked as already dilution-corrected by instrument software; downstream linkage uses factor 1× to prevent double-applying ${rec.dilutionFactor}×.`,
        impliedFactorFromVolumes:
          rec.sourceVolumeMl && rec.finalVolumeMl
            ? Number((rec.finalVolumeMl / rec.sourceVolumeMl).toFixed(4))
            : null,
        recordedFactor: rec.dilutionFactor,
      });
    }

    if (
      linkedSample &&
      linkedSample.dilutionFactor !== null &&
      rec.dilutionFactor !== null &&
      Math.abs(linkedSample.dilutionFactor - rec.dilutionFactor) > 1e-6
    ) {
      issues.push({
        id: `dil-sample-mismatch-${rec.id}`,
        dilutionRecordId: rec.id,
        sampleId: rec.sampleId,
        sampleMeasurementId: rec.sampleMeasurementId,
        severity: 'conflict',
        kind: 'sample_factor_mismatch',
        message: `Dilution record factor (${rec.dilutionFactor}×) differs from sample table dilution factor (${linkedSample.dilutionFactor}×) for ${rec.sampleId}.`,
        impliedFactorFromVolumes: null,
        recordedFactor: rec.dilutionFactor,
      });
    }
  }

  return issues;
}

/**
 * Computes sample-level replicate statistics grouped by (analyte + sampleId base or stage).
 */
export function computeAnalyticalReplicateGroups(
  measurements: InstrumentMeasurement[]
): Array<{
  groupKey: string;
  sampleId: string;
  analyte: string;
  stage: InstrumentMeasurement['stage'];
  unit: string;
  totalCount: number;
  includedCount: number;
  excludedCount: number;
  concStats: CalculationResult<DescriptiveStatsData>;
  signalStats: CalculationResult<DescriptiveStatsData>;
}> {
  const groups = new Map<string, InstrumentMeasurement[]>();
  for (const m of measurements) {
    const key = `${m.analyte || 'Unspecified'}::${m.stage}::${m.sampleId}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  return Array.from(groups.entries()).map(([groupKey, rows]) => {
    const valid = rows.filter((r) => r.qualityStatus !== 'excluded_by_user');
    const first = rows[0];
    const containsSynthetic = rows.some((r) => r.provenance === 'synthetic_demo');
    return {
      groupKey,
      sampleId: first.sampleId,
      analyte: first.analyte || 'Unspecified',
      stage: first.stage,
      unit: first.concUnit || 'ppm',
      totalCount: rows.length,
      includedCount: valid.length,
      excludedCount: rows.length - valid.length,
      concStats: computeDescriptiveStatistics(
        valid.map((r) => r.reportedConc),
        {
          calculationId: `ana-rep-conc-${groupKey}`,
          unit: first.concUnit || 'ppm',
          inputRefs: valid.map((r) => r.id),
          containsSynthetic,
        }
      ),
      signalStats: computeDescriptiveStatistics(
        valid.map((r) => r.rawSignal),
        {
          calculationId: `ana-rep-sig-${groupKey}`,
          unit: first.signalUnit || 'cps',
          inputRefs: valid.map((r) => r.id),
          containsSynthetic,
        }
      ),
    };
  });
}

/**
 * Deterministically detects all 11 analytical quality review issue categories for an
 * AnalyticalSession and merges with persisted researcher review records.
 */
export function detectAnalyticalQualityIssues(
  experiment: Experiment,
  session: AnalyticalSession
): DetectedAnalyticalIssue[] {
  const detected: Omit<DetectedAnalyticalIssue, 'persistedReview' | 'effectiveStatus'>[] = [];
  const calById = new Map(
    (session.calibrationDatasets ?? []).map((c) => [c.id, c])
  );
  const analyteById = new Map(
    (session.analytes ?? []).map((a) => [a.id, a])
  );
  const allSurveyEntries = getAllExperimentSurveyMeasurements(experiment);
  const surveyRowIds = new Set(allSurveyEntries.map((e) => e.measurement.id));

  // 1. Incomplete session metadata
  const missingMeta: string[] = [];
  if (!session.instrumentModel.trim()) missingMeta.push('instrument model');
  if (!session.analyst.trim()) missingMeta.push('analyst');
  if (!session.analysisDate.trim()) missingMeta.push('analysis date');
  if (!session.methodReference.trim()) missingMeta.push('method reference');
  if (missingMeta.length > 0) {
    detected.push({
      issueKey: `meta:${session.id}`,
      category: 'incomplete_metadata',
      sessionId: session.id,
      recordId: session.id,
      recordLabel: session.sessionId,
      description: `Session metadata missing: ${missingMeta.join(', ')}.`,
      provenance: session.provenance,
      targetTab: 'overview',
    });
  }

  // Track duplicate sample keys (sampleId + analyte + stage + replicateId)
  const dupMap = new Map<string, InstrumentMeasurement[]>();
  for (const row of session.sampleMeasurements ?? []) {
    const dupKey = `${row.sampleId.trim().toLowerCase()}|${(row.analyte || '').trim().toLowerCase()}|${row.stage}|${(row.replicateId || '').trim().toLowerCase()}`;
    if (row.sampleId.trim()) {
      const list = dupMap.get(dupKey) ?? [];
      list.push(row);
      dupMap.set(dupKey, list);
    }

    // Missing measurement
    if (row.reportedConc === null && row.rawSignal === null) {
      detected.push({
        issueKey: `missing:${row.id}`,
        category: 'missing_measurement',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId || row.id,
        description: `Both reported concentration and raw signal are missing for ${row.sampleId} (${row.stage}).`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    } else if (
      (row.stage === 'Initial' || row.stage === 'Final') &&
      row.reportedConc === null
    ) {
      detected.push({
        issueKey: `missing-conc:${row.id}`,
        category: 'missing_measurement',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId || row.id,
        description: `Reported concentration is null for ${row.stage} sample ${row.sampleId}; raw signal recorded without concentration value.`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    }

    // Unresolved survey association
    if (
      row.linkedSurveyMeasurementId &&
      !surveyRowIds.has(row.linkedSurveyMeasurementId)
    ) {
      detected.push({
        issueKey: `unresolved-link:${row.id}`,
        category: 'unresolved_survey_association',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Linked survey measurement reference (${row.linkedSurveyMeasurementId}) no longer exists in this experiment.`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    } else if (
      (row.stage === 'Initial' || row.stage === 'Final') &&
      row.linkedSurveySampleId.trim() &&
      !row.linkedSurveyMeasurementId
    ) {
      const matched = allSurveyEntries.some(
        (e) =>
          e.measurement.linkedInitialMeasurementId === row.id ||
          e.measurement.linkedFinalMeasurementId === row.id
      );
      if (!matched) {
        detected.push({
          issueKey: `unconfirmed-link:${row.id}`,
          category: 'unresolved_survey_association',
          sessionId: session.id,
          recordId: row.id,
          recordLabel: row.sampleId,
          description: `Sample ${row.sampleId} lists survey sample label "${row.linkedSurveySampleId}" but has no confirmed UUID survey link.`,
          provenance: row.provenance,
          targetTab: 'samples',
        });
      }
    }

    // Calibration association & unit compatibility
    const cal = row.calibrationDatasetId
      ? calById.get(row.calibrationDatasetId) ?? null
      : null;
    if (row.calibrationDatasetId && !cal) {
      detected.push({
        issueKey: `missing-cal:${row.id}`,
        category: 'missing_calibration_association',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample ${row.sampleId} references calibration dataset ID ${row.calibrationDatasetId} which is missing from this session.`,
        provenance: row.provenance,
        targetTab: 'calibration',
      });
    } else if (
      !row.calibrationDatasetId &&
      (row.stage === 'Initial' || row.stage === 'Final')
    ) {
      detected.push({
        issueKey: `unassigned-cal:${row.id}`,
        category: 'missing_calibration_association',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample ${row.sampleId} is not associated with a calibration dataset.`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    }

    if (cal) {
      // Check analyte compatibility
      if (row.analyteId && cal.analyteId && row.analyteId !== cal.analyteId) {
        const rowAnalyte = analyteById.get(row.analyteId)?.symbol ?? row.analyte;
        const calAnalyte = analyteById.get(cal.analyteId)?.symbol ?? cal.analyteId;
        detected.push({
          issueKey: `cal-analyte-mismatch:${row.id}`,
          category: 'missing_calibration_association',
          sessionId: session.id,
          recordId: row.id,
          recordLabel: row.sampleId,
          description: `Sample ${row.sampleId} analyte (${rowAnalyte}) does not match associated calibration ${cal.calibrationId} analyte (${calAnalyte}).`,
          provenance: row.provenance,
          targetTab: 'samples',
        });
      }

      // Check unit compatibility
      if (
        row.concUnit &&
        cal.concUnit &&
        !areUnitsCompatible(row.concUnit, cal.concUnit)
      ) {
        detected.push({
          issueKey: `unit-incompat:${row.id}`,
          category: 'incompatible_units',
          sessionId: session.id,
          recordId: row.id,
          recordLabel: row.sampleId,
          description: `Sample unit "${row.concUnit}" is incompatible with calibration dataset unit "${cal.concUnit}".`,
          provenance: row.provenance,
          targetTab: 'samples',
        });
      }
    }

    // Check ppm compatibility for survey-linked samples
    if (
      (row.stage === 'Initial' || row.stage === 'Final') &&
      row.concUnit &&
      !areUnitsCompatible(row.concUnit, 'ppm')
    ) {
      detected.push({
        issueKey: `unit-survey-incompat:${row.id}`,
        category: 'incompatible_units',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample concentration unit "${row.concUnit}" cannot be converted cleanly to ppm/mg·L⁻¹ for survey concentration comparison.`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    }

    // Instrument warning
    if (row.instrumentFlag && row.instrumentFlag.trim().length > 0) {
      detected.push({
        issueKey: `inst-warn:${row.id}`,
        category: 'instrument_warning',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Instrument-reported flag on ${row.sampleId}: "${row.instrumentFlag.trim()}".`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    }

    // Flagged / Excluded / Pending review
    if (row.qualityStatus === 'flagged') {
      detected.push({
        issueKey: `flagged:${row.id}`,
        category: 'flagged_observation',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample ${row.sampleId} is flagged for researcher review.${row.notes ? ` Note: ${row.notes}` : ''}`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    } else if (row.qualityStatus === 'excluded_by_user') {
      detected.push({
        issueKey: `excluded:${row.id}`,
        category: 'user_excluded_record',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample ${row.sampleId} excluded by researcher.${row.exclusionReason ? ` Reason: ${row.exclusionReason}` : ' (No exclusion reason documented yet.)'}`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    } else if (row.qualityStatus === 'pending') {
      detected.push({
        issueKey: `pending:${row.id}`,
        category: 'pending_review',
        sessionId: session.id,
        recordId: row.id,
        recordLabel: row.sampleId,
        description: `Sample ${row.sampleId} is marked pending analytical review.`,
        provenance: row.provenance,
        targetTab: 'samples',
      });
    }
  }

  // Duplicate sample entries
  for (const [, rows] of dupMap.entries()) {
    if (rows.length > 1) {
      detected.push({
        issueKey: `dup:${rows.map((r) => r.id).sort().join(',')}`,
        category: 'duplicate_measurement',
        sessionId: session.id,
        recordId: rows[0].id,
        recordLabel: `${rows[0].sampleId} (${rows[0].replicateId})`,
        description: `Detected ${rows.length} entries with identical Sample ID "${rows[0].sampleId}", analyte "${rows[0].analyte}", stage "${rows[0].stage}", and replicate "${rows[0].replicateId}".`,
        provenance: rows[0].provenance,
        targetTab: 'samples',
      });
    }
  }

  // Calibration standards excluded or flagged
  for (const cal of session.calibrationDatasets ?? []) {
    for (const std of cal.standards ?? []) {
      if (std.qualityStatus === 'excluded_by_user') {
        detected.push({
          issueKey: `cal-excluded:${std.id}`,
          category: 'user_excluded_record',
          sessionId: session.id,
          recordId: std.id,
          recordLabel: `${cal.calibrationId} / ${std.standardId}`,
          description: `Calibration standard ${std.standardId} in ${cal.calibrationId} excluded from exploratory regression.${std.exclusionReason ? ` Reason: ${std.exclusionReason}` : ''}`,
          provenance: std.provenance,
          targetTab: 'calibration',
        });
      } else if (std.qualityStatus === 'flagged') {
        detected.push({
          issueKey: `cal-flagged:${std.id}`,
          category: 'flagged_observation',
          sessionId: session.id,
          recordId: std.id,
          recordLabel: `${cal.calibrationId} / ${std.standardId}`,
          description: `Calibration standard ${std.standardId} in ${cal.calibrationId} is flagged.${std.notes ? ` Note: ${std.notes}` : ''}`,
          provenance: std.provenance,
          targetTab: 'calibration',
        });
      }
    }
  }

  // Dilution consistency conflicts
  const dilutionIssues = evaluateDilutionConsistency(session);
  for (const d of dilutionIssues) {
    detected.push({
      issueKey: `dilution:${d.id}`,
      category: 'conflicting_dilution_metadata',
      sessionId: session.id,
      recordId: d.dilutionRecordId,
      recordLabel: d.sampleId,
      description: d.message,
      provenance: session.provenance,
      targetTab: 'dilutions',
    });
  }

  const persistedByKey = new Map(
    (session.reviewRecords ?? []).map((r) => [r.issueKey, r])
  );

  return detected.map((item) => {
    const persisted = persistedByKey.get(item.issueKey) ?? null;
    const defaultStatus: AnalyticalReviewStatus =
      item.category === 'user_excluded_record'
        ? 'Excluded by Researcher'
        : 'Open';
    return {
      ...item,
      persistedReview: persisted,
      effectiveStatus: persisted?.status ?? defaultStatus,
    };
  });
}

/**
 * Generates exact-ID match suggestions between Analytical samples and Survey measurements
 * across all survey datasets in an experiment. Never silently auto-links.
 */
export function suggestSurveyAnalyticalMatches(
  experiment: Experiment,
  session: AnalyticalSession
): SurveyLinkMatchSuggestion[] {
  const allSurvey = getAllExperimentSurveyMeasurements(experiment);
  const suggestions: SurveyLinkMatchSuggestion[] = [];

  for (const sample of session.sampleMeasurements ?? []) {
    if (sample.stage !== 'Initial' && sample.stage !== 'Final') continue;
    const alreadyLinked = allSurvey.some(
      (e) =>
        e.measurement.linkedInitialMeasurementId === sample.id ||
        e.measurement.linkedFinalMeasurementId === sample.id
    );
    if (alreadyLinked) continue;

    const targetStage: 'Initial' | 'Final' = sample.stage;
    const cleanSample = sample.sampleId.trim().toLowerCase();
    const cleanLinkedLabel = sample.linkedSurveySampleId.trim().toLowerCase();

    const candidates: SurveyLinkMatchSuggestion['candidateMatches'] = [];
    for (const entry of allSurvey) {
      const surveyLabel = entry.measurement.sampleId.trim().toLowerCase();
      if (!surveyLabel) continue;

      if (cleanLinkedLabel && surveyLabel === cleanLinkedLabel) {
        candidates.push({
          surveyDatasetId: entry.datasetId,
          surveyDatasetCode: entry.datasetCode,
          surveyMeasurementId: entry.measurement.id,
          surveySampleId: entry.measurement.sampleId,
          targetStage,
          matchReason: 'linked_label_match',
        });
      } else if (
        cleanSample === surveyLabel ||
        cleanSample.startsWith(`${surveyLabel}-`) ||
        cleanSample.startsWith(`${surveyLabel}_`)
      ) {
        candidates.push({
          surveyDatasetId: entry.datasetId,
          surveyDatasetCode: entry.datasetCode,
          surveyMeasurementId: entry.measurement.id,
          surveySampleId: entry.measurement.sampleId,
          targetStage,
          matchReason: 'exact_sample_id',
        });
      }
    }

    if (candidates.length > 0) {
      suggestions.push({
        instrumentMeasurementId: sample.id,
        instrumentSampleId: sample.sampleId,
        instrumentStage: sample.stage,
        candidateMatches: candidates,
        isAmbiguous: candidates.length > 1,
      });
    }
  }

  return suggestions;
}

/**
 * Evaluates an AnalyticalSession's high-level factual overview and completeness diagnostics.
 * Never produces a single misleading validity score.
 */
export function evaluateAnalyticalSessionOverview(
  experiment: Experiment,
  session: AnalyticalSession
): AnalyticalSessionOverview {
  const samples = session.sampleMeasurements ?? [];
  const cals = session.calibrationDatasets ?? [];
  const calAnalyses = cals
    .map((c) => analyzeCalibrationDataset(c))
    .filter((a): a is CalibrationDatasetAnalysis => a !== null);

  const analyzableCalibrationDatasets = calAnalyses.filter(
    (a) => a.regression.status === 'available'
  ).length;

  const provenanceDistribution: Record<DataProvenance, number> = {
    user_entered: 0,
    literature_reference: 0,
    manufacturer_spec: 0,
    measured_experimental: 0,
    theoretical_estimate: 0,
    derived_calculated: 0,
    synthetic_demo: 0,
    unavailable: 0,
  };

  for (const s of samples) {
    provenanceDistribution[s.provenance] =
      (provenanceDistribution[s.provenance] ?? 0) + 1;
  }

  // Count linked survey rows pointing to measurements in THIS session
  const sessionSampleIds = new Set(samples.map((s) => s.id));
  const allSurvey = getAllExperimentSurveyMeasurements(experiment);
  const allInstruments = getAllExperimentInstrumentMeasurements(experiment);
  const instrumentById = new Map(allInstruments.map((i) => [i.id, i]));

  let linkedSurveyCount = 0;
  let discrepancyLinkCount = 0;

  for (const entry of allSurvey) {
    const m: SurveyMeasurement = entry.measurement;
    const pairs: Array<{ id: string | null; surveyVal: number | null }> = [
      { id: m.linkedInitialMeasurementId, surveyVal: m.initialConcPpm },
      { id: m.linkedFinalMeasurementId, surveyVal: m.finalConcPpm },
    ];
    for (const pair of pairs) {
      if (!pair.id || !sessionSampleIds.has(pair.id)) continue;
      linkedSurveyCount += 1;
      const rec = instrumentById.get(pair.id);
      if (rec && rec.reportedConc !== null && pair.surveyVal !== null) {
        const conv = convertUnit(rec.reportedConc, rec.concUnit || 'ppm', 'ppm');
        if (conv.ok && conv.value !== null) {
          const factor =
            rec.reportedValueBasis === 'already_dilution_corrected'
              ? 1
              : rec.dilutionFactor && rec.dilutionFactor > 0
                ? rec.dilutionFactor
                : 1;
          const eff = conv.value * factor;
          if (Math.abs(pair.surveyVal - eff) > 0.05) {
            discrepancyLinkCount += 1;
          }
        }
      }
    }
  }

  const qualityIssues = detectAnalyticalQualityIssues(experiment, session);
  const dilutionIssues = evaluateDilutionConsistency(session);

  const missingMetadataFields: string[] = [];
  if (!session.instrumentModel.trim()) missingMetadataFields.push('Instrument model');
  if (!session.methodReference.trim()) missingMetadataFields.push('Method reference');
  if (!session.analyst.trim()) missingMetadataFields.push('Analyst');
  if (!session.analysisDate.trim()) missingMetadataFields.push('Analysis date');
  if ((session.analytes ?? []).length === 0) missingMetadataFields.push('Analyte definition');

  const unresolvedLinkCount = qualityIssues.filter(
    (q) => q.category === 'unresolved_survey_association'
  ).length;
  const openQualityIssueCount = qualityIssues.filter(
    (q) => q.effectiveStatus === 'Open' || q.effectiveStatus === 'Under Review'
  ).length;

  const hasResearcherReviewedRecords =
    session.scientificReviewStatus === 'Reviewed' ||
    (session.reviewRecords ?? []).some(
      (r) => r.status === 'Resolved' || r.status === 'Acknowledged'
    );

  return {
    engineVersion: CALC_ENGINE_VERSION,
    sessionId: session.id,
    totalAnalytes: (session.analytes ?? []).length,
    totalCalibrationDatasets: cals.length,
    analyzableCalibrationDatasets,
    totalSampleMeasurements: samples.length,
    validSampleMeasurements: samples.filter((s) => s.qualityStatus === 'valid').length,
    missingValueSamples: samples.filter(
      (s) => s.reportedConc === null && s.rawSignal === null
    ).length,
    flaggedSamples: samples.filter((s) => s.qualityStatus === 'flagged').length,
    excludedSamples: samples.filter((s) => s.qualityStatus === 'excluded_by_user').length,
    instrumentWarningSamples: samples.filter(
      (s) => Boolean(s.instrumentFlag && s.instrumentFlag.trim())
    ).length,
    dilutionRecordCount: (session.dilutionRecords ?? []).length,
    dilutionConflictCount: dilutionIssues.filter((d) => d.severity === 'conflict').length,
    linkedSurveyCount,
    discrepancyLinkCount,
    unresolvedLinkCount,
    openQualityIssueCount,
    provenanceDistribution,
    statusDistinction: {
      hasCompleteMetadata: missingMetadataFields.length === 0,
      missingMetadataFields,
      hasMathematicallyAnalyzableCalibration: analyzableCalibrationDatasets > 0,
      hasResearcherReviewedRecords,
      isIndependentlyValidatedMethod: false,
    },
    containsSynthetic:
      session.isDemonstration ||
      session.provenance === 'synthetic_demo' ||
      samples.some((s) => s.provenance === 'synthetic_demo'),
  };
}

/**
 * Compares multiple AnalyticalSession records descriptively.
 * Explicitly warns when techniques, analytes, units, calibration metadata, methods,
 * or provenance differ; never merges incompatible units or claims method equivalence.
 */
export function buildAnalyticalSessionComparison(
  experiment: Experiment,
  sessions: AnalyticalSession[],
  analyteFilter?: string
): AnalyticalSessionComparisonSummary {
  const warnings: string[] = [];
  const entries: AnalyticalSessionComparisonEntry[] = [];
  const normalizedFilter = (analyteFilter ?? '').trim().toLowerCase();

  for (const session of sessions) {
    const activeAnalyte =
      (normalizedFilter
        ? session.analytes.find(
            (a) =>
              a.symbol.toLowerCase() === normalizedFilter ||
              a.name.toLowerCase() === normalizedFilter
          )
        : null) ??
      session.analytes.find((a) => a.id === session.activeAnalyteId) ??
      session.analytes[0] ??
      null;

    const matchingSamples = (session.sampleMeasurements ?? []).filter((m) => {
      if (!normalizedFilter) {
        if (!activeAnalyte) return true;
        return (
          m.analyteId === activeAnalyte.id ||
          m.analyte.trim().toLowerCase() === activeAnalyte.symbol.toLowerCase() ||
          m.analyte.trim().toLowerCase() === activeAnalyte.name.toLowerCase()
        );
      }
      return (
        m.analyte.trim().toLowerCase() === normalizedFilter ||
        (activeAnalyte && m.analyteId === activeAnalyte.id)
      );
    });

    const included = matchingSamples.filter(
      (m) =>
        m.qualityStatus !== 'excluded_by_user' &&
        m.reportedConc !== null &&
        Number.isFinite(m.reportedConc)
    );

    const concUnit =
      included[0]?.concUnit || activeAnalyte?.measurementUnit || 'ppm';

    const cal =
      session.calibrationDatasets.find(
        (c) =>
          c.id === activeAnalyte?.calibrationDatasetId ||
          c.id === session.activeCalibrationDatasetId
      ) ??
      session.calibrationDatasets[0] ??
      null;
    const calAnalysis = analyzeCalibrationDataset(cal);
    const maxAbsResidual =
      calAnalysis && calAnalysis.diagnosticPoints.length > 0
        ? Math.max(
            ...calAnalysis.diagnosticPoints.map((p) => Math.abs(p.residual))
          )
        : null;

    const issues = detectAnalyticalQualityIssues(experiment, session);
    const openQualityIssues = issues.filter(
      (i) => i.effectiveStatus === 'Open' || i.effectiveStatus === 'Under Review'
    ).length;

    entries.push({
      sessionId: session.id,
      sessionCode: session.sessionId,
      title: session.title,
      technique:
        session.technique === 'Other' && session.customTechniqueName
          ? session.customTechniqueName
          : session.technique,
      instrumentLabel:
        [session.instrumentManufacturer, session.instrumentModel]
          .filter(Boolean)
          .join(' ') || 'Unspecified instrument',
      analyteSymbol: activeAnalyte?.symbol || matchingSamples[0]?.analyte || 'Unspecified',
      wavelengthNm: activeAnalyte?.wavelengthNm ?? null,
      concUnit,
      provenance: session.provenance,
      isDemonstration: session.isDemonstration,
      sampleCount: matchingSamples.length,
      includedSampleCount: included.length,
      flaggedCount: matchingSamples.filter((m) => m.qualityStatus === 'flagged').length,
      excludedCount: matchingSamples.filter((m) => m.qualityStatus === 'excluded_by_user').length,
      missingCount: matchingSamples.filter((m) => m.reportedConc === null).length,
      concentrationStats: computeDescriptiveStatistics(
        included.map((m) => m.reportedConc),
        {
          calculationId: `comp-session-${session.sessionId}`,
          unit: concUnit,
          inputRefs: included.map((m) => m.id),
          containsSynthetic: session.isDemonstration,
        }
      ),
      calibrationR2: calAnalysis?.regression.value.rSquared ?? null,
      calibrationSlope: calAnalysis?.regression.value.slope ?? null,
      calibrationIntercept: calAnalysis?.regression.value.intercept ?? null,
      calibrationResidualMaxAbs: maxAbsResidual,
      openQualityIssues,
      valuesForPlot: included.map((m) => ({
        id: m.id,
        sampleId: m.sampleId,
        stage: m.stage,
        value: m.reportedConc as number,
        unit: m.concUnit || concUnit,
      })),
    });
  }

  const techniques = Array.from(new Set(entries.map((e) => e.technique)));
  if (techniques.length > 1) {
    warnings.push(
      `Analytical techniques differ across compared sessions (${techniques.join(' vs. ')}); differences may reflect instrument sensitivity, matrix interference, or calibration range.`
    );
  }

  const analytes = Array.from(new Set(entries.map((e) => e.analyteSymbol)));
  if (analytes.length > 1) {
    warnings.push(
      `Compared sessions target different analytes (${analytes.join(', ')}); direct concentration overlay is descriptive only.`
    );
  }

  const wavelengths = Array.from(
    new Set(
      entries
        .map((e) => (e.wavelengthNm !== null ? `${e.wavelengthNm} nm` : null))
        .filter((w): w is string => w !== null)
    )
  );
  if (wavelengths.length > 1) {
    warnings.push(
      `Recorded spectral wavelengths differ (${wavelengths.join(' vs. ')}).`
    );
  }

  const provenances = Array.from(new Set(entries.map((e) => e.provenance)));
  if (provenances.length > 1) {
    warnings.push(
      `Data provenance differs across compared sessions (${provenances.join(', ')}).`
    );
  }

  const unitSummary = Array.from(new Set(entries.map((e) => e.concUnit)));
  let hasIncompatibleUnits = false;
  if (unitSummary.length > 1) {
    for (let i = 1; i < unitSummary.length; i++) {
      if (!areUnitsCompatible(unitSummary[0], unitSummary[i])) {
        hasIncompatibleUnits = true;
      }
    }
    if (hasIncompatibleUnits) {
      warnings.push(
        `Incompatible concentration units detected (${unitSummary.join(' vs. ')}); numerical merging is blocked.`
      );
    } else {
      warnings.push(
        `Different concentration unit labels present (${unitSummary.join(' vs. ')}); verify unit scaling before comparing raw magnitudes.`
      );
    }
  }

  return {
    engineVersion: CALC_ENGINE_VERSION,
    entries,
    warnings,
    hasIncompatibleUnits,
    unitSummary,
    containsSynthetic: entries.some((e) => e.isDemonstration),
  };
}

export function createDefaultAnalyticalFigureConfig(
  plotType: AnalyticalFigurePlotType = 'calibration_regression',
  title = 'Calibration Standards — Exploratory Linear Regression',
  id = 'ana-fig-default'
): AnalyticalFigureConfiguration {
  const axisDefaults: Record<
    AnalyticalFigurePlotType,
    { xTitle: string; xUnit: string; yTitle: string; yUnit: string }
  > = {
    calibration_scatter: {
      xTitle: 'Nominal Standard Concentration',
      xUnit: 'ppm',
      yTitle: 'Instrument Response',
      yUnit: 'cps',
    },
    calibration_regression: {
      xTitle: 'Nominal Standard Concentration',
      xUnit: 'ppm',
      yTitle: 'Instrument Response',
      yUnit: 'cps',
    },
    residuals_vs_conc: {
      xTitle: 'Nominal Standard Concentration',
      xUnit: 'ppm',
      yTitle: 'Regression Residual (y − ŷ)',
      yUnit: 'cps',
    },
    residuals_vs_fitted: {
      xTitle: 'Fitted Response (ŷ)',
      xUnit: 'cps',
      yTitle: 'Regression Residual (y − ŷ)',
      yUnit: 'cps',
    },
    replicate_response: {
      xTitle: 'Nominal Concentration Level',
      xUnit: 'ppm',
      yTitle: 'Mean Replicate Response ± SD',
      yUnit: 'cps',
    },
    measurement_distribution: {
      xTitle: 'Reported Concentration Bin',
      xUnit: 'ppm',
      yTitle: 'Sample Count',
      yUnit: 'n',
    },
    concentration_comparison: {
      xTitle: 'Sample Record',
      xUnit: '',
      yTitle: 'Reported Concentration',
      yUnit: 'ppm',
    },
    multi_session_comparison: {
      xTitle: 'Sample Record',
      xUnit: '',
      yTitle: 'Recorded Concentration',
      yUnit: 'ppm',
    },
  };

  const defaults = axisDefaults[plotType];
  return {
    id,
    name: title,
    plotType,
    title,
    xAxisTitle: defaults.xTitle,
    xAxisUnit: defaults.xUnit,
    yAxisTitle: defaults.yTitle,
    yAxisUnit: defaults.yUnit,
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    tickDensity: 'standard',
    numericPrecision: 2,
    markerShape: 'circle',
    markerSize: 6,
    showLines: plotType === 'calibration_regression',
    lineStyle: 'solid',
    primaryColor: '#0F52BA',
    grayscaleMode: false,
    legendPosition: 'top',
    showGridlines: true,
    exportWidthPx: 1200,
    exportHeightPx: 720,
    exportScale: 2,
    savedAt: new Date().toISOString(),
  };
}

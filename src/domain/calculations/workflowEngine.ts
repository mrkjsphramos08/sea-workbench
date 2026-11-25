/**
 * SEA Workbench — Phase 5 Integrated Research Workflow & Data Integrity Engine
 *
 * Pure, deterministic domain services decoupled from React/DOM:
 * - Instrument measurement value qualifier classification (Section 4.1)
 * - Authoritative data-source consistency verification (Section 4.2)
 * - Reproducible analysis provenance hashing & staleness checks (Section 13)
 * - Unified Sample Registry aggregation without duplicating source tables (Section 9)
 * - Unified chronological Research Timeline with deleted-source detection (Section 10)
 * - Consolidated Research Review Center reusing Phase 2-4 diagnostics (Section 11)
 * - Experiment Snapshot creation, comparison, and independent restoration (Section 12)
 * - Wall-clock recovery for multiple independent Research Timers (Section 8.2)
 * - Shared Report Builder presets & Finalized Report revision checks (Sections 14-15)
 */

import {
  APP_VERSION,
  ActiveModule,
  ActivityEventType,
  AnalysisProvenanceMetadata,
  AnalyticalFigureConfiguration,
  AnalyticalReviewHistoryEntry,
  AnalyticalReviewStatus,
  AnalyticalSession,
  CALC_ENGINE_VERSION,
  DataProvenance,
  DilutionRecord,
  EXPERIMENT_DATA_VERSION,
  Experiment,
  ExperimentSnapshot,
  ExperimentSnapshotPayload,
  ExperimentalObservation,
  FigureConfiguration,
  FinalizedReport,
  InstrumentMeasurement,
  MeasurementValueQualifier,
  Precursor,
  ReportConfiguration,
  ReportSectionId,
  ReportType,
  ResearchTimer,
  SampleDocumentationStatus,
  SuppliedLimitType,
  Support,
  SurveyDataset,
  SurveyMeasurement,
  WORKSPACE_SCHEMA_VERSION,
} from '../models/types';
import {
  getActiveAnalyticalSession,
  getActiveCalibrationDataset,
  getActiveSurveyDataset,
  getAllExperimentInstrumentMeasurements,
  getAllExperimentSurveyMeasurements,
  projectExperimentCompatibilityMirrors,
} from '../models/projections';
import { resolveSurveyAnalyticalLinks } from './statistics';
import { evaluateSurveyCompleteness } from './surveyAnalysis';
import {
  detectAnalyticalQualityIssues,
  evaluateDilutionConsistency,
} from './analyticalAnalysis';
import { areUnitsCompatible } from './units';

// ---------------------------------------------------------------------------
// 4.1 Instrument Measurement Value Qualifiers
// ---------------------------------------------------------------------------

export const MEASUREMENT_QUALIFIER_LABELS: Record<
  MeasurementValueQualifier,
  string
> = {
  valid_numeric: 'Valid Numeric',
  valid_zero: 'Valid Zero (0)',
  missing: 'Missing Measurement',
  not_measured: 'Not Measured',
  not_detected: 'Not Detected (ND)',
  below_lod: 'Below Detection Limit (<LOD)',
  below_loq: 'Below Quantification Limit (<LOQ)',
  instrument_invalid: 'Instrument Invalid Result',
  excluded_by_user: 'User-Excluded Observation',
};

export interface ClassifiedMeasurementToken {
  numericValue: number | null;
  qualifier: MeasurementValueQualifier;
  originalToken: string | null;
  suppliedLimitValue: number | null;
  suppliedLimitType: SuppliedLimitType | null;
  invalid: boolean;
}

/**
 * Classifies a raw imported or entered concentration token without ever substituting
 * zero or an estimated censored value (e.g., LOD/2) for below-limit or missing entries.
 */
export function classifyMeasurementToken(
  raw: string | undefined | null
): ClassifiedMeasurementToken {
  if (raw === undefined || raw === null) {
    return {
      numericValue: null,
      qualifier: 'missing',
      originalToken: null,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '—') {
    return {
      numericValue: null,
      qualifier: 'missing',
      originalToken: trimmed || null,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  const lower = trimmed.toLowerCase();

  // Explicit missing tokens
  if (lower === 'na' || lower === 'n/a' || lower === 'null' || lower === 'missing') {
    return {
      numericValue: null,
      qualifier: 'missing',
      originalToken: trimmed,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  // Not measured
  if (lower === 'nm' || lower === 'n.m.' || lower === 'not measured' || lower === 'unmeasured') {
    return {
      numericValue: null,
      qualifier: 'not_measured',
      originalToken: trimmed,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  // Not detected
  if (lower === 'nd' || lower === 'n.d.' || lower === 'not detected' || lower === 'non-detect') {
    return {
      numericValue: null,
      qualifier: 'not_detected',
      originalToken: trimmed,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  // Below LOQ (with optional externally supplied limit e.g. "<LOQ (0.05)" or "<LOQ 0.05")
  if (
    lower === '<loq' ||
    lower === 'blq' ||
    lower === '< loq' ||
    lower.startsWith('<loq') ||
    lower.startsWith('below loq') ||
    lower.startsWith('below quantification')
  ) {
    const numMatch = trimmed.match(/(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    const limitVal = numMatch ? Number(numMatch[1]) : null;
    return {
      numericValue: null,
      qualifier: 'below_loq',
      originalToken: trimmed,
      suppliedLimitValue:
        limitVal !== null && Number.isFinite(limitVal) ? limitVal : null,
      suppliedLimitType: 'LOQ',
      invalid: false,
    };
  }

  // Below LOD / MDL / DL / BDL (with optional externally supplied limit)
  if (
    lower === 'bdl' ||
    lower === '<dl' ||
    lower === '<lod' ||
    lower === '<mdl' ||
    lower === '< dl' ||
    lower === '< lod' ||
    lower === '< mdl' ||
    lower.startsWith('<lod') ||
    lower.startsWith('<mdl') ||
    lower.startsWith('<dl') ||
    lower.startsWith('bdl') ||
    lower.startsWith('below lod') ||
    lower.startsWith('below detection')
  ) {
    const numMatch = trimmed.match(/(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    const limitVal = numMatch ? Number(numMatch[1]) : null;
    const limitType: SuppliedLimitType = lower.includes('mdl') ? 'MDL' : 'LOD';
    return {
      numericValue: null,
      qualifier: 'below_lod',
      originalToken: trimmed,
      suppliedLimitValue:
        limitVal !== null && Number.isFinite(limitVal) ? limitVal : null,
      suppliedLimitType: limitType,
      invalid: false,
    };
  }

  // Censored inequality numeric token such as "<0.02" or "< 0.05"
  const lessThanMatch = trimmed.match(/^<\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i);
  if (lessThanMatch) {
    const limitVal = Number(lessThanMatch[1]);
    return {
      numericValue: null,
      qualifier: 'below_lod',
      originalToken: trimmed,
      suppliedLimitValue: Number.isFinite(limitVal) ? limitVal : null,
      suppliedLimitType: 'LOD',
      invalid: false,
    };
  }

  // Instrument-reported invalid result
  if (
    lower === 'err' ||
    lower === 'error' ||
    lower === 'invalid' ||
    lower === 'ovr' ||
    lower === 'overrange' ||
    lower === 'over' ||
    lower === 'sat' ||
    lower === 'saturated' ||
    lower === '#value!' ||
    lower === '#n/a' ||
    lower === '#div/0!'
  ) {
    return {
      numericValue: null,
      qualifier: 'instrument_invalid',
      originalToken: trimmed,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  // Standard finite number
  const parsed = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(parsed)) {
    return {
      numericValue: parsed,
      qualifier: parsed === 0 ? 'valid_zero' : 'valid_numeric',
      originalToken: trimmed,
      suppliedLimitValue: null,
      suppliedLimitType: null,
      invalid: false,
    };
  }

  return {
    numericValue: null,
    qualifier: 'instrument_invalid',
    originalToken: trimmed,
    suppliedLimitValue: null,
    suppliedLimitType: null,
    invalid: true,
  };
}

/**
 * Resolves the authoritative qualifier for an InstrumentMeasurement, honoring explicit
 * user exclusion, explicit stored qualifier, valid numeric zero, and migrated Phase 4 tokens.
 */
export function resolveEffectiveMeasurementQualifier(
  m: Pick<
    InstrumentMeasurement,
    | 'reportedConc'
    | 'qualityStatus'
    | 'valueQualifier'
    | 'originalValueToken'
    | 'originalReportedConc'
    | 'instrumentFlag'
  >
): MeasurementValueQualifier {
  if (m.qualityStatus === 'excluded_by_user') {
    return 'excluded_by_user';
  }
  if (m.valueQualifier) {
    // Keep zero vs non-zero consistent if user edited numeric value directly
    if (m.reportedConc !== null && Number.isFinite(m.reportedConc)) {
      if (m.valueQualifier === 'instrument_invalid') return 'instrument_invalid';
      return m.reportedConc === 0 ? 'valid_zero' : 'valid_numeric';
    }
    return m.valueQualifier;
  }
  if (m.reportedConc !== null && Number.isFinite(m.reportedConc)) {
    return m.reportedConc === 0 ? 'valid_zero' : 'valid_numeric';
  }
  const token = m.originalValueToken ?? m.originalReportedConc ?? null;
  if (token) {
    const classified = classifyMeasurementToken(token);
    if (!classified.invalid) return classified.qualifier;
  }
  const flagLower = (m.instrumentFlag ?? '').toLowerCase();
  if (flagLower.includes('loq') || flagLower.includes('blq')) return 'below_loq';
  if (flagLower.includes('lod') || flagLower.includes('bdl') || flagLower.includes('mdl')) {
    return 'below_lod';
  }
  if (flagLower.includes('not detected') || flagLower === 'nd') return 'not_detected';
  if (flagLower.includes('invalid') || flagLower.includes('overrange') || flagLower.includes('err')) {
    return 'instrument_invalid';
  }
  return 'missing';
}

export function formatQualifiedMeasurementValue(
  m: InstrumentMeasurement,
  decimals = 3
): string {
  const q = resolveEffectiveMeasurementQualifier(m);
  if (m.reportedConc !== null && Number.isFinite(m.reportedConc)) {
    const numStr = m.reportedConc.toFixed(decimals);
    if (q === 'excluded_by_user') return `${numStr} ${m.concUnit} [Excluded]`;
    if (q === 'valid_zero') return `${numStr} ${m.concUnit} (Valid 0)`;
    if (q === 'instrument_invalid') return `${numStr} ${m.concUnit} [Invalid]`;
    return `${numStr} ${m.concUnit}`;
  }

  const token = m.originalValueToken ?? m.originalReportedConc ?? null;
  const limitInfo =
    m.suppliedLimitValue !== null && m.suppliedLimitValue !== undefined
      ? ` (${m.suppliedLimitType ?? 'Limit'}: ${m.suppliedLimitValue} ${m.suppliedLimitUnit || m.concUnit})`
      : '';

  switch (q) {
    case 'below_lod':
      return `${token || '<LOD'}${limitInfo}`;
    case 'below_loq':
      return `${token || '<LOQ'}${limitInfo}`;
    case 'not_detected':
      return `${token || 'ND'} (Not Detected)${limitInfo}`;
    case 'not_measured':
      return 'Not Measured';
    case 'instrument_invalid':
      return `${token || 'Invalid'} (Instrument Invalid)`;
    case 'excluded_by_user':
      return token ? `${token} [Excluded]` : '— [Excluded]';
    default:
      return '— (Missing)';
  }
}

// ---------------------------------------------------------------------------
// 4.2 Authoritative Data-Source Integrity Verification
// ---------------------------------------------------------------------------

export function verifyAuthoritativeSync(exp: Experiment): {
  synchronized: boolean;
  mismatches: string[];
} {
  const projected = projectExperimentCompatibilityMirrors(exp);
  const mismatches: string[] = [];

  const activeSurvey = getActiveSurveyDataset(exp);
  if (activeSurvey) {
    if (exp.surveyMeasurements.length !== activeSurvey.measurements.length) {
      mismatches.push(
        `Legacy surveyMeasurements length (${exp.surveyMeasurements.length}) differs from active surveyDataset (${activeSurvey.measurements.length}).`
      );
    } else {
      for (let i = 0; i < activeSurvey.measurements.length; i += 1) {
        if (exp.surveyMeasurements[i]?.id !== activeSurvey.measurements[i]?.id) {
          mismatches.push(
            `Legacy surveyMeasurements[${i}] ID differs from active surveyDataset.`
          );
          break;
        }
      }
    }
    if (exp.surveyConfig.mode !== activeSurvey.config.mode) {
      mismatches.push('Legacy surveyConfig.mode differs from active surveyDataset.');
    }
  }

  const activeSession = getActiveAnalyticalSession(exp);
  const activeCal = getActiveCalibrationDataset(activeSession);
  if (activeCal) {
    if (exp.calibrationStandards.length !== activeCal.standards.length) {
      mismatches.push(
        `Legacy calibrationStandards length (${exp.calibrationStandards.length}) differs from active calibrationDataset (${activeCal.standards.length}).`
      );
    }
  }

  if (
    exp.instrumentMeasurements.length !== projected.instrumentMeasurements.length
  ) {
    mismatches.push(
      `Legacy instrumentMeasurements count (${exp.instrumentMeasurements.length}) differs from authoritative multi-session projection (${projected.instrumentMeasurements.length}).`
    );
  }

  if (
    Array.isArray(exp.milestones) &&
    exp.milestones.length > 0 &&
    exp.benchChecklist.length !== projected.benchChecklist.length
  ) {
    mismatches.push(
      `Legacy benchChecklist count (${exp.benchChecklist.length}) differs from active milestones projection (${projected.benchChecklist.length}).`
    );
  }

  return {
    synchronized: mismatches.length === 0,
    mismatches,
  };
}

// ---------------------------------------------------------------------------
// 13. Reproducible Analysis Records & Staleness Detection
// ---------------------------------------------------------------------------

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeSurveyDatasetContentHash(dataset: SurveyDataset): string {
  const canonical = JSON.stringify({
    mode: dataset.mode,
    analysisConfig: dataset.analysisConfig,
    measurements: dataset.measurements.map((m) => ({
      id: m.id,
      g: m.sampleGroupId,
      phi: m.measuredInitialPh,
      phf: m.measuredFinalPh,
      ci: m.initialConcPpm,
      cf: m.finalConcPpm,
      u: m.recordedUptakeUmolM2,
      uu: m.uptakeUnit ?? 'µmol/m²',
      cu: m.concUnit ?? 'ppm',
      q: m.qualityStatus,
      ex: m.exclusionReason ?? '',
    })),
  });
  return `srv-${fnv1aHex(canonical)}`;
}

export function computeAnalyticalSessionContentHash(
  session: AnalyticalSession
): string {
  const canonical = JSON.stringify({
    technique: session.technique,
    activeCalibrationDatasetId: session.activeCalibrationDatasetId,
    cals: session.calibrationDatasets.map((c) => ({
      id: c.id,
      cu: c.concUnit,
      ru: c.responseUnit,
      stds: c.standards.map((s) => ({
        id: s.id,
        c: s.nominalConc,
        r: s.instrumentResponse,
        q: s.qualityStatus,
        ex: s.exclusionReason ?? '',
      })),
    })),
    samples: session.sampleMeasurements.map((m) => ({
      id: m.id,
      an: m.analyte,
      st: m.stage,
      rc: m.reportedConc,
      cu: m.concUnit,
      vq: resolveEffectiveMeasurementQualifier(m),
      df: m.dilutionFactor,
      vb: m.reportedValueBasis ?? 'unspecified',
      q: m.qualityStatus,
      ex: m.exclusionReason ?? '',
    })),
  });
  return `ana-${fnv1aHex(canonical)}`;
}

export function buildSurveyAnalysisProvenance(
  exp: Experiment,
  dataset: SurveyDataset
): AnalysisProvenanceMetadata {
  const included = dataset.measurements.filter((m) => {
    if (m.qualityStatus === 'excluded_by_user') return false;
    if (dataset.analysisConfig.excludeFlaggedInStats && m.qualityStatus === 'flagged') {
      return false;
    }
    return true;
  });
  return {
    sourceExperimentUuid: exp.uuid,
    sourceCollectionId: dataset.id,
    sourceCollectionLabel: `${dataset.datasetId} — ${dataset.title}`,
    includedMeasurementIds: included.map((m) => m.id),
    sourceContentHash: computeSurveyDatasetContentHash(dataset),
    exclusionSettingsSummary: dataset.analysisConfig.excludeFlaggedInStats
      ? 'Excluded user-excluded & flagged rows'
      : 'Excluded user-excluded rows only (flagged included)',
    unitSummary: `pH / ${dataset.measurements[0]?.uptakeUnit ?? 'µmol/m²'} / ${dataset.measurements[0]?.concUnit ?? 'ppm'}`,
    calcEngineVersion: CALC_ENGINE_VERSION,
    capturedAt: new Date().toISOString(),
    provenance: dataset.provenance,
    scientificReviewStatus: dataset.scientificReviewStatus,
  };
}

export function buildAnalyticalAnalysisProvenance(
  exp: Experiment,
  session: AnalyticalSession
): AnalysisProvenanceMetadata {
  const activeCal = getActiveCalibrationDataset(session);
  const includedIds = [
    ...(activeCal?.standards
      .filter((s) => s.qualityStatus !== 'excluded_by_user')
      .map((s) => s.id) ?? []),
    ...session.sampleMeasurements
      .filter((m) => m.qualityStatus !== 'excluded_by_user')
      .map((m) => m.id),
  ];
  return {
    sourceExperimentUuid: exp.uuid,
    sourceCollectionId: session.id,
    sourceCollectionLabel: `${session.sessionId} — ${session.title}`,
    includedMeasurementIds: includedIds,
    sourceContentHash: computeAnalyticalSessionContentHash(session),
    exclusionSettingsSummary:
      'Excluded user-excluded standards/samples; below-limit tokens preserved as null',
    unitSummary: activeCal
      ? `${activeCal.concUnit} / ${activeCal.responseUnit}`
      : session.analytes[0]?.measurementUnit ?? 'ppm',
    calcEngineVersion: CALC_ENGINE_VERSION,
    capturedAt: new Date().toISOString(),
    provenance: session.provenance,
    scientificReviewStatus: session.scientificReviewStatus,
  };
}

export type FigureReproducibilityStatus =
  | 'saved_current'
  | 'requires_regeneration'
  | 'source_unavailable'
  | 'legacy_untracked';

export interface FigureReproducibilityCheck {
  status: FigureReproducibilityStatus;
  label: string;
  message: string;
  capturedHash: string | null;
  currentHash: string | null;
}

export function evaluateFigureReproducibility(
  exp: Experiment,
  kind: 'survey' | 'analytical',
  figure: FigureConfiguration | AnalyticalFigureConfiguration,
  parentCollectionId?: string | null
): FigureReproducibilityCheck {
  const prov = figure.analysisProvenance;
  const targetId = prov?.sourceCollectionId ?? parentCollectionId ?? null;

  if (!prov) {
    return {
      status: 'legacy_untracked',
      label: 'Historical (Untracked Hash)',
      message:
        'Saved before Phase 5 provenance hashing. Re-save to record exact source measurement IDs and content hash.',
      capturedHash: null,
      currentHash: null,
    };
  }

  if (kind === 'survey') {
    const ds = (exp.surveyDatasets ?? []).find((d) => d.id === targetId);
    if (!ds) {
      return {
        status: 'source_unavailable',
        label: 'Source Unavailable',
        message: `Source survey dataset (${prov.sourceCollectionLabel}) is no longer present in this experiment.`,
        capturedHash: prov.sourceContentHash,
        currentHash: null,
      };
    }
    const currentHash = computeSurveyDatasetContentHash(ds);
    if (currentHash !== prov.sourceContentHash) {
      return {
        status: 'requires_regeneration',
        label: 'Requires Regeneration',
        message:
          'Source survey measurements or exclusion settings changed after this saved figure was captured.',
        capturedHash: prov.sourceContentHash,
        currentHash,
      };
    }
    return {
      status: 'saved_current',
      label: 'Matches Current Data',
      message: `Matches current ${ds.datasetId} source records (${prov.includedMeasurementIds.length} measurements).`,
      capturedHash: prov.sourceContentHash,
      currentHash,
    };
  } else {
    const sess = (exp.analyticalSessions ?? []).find((s) => s.id === targetId);
    if (!sess) {
      return {
        status: 'source_unavailable',
        label: 'Source Unavailable',
        message: `Source analytical session (${prov.sourceCollectionLabel}) is no longer present in this experiment.`,
        capturedHash: prov.sourceContentHash,
        currentHash: null,
      };
    }
    const currentHash = computeAnalyticalSessionContentHash(sess);
    if (currentHash !== prov.sourceContentHash) {
      return {
        status: 'requires_regeneration',
        label: 'Requires Regeneration',
        message:
          'Source calibration standards, sample measurements, or dilutions changed after this figure was saved.',
        capturedHash: prov.sourceContentHash,
        currentHash,
      };
    }
    return {
      status: 'saved_current',
      label: 'Matches Current Data',
      message: `Matches current ${sess.sessionId} analytical records (${prov.includedMeasurementIds.length} records).`,
      capturedHash: prov.sourceContentHash,
      currentHash,
    };
  }
}

// ---------------------------------------------------------------------------
// 9. Unified Sample Registry (Zero Source Duplication)
// ---------------------------------------------------------------------------

export interface UnifiedSampleRegistryEntry {
  /** Stable internal key (SurveyMeasurement.id, InstrumentMeasurement.id, or planned:<id>) */
  sampleKey: string;
  sampleId: string;
  experimentUuid: string;
  origin: 'survey' | 'analytical_unlinked' | 'planned_only';
  surveyDatasetId: string | null;
  surveyDatasetCode: string | null;
  surveyDatasetTitle: string | null;
  surveyMeasurement: SurveyMeasurement | null;
  replicateGroupId: string;
  classification: string;
  analyticalLinks: Array<{
    stage: 'Initial' | 'Final' | 'Standalone';
    sessionId: string;
    sessionCode: string;
    measurement: InstrumentMeasurement;
    qualifier: MeasurementValueQualifier;
    hasDiscrepancy: boolean;
    effectiveConcPpm: number | null;
  }>;
  unavailableLinkedIds: Array<{ stage: 'Initial' | 'Final'; missingId: string }>;
  analytes: string[];
  dilutions: DilutionRecord[];
  qualityFlags: string[];
  observations: ExperimentalObservation[];
  relatedFigures: Array<{ kind: 'survey' | 'analytical'; id: string; name: string }>;
  documentationStatus: SampleDocumentationStatus;
  provenance: DataProvenance;
  notes: string;
}

export interface DuplicateSampleLabelWarning {
  normalizedLabel: string;
  sampleKeys: string[];
  sampleIds: string[];
  message: string;
}

export function buildUnifiedSampleRegistry(exp: Experiment): {
  entries: UnifiedSampleRegistryEntry[];
  duplicateLabelWarnings: DuplicateSampleLabelWarning[];
} {
  const allSurvey = getAllExperimentSurveyMeasurements(exp);
  const allInst = getAllExperimentInstrumentMeasurements(exp);
  const sessionByMeasurementId = new Map<string, AnalyticalSession>();
  const dilutionsByMeasurementId = new Map<string, DilutionRecord[]>();

  for (const sess of exp.analyticalSessions ?? []) {
    for (const m of sess.sampleMeasurements ?? []) {
      sessionByMeasurementId.set(m.id, sess);
    }
    for (const d of sess.dilutionRecords ?? []) {
      if (d.sampleMeasurementId) {
        const list = dilutionsByMeasurementId.get(d.sampleMeasurementId) ?? [];
        list.push(d);
        dilutionsByMeasurementId.set(d.sampleMeasurementId, list);
      }
    }
  }

  const linkMap = resolveSurveyAnalyticalLinks(
    allSurvey.map((s) => s.measurement),
    allInst
  );
  const noteMap = new Map(
    (exp.sampleRegistryNotes ?? []).map((n) => [n.sampleKey, n])
  );

  const claimedInstrumentIds = new Set<string>();
  const entries: UnifiedSampleRegistryEntry[] = [];

  // 1. Survey-anchored samples (stable key = SurveyMeasurement.id)
  for (const item of allSurvey) {
    const m = item.measurement;
    const link = linkMap[m.id];
    const analyticalLinks: UnifiedSampleRegistryEntry['analyticalLinks'] = [];
    const unavailableLinkedIds: UnifiedSampleRegistryEntry['unavailableLinkedIds'] =
      [];
    const dilutions: DilutionRecord[] = [];
    const analytes = new Set<string>();
    const qualityFlags: string[] = [];

    if (m.qualityStatus === 'flagged') qualityFlags.push('Survey measurement flagged');
    if (m.qualityStatus === 'excluded_by_user') {
      qualityFlags.push(
        `Excluded by researcher${m.exclusionReason ? `: ${m.exclusionReason}` : ''}`
      );
    }

    const stages: Array<{
      stage: 'Initial' | 'Final';
      linkedId: string | null;
      status: typeof link.initial;
    }> = [
      { stage: 'Initial', linkedId: m.linkedInitialMeasurementId, status: link?.initial },
      { stage: 'Final', linkedId: m.linkedFinalMeasurementId, status: link?.final },
    ];

    for (const st of stages) {
      if (!st.linkedId) continue;
      const inst = allInst.find((x) => x.id === st.linkedId) ?? null;
      if (!inst) {
        unavailableLinkedIds.push({ stage: st.stage, missingId: st.linkedId });
        qualityFlags.push(`Linked ${st.stage} analytical source unavailable (${st.linkedId})`);
        continue;
      }
      claimedInstrumentIds.add(inst.id);
      const sess = sessionByMeasurementId.get(inst.id);
      const qual = resolveEffectiveMeasurementQualifier(inst);
      if (inst.analyte) analytes.add(inst.analyte);
      if (qual !== 'valid_numeric' && qual !== 'valid_zero') {
        qualityFlags.push(`${st.stage} analytical qualifier: ${MEASUREMENT_QUALIFIER_LABELS[qual]}`);
      }
      if (inst.instrumentFlag) {
        qualityFlags.push(`${st.stage} instrument flag: ${inst.instrumentFlag}`);
      }
      if (st.status?.hasDiscrepancy) {
        qualityFlags.push(`${st.stage} survey-to-analytical concentration discrepancy`);
      }
      analyticalLinks.push({
        stage: st.stage,
        sessionId: sess?.id ?? inst.sessionId ?? '',
        sessionCode: sess?.sessionId ?? 'ANA',
        measurement: inst,
        qualifier: qual,
        hasDiscrepancy: Boolean(st.status?.hasDiscrepancy),
        effectiveConcPpm: st.status?.linkedEffectiveConcPpm ?? null,
      });
      dilutions.push(...(dilutionsByMeasurementId.get(inst.id) ?? []));
    }

    const relatedObs = (exp.observations ?? []).filter((o) =>
      (o.references ?? []).some(
        (r) =>
          r.kind === 'sample_measurement' &&
          (r.id === m.id || analyticalLinks.some((a) => a.measurement.id === r.id))
      )
    );

    const ds = (exp.surveyDatasets ?? []).find((d) => d.id === item.datasetId);
    const relatedFigures: UnifiedSampleRegistryEntry['relatedFigures'] = [];
    for (const f of ds?.savedFigures ?? []) {
      relatedFigures.push({ kind: 'survey', id: f.id, name: f.name });
    }
    for (const aLink of analyticalLinks) {
      const sess = (exp.analyticalSessions ?? []).find(
        (s) => s.id === aLink.sessionId
      );
      for (const af of sess?.savedFigures ?? []) {
        if (!relatedFigures.some((rf) => rf.id === af.id)) {
          relatedFigures.push({ kind: 'analytical', id: af.id, name: af.name });
        }
      }
    }

    let documentationStatus: SampleDocumentationStatus = 'Recorded';
    if (m.qualityStatus === 'excluded_by_user') {
      documentationStatus = 'Excluded';
    } else if (qualityFlags.length > 0) {
      documentationStatus = 'Flagged / Review Needed';
    } else if (analyticalLinks.length > 0) {
      documentationStatus = 'Analytically Linked';
    }

    const customMeta = noteMap.get(m.id);

    entries.push({
      sampleKey: m.id,
      sampleId: m.sampleId || '(Unnamed Sample)',
      experimentUuid: exp.uuid,
      origin: 'survey',
      surveyDatasetId: item.datasetId,
      surveyDatasetCode: item.datasetCode,
      surveyDatasetTitle: item.datasetTitle,
      surveyMeasurement: m,
      replicateGroupId: m.sampleGroupId || '',
      classification:
        customMeta?.classification ||
        (ds?.mode === 'pzc' ? 'PZC / pH-Shift Sample' : 'SEA Uptake Sample'),
      analyticalLinks,
      unavailableLinkedIds,
      analytes: Array.from(analytes),
      dilutions,
      qualityFlags,
      observations: relatedObs,
      relatedFigures,
      documentationStatus,
      provenance: m.provenance,
      notes: customMeta?.notes || m.notes || '',
    });
  }

  // 2. Standalone / unlinked analytical sample measurements (never merged silently by label!)
  for (const inst of allInst) {
    if (claimedInstrumentIds.has(inst.id)) continue;
    const sess = sessionByMeasurementId.get(inst.id);
    const qual = resolveEffectiveMeasurementQualifier(inst);
    const qualityFlags: string[] = [];
    if (inst.qualityStatus === 'flagged') qualityFlags.push('Analytical record flagged');
    if (inst.qualityStatus === 'excluded_by_user') {
      qualityFlags.push(
        `Excluded by researcher${inst.exclusionReason ? `: ${inst.exclusionReason}` : ''}`
      );
    }
    if (qual !== 'valid_numeric' && qual !== 'valid_zero') {
      qualityFlags.push(`Qualifier: ${MEASUREMENT_QUALIFIER_LABELS[qual]}`);
    }
    if (inst.instrumentFlag) {
      qualityFlags.push(`Instrument flag: ${inst.instrumentFlag}`);
    }
    if (inst.linkedSurveySampleId && !inst.linkedSurveyMeasurementId) {
      qualityFlags.push(
        `Unresolved survey label reference "${inst.linkedSurveySampleId}"`
      );
    }

    const relatedObs = (exp.observations ?? []).filter((o) =>
      (o.references ?? []).some(
        (r) => r.kind === 'sample_measurement' && r.id === inst.id
      )
    );
    const relatedFigures: UnifiedSampleRegistryEntry['relatedFigures'] = (
      sess?.savedFigures ?? []
    ).map((f) => ({ kind: 'analytical', id: f.id, name: f.name }));

    const customMeta = noteMap.get(inst.id);
    const documentationStatus: SampleDocumentationStatus =
      inst.qualityStatus === 'excluded_by_user'
        ? 'Excluded'
        : qualityFlags.length > 0
          ? 'Flagged / Review Needed'
          : 'Recorded';

    entries.push({
      sampleKey: inst.id,
      sampleId: inst.sampleId || '(Unnamed Analytical Sample)',
      experimentUuid: exp.uuid,
      origin: 'analytical_unlinked',
      surveyDatasetId: null,
      surveyDatasetCode: null,
      surveyDatasetTitle: null,
      surveyMeasurement: null,
      replicateGroupId: inst.replicateId || '',
      classification:
        customMeta?.classification || `${inst.stage} (${sess?.technique ?? 'Analytical'})`,
      analyticalLinks: [
        {
          stage: 'Standalone',
          sessionId: sess?.id ?? inst.sessionId ?? '',
          sessionCode: sess?.sessionId ?? 'ANA',
          measurement: inst,
          qualifier: qual,
          hasDiscrepancy: false,
          effectiveConcPpm: inst.reportedConc,
        },
      ],
      unavailableLinkedIds: [],
      analytes: inst.analyte ? [inst.analyte] : [],
      dilutions: dilutionsByMeasurementId.get(inst.id) ?? [],
      qualityFlags,
      observations: relatedObs,
      relatedFigures,
      documentationStatus,
      provenance: inst.provenance,
      notes: customMeta?.notes || inst.notes || '',
    });
  }

  // 3. Planned-only sample IDs from Research Plan not yet recorded
  const recordedNormalized = new Set(
    entries.map((e) => e.sampleId.trim().toLowerCase())
  );
  for (const planned of exp.researchPlan?.plannedSampleIds ?? []) {
    const clean = planned.trim();
    if (!clean) continue;
    if (recordedNormalized.has(clean.toLowerCase())) continue;
    const key = `planned:${clean}`;
    const customMeta = noteMap.get(key);
    entries.push({
      sampleKey: key,
      sampleId: clean,
      experimentUuid: exp.uuid,
      origin: 'planned_only',
      surveyDatasetId: null,
      surveyDatasetCode: null,
      surveyDatasetTitle: null,
      surveyMeasurement: null,
      replicateGroupId: '',
      classification: customMeta?.classification || 'Planned Sample',
      analyticalLinks: [],
      unavailableLinkedIds: [],
      analytes: [],
      dilutions: [],
      qualityFlags: [],
      observations: [],
      relatedFigures: [],
      documentationStatus: 'Planned',
      provenance: 'user_entered',
      notes: customMeta?.notes || 'Defined in research plan; no measurements recorded yet.',
    });
  }

  // Detect duplicate human-readable sample labels across distinct stable entries without merging
  const byLabel = new Map<string, UnifiedSampleRegistryEntry[]>();
  for (const entry of entries) {
    const norm = entry.sampleId.trim().toLowerCase();
    if (!norm || norm.startsWith('(unnamed')) continue;
    const list = byLabel.get(norm) ?? [];
    list.push(entry);
    byLabel.set(norm, list);
  }
  const duplicateLabelWarnings: DuplicateSampleLabelWarning[] = [];
  for (const [norm, group] of byLabel.entries()) {
    if (group.length > 1) {
      duplicateLabelWarnings.push({
        normalizedLabel: norm,
        sampleKeys: group.map((g) => g.sampleKey),
        sampleIds: group.map((g) => g.sampleId),
        message: `Sample label "${group[0].sampleId}" appears in ${group.length} separate records. Entries are kept distinct by stable internal ID (never silently merged).`,
      });
    }
  }

  return { entries, duplicateLabelWarnings };
}

// ---------------------------------------------------------------------------
// 10. Integrated Chronological Research Timeline
// ---------------------------------------------------------------------------

export interface ResolvedTimelineEvent {
  id: string;
  eventType: ActivityEventType;
  module: ActiveModule;
  timestamp: string;
  experimentUuid: string;
  sourceKind: string;
  sourceId: string | null;
  sourceLabel: string;
  sourceAvailable: boolean;
  author: string;
  description: string;
}

function checkSourceAvailability(
  exp: Experiment,
  sourceKind: string | undefined,
  sourceId: string | null | undefined
): boolean {
  if (!sourceKind || !sourceId) return true;
  switch (sourceKind) {
    case 'experiment':
      return sourceId === exp.uuid;
    case 'survey_dataset':
      return (exp.surveyDatasets ?? []).some((d) => d.id === sourceId);
    case 'analytical_session':
      return (exp.analyticalSessions ?? []).some((s) => s.id === sourceId);
    case 'observation':
      return (exp.observations ?? []).some((o) => o.id === sourceId);
    case 'milestone':
      return (
        (exp.milestones ?? []).some((m) => m.id === sourceId) ||
        (exp.benchChecklist ?? []).some((c) => c.id === sourceId)
      );
    case 'timer':
      return (exp.timers ?? []).some((t) => t.id === sourceId);
    case 'snapshot':
      return (exp.snapshots ?? []).some((s) => s.snapshotId === sourceId);
    case 'finalized_report':
      return (exp.finalizedReports ?? []).some((r) => r.id === sourceId);
    case 'survey_figure':
      return (exp.surveyDatasets ?? []).some((d) =>
        d.savedFigures.some((f) => f.id === sourceId)
      );
    case 'analytical_figure':
      return (exp.analyticalSessions ?? []).some((s) =>
        s.savedFigures.some((f) => f.id === sourceId)
      );
    case 'annotation':
      return (exp.surveyDatasets ?? []).some((d) =>
        d.annotations.some((a) => a.id === sourceId)
      );
    case 'sample_measurement':
      return (
        getAllExperimentSurveyMeasurements(exp).some(
          (s) => s.measurement.id === sourceId
        ) ||
        getAllExperimentInstrumentMeasurements(exp).some((m) => m.id === sourceId)
      );
    default:
      return true;
  }
}

export function buildExperimentTimeline(exp: Experiment): ResolvedTimelineEvent[] {
  const events: ResolvedTimelineEvent[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (ev: ResolvedTimelineEvent) => {
    if (seenIds.has(ev.id)) return;
    seenIds.add(ev.id);
    events.push(ev);
  };

  // 1. Explicit stored activity events (survive deletion of their source records!)
  for (const ev of exp.activityEvents ?? []) {
    pushUnique({
      id: ev.id,
      eventType: ev.eventType,
      module: ev.module,
      timestamp: ev.timestamp,
      experimentUuid: exp.uuid,
      sourceKind: ev.sourceKind ?? 'experiment',
      sourceId: ev.sourceId ?? null,
      sourceLabel: ev.sourceLabel ?? exp.experimentId,
      sourceAvailable: checkSourceAvailability(exp, ev.sourceKind, ev.sourceId),
      author: ev.author || exp.researcher || 'Researcher',
      description: ev.description,
    });
  }

  // 2. Experiment creation
  pushUnique({
    id: `derived-created-${exp.uuid}`,
    eventType: 'experiment_created',
    module: 'overview',
    timestamp: exp.createdAt,
    experimentUuid: exp.uuid,
    sourceKind: 'experiment',
    sourceId: exp.uuid,
    sourceLabel: exp.experimentId,
    sourceAvailable: true,
    author: exp.researcher || 'Researcher',
    description: `Experiment record ${exp.experimentId} ("${exp.title}") initialized.`,
  });

  // 3. Lifecycle transitions
  for (const lc of exp.lifecycleHistory ?? []) {
    pushUnique({
      id: `lc-${lc.id}`,
      eventType:
        lc.toStatus === 'Archived' ? 'experiment_archived' : 'lifecycle_transition',
      module: 'overview',
      timestamp: lc.timestamp,
      experimentUuid: exp.uuid,
      sourceKind: lc.snapshotId ? 'snapshot' : 'experiment',
      sourceId: lc.snapshotId ?? exp.uuid,
      sourceLabel: `${lc.fromStatus ?? 'Initial'} → ${lc.toStatus}`,
      sourceAvailable: lc.snapshotId
        ? checkSourceAvailability(exp, 'snapshot', lc.snapshotId)
        : true,
      author: lc.researcher || exp.researcher || 'Researcher',
      description: `Lifecycle status changed from ${lc.fromStatus ?? 'Initial'} to ${lc.toStatus}.${
        lc.explanation ? ` Note: ${lc.explanation}` : ''
      }`,
    });
  }

  // 4. Milestones completed
  for (const ms of exp.milestones ?? []) {
    if (ms.actualCompletedAt) {
      pushUnique({
        id: `ms-comp-${ms.id}-${ms.actualCompletedAt}`,
        eventType: 'milestone_updated',
        module: 'bench-runner',
        timestamp: ms.actualCompletedAt,
        experimentUuid: exp.uuid,
        sourceKind: 'milestone',
        sourceId: ms.id,
        sourceLabel: ms.title,
        sourceAvailable: true,
        author: exp.researcher || 'Researcher',
        description: `Milestone completed: "${ms.title}".`,
      });
    }
  }

  // 5. Named timer history & bench logs
  for (const timer of exp.timers ?? []) {
    for (let i = 0; i < timer.history.length; i += 1) {
      const h = timer.history[i];
      pushUnique({
        id: `tmr-${timer.id}-${i}-${h.timestamp}`,
        eventType: 'timer_event',
        module: 'bench-runner',
        timestamp: h.timestamp,
        experimentUuid: exp.uuid,
        sourceKind: 'timer',
        sourceId: timer.id,
        sourceLabel: timer.name,
        sourceAvailable: true,
        author: exp.researcher || 'Researcher',
        description: `Timer "${timer.name}" (${h.action}): ${h.detail}`,
      });
    }
  }
  for (const log of exp.benchLogs ?? []) {
    pushUnique({
      id: `blog-${log.id}`,
      eventType:
        log.eventType === 'timer'
          ? 'timer_event'
          : log.eventType === 'checklist'
            ? 'milestone_updated'
            : 'observation_logged',
      module: 'bench-runner',
      timestamp: log.timestamp,
      experimentUuid: exp.uuid,
      sourceKind: 'experiment',
      sourceId: exp.uuid,
      sourceLabel: 'Bench Runner',
      sourceAvailable: true,
      author: exp.researcher || 'Researcher',
      description: log.message,
    });
  }

  // 6. Recorded observations
  for (const obs of exp.observations ?? []) {
    pushUnique({
      id: `obs-${obs.id}`,
      eventType: 'observation_logged',
      module: obs.module,
      timestamp: obs.timestamp,
      experimentUuid: exp.uuid,
      sourceKind: 'observation',
      sourceId: obs.id,
      sourceLabel: obs.category,
      sourceAvailable: true,
      author: obs.author || exp.researcher || 'Researcher',
      description: `[${obs.category}] ${obs.text}`,
    });
  }

  // 7. Survey datasets, saved figures, and research interpretations
  for (const ds of exp.surveyDatasets ?? []) {
    pushUnique({
      id: `ds-created-${ds.id}`,
      eventType: 'survey_dataset_event',
      module: 'uptake-survey',
      timestamp: ds.createdAt,
      experimentUuid: exp.uuid,
      sourceKind: 'survey_dataset',
      sourceId: ds.id,
      sourceLabel: `${ds.datasetId} — ${ds.title}`,
      sourceAvailable: true,
      author: ds.researcher || exp.researcher || 'Researcher',
      description: `Survey dataset ${ds.datasetId} ("${ds.title}", ${ds.mode.toUpperCase()}) recorded with ${ds.measurements.length} measurement(s).`,
    });
    for (const fig of ds.savedFigures ?? []) {
      pushUnique({
        id: `sfig-${fig.id}`,
        eventType: 'figure_saved',
        module: 'uptake-survey',
        timestamp: fig.savedAt,
        experimentUuid: exp.uuid,
        sourceKind: 'survey_figure',
        sourceId: fig.id,
        sourceLabel: fig.name,
        sourceAvailable: true,
        author: ds.researcher || exp.researcher || 'Researcher',
        description: `Saved survey figure "${fig.name}" from ${ds.datasetId}.`,
      });
    }
    for (const ann of ds.annotations ?? []) {
      pushUnique({
        id: `ann-${ann.id}`,
        eventType: 'interpretation_logged',
        module: 'uptake-survey',
        timestamp: ann.createdAt,
        experimentUuid: exp.uuid,
        sourceKind: 'annotation',
        sourceId: ann.id,
        sourceLabel: ann.title,
        sourceAvailable: true,
        author: ann.author || exp.researcher || 'Researcher',
        description: `Research interpretation (${ann.category.replace(/_/g, ' ')}): "${ann.title}".`,
      });
    }
  }

  // 8. Analytical sessions, imports, review decisions, and saved figures
  for (const sess of exp.analyticalSessions ?? []) {
    for (const imp of sess.importHistory ?? []) {
      pushUnique({
        id: `imp-${imp.id}`,
        eventType: 'instrument_import',
        module: 'analytical',
        timestamp: imp.importedAt,
        experimentUuid: exp.uuid,
        sourceKind: 'analytical_session',
        sourceId: sess.id,
        sourceLabel: `${sess.sessionId} · ${imp.filename}`,
        sourceAvailable: true,
        author: sess.analyst || exp.researcher || 'Analyst',
        description: `Imported ${imp.acceptedCount} accepted row(s) from "${imp.filename}" (${imp.format.toUpperCase()}) into ${sess.sessionId}.`,
      });
    }
    for (const rev of sess.reviewRecords ?? []) {
      for (let i = 0; i < rev.history.length; i += 1) {
        const h = rev.history[i];
        pushUnique({
          id: `rev-${rev.id}-${i}-${h.timestamp}`,
          eventType: 'quality_review_decision',
          module: 'analytical',
          timestamp: h.timestamp,
          experimentUuid: exp.uuid,
          sourceKind: 'analytical_session',
          sourceId: sess.id,
          sourceLabel: `${sess.sessionId} · ${rev.recordLabel}`,
          sourceAvailable: true,
          author: h.author || sess.analyst || 'Reviewer',
          description: `Quality review status set to "${h.status}" for ${rev.recordLabel}.${
            h.note ? ` ${h.note}` : ''
          }`,
        });
      }
    }
    for (const fig of sess.savedFigures ?? []) {
      pushUnique({
        id: `afig-${fig.id}`,
        eventType: 'figure_saved',
        module: 'analytical',
        timestamp: fig.savedAt,
        experimentUuid: exp.uuid,
        sourceKind: 'analytical_figure',
        sourceId: fig.id,
        sourceLabel: fig.name,
        sourceAvailable: true,
        author: sess.analyst || exp.researcher || 'Analyst',
        description: `Saved analytical figure "${fig.name}" from ${sess.sessionId}.`,
      });
    }
  }

  // 9. Snapshots & Finalized Reports
  for (const snap of exp.snapshots ?? []) {
    pushUnique({
      id: `snap-${snap.snapshotId}`,
      eventType: 'snapshot_created',
      module: 'overview',
      timestamp: snap.capturedAt,
      experimentUuid: exp.uuid,
      sourceKind: 'snapshot',
      sourceId: snap.snapshotId,
      sourceLabel: snap.name,
      sourceAvailable: true,
      author: snap.researcher || exp.researcher || 'Researcher',
      description: `Immutable experiment snapshot captured: "${snap.name}" (${snap.snapshotId}).`,
    });
  }
  for (const rep of exp.finalizedReports ?? []) {
    pushUnique({
      id: `frep-${rep.id}`,
      eventType: 'report_finalized',
      module: 'lab-report',
      timestamp: rep.finalizedAt,
      experimentUuid: exp.uuid,
      sourceKind: 'finalized_report',
      sourceId: rep.id,
      sourceLabel: `v${rep.versionNumber} — ${rep.title}`,
      sourceAvailable: true,
      author: rep.researcher || exp.researcher || 'Researcher',
      description: `Finalized report v${rep.versionNumber} ("${rep.title}") bound to snapshot "${rep.snapshotName}".`,
    });
  }

  // Sort strictly descending by ISO timestamp (deterministic tie-break by id)
  return events.sort((a, b) => {
    const cmp = b.timestamp.localeCompare(a.timestamp);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// 11. Consolidated Research Review Center (Zero Duplicates, Authoritative Sync)
// ---------------------------------------------------------------------------

export type ConsolidatedReviewGroup =
  | 'experiment_metadata'
  | 'material_references'
  | 'survey_records'
  | 'analytical_records'
  | 'measurement_associations'
  | 'missing_observations'
  | 'incompatible_units'
  | 'conflicting_values'
  | 'analytical_discrepancies'
  | 'figure_source_availability'
  | 'report_completeness';

export const CONSOLIDATED_REVIEW_GROUP_LABELS: Record<
  ConsolidatedReviewGroup,
  string
> = {
  experiment_metadata: 'Experiment Metadata',
  material_references: 'Material References',
  survey_records: 'Survey Records',
  analytical_records: 'Analytical Records',
  measurement_associations: 'Measurement Associations',
  missing_observations: 'Missing Observations',
  incompatible_units: 'Incompatible Units',
  conflicting_values: 'Conflicting Recorded Values',
  analytical_discrepancies: 'Unresolved Analytical Discrepancies',
  figure_source_availability: 'Figure Source Availability',
  report_completeness: 'Report Documentation Completeness',
};

export interface ConsolidatedReviewItem {
  /** Canonical deduplication key */
  issueKey: string;
  group: ConsolidatedReviewGroup;
  description: string;
  recordId: string;
  recordLabel: string;
  status: AnalyticalReviewStatus;
  sourceWorkspace: ActiveModule;
  /** Navigation metadata for one-click deep linking */
  navContext: {
    module: ActiveModule;
    surveyDatasetId?: string;
    surveyTab?: 'overview' | 'data' | 'analysis' | 'figures' | 'interpretation';
    analyticalSessionId?: string;
    analyticalTab?: 'overview' | 'calibration' | 'samples' | 'dilutions' | 'quality' | 'figures';
    overviewTab?: 'summary' | 'samples' | 'timeline' | 'review' | 'snapshots';
    highlightRecordId?: string;
  };
  /** When backed by an AnalyticalSession review record, allows direct authoritative status update */
  analyticalReviewRef?: {
    sessionId: string;
    issueKey: string;
    category: import('../models/types').AnalyticalQualityIssueCategory;
    recordId: string;
    recordLabel: string;
    provenance: DataProvenance;
  };
  researcherNotes: string;
  history: AnalyticalReviewHistoryEntry[];
}

export function buildConsolidatedReviewItems(
  exp: Experiment,
  supports: Support[] = [],
  precursors: Precursor[] = []
): ConsolidatedReviewItem[] {
  const items: ConsolidatedReviewItem[] = [];
  const seenKeys = new Set<string>();

  const addUnique = (item: ConsolidatedReviewItem) => {
    if (seenKeys.has(item.issueKey)) return;
    seenKeys.add(item.issueKey);
    items.push(item);
  };

  // 1. Experiment metadata
  if (!exp.objective.trim()) {
    addUnique({
      issueKey: `meta:objective:${exp.uuid}`,
      group: 'experiment_metadata',
      description: 'Experiment research objective is empty.',
      recordId: exp.uuid,
      recordLabel: exp.experimentId,
      status: 'Open',
      sourceWorkspace: 'batch-synthesis',
      navContext: { module: 'batch-synthesis' },
      researcherNotes: '',
      history: [],
    });
  }
  if (!exp.researcher.trim()) {
    addUnique({
      issueKey: `meta:researcher:${exp.uuid}`,
      group: 'experiment_metadata',
      description: 'Researcher attribution is missing on experiment record.',
      recordId: exp.uuid,
      recordLabel: exp.experimentId,
      status: 'Open',
      sourceWorkspace: 'batch-synthesis',
      navContext: { module: 'batch-synthesis' },
      researcherNotes: '',
      history: [],
    });
  }

  // 2. Material references & snapshot drift
  if (!exp.batch.supportSnapshot) {
    addUnique({
      issueKey: `mat:missing-support:${exp.uuid}`,
      group: 'material_references',
      description: 'No support material snapshot is attached to this experiment.',
      recordId: exp.uuid,
      recordLabel: 'Support Snapshot',
      status: 'Open',
      sourceWorkspace: 'batch-synthesis',
      navContext: { module: 'batch-synthesis' },
      researcherNotes: '',
      history: [],
    });
  } else {
    const live = supports.find((s) => s.id === exp.batch.supportId);
    if (
      live &&
      live.updatedAt !== exp.batch.supportSnapshot.sourceUpdatedAt
    ) {
      addUnique({
        issueKey: `mat:drift-support:${exp.uuid}`,
        group: 'material_references',
        description: `Support "${live.name}" was edited in Material Databases after snapshot capture. Historical snapshot remains preserved.`,
        recordId: exp.batch.supportSnapshot.snapshotId,
        recordLabel: live.name,
        status: 'Acknowledged',
        sourceWorkspace: 'batch-synthesis',
        navContext: { module: 'batch-synthesis' },
        researcherNotes: '',
        history: [],
      });
    }
  }
  if (!exp.batch.precursorSnapshot) {
    addUnique({
      issueKey: `mat:missing-precursor:${exp.uuid}`,
      group: 'material_references',
      description: 'No precursor material snapshot is attached to this experiment.',
      recordId: exp.uuid,
      recordLabel: 'Precursor Snapshot',
      status: 'Open',
      sourceWorkspace: 'batch-synthesis',
      navContext: { module: 'batch-synthesis' },
      researcherNotes: '',
      history: [],
    });
  } else {
    const live = precursors.find((p) => p.id === exp.batch.precursorId);
    if (
      live &&
      live.updatedAt !== exp.batch.precursorSnapshot.sourceUpdatedAt
    ) {
      addUnique({
        issueKey: `mat:drift-precursor:${exp.uuid}`,
        group: 'material_references',
        description: `Precursor "${live.name}" was edited in Material Databases after snapshot capture. Historical snapshot remains preserved.`,
        recordId: exp.batch.precursorSnapshot.snapshotId,
        recordLabel: live.name,
        status: 'Acknowledged',
        sourceWorkspace: 'batch-synthesis',
        navContext: { module: 'batch-synthesis' },
        researcherNotes: '',
        history: [],
      });
    }
  }

  // 3. Authoritative Phase 4 Analytical Quality Issues (across all sessions)
  for (const sess of exp.analyticalSessions ?? []) {
    const detected = detectAnalyticalQualityIssues(exp, sess);
    for (const issue of detected) {
      let group: ConsolidatedReviewGroup = 'analytical_records';
      if (issue.category === 'missing_measurement') group = 'missing_observations';
      else if (issue.category === 'incompatible_units') group = 'incompatible_units';
      else if (issue.category === 'conflicting_dilution_metadata') {
        group = 'conflicting_values';
      } else if (issue.category === 'unresolved_survey_association') {
        group = 'measurement_associations';
      }

      addUnique({
        issueKey: `ana:${sess.id}:${issue.issueKey}`,
        group,
        description: `[${sess.sessionId}] ${issue.description}`,
        recordId: issue.recordId,
        recordLabel: `${sess.sessionId} · ${issue.recordLabel}`,
        status: issue.effectiveStatus,
        sourceWorkspace: 'analytical',
        navContext: {
          module: 'analytical',
          analyticalSessionId: sess.id,
          analyticalTab: 'quality',
          highlightRecordId: issue.recordId,
        },
        analyticalReviewRef: {
          sessionId: sess.id,
          issueKey: issue.issueKey,
          category: issue.category,
          recordId: issue.recordId,
          recordLabel: issue.recordLabel,
          provenance: issue.provenance,
        },
        researcherNotes: issue.persistedReview?.researcherNotes ?? '',
        history: issue.persistedReview?.history ?? [],
      });
    }

    // Check explicit dilution conflicts not already represented
    const dilDiags = evaluateDilutionConsistency(sess);
    for (const d of dilDiags) {
      if (d.severity !== 'conflict') continue;
      addUnique({
        issueKey: `ana:${sess.id}:dilution-conflict:${d.dilutionRecordId}`,
        group: 'conflicting_values',
        description: `[${sess.sessionId}] ${d.message}`,
        recordId: d.dilutionRecordId,
        recordLabel: `${sess.sessionId} · ${d.sampleId}`,
        status: 'Open',
        sourceWorkspace: 'analytical',
        navContext: {
          module: 'analytical',
          analyticalSessionId: sess.id,
          analyticalTab: 'dilutions',
          highlightRecordId: d.dilutionRecordId,
        },
        researcherNotes: '',
        history: [],
      });
    }
  }

  // 4. Phase 2-3 Survey completeness, discrepancies, and unit compatibility
  const allInst = getAllExperimentInstrumentMeasurements(exp);
  for (const ds of exp.surveyDatasets ?? []) {
    const comp = evaluateSurveyCompleteness(ds, allInst);
    if (comp.missingFinalPhCount > 0 || comp.missingUptakeCount > 0) {
      addUnique({
        issueKey: `srv:${ds.id}:missing-obs`,
        group: 'missing_observations',
        description: `[${ds.datasetId}] ${comp.missingFinalPhCount} missing final pH and ${comp.missingUptakeCount} missing uptake value(s).`,
        recordId: ds.id,
        recordLabel: `${ds.datasetId} — ${ds.title}`,
        status: 'Open',
        sourceWorkspace: 'uptake-survey',
        navContext: {
          module: 'uptake-survey',
          surveyDatasetId: ds.id,
          surveyTab: 'data',
        },
        researcherNotes: '',
        history: [],
      });
    }
    if (comp.flaggedCount > 0) {
      addUnique({
        issueKey: `srv:${ds.id}:flagged-rows`,
        group: 'survey_records',
        description: `[${ds.datasetId}] ${comp.flaggedCount} survey measurement row(s) flagged for review.`,
        recordId: ds.id,
        recordLabel: `${ds.datasetId} — ${ds.title}`,
        status: 'Open',
        sourceWorkspace: 'uptake-survey',
        navContext: {
          module: 'uptake-survey',
          surveyDatasetId: ds.id,
          surveyTab: 'data',
        },
        researcherNotes: '',
        history: [],
      });
    }

    const linkMap = resolveSurveyAnalyticalLinks(ds.measurements, allInst);
    for (const m of ds.measurements) {
      const link = linkMap[m.id];
      if (!link) continue;
      if (link.initial.hasDiscrepancy) {
        addUnique({
          issueKey: `link:disc:${m.id}:initial`,
          group: 'analytical_discrepancies',
          description: `[${ds.datasetId}] ${m.sampleId} Initial conc (${m.initialConcPpm} ppm) differs from linked analytical record (${link.initial.linkedEffectiveConcPpm?.toFixed(3)} ppm).`,
          recordId: m.id,
          recordLabel: `${ds.datasetId} · ${m.sampleId} (Initial)`,
          status: 'Open',
          sourceWorkspace: 'uptake-survey',
          navContext: {
            module: 'uptake-survey',
            surveyDatasetId: ds.id,
            surveyTab: 'data',
            highlightRecordId: m.id,
          },
          researcherNotes: '',
          history: [],
        });
      }
      if (link.final.hasDiscrepancy) {
        addUnique({
          issueKey: `link:disc:${m.id}:final`,
          group: 'analytical_discrepancies',
          description: `[${ds.datasetId}] ${m.sampleId} Final conc (${m.finalConcPpm} ppm) differs from linked analytical record (${link.final.linkedEffectiveConcPpm?.toFixed(3)} ppm).`,
          recordId: m.id,
          recordLabel: `${ds.datasetId} · ${m.sampleId} (Final)`,
          status: 'Open',
          sourceWorkspace: 'uptake-survey',
          navContext: {
            module: 'uptake-survey',
            surveyDatasetId: ds.id,
            surveyTab: 'data',
            highlightRecordId: m.id,
          },
          researcherNotes: '',
          history: [],
        });
      }
      if (link.initial.sourceUnavailable || link.final.sourceUnavailable) {
        addUnique({
          issueKey: `link:missing:${m.id}`,
          group: 'measurement_associations',
          description: `[${ds.datasetId}] ${m.sampleId} references an analytical measurement UUID that is no longer available.`,
          recordId: m.id,
          recordLabel: `${ds.datasetId} · ${m.sampleId}`,
          status: 'Open',
          sourceWorkspace: 'overview',
          navContext: {
            module: 'overview',
            overviewTab: 'samples',
            highlightRecordId: m.id,
          },
          researcherNotes: '',
          history: [],
        });
      }

      // Check concentration unit compatibility on linked rows
      if (link.initial.linkedRecord && !areUnitsCompatible(m.concUnit || 'ppm', link.initial.linkedRecord.concUnit || 'ppm')) {
        addUnique({
          issueKey: `unit:incompat:${m.id}:initial`,
          group: 'incompatible_units',
          description: `[${ds.datasetId}] ${m.sampleId} unit (${m.concUnit || 'ppm'}) is incompatible with linked Initial analytical unit (${link.initial.linkedRecord.concUnit}).`,
          recordId: m.id,
          recordLabel: `${ds.datasetId} · ${m.sampleId}`,
          status: 'Open',
          sourceWorkspace: 'uptake-survey',
          navContext: {
            module: 'uptake-survey',
            surveyDatasetId: ds.id,
            surveyTab: 'data',
            highlightRecordId: m.id,
          },
          researcherNotes: '',
          history: [],
        });
      }
    }

    // 5. Saved Survey Figure Reproducibility / Source Availability
    for (const fig of ds.savedFigures ?? []) {
      const check = evaluateFigureReproducibility(exp, 'survey', fig, ds.id);
      if (
        check.status === 'requires_regeneration' ||
        check.status === 'source_unavailable'
      ) {
        addUnique({
          issueKey: `fig:survey:${fig.id}:${check.status}`,
          group: 'figure_source_availability',
          description: `Saved survey figure "${fig.name}" (${ds.datasetId}): ${check.message}`,
          recordId: fig.id,
          recordLabel: fig.name,
          status: 'Open',
          sourceWorkspace: 'uptake-survey',
          navContext: {
            module: 'uptake-survey',
            surveyDatasetId: ds.id,
            surveyTab: 'figures',
            highlightRecordId: fig.id,
          },
          researcherNotes: '',
          history: [],
        });
      }
    }
  }

  for (const sess of exp.analyticalSessions ?? []) {
    for (const fig of sess.savedFigures ?? []) {
      const check = evaluateFigureReproducibility(exp, 'analytical', fig, sess.id);
      if (
        check.status === 'requires_regeneration' ||
        check.status === 'source_unavailable'
      ) {
        addUnique({
          issueKey: `fig:analytical:${fig.id}:${check.status}`,
          group: 'figure_source_availability',
          description: `Saved analytical figure "${fig.name}" (${sess.sessionId}): ${check.message}`,
          recordId: fig.id,
          recordLabel: fig.name,
          status: 'Open',
          sourceWorkspace: 'analytical',
          navContext: {
            module: 'analytical',
            analyticalSessionId: sess.id,
            analyticalTab: 'figures',
            highlightRecordId: fig.id,
          },
          researcherNotes: '',
          history: [],
        });
      }
    }
  }

  // 6. Report documentation completeness
  const finalized = exp.finalizedReports ?? [];
  if (exp.status === 'Completed' && finalized.length === 0) {
    addUnique({
      issueKey: `report:no-finalized:${exp.uuid}`,
      group: 'report_completeness',
      description:
        'Experiment is marked Completed, but no snapshot-bound finalized report revision has been created yet.',
      recordId: exp.uuid,
      recordLabel: `${exp.experimentId} Report`,
      status: 'Open',
      sourceWorkspace: 'lab-report',
      navContext: { module: 'lab-report' },
      researcherNotes: '',
      history: [],
    });
  }
  if ((exp.snapshots ?? []).length === 0 && exp.status === 'Completed') {
    addUnique({
      issueKey: `report:no-snapshot:${exp.uuid}`,
      group: 'report_completeness',
      description:
        'Experiment is marked Completed without an immutable historical research snapshot.',
      recordId: exp.uuid,
      recordLabel: `${exp.experimentId} Snapshots`,
      status: 'Open',
      sourceWorkspace: 'overview',
      navContext: { module: 'overview', overviewTab: 'snapshots' },
      researcherNotes: '',
      history: [],
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// 12. Experiment Snapshots, Comparison & Independent Restoration
// ---------------------------------------------------------------------------

export function stripSnapshotsForPayload(
  exp: Experiment
): ExperimentSnapshotPayload {
  const projected = projectExperimentCompatibilityMirrors(exp);
  const { snapshots: _snaps, finalizedReports: _reps, ...rest } = projected;
  void _snaps;
  void _reps;
  return structuredClone(rest);
}

export function createExperimentSnapshotRecord(
  exp: Experiment,
  meta: {
    snapshotId: string;
    name: string;
    description?: string;
    researcher?: string;
    capturedAt?: string;
  }
): ExperimentSnapshot {
  const payload = stripSnapshotsForPayload(exp);
  const serialized = JSON.stringify(payload);
  const byteSize =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(serialized).length
      : serialized.length * 2;

  return {
    snapshotId: meta.snapshotId,
    name: meta.name.trim() || `Snapshot (${new Date().toISOString().slice(0, 10)})`,
    description: meta.description?.trim() ?? '',
    capturedAt: meta.capturedAt ?? new Date().toISOString(),
    researcher: meta.researcher?.trim() || exp.researcher || 'Researcher',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    experimentUuid: exp.uuid,
    experimentDataVersion: EXPERIMENT_DATA_VERSION,
    calcEngineVersion: CALC_ENGINE_VERSION,
    scientificReviewStatus: exp.scientificReviewStatus,
    byteSize,
    payload,
  };
}

export interface SnapshotDiffField {
  area: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export function compareExperimentSnapshots(
  a: ExperimentSnapshotPayload,
  b: ExperimentSnapshotPayload
): {
  changedCount: number;
  fields: SnapshotDiffField[];
} {
  const countSurveyRows = (p: ExperimentSnapshotPayload) =>
    (p.surveyDatasets ?? []).reduce((acc, d) => acc + d.measurements.length, 0);
  const countAnalyticalRows = (p: ExperimentSnapshotPayload) =>
    (p.analyticalSessions ?? []).reduce(
      (acc, s) => acc + s.sampleMeasurements.length,
      0
    );
  const countSavedFigures = (p: ExperimentSnapshotPayload) =>
    (p.surveyDatasets ?? []).reduce((acc, d) => acc + d.savedFigures.length, 0) +
    (p.analyticalSessions ?? []).reduce((acc, s) => acc + s.savedFigures.length, 0);

  const rawRows: Array<Omit<SnapshotDiffField, 'changed'>> = [
    { area: 'Metadata', label: 'Title', before: a.title, after: b.title },
    { area: 'Lifecycle', label: 'Status', before: a.status, after: b.status },
    {
      area: 'Review',
      label: 'Scientific Review Status',
      before: a.scientificReviewStatus,
      after: b.scientificReviewStatus,
    },
    {
      area: 'Metadata',
      label: 'Objective',
      before: a.objective || '—',
      after: b.objective || '—',
    },
    {
      area: 'Materials',
      label: 'Support Snapshot',
      before: a.batch.supportSnapshot?.supportData?.name ?? 'None',
      after: b.batch.supportSnapshot?.supportData?.name ?? 'None',
    },
    {
      area: 'Materials',
      label: 'Precursor Snapshot',
      before: a.batch.precursorSnapshot?.precursorData?.name ?? 'None',
      after: b.batch.precursorSnapshot?.precursorData?.name ?? 'None',
    },
    {
      area: 'Survey',
      label: 'Survey Datasets / Rows',
      before: `${(a.surveyDatasets ?? []).length} datasets / ${countSurveyRows(a)} rows`,
      after: `${(b.surveyDatasets ?? []).length} datasets / ${countSurveyRows(b)} rows`,
    },
    {
      area: 'Analytical',
      label: 'Analytical Sessions / Samples',
      before: `${(a.analyticalSessions ?? []).length} sessions / ${countAnalyticalRows(a)} samples`,
      after: `${(b.analyticalSessions ?? []).length} sessions / ${countAnalyticalRows(b)} samples`,
    },
    {
      area: 'Figures',
      label: 'Saved Figures',
      before: String(countSavedFigures(a)),
      after: String(countSavedFigures(b)),
    },
    {
      area: 'Bench',
      label: 'Observations Logged',
      before: String((a.observations ?? []).length),
      after: String((b.observations ?? []).length),
    },
    {
      area: 'Bench',
      label: 'Milestones Completed',
      before: `${(a.milestones ?? []).filter((m) => m.status === 'completed').length}/${(a.milestones ?? []).length}`,
      after: `${(b.milestones ?? []).filter((m) => m.status === 'completed').length}/${(b.milestones ?? []).length}`,
    },
  ];

  const fields: SnapshotDiffField[] = rawRows.map((r) => ({
    ...r,
    changed: r.before !== r.after,
  }));

  return {
    changedCount: fields.filter((f) => f.changed).length,
    fields,
  };
}

export function hasExperimentChangedSinceSnapshot(
  exp: Experiment,
  snapshot: ExperimentSnapshot | undefined
): boolean {
  if (!snapshot) return true;
  const currentPayload = stripSnapshotsForPayload(exp);
  // Compare semantic payload ignoring updatedAt clock jitter and audit activityEvents
  const normalize = (p: ExperimentSnapshotPayload) => {
    const { updatedAt: _u, activityEvents: _a, ...rest } = p;
    void _u;
    void _a;
    return JSON.stringify(rest);
  };
  return normalize(currentPayload) !== normalize(snapshot.payload);
}

export function restoreSnapshotAsIndependentExperiment(
  snapshot: ExperimentSnapshot,
  existingExperiments: Experiment[],
  idGenerator: (prefix: string) => string,
  uniqueExperimentIdGenerator: (existing: Experiment[], prefix?: string) => string
): Experiment {
  const now = new Date().toISOString();
  const cloned = structuredClone(snapshot.payload);
  const newUuid = idGenerator('exp');
  const newExperimentId = uniqueExperimentIdGenerator(existingExperiments, 'SEA');

  const restored: Experiment = {
    ...cloned,
    uuid: newUuid,
    experimentId: newExperimentId,
    title: `${cloned.title} (Restored from ${snapshot.name})`,
    status: cloned.status === 'Archived' ? 'Draft' : cloned.status,
    isDemonstration: false,
    createdAt: now,
    updatedAt: now,
    dataVersion: EXPERIMENT_DATA_VERSION,
    calcEngineVersion: CALC_ENGINE_VERSION,
    analyticalSessions: (cloned.analyticalSessions ?? []).map((s) => ({
      ...s,
      experimentUuid: newUuid,
    })),
    lifecycleHistory: [
      ...(cloned.lifecycleHistory ?? []),
      {
        id: idGenerator('lc'),
        fromStatus: null,
        toStatus: cloned.status === 'Archived' ? 'Draft' : cloned.status,
        timestamp: now,
        researcher: cloned.researcher || 'Researcher',
        explanation: `Restored as independent experiment from snapshot "${snapshot.name}" (${snapshot.snapshotId}, captured ${snapshot.capturedAt.slice(0, 10)}).`,
        snapshotId: snapshot.snapshotId,
      },
    ],
    activityEvents: [
      ...(cloned.activityEvents ?? []),
      {
        id: idGenerator('act'),
        eventType: 'experiment_created',
        module: 'overview',
        timestamp: now,
        experimentUuid: newUuid,
        sourceKind: 'experiment',
        sourceId: newUuid,
        sourceLabel: newExperimentId,
        author: cloned.researcher || 'Researcher',
        description: `Created independent experiment ${newExperimentId} from historical snapshot "${snapshot.name}" (${snapshot.snapshotId}).`,
      },
    ],
    snapshots: [],
    finalizedReports: [],
  };

  return projectExperimentCompatibilityMirrors(restored);
}

/**
 * Captures immutable companion experiment snapshots for all cross-experiment
 * comparisons and portfolio summaries referenced or visible at report finalization.
 */
export function captureCrossExperimentSnapshotsForReport(
  primaryExperiment: Experiment | ExperimentSnapshotPayload,
  allExperiments: Experiment[],
  reportConfig: ReportConfiguration,
  meta: {
    capturedAt?: string;
    researcher?: string;
    idGenerator: (prefix: string) => string;
  }
): ExperimentSnapshot[] {
  const capturedAt = meta.capturedAt ?? new Date().toISOString();
  const includeAllPortfolio = Boolean(
    reportConfig.includeCrossExperimentSummary ||
      reportConfig.includeResearchMatrix
  );
  const referencedUuids = new Set<string>(
    (primaryExperiment.datasetComparison?.selectedRefs ?? []).map(
      (r) => r.experimentUuid
    )
  );

  const snapshots: ExperimentSnapshot[] = [];
  for (const candidate of allExperiments) {
    if (candidate.uuid === primaryExperiment.uuid) continue;
    const isReferenced = referencedUuids.has(candidate.uuid);
    if (!includeAllPortfolio && !isReferenced) continue;
    snapshots.push(
      createExperimentSnapshotRecord(candidate, {
        snapshotId: meta.idGenerator('snapx'),
        name: `Cross-Experiment Freeze — ${candidate.experimentId}`,
        description: `Immutable companion snapshot captured for cross-experiment reproducibility during report finalization (${candidate.experimentId}).`,
        researcher:
          meta.researcher || candidate.researcher || 'Research Scientist',
        capturedAt,
      })
    );
  }
  return snapshots;
}

export interface FinalizedReportResolvedContext {
  effectiveExperiment: Experiment;
  crossExperimentPool: Experiment[];
  boundSnapshot: ExperimentSnapshot | null;
  hasFrozenComparisonSnapshots: boolean;
}

/**
 * Resolves the authoritative experiment and cross-experiment pool for rendering
 * either a live working report or a finalized snapshot-bound report.
 * Finalized reports never read companion data from live `allExperiments`.
 */
export function resolveFinalizedReportContext(
  experiment: Experiment,
  finalizedReport: FinalizedReport | null,
  allExperiments: Experiment[] = []
): FinalizedReportResolvedContext {
  if (!finalizedReport) {
    const livePool = allExperiments.length > 0 ? allExperiments : [experiment];
    return {
      effectiveExperiment: experiment,
      crossExperimentPool: livePool,
      boundSnapshot: null,
      hasFrozenComparisonSnapshots: false,
    };
  }

  const boundSnapshot =
    (experiment.snapshots ?? []).find(
      (s) => s.snapshotId === finalizedReport.snapshotId
    ) ?? null;

  const effectiveExperiment: Experiment = boundSnapshot
    ? {
        ...boundSnapshot.payload,
        snapshots: experiment.snapshots,
        finalizedReports: experiment.finalizedReports,
        reportConfig: finalizedReport.reportConfig,
      }
    : experiment;

  const hasFrozenComparisonSnapshots = Array.isArray(
    finalizedReport.crossExperimentSnapshots
  );

  const frozenCompanions: Experiment[] = hasFrozenComparisonSnapshots
    ? finalizedReport.crossExperimentSnapshots!.map((snap) => ({
        ...snap.payload,
        snapshots: [],
        finalizedReports: [],
      }))
    : [];

  return {
    effectiveExperiment,
    crossExperimentPool: [effectiveExperiment, ...frozenCompanions],
    boundSnapshot,
    hasFrozenComparisonSnapshots,
  };
}

// ---------------------------------------------------------------------------
// 8.2 Wall-Clock Recovery for Multiple Independent Research Timers
// ---------------------------------------------------------------------------

export function recoverResearchTimer(
  timer: ResearchTimer,
  nowMs: number = Date.now()
): {
  elapsedMs: number;
  remainingMs: number;
  status: ResearchTimer['status'];
  completedWhileAway: boolean;
} {
  if (timer.status !== 'running' || !timer.lastTickAt) {
    return {
      elapsedMs: timer.elapsedMs,
      remainingMs: timer.remainingMs,
      status: timer.status,
      completedWhileAway: false,
    };
  }

  const parsed = Date.parse(timer.lastTickAt);
  const delta = Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : 0;

  if (timer.mode === 'elapsed') {
    return {
      elapsedMs: timer.elapsedMs + delta,
      remainingMs: 0,
      status: 'running',
      completedWhileAway: false,
    };
  }

  const nextRemaining = Math.max(0, timer.remainingMs - delta);
  const completedWhileAway = nextRemaining === 0 && timer.remainingMs > 0;
  return {
    elapsedMs: timer.elapsedMs + Math.min(delta, timer.remainingMs),
    remainingMs: nextRemaining,
    status: nextRemaining === 0 ? 'completed' : 'running',
    completedWhileAway,
  };
}

// ---------------------------------------------------------------------------
// 14. Shared Report Builder Presets & Section Ordering
// ---------------------------------------------------------------------------

export const DEFAULT_REPORT_SECTION_ORDER: ReportSectionId[] = [
  'identification',
  'objectives_project',
  'materials',
  'planned_vs_actual',
  'timeline_milestones',
  'observations',
  'sample_registry',
  'survey_datasets',
  'analytical_sessions',
  'quality_review',
  'interpretations_conclusions',
  'references',
  'snapshot_provenance',
];

export const REPORT_SECTION_LABELS: Record<ReportSectionId, string> = {
  identification: 'Title & Experiment Identification',
  objectives_project: 'Research Objectives & Project Context',
  materials: 'Material Snapshots (Support & Precursor)',
  planned_vs_actual: 'Planned vs. Actual Synthesis Parameters',
  timeline_milestones: 'Research Milestones & Timeline',
  observations: 'Timestamped Bench & Research Observations',
  sample_registry: 'Unified Sample Registry Summary',
  survey_datasets: 'Survey Datasets, Statistics & Figures',
  analytical_sessions: 'Analytical Sessions, Calibration & Dilutions',
  quality_review: 'Quality-Review Findings & Data Limitations',
  interpretations_conclusions: 'Researcher Interpretations & Conclusions',
  references: 'Scientific References',
  snapshot_provenance: 'Snapshot & Reproducibility Metadata',
  cross_experiment_analytics: 'Cross-Experiment Analytics & Comparison Matrix',
  measurement_uncertainty: 'Recorded Measurement Uncertainty & Assumptions',
};

export const REPORT_TYPE_PRESETS: Record<
  ReportType,
  {
    label: string;
    description: string;
    patch: Partial<ReportConfiguration>;
  }
> = {
  'research-planning': {
    label: 'Research Planning Sheet',
    description: 'Pre-experiment objectives, material snapshots, planned parameters, and documentation milestones.',
    patch: {
      mode: 'pre-experiment',
      reportType: 'research-planning',
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includePlannedVsActual: true,
      includeBenchChecklist: true,
      includeResearchTimeline: false,
      includeSampleRegistry: true,
      includeSurveyOverview: false,
      includeSurveyTable: false,
      includeSurveyFigure: false,
      includeStatisticalSummaries: false,
      includeComparativeSummary: false,
      includeAnalyticalOverview: false,
      includeCalibrationRecords: false,
      includeAnalyticalRecords: false,
      includeRegressionSummary: false,
      includeAnalyticalFigures: false,
      includeDilutionRecords: false,
      includeAnalyticalQualityReview: false,
      includeSurveyAnalyticalLinks: false,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: false,
      includeScientificReferences: true,
      includeObservations: true,
      includeSnapshotMetadata: true,
    },
  },
  'experiment-progress': {
    label: 'Experiment Progress Record',
    description: 'Current lifecycle status, milestones, research timeline, observations, and open review items.',
    patch: {
      mode: 'post-experiment',
      reportType: 'experiment-progress',
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includePlannedVsActual: true,
      includeBenchChecklist: true,
      includeResearchTimeline: true,
      includeSampleRegistry: true,
      includeSurveyOverview: true,
      includeSurveyTable: false,
      includeSurveyFigure: true,
      includeStatisticalSummaries: false,
      includeComparativeSummary: false,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: false,
      includeAnalyticalRecords: false,
      includeRegressionSummary: false,
      includeAnalyticalFigures: false,
      includeDilutionRecords: false,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: false,
      includeObservations: true,
      includeSnapshotMetadata: true,
    },
  },
  'survey-analysis': {
    label: 'Survey Analysis Report',
    description: 'Focused Uptake & PZC survey tables, replicate statistics, saved figures, comparisons, and interpretations.',
    patch: {
      mode: 'post-experiment',
      reportType: 'survey-analysis',
      includeMaterialSnapshots: true,
      includeBatchRecords: false,
      includePlannedVsActual: false,
      includeBenchChecklist: false,
      includeResearchTimeline: false,
      includeSampleRegistry: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalOverview: false,
      includeCalibrationRecords: false,
      includeAnalyticalRecords: false,
      includeRegressionSummary: false,
      includeAnalyticalFigures: false,
      includeDilutionRecords: false,
      includeAnalyticalQualityReview: false,
      includeSurveyAnalyticalLinks: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: false,
      includeSnapshotMetadata: true,
    },
  },
  'analytical-data': {
    label: 'Analytical Data Report',
    description: 'ICP-OES / AAS session metadata, calibration regressions, sample tables with qualifiers, dilutions, and quality review.',
    patch: {
      mode: 'post-experiment',
      reportType: 'analytical-data',
      includeMaterialSnapshots: false,
      includeBatchRecords: false,
      includePlannedVsActual: false,
      includeBenchChecklist: false,
      includeResearchTimeline: false,
      includeSampleRegistry: true,
      includeSurveyOverview: false,
      includeSurveyTable: false,
      includeSurveyFigure: false,
      includeStatisticalSummaries: false,
      includeComparativeSummary: false,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeAnalyticalFigures: true,
      includeDilutionRecords: true,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: false,
      includeScientificReferences: false,
      includeObservations: true,
      includeSnapshotMetadata: true,
    },
  },
  'complete-research': {
    label: 'Complete Research Report',
    description: 'Full publication-grade A4 dossier combining synthesis, survey, analytical, review, timeline, and references.',
    patch: {
      mode: 'post-experiment',
      reportType: 'complete-research',
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includePlannedVsActual: true,
      includeBenchChecklist: true,
      includeResearchTimeline: true,
      includeSampleRegistry: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeAnalyticalFigures: true,
      includeDilutionRecords: true,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: true,
      includeSnapshotMetadata: true,
    },
  },
  'data-review-summary': {
    label: 'Research Data Review Summary',
    description: 'Consolidated data-quality diagnostics, analytical discrepancies, qualifier summary, and snapshot provenance.',
    patch: {
      mode: 'post-experiment',
      reportType: 'data-review-summary',
      includeMaterialSnapshots: true,
      includeBatchRecords: false,
      includePlannedVsActual: false,
      includeBenchChecklist: false,
      includeResearchTimeline: true,
      includeSampleRegistry: true,
      includeSurveyOverview: true,
      includeSurveyTable: false,
      includeSurveyFigure: false,
      includeStatisticalSummaries: false,
      includeComparativeSummary: false,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: false,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeAnalyticalFigures: false,
      includeDilutionRecords: true,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: false,
      includeObservations: true,
      includeSnapshotMetadata: true,
    },
  },
};

export function createDefaultResearchPlan(): import('../models/types').ResearchPlanMetadata {
  return {
    researchQuestions: [],
    plannedSampleIds: [],
    plannedMeasurementRequirements: '',
    plannedAnalyticalSessions: '',
    expectedDeliverables: '',
    externalProtocolRefs: [],
    deviations: [],
  };
}

export function getExperimentVersionSummary(): string {
  return `SEA Workbench v${APP_VERSION} · Schema ${WORKSPACE_SCHEMA_VERSION} · Engine ${CALC_ENGINE_VERSION}`;
}

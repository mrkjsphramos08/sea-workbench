/**
 * Deterministic Workspace Schema Migration Layer (v1.0.0 / v2.0.0 / v3.0.0 -> Phase 4 v4.0.0)
 *
 * Design guarantees:
 * - Never deletes or resets existing user experiments, snapshots, measurements,
 *   observations, bench logs, or report configurations.
 * - Preserves `null` values strictly (never replaces missing values with 0).
 * - Migrates Phase 1–3 single-session analytical records (`analyticalConfig`,
 *   `calibrationStandards`, `instrumentMeasurements`) into Phase 4 `analyticalSessions[]`
 *   while projecting deterministic compatibility mirrors via `projectExperimentCompatibilityMirrors`.
 * - Rejects malformed or unsupported major versions (5+) rather than silently fabricating data.
 */

import {
  APP_VERSION,
  AnalyticalAnalyte,
  AnalyticalComparisonConfig,
  AnalyticalFigureConfiguration,
  AnalyticalSession,
  BenchTimerState,
  CalibrationDataset,
  CalibrationStandard,
  DatasetComparisonConfig,
  DilutionRecord,
  EXPERIMENT_DATA_VERSION,
  Experiment,
  ExperimentLifecycleEvent,
  ExperimentTemplate,
  FigureConfiguration,
  ImportMappingTemplate,
  InstrumentMeasurement,
  Precursor,
  ReportConfiguration,
  ResearchAnnotation,
  ResearchMilestone,
  ResearchPlanMetadata,
  ResearchTimer,
  ScientificReference,
  Support,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import { createDefaultFigureConfig } from '../../domain/calculations/surveyAnalysis';
import { createDefaultAnalyticalFigureConfig } from '../../domain/calculations/analyticalAnalysis';
import {
  DEFAULT_REPORT_SECTION_ORDER,
  createDefaultResearchPlan,
  resolveEffectiveMeasurementQualifier,
} from '../../domain/calculations/workflowEngine';
import { projectExperimentCompatibilityMirrors } from '../../domain/models/projections';
import { createDefaultImportMappingTemplates } from '../../data/demo/analyticalFixtures';

export interface MigrationResult {
  ok: boolean;
  migrated: boolean;
  fromVersion: string | null;
  toVersion: string;
  data: WorkspaceStateData | null;
  notes: string[];
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function migrateReference(raw: unknown, idx: number): ScientificReference {
  const r = isRecord(raw) ? raw : {};
  const legacyCitation = typeof r.citation === 'string' ? r.citation : '';
  const legacyNotes = typeof r.notes === 'string' ? r.notes : '';
  const isDemo =
    legacyCitation.toLowerCase().includes('demo') ||
    legacyCitation.toLowerCase().includes('placeholder') ||
    legacyCitation.toLowerCase().includes('synthetic');

  return {
    id: typeof r.id === 'string' && r.id ? r.id : `ref-migrated-${idx + 1}`,
    title:
      typeof r.title === 'string' && r.title.trim()
        ? r.title
        : legacyCitation || 'Migrated Reference Record',
    authorOrOrganization:
      typeof r.authorOrOrganization === 'string'
        ? r.authorOrOrganization
        : '',
    year: typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : null,
    doiOrUrl: typeof r.doiOrUrl === 'string' ? r.doiOrUrl : '',
    sourceType:
      typeof r.sourceType === 'string'
        ? (r.sourceType as ScientificReference['sourceType'])
        : isDemo
          ? 'synthetic_demo_fixture'
          : 'user_provided',
    relevantProperty:
      typeof r.relevantProperty === 'string' ? r.relevantProperty : 'General',
    measurementConditions:
      typeof r.measurementConditions === 'string'
        ? r.measurementConditions
        : '',
    dateAccessed: typeof r.dateAccessed === 'string' ? r.dateAccessed : '',
    verificationStatus:
      typeof r.verificationStatus === 'string'
        ? (r.verificationStatus as ScientificReference['verificationStatus'])
        : isDemo
          ? 'synthetic_fixture'
          : 'unverified',
    reviewerNotes:
      typeof r.reviewerNotes === 'string' ? r.reviewerNotes : legacyNotes,
    citation: legacyCitation || undefined,
    notes: legacyNotes || undefined,
  };
}

function migratePrecursor(p: Precursor): Precursor {
  return {
    ...p,
    references: Array.isArray(p.references)
      ? p.references.map((r, i) => migrateReference(r, i))
      : [],
  };
}

function migrateSupport(s: Support): Support {
  return {
    ...s,
    references: Array.isArray(s.references)
      ? s.references.map((r, i) => migrateReference(r, i))
      : [],
  };
}

function migrateSurveyMeasurement(
  row: Partial<SurveyMeasurement> & Record<string, unknown>,
  experimentDate: string
): SurveyMeasurement {
  return {
    id: String(row.id ?? `sm-mig-${Math.random().toString(36).slice(2, 8)}`),
    sampleId: typeof row.sampleId === 'string' ? row.sampleId : '',
    sampleGroupId:
      typeof row.sampleGroupId === 'string'
        ? row.sampleGroupId
        : typeof row.sampleId === 'string' && row.sampleId
          ? `GRP-${row.sampleId}`
          : '',
    replicateId: typeof row.replicateId === 'string' ? row.replicateId : 'R1',
    targetInitialPh:
      typeof row.targetInitialPh === 'number' && Number.isFinite(row.targetInitialPh)
        ? row.targetInitialPh
        : null,
    measuredInitialPh:
      typeof row.measuredInitialPh === 'number' &&
      Number.isFinite(row.measuredInitialPh)
        ? row.measuredInitialPh
        : null,
    measuredFinalPh:
      typeof row.measuredFinalPh === 'number' && Number.isFinite(row.measuredFinalPh)
        ? row.measuredFinalPh
        : null,
    initialConcPpm:
      typeof row.initialConcPpm === 'number' && Number.isFinite(row.initialConcPpm)
        ? row.initialConcPpm
        : null,
    finalConcPpm:
      typeof row.finalConcPpm === 'number' && Number.isFinite(row.finalConcPpm)
        ? row.finalConcPpm
        : null,
    supportMassMg:
      typeof row.supportMassMg === 'number' && Number.isFinite(row.supportMassMg)
        ? row.supportMassMg
        : null,
    solutionVolumeMl:
      typeof row.solutionVolumeMl === 'number' &&
      Number.isFinite(row.solutionVolumeMl)
        ? row.solutionVolumeMl
        : null,
    recordedUptakeUmolM2:
      typeof row.recordedUptakeUmolM2 === 'number' &&
      Number.isFinite(row.recordedUptakeUmolM2)
        ? row.recordedUptakeUmolM2
        : null,
    uptakeUnit: typeof row.uptakeUnit === 'string' ? row.uptakeUnit : 'µmol/m²',
    concUnit: typeof row.concUnit === 'string' ? row.concUnit : 'ppm',
    provenance: row.provenance ?? 'user_entered',
    qualityStatus: row.qualityStatus ?? 'valid',
    exclusionReason:
      typeof row.exclusionReason === 'string' ? row.exclusionReason : undefined,
    linkedInitialMeasurementId:
      typeof row.linkedInitialMeasurementId === 'string'
        ? row.linkedInitialMeasurementId
        : null,
    linkedFinalMeasurementId:
      typeof row.linkedFinalMeasurementId === 'string'
        ? row.linkedFinalMeasurementId
        : null,
    measurementDate:
      typeof row.measurementDate === 'string'
        ? row.measurementDate
        : experimentDate,
    notes: typeof row.notes === 'string' ? row.notes : '',
  };
}

function migrateCalibrationStandard(
  std: Partial<CalibrationStandard> & Record<string, unknown>,
  defaultAnalyteId: string | null = null
): CalibrationStandard {
  return {
    id: String(std.id ?? `cal-mig-${Math.random().toString(36).slice(2, 8)}`),
    standardId: typeof std.standardId === 'string' ? std.standardId : '',
    analyteId:
      typeof std.analyteId === 'string' ? std.analyteId : defaultAnalyteId,
    isBlank:
      typeof std.isBlank === 'boolean'
        ? std.isBlank
        : std.nominalConc === 0,
    replicateGroupId:
      typeof std.replicateGroupId === 'string' ? std.replicateGroupId : undefined,
    nominalConc:
      typeof std.nominalConc === 'number' && Number.isFinite(std.nominalConc)
        ? std.nominalConc
        : null,
    unit: typeof std.unit === 'string' ? std.unit : 'ppm',
    instrumentResponse:
      typeof std.instrumentResponse === 'number' &&
      Number.isFinite(std.instrumentResponse)
        ? std.instrumentResponse
        : null,
    responseUnit: typeof std.responseUnit === 'string' ? std.responseUnit : 'cps',
    replicateNumber:
      typeof std.replicateNumber === 'number' && Number.isFinite(std.replicateNumber)
        ? std.replicateNumber
        : 1,
    provenance: std.provenance ?? 'user_entered',
    qualityStatus: std.qualityStatus ?? 'valid',
    exclusionReason:
      typeof std.exclusionReason === 'string' ? std.exclusionReason : undefined,
    notes: typeof std.notes === 'string' ? std.notes : '',
  };
}

function migrateInstrumentMeasurement(
  m: Partial<InstrumentMeasurement> & Record<string, unknown>,
  defaultAnalyte: string,
  defaultDate: string,
  defaults?: {
    sessionId?: string;
    analyteId?: string | null;
    calibrationDatasetId?: string | null;
  }
): InstrumentMeasurement {
  return {
    id: String(m.id ?? `im-mig-${Math.random().toString(36).slice(2, 8)}`),
    sampleId: typeof m.sampleId === 'string' ? m.sampleId : '',
    sessionId:
      typeof m.sessionId === 'string' ? m.sessionId : defaults?.sessionId,
    analyteId:
      typeof m.analyteId === 'string' || m.analyteId === null
        ? (m.analyteId as string | null)
        : defaults?.analyteId ?? null,
    calibrationDatasetId:
      typeof m.calibrationDatasetId === 'string' ||
      m.calibrationDatasetId === null
        ? (m.calibrationDatasetId as string | null)
        : defaults?.calibrationDatasetId ?? null,
    linkedSurveyDatasetId:
      typeof m.linkedSurveyDatasetId === 'string'
        ? m.linkedSurveyDatasetId
        : null,
    linkedSurveyMeasurementId:
      typeof m.linkedSurveyMeasurementId === 'string'
        ? m.linkedSurveyMeasurementId
        : null,
    linkedSurveySampleId:
      typeof m.linkedSurveySampleId === 'string' ? m.linkedSurveySampleId : '',
    analyte: typeof m.analyte === 'string' ? m.analyte : defaultAnalyte,
    stage: m.stage ?? 'Initial',
    classificationLabel:
      typeof m.classificationLabel === 'string'
        ? m.classificationLabel
        : undefined,
    replicateId: typeof m.replicateId === 'string' ? m.replicateId : 'R1',
    dilutionFactor:
      typeof m.dilutionFactor === 'number' && Number.isFinite(m.dilutionFactor)
        ? m.dilutionFactor
        : null,
    reportedValueBasis:
      m.reportedValueBasis ??
      (typeof m.dilutionFactor === 'number' && m.dilutionFactor > 1
        ? 'as_measured_diluted'
        : 'unspecified'),
    rawSignal:
      typeof m.rawSignal === 'number' && Number.isFinite(m.rawSignal)
        ? m.rawSignal
        : null,
    signalUnit: typeof m.signalUnit === 'string' ? m.signalUnit : 'cps',
    reportedConc:
      typeof m.reportedConc === 'number' && Number.isFinite(m.reportedConc)
        ? m.reportedConc
        : null,
    concUnit: typeof m.concUnit === 'string' ? m.concUnit : 'ppm',
    valueQualifier: resolveEffectiveMeasurementQualifier({
      reportedConc:
        typeof m.reportedConc === 'number' && Number.isFinite(m.reportedConc)
          ? m.reportedConc
          : null,
      qualityStatus: m.qualityStatus ?? 'valid',
      valueQualifier: m.valueQualifier,
      originalValueToken:
        typeof m.originalValueToken === 'string' ? m.originalValueToken : null,
      originalReportedConc:
        typeof m.originalReportedConc === 'string'
          ? m.originalReportedConc
          : null,
      instrumentFlag:
        typeof m.instrumentFlag === 'string' ? m.instrumentFlag : undefined,
    }),
    originalValueToken:
      typeof m.originalValueToken === 'string'
        ? m.originalValueToken
        : typeof m.originalReportedConc === 'string'
          ? m.originalReportedConc
          : null,
    suppliedLimitValue:
      typeof m.suppliedLimitValue === 'number' &&
      Number.isFinite(m.suppliedLimitValue)
        ? m.suppliedLimitValue
        : null,
    suppliedLimitType: m.suppliedLimitType ?? null,
    suppliedLimitUnit:
      typeof m.suppliedLimitUnit === 'string' ? m.suppliedLimitUnit : null,
    instrumentFlag:
      typeof m.instrumentFlag === 'string' ? m.instrumentFlag : undefined,
    exclusionReason:
      typeof m.exclusionReason === 'string' ? m.exclusionReason : undefined,
    importRecordId:
      typeof m.importRecordId === 'string' ? m.importRecordId : null,
    importRowNumber:
      typeof m.importRowNumber === 'number' ? m.importRowNumber : null,
    originalReportedConc:
      typeof m.originalReportedConc === 'string'
        ? m.originalReportedConc
        : null,
    originalConcUnit:
      typeof m.originalConcUnit === 'string' ? m.originalConcUnit : null,
    analysisTimestamp:
      typeof m.analysisTimestamp === 'string' ? m.analysisTimestamp : undefined,
    provenance: m.provenance ?? 'measured_experimental',
    qualityStatus: m.qualityStatus ?? 'valid',
    measurementDate:
      typeof m.measurementDate === 'string' ? m.measurementDate : defaultDate,
    notes: typeof m.notes === 'string' ? m.notes : '',
  };
}

function migrateBenchTimer(
  rawTimer: Partial<BenchTimerState> & Record<string, unknown>
): BenchTimerState {
  const elapsedMs =
    typeof rawTimer.elapsedMs === 'number' && Number.isFinite(rawTimer.elapsedMs)
      ? Math.max(0, rawTimer.elapsedMs)
      : 0;
  const countdownDurationSec =
    typeof rawTimer.countdownDurationSec === 'number' &&
    Number.isFinite(rawTimer.countdownDurationSec) &&
    rawTimer.countdownDurationSec > 0
      ? rawTimer.countdownDurationSec
      : 3600;
  const activeCountdownDurationSec =
    typeof rawTimer.activeCountdownDurationSec === 'number' &&
    Number.isFinite(rawTimer.activeCountdownDurationSec) &&
    rawTimer.activeCountdownDurationSec > 0
      ? rawTimer.activeCountdownDurationSec
      : countdownDurationSec;
  const countdownRemainingMs =
    typeof rawTimer.countdownRemainingMs === 'number' &&
    Number.isFinite(rawTimer.countdownRemainingMs)
      ? Math.max(0, rawTimer.countdownRemainingMs)
      : activeCountdownDurationSec * 1000;

  const inferredCountdownStatus: BenchTimerState['countdownStatus'] =
    rawTimer.countdownStatus ??
    (countdownRemainingMs === 0
      ? 'completed'
      : countdownRemainingMs < activeCountdownDurationSec * 1000
        ? 'paused'
        : 'ready');

  const inferredElapsedStatus: BenchTimerState['elapsedStatus'] =
    rawTimer.elapsedStatus ?? (elapsedMs > 0 ? 'paused' : 'ready');

  return {
    elapsedMs,
    elapsedStatus: inferredElapsedStatus,
    elapsedLastTickAt:
      typeof rawTimer.elapsedLastTickAt === 'string'
        ? rawTimer.elapsedLastTickAt
        : null,
    countdownDurationSec,
    activeCountdownDurationSec,
    countdownRemainingMs,
    countdownStatus: inferredCountdownStatus,
    countdownLastTickAt:
      typeof rawTimer.countdownLastTickAt === 'string'
        ? rawTimer.countdownLastTickAt
        : null,
    startedAt: typeof rawTimer.startedAt === 'string' ? rawTimer.startedAt : null,
    completedAt:
      typeof rawTimer.completedAt === 'string' ? rawTimer.completedAt : null,
  };
}

function migrateFigureConfig(
  raw: Partial<FigureConfiguration> | undefined,
  mode: 'uptake' | 'pzc',
  fallbackTitle: string
): FigureConfiguration {
  const base = createDefaultFigureConfig(mode, fallbackTitle);
  if (!raw || !isRecord(raw)) return base;
  return {
    ...base,
    ...raw,
    xMin: typeof raw.xMin === 'number' && Number.isFinite(raw.xMin) ? raw.xMin : null,
    xMax: typeof raw.xMax === 'number' && Number.isFinite(raw.xMax) ? raw.xMax : null,
    yMin: typeof raw.yMin === 'number' && Number.isFinite(raw.yMin) ? raw.yMin : null,
    yMax: typeof raw.yMax === 'number' && Number.isFinite(raw.yMax) ? raw.yMax : null,
  };
}

function migrateAnalyticalFigureConfig(
  raw: Partial<AnalyticalFigureConfiguration> | undefined,
  fallbackTitle: string
): AnalyticalFigureConfiguration {
  const base = createDefaultAnalyticalFigureConfig(
    raw?.plotType ?? 'calibration_regression',
    fallbackTitle
  );
  if (!raw || !isRecord(raw)) return base;
  return {
    ...base,
    ...raw,
    xMin: typeof raw.xMin === 'number' && Number.isFinite(raw.xMin) ? raw.xMin : null,
    xMax: typeof raw.xMax === 'number' && Number.isFinite(raw.xMax) ? raw.xMax : null,
    yMin: typeof raw.yMin === 'number' && Number.isFinite(raw.yMin) ? raw.yMin : null,
    yMax: typeof raw.yMax === 'number' && Number.isFinite(raw.yMax) ? raw.yMax : null,
  };
}

function migrateSurveyDataset(
  raw: Partial<SurveyDataset>,
  exp: Experiment,
  index: number
): SurveyDataset {
  const mode = raw.mode ?? raw.config?.mode ?? exp.surveyConfig?.mode ?? 'uptake';
  const config: SurveyConfiguration = {
    mode,
    targetSurfaceLoadingM2L: raw.config?.targetSurfaceLoadingM2L ?? null,
    equilibrationTimeMin: raw.config?.equilibrationTimeMin ?? null,
    temperatureC: raw.config?.temperatureC ?? null,
    backgroundElectrolyte: raw.config?.backgroundElectrolyte ?? '',
    phAdjustmentReagentsNote: raw.config?.phAdjustmentReagentsNote ?? '',
    dataProvenance:
      raw.config?.dataProvenance ??
      exp.surveyConfig?.dataProvenance ??
      'user_entered',
    chartTitle:
      raw.config?.chartTitle ??
      raw.title ??
      (mode === 'pzc'
        ? 'pH Shift Survey (Final vs. Initial pH)'
        : 'Recorded Metal Uptake vs. Final pH'),
    showSyntheticNotice: Boolean(
      raw.config?.showSyntheticNotice ?? raw.isDemonstration ?? exp.isDemonstration
    ),
    chartDisplayMode: raw.config?.chartDisplayMode ?? 'individual',
    errorBarMode: raw.config?.errorBarMode ?? 'none',
  };

  const measurements = Array.isArray(raw.measurements)
    ? raw.measurements.map((row) =>
        migrateSurveyMeasurement(
          row as unknown as Partial<SurveyMeasurement> & Record<string, unknown>,
          exp.experimentDate
        )
      )
    : [];

  const figureConfig = migrateFigureConfig(raw.figureConfig, mode, config.chartTitle);
  const savedFigures = Array.isArray(raw.savedFigures)
    ? raw.savedFigures.map((f) => migrateFigureConfig(f, mode, f.title || config.chartTitle))
    : [];

  const annotations: ResearchAnnotation[] = Array.isArray(raw.annotations)
    ? raw.annotations.map((a) => ({
        ...a,
        linkedDatasetId: a.linkedDatasetId ?? raw.id ?? null,
        linkedMeasurementIds: Array.isArray(a.linkedMeasurementIds)
          ? a.linkedMeasurementIds
          : [],
        linkedGroupIds: Array.isArray(a.linkedGroupIds) ? a.linkedGroupIds : [],
        linkedFigureId: a.linkedFigureId ?? null,
        linkedReferenceIds: Array.isArray(a.linkedReferenceIds)
          ? a.linkedReferenceIds
          : [],
      }))
    : [];

  return {
    id:
      typeof raw.id === 'string' && raw.id
        ? raw.id
        : `ds-${exp.uuid}-${index + 1}`,
    datasetId:
      typeof raw.datasetId === 'string' && raw.datasetId
        ? raw.datasetId
        : `DS-${mode === 'pzc' ? 'PZC' : 'UPT'}-${String(index + 1).padStart(2, '0')}`,
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title
        : config.chartTitle || `Survey Dataset ${index + 1}`,
    mode,
    status: raw.status === 'Archived' ? 'Archived' : 'Active',
    objective: typeof raw.objective === 'string' ? raw.objective : exp.objective,
    researcher:
      typeof raw.researcher === 'string' && raw.researcher
        ? raw.researcher
        : exp.researcher,
    provenance: raw.provenance ?? config.dataProvenance,
    scientificReviewStatus:
      raw.scientificReviewStatus ?? exp.scientificReviewStatus,
    isDemonstration: Boolean(raw.isDemonstration ?? exp.isDemonstration),
    supportSnapshot: raw.supportSnapshot ?? exp.batch.supportSnapshot ?? null,
    precursorSnapshot: raw.precursorSnapshot ?? exp.batch.precursorSnapshot ?? null,
    config,
    analysisConfig: {
      excludeFlaggedInStats: Boolean(raw.analysisConfig?.excludeFlaggedInStats),
      discrepancyTolerancePpm:
        typeof raw.analysisConfig?.discrepancyTolerancePpm === 'number' &&
        Number.isFinite(raw.analysisConfig.discrepancyTolerancePpm)
          ? raw.analysisConfig.discrepancyTolerancePpm
          : 0.05,
      pzcPlotView: raw.analysisConfig?.pzcPlotView ?? 'final_vs_initial',
    },
    referencePzcMarkers: Array.isArray(raw.referencePzcMarkers)
      ? raw.referencePzcMarkers
      : [],
    replicateGroupMeta: Array.isArray(raw.replicateGroupMeta)
      ? raw.replicateGroupMeta
      : [],
    measurements,
    figureConfig,
    savedFigures,
    annotations,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    createdAt: raw.createdAt ?? exp.createdAt,
    updatedAt: raw.updatedAt ?? exp.updatedAt,
  };
}

function migrateAnalyticalSession(
  raw: Partial<AnalyticalSession>,
  exp: Experiment,
  index: number
): AnalyticalSession {
  const sessionId =
    typeof raw.id === 'string' && raw.id
      ? raw.id
      : `as-${exp.uuid}-${index + 1}`;
  const sessionCode =
    typeof raw.sessionId === 'string' && raw.sessionId
      ? raw.sessionId
      : `ANA-${String(index + 1).padStart(2, '0')}`;

  const analytes: AnalyticalAnalyte[] = Array.isArray(raw.analytes)
    ? raw.analytes.map((a, idx) => ({
        id: typeof a.id === 'string' && a.id ? a.id : `an-${sessionId}-${idx + 1}`,
        name: typeof a.name === 'string' ? a.name : a.symbol || 'Unspecified',
        symbol: typeof a.symbol === 'string' ? a.symbol : '',
        wavelengthNm:
          typeof a.wavelengthNm === 'number' && Number.isFinite(a.wavelengthNm)
            ? a.wavelengthNm
            : null,
        measurementUnit:
          typeof a.measurementUnit === 'string' ? a.measurementUnit : 'ppm',
        methodReference:
          typeof a.methodReference === 'string' ? a.methodReference : '',
        calibrationDatasetId:
          typeof a.calibrationDatasetId === 'string'
            ? a.calibrationDatasetId
            : null,
        notes: typeof a.notes === 'string' ? a.notes : '',
      }))
    : [];

  const activeAnalyteId =
    raw.activeAnalyteId && analytes.some((a) => a.id === raw.activeAnalyteId)
      ? raw.activeAnalyteId
      : analytes[0]?.id ?? null;

  const calibrationDatasets: CalibrationDataset[] = Array.isArray(
    raw.calibrationDatasets
  )
    ? raw.calibrationDatasets.map((c, idx) => ({
        id:
          typeof c.id === 'string' && c.id
            ? c.id
            : `calds-${sessionId}-${idx + 1}`,
        calibrationId:
          typeof c.calibrationId === 'string' && c.calibrationId
            ? c.calibrationId
            : `CAL-DS-${String(idx + 1).padStart(2, '0')}`,
        title:
          typeof c.title === 'string' && c.title
            ? c.title
            : `Calibration Curve ${idx + 1}`,
        sessionId,
        analyteId:
          typeof c.analyteId === 'string' ? c.analyteId : activeAnalyteId,
        referenceMethod:
          typeof c.referenceMethod === 'string' ? c.referenceMethod : '',
        concUnit: typeof c.concUnit === 'string' ? c.concUnit : 'ppm',
        responseUnit: typeof c.responseUnit === 'string' ? c.responseUnit : 'cps',
        analyst:
          typeof c.analyst === 'string'
            ? c.analyst
            : raw.analyst ?? exp.researcher,
        analysisDate:
          typeof c.analysisDate === 'string'
            ? c.analysisDate
            : raw.analysisDate ?? exp.experimentDate,
        provenance: c.provenance ?? raw.provenance ?? 'user_entered',
        standards: Array.isArray(c.standards)
          ? c.standards.map((s) =>
              migrateCalibrationStandard(
                s as unknown as Partial<CalibrationStandard> & Record<string, unknown>,
                c.analyteId ?? activeAnalyteId
              )
            )
          : [],
        notes: typeof c.notes === 'string' ? c.notes : '',
        createdAt: c.createdAt ?? raw.createdAt ?? exp.createdAt,
        updatedAt: c.updatedAt ?? raw.updatedAt ?? exp.updatedAt,
      }))
    : [];

  const activeCalibrationDatasetId =
    raw.activeCalibrationDatasetId &&
    calibrationDatasets.some((c) => c.id === raw.activeCalibrationDatasetId)
      ? raw.activeCalibrationDatasetId
      : calibrationDatasets[0]?.id ?? null;

  const sampleMeasurements = Array.isArray(raw.sampleMeasurements)
    ? raw.sampleMeasurements.map((m) =>
        migrateInstrumentMeasurement(
          m as unknown as Partial<InstrumentMeasurement> & Record<string, unknown>,
          analytes[0]?.symbol || exp.analyticalConfig?.analyteElement || '',
          raw.analysisDate ?? exp.experimentDate,
          {
            sessionId,
            analyteId: activeAnalyteId,
            calibrationDatasetId: activeCalibrationDatasetId,
          }
        )
      )
    : [];

  const dilutionRecords: DilutionRecord[] = Array.isArray(raw.dilutionRecords)
    ? raw.dilutionRecords.map((d, idx) => ({
        id: typeof d.id === 'string' && d.id ? d.id : `dil-${sessionId}-${idx + 1}`,
        sampleMeasurementId:
          typeof d.sampleMeasurementId === 'string'
            ? d.sampleMeasurementId
            : null,
        sampleId: typeof d.sampleId === 'string' ? d.sampleId : '',
        stage: d.stage ?? 'Other',
        dilutionFactor:
          typeof d.dilutionFactor === 'number' && Number.isFinite(d.dilutionFactor)
            ? d.dilutionFactor
            : null,
        sourceVolumeMl:
          typeof d.sourceVolumeMl === 'number' && Number.isFinite(d.sourceVolumeMl)
            ? d.sourceVolumeMl
            : null,
        finalVolumeMl:
          typeof d.finalVolumeMl === 'number' && Number.isFinite(d.finalVolumeMl)
            ? d.finalVolumeMl
            : null,
        concUnit: typeof d.concUnit === 'string' ? d.concUnit : 'ppm',
        reportedValueBasis: d.reportedValueBasis ?? 'unspecified',
        preparationReference:
          typeof d.preparationReference === 'string'
            ? d.preparationReference
            : '',
        matrixDescription:
          typeof d.matrixDescription === 'string' ? d.matrixDescription : '',
        analyst: typeof d.analyst === 'string' ? d.analyst : raw.analyst ?? '',
        date: typeof d.date === 'string' ? d.date : raw.analysisDate ?? exp.experimentDate,
        verificationStatus: d.verificationStatus ?? 'unverified',
        provenance: d.provenance ?? raw.provenance ?? 'user_entered',
        notes: typeof d.notes === 'string' ? d.notes : '',
      }))
    : [];

  const figureConfig = migrateAnalyticalFigureConfig(
    raw.figureConfig,
    `${raw.title || sessionCode} — Exploratory Calibration Fit`
  );
  const savedFigures = Array.isArray(raw.savedFigures)
    ? raw.savedFigures.map((f) =>
        migrateAnalyticalFigureConfig(f, f.title || figureConfig.title)
      )
    : [];

  return {
    id: sessionId,
    sessionId: sessionCode,
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title
        : `${raw.technique ?? 'ICP-OES'} Analytical Session ${index + 1}`,
    experimentUuid: exp.uuid,
    status: raw.status === 'Archived' ? 'Archived' : 'Active',
    technique: raw.technique ?? exp.analyticalConfig?.instrumentType ?? 'ICP-OES',
    customTechniqueName:
      typeof raw.customTechniqueName === 'string'
        ? raw.customTechniqueName
        : '',
    instrumentManufacturer:
      typeof raw.instrumentManufacturer === 'string'
        ? raw.instrumentManufacturer
        : '',
    instrumentModel:
      typeof raw.instrumentModel === 'string'
        ? raw.instrumentModel
        : exp.analyticalConfig?.instrumentModel ?? '',
    instrumentIdentifier:
      typeof raw.instrumentIdentifier === 'string'
        ? raw.instrumentIdentifier
        : '',
    methodReference:
      typeof raw.methodReference === 'string' ? raw.methodReference : '',
    analyst:
      typeof raw.analyst === 'string'
        ? raw.analyst
        : exp.analyticalConfig?.analystName ?? exp.researcher,
    analysisDate:
      typeof raw.analysisDate === 'string'
        ? raw.analysisDate
        : exp.analyticalConfig?.analysisDate ?? exp.experimentDate,
    matrixDescription:
      typeof raw.matrixDescription === 'string'
        ? raw.matrixDescription
        : exp.analyticalConfig?.matrixDescription ?? '',
    conditionsNote:
      typeof raw.conditionsNote === 'string' ? raw.conditionsNote : '',
    analytes,
    activeAnalyteId,
    calibrationDatasets,
    activeCalibrationDatasetId,
    sampleMeasurements,
    dilutionRecords,
    importHistory: Array.isArray(raw.importHistory) ? raw.importHistory : [],
    reviewRecords: Array.isArray(raw.reviewRecords) ? raw.reviewRecords : [],
    figureConfig,
    savedFigures,
    observations:
      typeof raw.observations === 'string'
        ? raw.observations
        : exp.analyticalConfig?.notes ?? '',
    provenance:
      raw.provenance ?? exp.analyticalConfig?.dataProvenance ?? 'user_entered',
    scientificReviewStatus:
      raw.scientificReviewStatus ?? exp.scientificReviewStatus,
    isDemonstration: Boolean(raw.isDemonstration ?? exp.isDemonstration),
    notes: typeof raw.notes === 'string' ? raw.notes : exp.analyticalConfig?.notes ?? '',
    createdAt: raw.createdAt ?? exp.createdAt,
    updatedAt: raw.updatedAt ?? exp.updatedAt,
  };
}

function synthesizeAnalyticalSessionFromLegacy(exp: Experiment): AnalyticalSession {
  const cfg = exp.analyticalConfig;
  const sessionId = `as-mig-${exp.uuid}`;
  const analyteId = `an-mig-${exp.uuid}`;
  const calDatasetId = `calds-mig-${exp.uuid}`;

  const unit =
    (cfg?.calibrationUnits || 'ppm').replace(/^mg\/L\s*\(ppm\)$/i, 'ppm') || 'ppm';

  const analyte: AnalyticalAnalyte = {
    id: analyteId,
    name: cfg?.analyteElement?.trim() || 'Primary Analyte',
    symbol: cfg?.analyteElement?.trim() || '',
    wavelengthNm:
      typeof cfg?.wavelengthNm === 'number' && Number.isFinite(cfg.wavelengthNm)
        ? cfg.wavelengthNm
        : null,
    measurementUnit: unit,
    methodReference: '',
    calibrationDatasetId: calDatasetId,
    notes: 'Migrated from Phase 1–3 analytical configuration.',
  };

  const standards = (exp.calibrationStandards ?? []).map((std) =>
    migrateCalibrationStandard(
      std as unknown as Partial<CalibrationStandard> & Record<string, unknown>,
      analyteId
    )
  );

  const calDataset: CalibrationDataset = {
    id: calDatasetId,
    calibrationId: 'CAL-DS-01',
    title: `${analyte.symbol || analyte.name} Primary Calibration Series`,
    sessionId,
    analyteId,
    referenceMethod: '',
    concUnit: standards[0]?.unit || unit,
    responseUnit: standards[0]?.responseUnit || 'cps',
    analyst: cfg?.analystName || exp.researcher,
    analysisDate: cfg?.analysisDate || exp.experimentDate,
    provenance: cfg?.dataProvenance ?? 'user_entered',
    standards,
    notes: 'Migrated from legacy calibration standards.',
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
  };

  const samples = (exp.instrumentMeasurements ?? []).map((m) =>
    migrateInstrumentMeasurement(
      m as unknown as Partial<InstrumentMeasurement> & Record<string, unknown>,
      cfg?.analyteElement ?? '',
      cfg?.analysisDate ?? exp.experimentDate,
      {
        sessionId,
        analyteId,
        calibrationDatasetId: calDatasetId,
      }
    )
  );

  // Build dilution records from existing sample dilution factors if recorded
  const dilutionRecords: DilutionRecord[] = samples
    .filter((m) => m.dilutionFactor !== null)
    .map((m) => ({
      id: `dil-mig-${m.id}`,
      sampleMeasurementId: m.id,
      sampleId: m.sampleId,
      stage:
        m.stage === 'Initial' || m.stage === 'Final' ? m.stage : 'Other',
      dilutionFactor: m.dilutionFactor,
      sourceVolumeMl: null,
      finalVolumeMl: null,
      concUnit: m.concUnit || 'ppm',
      reportedValueBasis: m.reportedValueBasis ?? 'as_measured_diluted',
      preparationReference: '',
      matrixDescription: cfg?.matrixDescription || '',
      analyst: cfg?.analystName || exp.researcher,
      date: m.measurementDate || exp.experimentDate,
      verificationStatus: exp.isDemonstration ? 'synthetic_fixture' : 'unverified',
      provenance: m.provenance,
      notes: 'Migrated dilution factor from Phase 1–3 instrument sample record.',
    }));

  return {
    id: sessionId,
    sessionId: 'ANA-01',
    title: `${cfg?.instrumentType || 'ICP-OES'} Analytical Session — ${analyte.symbol || exp.experimentId}`,
    experimentUuid: exp.uuid,
    status: 'Active',
    technique: cfg?.instrumentType ?? 'ICP-OES',
    customTechniqueName: '',
    instrumentManufacturer: '',
    instrumentModel: cfg?.instrumentModel ?? '',
    instrumentIdentifier: '',
    methodReference: '',
    analyst: cfg?.analystName ?? exp.researcher,
    analysisDate: cfg?.analysisDate ?? exp.experimentDate,
    matrixDescription: cfg?.matrixDescription ?? '',
    conditionsNote: '',
    analytes: [analyte],
    activeAnalyteId: analyteId,
    calibrationDatasets: [calDataset],
    activeCalibrationDatasetId: calDatasetId,
    sampleMeasurements: samples,
    dilutionRecords,
    importHistory: [],
    reviewRecords: [],
    figureConfig: createDefaultAnalyticalFigureConfig(
      'calibration_regression',
      `${analyte.symbol || 'Analyte'} Calibration — Exploratory Linear Regression`,
      `ana-fig-${exp.uuid}`
    ),
    savedFigures: [],
    observations: cfg?.notes ?? '',
    provenance: cfg?.dataProvenance ?? 'user_entered',
    scientificReviewStatus: exp.scientificReviewStatus,
    isDemonstration: exp.isDemonstration,
    notes: cfg?.notes ?? '',
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
  };
}

function migrateExperiment(exp: Experiment): Experiment {
  const legacySurveyConfig: SurveyConfiguration = {
    ...exp.surveyConfig,
    chartDisplayMode: exp.surveyConfig.chartDisplayMode ?? 'individual',
    errorBarMode: exp.surveyConfig.errorBarMode ?? 'none',
  };

  const legacyMeasurements = (exp.surveyMeasurements ?? []).map((row) =>
    migrateSurveyMeasurement(
      row as unknown as Partial<SurveyMeasurement> & Record<string, unknown>,
      exp.experimentDate
    )
  );

  const supportSnapshot = exp.batch.supportSnapshot
    ? {
        ...exp.batch.supportSnapshot,
        supportData: exp.batch.supportSnapshot.supportData
          ? migrateSupport(exp.batch.supportSnapshot.supportData)
          : undefined,
      }
    : null;

  const precursorSnapshot = exp.batch.precursorSnapshot
    ? {
        ...exp.batch.precursorSnapshot,
        precursorData: exp.batch.precursorSnapshot.precursorData
          ? migratePrecursor(exp.batch.precursorSnapshot.precursorData)
          : undefined,
      }
    : null;

  const expWithSnapshots: Experiment = {
    ...exp,
    batch: {
      ...exp.batch,
      supportSnapshot,
      precursorSnapshot,
    },
    surveyConfig: legacySurveyConfig,
    surveyMeasurements: legacyMeasurements,
  };

  // Migrate or synthesize Phase 3 `surveyDatasets[]`
  let surveyDatasets: SurveyDataset[];
  if (Array.isArray(exp.surveyDatasets) && exp.surveyDatasets.length > 0) {
    surveyDatasets = exp.surveyDatasets.map((ds, idx) =>
      migrateSurveyDataset(ds, expWithSnapshots, idx)
    );
  } else {
    const defaultId = `ds-mig-${exp.uuid}`;
    const defaultFig = createDefaultFigureConfig(
      legacySurveyConfig.mode,
      legacySurveyConfig.chartTitle
    );
    defaultFig.displayMode = legacySurveyConfig.chartDisplayMode;
    defaultFig.errorBarMode = legacySurveyConfig.errorBarMode;

    surveyDatasets = [
      {
        id: defaultId,
        datasetId: legacySurveyConfig.mode === 'pzc' ? 'DS-PZC-01' : 'DS-UPT-01',
        title:
          legacySurveyConfig.chartTitle ||
          `${exp.title} — Primary Survey Series`,
        mode: legacySurveyConfig.mode,
        status: 'Active',
        objective: exp.objective,
        researcher: exp.researcher,
        provenance: legacySurveyConfig.dataProvenance,
        scientificReviewStatus: exp.scientificReviewStatus,
        isDemonstration: exp.isDemonstration,
        supportSnapshot,
        precursorSnapshot,
        config: legacySurveyConfig,
        analysisConfig: {
          excludeFlaggedInStats: false,
          discrepancyTolerancePpm: 0.05,
          pzcPlotView: 'final_vs_initial',
        },
        referencePzcMarkers:
          supportSnapshot?.supportData?.pzc.value != null
            ? [
                {
                  id: `pzc-ref-${exp.uuid}`,
                  label: `${supportSnapshot.supportData.name} Snapshot PZC`,
                  valuePh: supportSnapshot.supportData.pzc.value,
                  sourceType: 'support_snapshot',
                  conditions:
                    supportSnapshot.supportData.pzc.conditions ||
                    'Material snapshot reference',
                  notes: supportSnapshot.supportData.pzc.notes || '',
                },
              ]
            : [],
        replicateGroupMeta: [],
        measurements: legacyMeasurements,
        figureConfig: defaultFig,
        savedFigures: [],
        annotations: [],
        notes: '',
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt,
      },
    ];
  }

  const activeSurveyDatasetId =
    exp.activeSurveyDatasetId &&
    surveyDatasets.some((d) => d.id === exp.activeSurveyDatasetId)
      ? exp.activeSurveyDatasetId
      : surveyDatasets[0]?.id ?? null;

  const activeDs =
    surveyDatasets.find((d) => d.id === activeSurveyDatasetId) ??
    surveyDatasets[0];

  const datasetComparison: DatasetComparisonConfig = exp.datasetComparison ?? {
    selectedRefs: surveyDatasets.slice(0, 2).map((d) => ({
      experimentUuid: exp.uuid,
      datasetId: d.id,
    })),
    comparePlotMode:
      activeDs?.mode === 'pzc' ? 'phf_vs_phi' : 'uptake_vs_phf',
    showGroupMeans: true,
    errorBarMode: 'sd',
  };

  // Migrate or synthesize Phase 4 `analyticalSessions[]`
  let analyticalSessions: AnalyticalSession[];
  if (
    Array.isArray(exp.analyticalSessions) &&
    exp.analyticalSessions.length > 0
  ) {
    analyticalSessions = exp.analyticalSessions.map((s, idx) =>
      migrateAnalyticalSession(s, expWithSnapshots, idx)
    );
  } else {
    analyticalSessions = [synthesizeAnalyticalSessionFromLegacy(expWithSnapshots)];
  }

  const activeAnalyticalSessionId =
    exp.activeAnalyticalSessionId &&
    analyticalSessions.some((s) => s.id === exp.activeAnalyticalSessionId)
      ? exp.activeAnalyticalSessionId
      : analyticalSessions[0]?.id ?? null;

  const analyticalComparison: AnalyticalComparisonConfig =
    exp.analyticalComparison ?? {
      selectedSessionIds: analyticalSessions.slice(0, 2).map((s) => s.id),
      compareAnalyteSymbol:
        analyticalSessions[0]?.analytes[0]?.symbol || '',
      plotMode: 'concentration_comparison',
    };

  const reportConfig: ReportConfiguration = {
    ...exp.reportConfig,
    reportType:
      exp.reportConfig.reportType ??
      (exp.reportConfig.mode === 'pre-experiment'
        ? 'research-planning'
        : 'complete-research'),
    reportTitle: exp.reportConfig.reportTitle ?? '',
    reportSubtitle: exp.reportConfig.reportSubtitle ?? '',
    researcherName: exp.reportConfig.researcherName ?? exp.researcher,
    reportDate: exp.reportConfig.reportDate ?? exp.experimentDate,
    includeCoverPage: exp.reportConfig.includeCoverPage ?? false,
    includePageNumbers: exp.reportConfig.includePageNumbers ?? true,
    sectionOrder:
      Array.isArray(exp.reportConfig.sectionOrder) &&
      exp.reportConfig.sectionOrder.length > 0
        ? exp.reportConfig.sectionOrder
        : [...DEFAULT_REPORT_SECTION_ORDER],
    includePlannedVsActual: exp.reportConfig.includePlannedVsActual ?? true,
    includeResearchTimeline: exp.reportConfig.includeResearchTimeline ?? true,
    includeSampleRegistry: exp.reportConfig.includeSampleRegistry ?? true,
    includeSnapshotMetadata: exp.reportConfig.includeSnapshotMetadata ?? true,
    researcherConclusions: exp.reportConfig.researcherConclusions ?? '',
    includeSurveyOverview: exp.reportConfig.includeSurveyOverview ?? true,
    includeStatisticalSummaries:
      exp.reportConfig.includeStatisticalSummaries ?? true,
    includeComparativeSummary:
      exp.reportConfig.includeComparativeSummary ?? true,
    includeRegressionSummary: exp.reportConfig.includeRegressionSummary ?? true,
    includeAnalyticalOverview:
      exp.reportConfig.includeAnalyticalOverview ?? true,
    includeCalibrationRecords:
      exp.reportConfig.includeCalibrationRecords ?? true,
    includeAnalyticalFigures:
      exp.reportConfig.includeAnalyticalFigures ?? true,
    includeDilutionRecords: exp.reportConfig.includeDilutionRecords ?? true,
    includeAnalyticalQualityReview:
      exp.reportConfig.includeAnalyticalQualityReview ?? true,
    includeSurveyAnalyticalLinks:
      exp.reportConfig.includeSurveyAnalyticalLinks ?? true,
    includeCrossExperimentSummary:
      exp.reportConfig.includeCrossExperimentSummary ?? true,
    includeResearchMatrix: exp.reportConfig.includeResearchMatrix ?? true,
    includeAdvancedStatistics:
      exp.reportConfig.includeAdvancedStatistics ?? true,
    includeMeasurementUncertainty:
      exp.reportConfig.includeMeasurementUncertainty ?? true,
    includeCompatibilityLimitations:
      exp.reportConfig.includeCompatibilityLimitations ?? true,
    includeAnalysisAssumptions:
      exp.reportConfig.includeAnalysisAssumptions ?? true,
    includeDataQualityLimitations:
      exp.reportConfig.includeDataQualityLimitations ?? true,
    includeResearchInterpretations:
      exp.reportConfig.includeResearchInterpretations ?? true,
    includeScientificReferences:
      exp.reportConfig.includeScientificReferences ?? true,
    selectedSurveyDatasetIds: Array.isArray(
      exp.reportConfig.selectedSurveyDatasetIds
    )
      ? exp.reportConfig.selectedSurveyDatasetIds
      : [],
    selectedFigureIds: Array.isArray(exp.reportConfig.selectedFigureIds)
      ? exp.reportConfig.selectedFigureIds
      : [],
    selectedAnalyticalSessionIds: Array.isArray(
      exp.reportConfig.selectedAnalyticalSessionIds
    )
      ? exp.reportConfig.selectedAnalyticalSessionIds
      : [],
    selectedAnalyticalFigureIds: Array.isArray(
      exp.reportConfig.selectedAnalyticalFigureIds
    )
      ? exp.reportConfig.selectedAnalyticalFigureIds
      : [],
  };

  // Phase 5: Migrate benchChecklist -> structured milestones[] if missing
  const milestones: ResearchMilestone[] =
    Array.isArray(exp.milestones) && exp.milestones.length > 0
      ? exp.milestones
      : (exp.benchChecklist ?? []).map((item, idx) => ({
          id: item.id,
          title: item.label,
          description: '',
          plannedDateTime: item.plannedTime,
          actualCompletedAt: item.actualCompletedAt,
          status: item.completed ? 'completed' : 'pending',
          linkedModule: null,
          linkedRecordId: null,
          linkedRecordLabel: '',
          notes: item.notes,
          deviations: '',
          order: idx,
        }));

  // Phase 5: Preserve lifecycle history or initialize initial status entry
  const lifecycleHistory: ExperimentLifecycleEvent[] =
    Array.isArray(exp.lifecycleHistory) && exp.lifecycleHistory.length > 0
      ? exp.lifecycleHistory
      : [
          {
            id: `lc-init-${exp.uuid}`,
            fromStatus: null,
            toStatus: exp.status,
            timestamp: exp.createdAt,
            researcher: exp.researcher || 'Researcher',
            explanation: 'Initial experiment lifecycle status recorded.',
            snapshotId: null,
          },
        ];

  const researchPlan: ResearchPlanMetadata = exp.researchPlan
    ? {
        ...createDefaultResearchPlan(),
        ...exp.researchPlan,
        researchQuestions: Array.isArray(exp.researchPlan.researchQuestions)
          ? exp.researchPlan.researchQuestions
          : [],
        plannedSampleIds: Array.isArray(exp.researchPlan.plannedSampleIds)
          ? exp.researchPlan.plannedSampleIds
          : [],
        externalProtocolRefs: Array.isArray(exp.researchPlan.externalProtocolRefs)
          ? exp.researchPlan.externalProtocolRefs
          : [],
        deviations: Array.isArray(exp.researchPlan.deviations)
          ? exp.researchPlan.deviations
          : [],
      }
    : createDefaultResearchPlan();

  const timers: ResearchTimer[] = Array.isArray(exp.timers) ? exp.timers : [];

  const migratedExp: Experiment = {
    ...expWithSnapshots,
    dataVersion: EXPERIMENT_DATA_VERSION,
    researchPlan,
    lifecycleHistory,
    surveyDatasets,
    activeSurveyDatasetId,
    datasetComparison,
    analyticalSessions,
    activeAnalyticalSessionId,
    analyticalComparison,
    milestones,
    benchTimer: migrateBenchTimer(
      (exp.benchTimer ?? {}) as unknown as Partial<BenchTimerState> &
        Record<string, unknown>
    ),
    timers,
    sampleRegistryNotes: Array.isArray(exp.sampleRegistryNotes)
      ? exp.sampleRegistryNotes
      : [],
    activityEvents: Array.isArray(exp.activityEvents) ? exp.activityEvents : [],
    snapshots: Array.isArray(exp.snapshots) ? exp.snapshots : [],
    finalizedReports: Array.isArray(exp.finalizedReports)
      ? exp.finalizedReports
      : [],
    uncertaintyRecords: Array.isArray(exp.uncertaintyRecords)
      ? exp.uncertaintyRecords
      : [],
    reportConfig,
  };

  return projectExperimentCompatibilityMirrors(migratedExp);
}

export function migrateWorkspaceToCurrentSchema(raw: unknown): MigrationResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      migrated: false,
      fromVersion: null,
      toVersion: WORKSPACE_SCHEMA_VERSION,
      data: null,
      notes: [],
      errors: ['Workspace payload must be a JSON object.'],
    };
  }

  const version = typeof raw.schemaVersion === 'string' ? raw.schemaVersion : null;
  if (!version) {
    return {
      ok: false,
      migrated: false,
      fromVersion: null,
      toVersion: WORKSPACE_SCHEMA_VERSION,
      data: null,
      notes: [],
      errors: ['Missing schemaVersion field.'],
    };
  }

  const major = version.split('.')[0];
  if (
    major !== '1' &&
    major !== '2' &&
    major !== '3' &&
    major !== '4' &&
    major !== '5' &&
    major !== '6'
  ) {
    return {
      ok: false,
      migrated: false,
      fromVersion: version,
      toVersion: WORKSPACE_SCHEMA_VERSION,
      data: null,
      notes: [],
      errors: [
        `Incompatible major schema version "${version}" (supported: 1.x–5.x or ${WORKSPACE_SCHEMA_VERSION}).`,
      ],
    };
  }

  const workspace = raw as unknown as WorkspaceStateData;
  const migratedFromOlder =
    major === '1' ||
    major === '2' ||
    major === '3' ||
    major === '4' ||
    major === '5';

  const importMappingTemplates: ImportMappingTemplate[] =
    Array.isArray(workspace.importMappingTemplates) &&
    workspace.importMappingTemplates.length > 0
      ? workspace.importMappingTemplates
      : createDefaultImportMappingTemplates();

  const experimentTemplates: ExperimentTemplate[] = Array.isArray(
    workspace.experimentTemplates
  )
    ? workspace.experimentTemplates
    : [];

  const upgraded: WorkspaceStateData = {
    ...workspace,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    precursors: (workspace.precursors ?? []).map(migratePrecursor),
    supports: (workspace.supports ?? []).map(migrateSupport),
    experiments: (workspace.experiments ?? []).map(migrateExperiment),
    importMappingTemplates,
    experimentTemplates,
    researchComparisonConfigs: Array.isArray(workspace.researchComparisonConfigs)
      ? workspace.researchComparisonConfigs
      : [],
    researchMatrixConfigs: Array.isArray(workspace.researchMatrixConfigs)
      ? workspace.researchMatrixConfigs
      : [],
    researchAnalysisSnapshots: Array.isArray(workspace.researchAnalysisSnapshots)
      ? workspace.researchAnalysisSnapshots
      : [],
  };

  return {
    ok: true,
    migrated: migratedFromOlder,
    fromVersion: version,
    toVersion: WORKSPACE_SCHEMA_VERSION,
    data: upgraded,
    notes: migratedFromOlder
      ? [
          `Migrated workspace schema (${version}) to Phase 6 (${WORKSPACE_SCHEMA_VERSION}) while preserving all experiments, survey datasets, analytical sessions, measurement qualifiers, UUIDs, links, snapshots, timers, uncertainty records, and null values.`,
        ]
      : [],
    errors: [],
  };
}

/**
 * Deterministic Workspace Schema Migration Layer (v1.0.0 / v2.0.0 -> Phase 3 v3.0.0)
 *
 * Design guarantees:
 * - Never deletes or resets existing user experiments, snapshots, measurements,
 *   observations, bench logs, or report configurations.
 * - Preserves `null` values strictly (never replaces missing values with 0).
 * - Migrates Phase 1 & Phase 2 single-survey experiments into Phase 3 `surveyDatasets[]`
 *   while keeping `surveyConfig` and `surveyMeasurements` synchronized with the active dataset.
 * - Rejects malformed or unsupported major versions rather than silently fabricating data.
 */

import {
  APP_VERSION,
  BenchTimerState,
  CalibrationStandard,
  DatasetComparisonConfig,
  EXPERIMENT_DATA_VERSION,
  Experiment,
  FigureConfiguration,
  InstrumentMeasurement,
  Precursor,
  ReportConfiguration,
  ResearchAnnotation,
  ScientificReference,
  Support,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import { createDefaultFigureConfig } from '../../domain/calculations/surveyAnalysis';

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
  std: Partial<CalibrationStandard> & Record<string, unknown>
): CalibrationStandard {
  return {
    id: String(std.id ?? `cal-mig-${Math.random().toString(36).slice(2, 8)}`),
    standardId: typeof std.standardId === 'string' ? std.standardId : '',
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
    notes: typeof std.notes === 'string' ? std.notes : '',
  };
}

function migrateInstrumentMeasurement(
  m: Partial<InstrumentMeasurement> & Record<string, unknown>,
  defaultAnalyte: string,
  defaultDate: string
): InstrumentMeasurement {
  return {
    id: String(m.id ?? `im-mig-${Math.random().toString(36).slice(2, 8)}`),
    sampleId: typeof m.sampleId === 'string' ? m.sampleId : '',
    linkedSurveySampleId:
      typeof m.linkedSurveySampleId === 'string' ? m.linkedSurveySampleId : '',
    analyte: typeof m.analyte === 'string' ? m.analyte : defaultAnalyte,
    stage: m.stage ?? 'Initial',
    replicateId: typeof m.replicateId === 'string' ? m.replicateId : 'R1',
    dilutionFactor:
      typeof m.dilutionFactor === 'number' && Number.isFinite(m.dilutionFactor)
        ? m.dilutionFactor
        : null,
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
    dataProvenance: raw.config?.dataProvenance ?? exp.surveyConfig?.dataProvenance ?? 'user_entered',
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
        referencePzcMarkers: supportSnapshot?.supportData?.pzc.value != null
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

  const reportConfig: ReportConfiguration = {
    ...exp.reportConfig,
    includeSurveyOverview: exp.reportConfig.includeSurveyOverview ?? true,
    includeStatisticalSummaries:
      exp.reportConfig.includeStatisticalSummaries ?? true,
    includeComparativeSummary:
      exp.reportConfig.includeComparativeSummary ?? true,
    includeRegressionSummary: exp.reportConfig.includeRegressionSummary ?? true,
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
  };

  return {
    ...expWithSnapshots,
    dataVersion: EXPERIMENT_DATA_VERSION,
    surveyConfig: activeDs ? activeDs.config : legacySurveyConfig,
    surveyMeasurements: activeDs ? activeDs.measurements : legacyMeasurements,
    surveyDatasets,
    activeSurveyDatasetId,
    datasetComparison,
    calibrationStandards: (exp.calibrationStandards ?? []).map((std) =>
      migrateCalibrationStandard(
        std as unknown as Partial<CalibrationStandard> & Record<string, unknown>
      )
    ),
    instrumentMeasurements: (exp.instrumentMeasurements ?? []).map((m) =>
      migrateInstrumentMeasurement(
        m as unknown as Partial<InstrumentMeasurement> & Record<string, unknown>,
        exp.analyticalConfig?.analyteElement ?? '',
        exp.analyticalConfig?.analysisDate ?? exp.experimentDate
      )
    ),
    benchTimer: migrateBenchTimer(
      (exp.benchTimer ?? {}) as unknown as Partial<BenchTimerState> &
        Record<string, unknown>
    ),
    reportConfig,
  };
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
  if (major !== '1' && major !== '2' && major !== '3') {
    return {
      ok: false,
      migrated: false,
      fromVersion: version,
      toVersion: WORKSPACE_SCHEMA_VERSION,
      data: null,
      notes: [],
      errors: [
        `Incompatible major schema version "${version}" (supported: 1.x, 2.x, or ${WORKSPACE_SCHEMA_VERSION}).`,
      ],
    };
  }

  const workspace = raw as unknown as WorkspaceStateData;
  const migratedFromOlder = major === '1' || major === '2';

  const upgraded: WorkspaceStateData = {
    ...workspace,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    precursors: (workspace.precursors ?? []).map(migratePrecursor),
    supports: (workspace.supports ?? []).map(migrateSupport),
    experiments: (workspace.experiments ?? []).map(migrateExperiment),
  };

  return {
    ok: true,
    migrated: migratedFromOlder,
    fromVersion: version,
    toVersion: WORKSPACE_SCHEMA_VERSION,
    data: upgraded,
    notes: migratedFromOlder
      ? [
          `Migrated workspace schema (${version}) to Phase 3 (${WORKSPACE_SCHEMA_VERSION}) while preserving all experiments, measurement UUIDs, analytical links, snapshots, and null values.`,
        ]
      : [],
    errors: [],
  };
}

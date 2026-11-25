import {
  APP_VERSION,
  CALC_ENGINE_VERSION,
  EXPERIMENT_DATA_VERSION,
  Experiment,
  ExperimentTemplate,
  ExperimentType,
  FigureConfiguration,
  FinalizedReport,
  MaterialSnapshot,
  MeasurementUncertaintyRecord,
  Precursor,
  ResearchAnalysisSnapshot,
  ResearchAnnotation,
  ResearchComparisonConfiguration,
  ResearchMatrixConfiguration,
  ResearchMilestone,
  ResearchProject,
  ResearchTimer,
  Support,
  SurveyDataset,
  SurveyMeasurement,
  SurveyMode,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import {
  DEFAULT_RESEARCH_MATRIX_COLUMNS,
  createDefaultResearchScopeFilter,
} from '../../domain/calculations/researchAnalytics';
import { createDefaultFigureConfig } from '../../domain/calculations/surveyAnalysis';
import {
  DEFAULT_REPORT_SECTION_ORDER,
  buildAnalyticalAnalysisProvenance,
  buildSurveyAnalysisProvenance,
  captureCrossExperimentSnapshotsForReport,
  createDefaultResearchPlan,
  createExperimentSnapshotRecord,
} from '../../domain/calculations/workflowEngine';
import { projectExperimentCompatibilityMirrors } from '../../domain/models/projections';
import {
  buildDemoExperimentAnalyticalSessions,
  createBlankAnalyticalSession,
  createDefaultImportMappingTemplates,
  createSyntheticAnalyticalSession,
  duplicateAnalyticalSessionRecord,
  generateUniqueSessionId,
} from './analyticalFixtures';

export {
  createBlankAnalyticalSession,
  createSyntheticAnalyticalSession,
  duplicateAnalyticalSessionRecord,
  generateUniqueSessionId,
};

export function generateUuid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${rand}`;
}

export function generateUniqueExperimentId(
  existingExperiments: Experiment[],
  prefix = 'SEA'
): string {
  const year = new Date().getFullYear();
  const existing = new Set(
    existingExperiments.map((e) => e.experimentId.trim().toLowerCase())
  );
  let seq = existingExperiments.length + 1;
  while (seq < 10000) {
    const candidate = `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
    seq += 1;
  }
  return `${prefix}-${year}-${Date.now().toString().slice(-5)}`;
}

export function generateUniqueDatasetId(
  existingDatasets: SurveyDataset[],
  mode: SurveyMode
): string {
  const prefix = mode === 'pzc' ? 'DS-PZC' : 'DS-UPT';
  const existing = new Set(
    existingDatasets.map((d) => d.datasetId.trim().toLowerCase())
  );
  let seq = existingDatasets.length + 1;
  while (seq < 1000) {
    const candidate = `${prefix}-${String(seq).padStart(2, '0')}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
    seq += 1;
  }
  return `${prefix}-${Date.now().toString().slice(-4)}`;
}

export function createPrecursorSnapshot(precursor: Precursor): MaterialSnapshot {
  return {
    snapshotId: generateUuid('snap-prec'),
    capturedAt: new Date().toISOString(),
    sourceMaterialId: precursor.id,
    materialKind: 'precursor',
    sourceUpdatedAt: precursor.updatedAt,
    precursorData: structuredClone(precursor),
  };
}

export function createSupportSnapshot(support: Support): MaterialSnapshot {
  return {
    snapshotId: generateUuid('snap-supp'),
    capturedAt: new Date().toISOString(),
    sourceMaterialId: support.id,
    materialKind: 'support',
    sourceUpdatedAt: support.updatedAt,
    supportData: structuredClone(support),
  };
}

export function createBlankSurveyDataset(params: {
  datasetId: string;
  title: string;
  mode: SurveyMode;
  researcher: string;
  objective?: string;
  supportSnapshot?: MaterialSnapshot | null;
  precursorSnapshot?: MaterialSnapshot | null;
}): SurveyDataset {
  const now = new Date().toISOString();
  const id = generateUuid('ds');
  const title =
    params.title.trim() ||
    (params.mode === 'pzc'
      ? 'pH Shift Survey Dataset'
      : 'Metal Uptake Survey Dataset');

  const figureConfig = createDefaultFigureConfig(
    params.mode,
    title,
    generateUuid('fig')
  );

  const supportPzc = params.supportSnapshot?.supportData?.pzc.value ?? null;

  return {
    id,
    datasetId: params.datasetId.trim(),
    title,
    mode: params.mode,
    status: 'Active',
    objective: params.objective?.trim() ?? '',
    researcher: params.researcher.trim(),
    provenance: 'user_entered',
    scientificReviewStatus: 'Unreviewed',
    isDemonstration: false,
    supportSnapshot: params.supportSnapshot
      ? structuredClone(params.supportSnapshot)
      : null,
    precursorSnapshot: params.precursorSnapshot
      ? structuredClone(params.precursorSnapshot)
      : null,
    config: {
      mode: params.mode,
      targetSurfaceLoadingM2L: null,
      equilibrationTimeMin: null,
      temperatureC: null,
      backgroundElectrolyte: '',
      phAdjustmentReagentsNote: '',
      dataProvenance: 'user_entered',
      chartTitle: title,
      showSyntheticNotice: false,
      chartDisplayMode: 'both',
      errorBarMode: 'sd',
    },
    analysisConfig: {
      excludeFlaggedInStats: false,
      discrepancyTolerancePpm: 0.05,
      pzcPlotView: 'final_vs_initial',
    },
    referencePzcMarkers:
      supportPzc !== null
        ? [
            {
              id: generateUuid('pzc-ref'),
              label: `${params.supportSnapshot?.supportData?.name ?? 'Support'} Snapshot PZC`,
              valuePh: supportPzc,
              sourceType: 'support_snapshot',
              conditions:
                params.supportSnapshot?.supportData?.pzc.conditions ||
                'Material snapshot reference',
              notes: params.supportSnapshot?.supportData?.pzc.notes || '',
            },
          ]
        : [],
    replicateGroupMeta: [],
    measurements: [],
    figureConfig,
    savedFigures: [],
    annotations: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateSurveyDatasetRecord(
  source: SurveyDataset,
  existingDatasets: SurveyDataset[],
  analyticalIdMap?: Map<string, string>
): SurveyDataset {
  const clone = structuredClone(source);
  const now = new Date().toISOString();
  const newDatasetId = generateUniqueDatasetId(existingDatasets, source.mode);
  const newId = generateUuid('ds');

  const rowIdMap = new Map<string, string>();
  clone.measurements = clone.measurements.map((row) => {
    const nextRowId = generateUuid('sm');
    rowIdMap.set(row.id, nextRowId);
    return {
      ...row,
      id: nextRowId,
      linkedInitialMeasurementId: row.linkedInitialMeasurementId
        ? analyticalIdMap
          ? analyticalIdMap.get(row.linkedInitialMeasurementId) ?? null
          : row.linkedInitialMeasurementId
        : null,
      linkedFinalMeasurementId: row.linkedFinalMeasurementId
        ? analyticalIdMap
          ? analyticalIdMap.get(row.linkedFinalMeasurementId) ?? null
          : row.linkedFinalMeasurementId
        : null,
    };
  });

  const figIdMap = new Map<string, string>();
  clone.figureConfig = {
    ...clone.figureConfig,
    id: generateUuid('fig'),
    savedAt: now,
  };
  clone.savedFigures = clone.savedFigures.map((fig) => {
    const nextFigId = generateUuid('fig');
    figIdMap.set(fig.id, nextFigId);
    return { ...fig, id: nextFigId };
  });

  clone.referencePzcMarkers = clone.referencePzcMarkers.map((m) => ({
    ...m,
    id: generateUuid('pzc-ref'),
  }));

  clone.annotations = clone.annotations.map((ann) => ({
    ...ann,
    id: generateUuid('ann'),
    linkedDatasetId: newId,
    linkedMeasurementIds: ann.linkedMeasurementIds
      .map((oldId) => rowIdMap.get(oldId))
      .filter((v): v is string => Boolean(v)),
    linkedFigureId: ann.linkedFigureId
      ? figIdMap.get(ann.linkedFigureId) ?? null
      : null,
    createdAt: now,
    updatedAt: now,
  }));

  clone.id = newId;
  clone.datasetId = newDatasetId;
  clone.title = `${source.title} (Copy)`;
  clone.status = 'Active';
  clone.isDemonstration = false;
  clone.scientificReviewStatus = 'Unreviewed';
  clone.createdAt = now;
  clone.updatedAt = now;

  return clone;
}

export function createSyntheticDemoDataset(
  mode: SurveyMode,
  existingDatasets: SurveyDataset[],
  supportSnapshot: MaterialSnapshot | null,
  precursorSnapshot: MaterialSnapshot | null,
  researcher: string
): SurveyDataset {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const dsId = generateUniqueDatasetId(existingDatasets, mode);
  const id = generateUuid('ds');

  if (mode === 'pzc') {
    const rows: SurveyMeasurement[] = [
      {
        id: generateUuid('sm'),
        sampleId: 'PZC-01',
        sampleGroupId: 'PZC-G02',
        replicateId: 'R1',
        targetInitialPh: 2.0,
        measuredInitialPh: 2.04,
        measuredFinalPh: 2.38,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 250.0,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: today,
        notes: 'Acidic branch synthetic point.',
      },
      {
        id: generateUuid('sm'),
        sampleId: 'PZC-02',
        sampleGroupId: 'PZC-G04',
        replicateId: 'R1',
        targetInitialPh: 4.0,
        measuredInitialPh: 4.02,
        measuredFinalPh: 3.86,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 250.2,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: today,
        notes: 'Near reference PZC synthetic fixture.',
      },
      {
        id: generateUuid('sm'),
        sampleId: 'PZC-02B',
        sampleGroupId: 'PZC-G04',
        replicateId: 'R2',
        targetInitialPh: 4.0,
        measuredInitialPh: 4.05,
        measuredFinalPh: 3.92,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 249.8,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: today,
        notes: 'Duplicate replicate R2 (synthetic).',
      },
      {
        id: generateUuid('sm'),
        sampleId: 'PZC-03',
        sampleGroupId: 'PZC-G07',
        replicateId: 'R1',
        targetInitialPh: 7.0,
        measuredInitialPh: 7.01,
        measuredFinalPh: 4.48,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 250.1,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: today,
        notes: 'Buffering region synthetic point.',
      },
      {
        id: generateUuid('sm'),
        sampleId: 'PZC-04',
        sampleGroupId: 'PZC-G10',
        replicateId: 'R1',
        targetInitialPh: 10.0,
        measuredInitialPh: 10.04,
        measuredFinalPh: 6.15,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 250.4,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'flagged',
        exclusionReason: 'Mild electrode drift noted during synthetic test.',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: today,
        notes: 'Flagged synthetic observation.',
      },
    ];

    return {
      id,
      datasetId: dsId,
      title: 'Synthetic PZC / pH-Shift Demonstration Series',
      mode: 'pzc',
      status: 'Active',
      objective:
        'Illustrative synthetic pH-shift dataset for verifying Final vs. Initial pH and ΔpH exploratory plots.',
      researcher: researcher || 'Demo Researcher',
      provenance: 'synthetic_demo',
      scientificReviewStatus: 'Demonstration Fixture',
      isDemonstration: true,
      supportSnapshot: supportSnapshot ? structuredClone(supportSnapshot) : null,
      precursorSnapshot: null,
      config: {
        mode: 'pzc',
        targetSurfaceLoadingM2L: 1500,
        equilibrationTimeMin: 60,
        temperatureC: 22.0,
        backgroundElectrolyte: '0.01 M NaNO3 (synthetic fixture)',
        phAdjustmentReagentsNote: 'Demo metadata note only.',
        dataProvenance: 'synthetic_demo',
        chartTitle: 'Synthetic pH-Shift Demonstration (pHf vs. pHi)',
        showSyntheticNotice: true,
        chartDisplayMode: 'both',
        errorBarMode: 'sd',
      },
      analysisConfig: {
        excludeFlaggedInStats: false,
        discrepancyTolerancePpm: 0.05,
        pzcPlotView: 'final_vs_initial',
      },
      referencePzcMarkers: [
        {
          id: generateUuid('pzc-ref'),
          label: 'Synthetic Reference PZC',
          valuePh: 3.8,
          sourceType: 'user_entered',
          conditions: 'Synthetic illustrative marker',
          notes: 'Not experimentally validated.',
        },
      ],
      replicateGroupMeta: [
        { groupId: 'PZC-G04', label: 'pH 4.0 Duplicate Pair', notes: 'n = 2 replicate demonstration' },
      ],
      measurements: rows,
      figureConfig: createDefaultFigureConfig(
        'pzc',
        'Synthetic pH-Shift Demonstration (pHf vs. pHi)',
        generateUuid('fig')
      ),
      savedFigures: [],
      annotations: [],
      notes: 'Loaded synthetic PZC demonstration fixture.',
      createdAt: now,
      updatedAt: now,
    };
  }

  const rows: SurveyMeasurement[] = [
    {
      id: generateUuid('sm'),
      sampleId: 'DEM-01',
      sampleGroupId: 'DEM-PH05',
      replicateId: 'R1',
      targetInitialPh: 5.0,
      measuredInitialPh: 5.05,
      measuredFinalPh: 4.92,
      initialConcPpm: 200,
      finalConcPpm: 184,
      supportMassMg: 200,
      solutionVolumeMl: 50,
      recordedUptakeUmolM2: 0.35,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: today,
      notes: 'Synthetic demo point.',
    },
    {
      id: generateUuid('sm'),
      sampleId: 'DEM-02',
      sampleGroupId: 'DEM-PH09',
      replicateId: 'R1',
      targetInitialPh: 9.0,
      measuredInitialPh: 9.04,
      measuredFinalPh: 8.62,
      initialConcPpm: 200,
      finalConcPpm: 108,
      supportMassMg: 200,
      solutionVolumeMl: 50,
      recordedUptakeUmolM2: 1.54,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: today,
      notes: 'Synthetic demo replicate R1.',
    },
    {
      id: generateUuid('sm'),
      sampleId: 'DEM-02B',
      sampleGroupId: 'DEM-PH09',
      replicateId: 'R2',
      targetInitialPh: 9.0,
      measuredInitialPh: 9.01,
      measuredFinalPh: 8.58,
      initialConcPpm: 200,
      finalConcPpm: 112,
      supportMassMg: 200,
      solutionVolumeMl: 50,
      recordedUptakeUmolM2: 1.48,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: today,
      notes: 'Synthetic demo replicate R2.',
    },
  ];

  return {
    id,
    datasetId: dsId,
    title: 'Synthetic Uptake Comparison Series (Demo)',
    mode: 'uptake',
    status: 'Active',
    objective:
      'Additional synthetic uptake series for testing comparative visualization and replicate statistics.',
    researcher: researcher || 'Demo Researcher',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    supportSnapshot: supportSnapshot ? structuredClone(supportSnapshot) : null,
    precursorSnapshot: precursorSnapshot
      ? structuredClone(precursorSnapshot)
      : null,
    config: {
      mode: 'uptake',
      targetSurfaceLoadingM2L: 1200,
      equilibrationTimeMin: 60,
      temperatureC: 22.0,
      backgroundElectrolyte: 'DI water (synthetic fixture)',
      phAdjustmentReagentsNote: 'Demo metadata note only.',
      dataProvenance: 'synthetic_demo',
      chartTitle: 'Synthetic Uptake Comparison Series',
      showSyntheticNotice: true,
      chartDisplayMode: 'both',
      errorBarMode: 'sd',
    },
    analysisConfig: {
      excludeFlaggedInStats: false,
      discrepancyTolerancePpm: 0.05,
      pzcPlotView: 'final_vs_initial',
    },
    referencePzcMarkers: [],
    replicateGroupMeta: [],
    measurements: rows,
    figureConfig: createDefaultFigureConfig(
      'uptake',
      'Synthetic Uptake Comparison Series',
      generateUuid('fig')
    ),
    savedFigures: [],
    annotations: [],
    notes: 'Loaded synthetic uptake demonstration fixture.',
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankExperiment(params: {
  experimentId: string;
  title: string;
  projectId: string | null;
  researcher: string;
  type: ExperimentType;
  objective?: string;
  experimentDate?: string;
  tags?: string[];
}): Experiment {
  const now = new Date().toISOString();
  const today = params.experimentDate || now.slice(0, 10);
  const mode: SurveyMode =
    params.type === 'PZC / pH Shift Survey' ? 'pzc' : 'uptake';

  const expUuid = generateUuid('exp');
  const initialDataset = createBlankSurveyDataset({
    datasetId: mode === 'pzc' ? 'DS-PZC-01' : 'DS-UPT-01',
    title:
      mode === 'pzc'
        ? 'pH Shift Survey (Initial vs. Final pH)'
        : 'Metal Uptake Survey vs. Final pH',
    mode,
    researcher: params.researcher,
    objective: params.objective,
  });

  const initialAnalyticalSession = createBlankAnalyticalSession({
    experimentUuid: expUuid,
    sessionId: 'ANA-ICP-01',
    title: 'Primary ICP-OES Analytical Session',
    technique: 'ICP-OES',
    analyst: params.researcher,
    analysisDate: today,
  });

  return projectExperimentCompatibilityMirrors({
    uuid: expUuid,
    experimentId: params.experimentId.trim(),
    title: params.title.trim(),
    projectId: params.projectId,
    researcher: params.researcher.trim(),
    type: params.type,
    objective: params.objective?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
    experimentDate: today,
    status: 'Draft',
    tags: params.tags ?? [],
    generalObservations: '',
    scientificReviewStatus: 'Unreviewed',
    isDemonstration: false,
    dataVersion: EXPERIMENT_DATA_VERSION,
    calcEngineVersion: CALC_ENGINE_VERSION,
    batch: {
      supportId: null,
      precursorId: null,
      supportSnapshot: null,
      precursorSnapshot: null,
      plannedSupportMassG: null,
      actualSupportMassG: null,
      plannedSolutionVolumeMl: null,
      actualSolutionVolumeMl: null,
      plannedSurfaceLoadingM2L: null,
      actualSurfaceLoadingM2L: null,
      plannedTargetMetalLoadingWtPct: null,
      actualMeasuredMetalLoadingWtPct: null,
      plannedInitialPh: null,
      actualInitialPh: null,
      actualFinalPh: null,
      plannedPrecursorConcPpm: null,
      actualPrecursorConcPpm: null,
      contactTimeMin: null,
      temperatureC: null,
      agitationMode: '',
      filtrationNotes: '',
      dryingNotes: '',
      dataProvenance: 'user_entered',
    },
    surveyConfig: structuredClone(initialDataset.config),
    surveyMeasurements: [],
    surveyDatasets: [initialDataset],
    activeSurveyDatasetId: initialDataset.id,
    datasetComparison: {
      selectedRefs: [{ experimentUuid: expUuid, datasetId: initialDataset.id }],
      comparePlotMode: mode === 'pzc' ? 'phf_vs_phi' : 'uptake_vs_phf',
      showGroupMeans: true,
      errorBarMode: 'sd',
    },
    analyticalConfig: {
      instrumentType: 'ICP-OES',
      instrumentModel: '',
      analyteElement: '',
      wavelengthNm: null,
      matrixDescription: '',
      calibrationUnits: 'ppm',
      analystName: params.researcher.trim(),
      analysisDate: today,
      notes: '',
      dataProvenance: 'user_entered',
    },
    calibrationStandards: [],
    instrumentMeasurements: [],
    analyticalSessions: [initialAnalyticalSession],
    activeAnalyticalSessionId: initialAnalyticalSession.id,
    analyticalComparison: {
      selectedSessionIds: [initialAnalyticalSession.id],
      compareAnalyteSymbol: '',
      plotMode: 'concentration_comparison',
    },
    observations: [],
    researchPlan: createDefaultResearchPlan(),
    lifecycleHistory: [
      {
        id: generateUuid('lc'),
        fromStatus: null,
        toStatus: 'Draft',
        timestamp: now,
        researcher: params.researcher.trim() || 'Research Scientist',
        explanation: 'Experiment record initialized.',
        snapshotId: null,
      },
    ],
    milestones: [
      {
        id: generateUuid('ms'),
        order: 0,
        title: 'Verify material records and experiment metadata',
        description:
          'Confirm support/precursor snapshots and experiment identifiers.',
        status: 'pending',
        plannedDateTime: '',
        actualCompletedAt: null,
        linkedModule: 'batch-synthesis',
        linkedRecordId: null,
        linkedRecordLabel: '',
        deviations: '',
        notes: '',
      },
      {
        id: generateUuid('ms'),
        order: 1,
        title: 'Record initial pH and sample identifiers',
        description:
          'Enter planned sample labels and initial measured pH values.',
        status: 'pending',
        plannedDateTime: '',
        actualCompletedAt: null,
        linkedModule: 'uptake-survey',
        linkedRecordId: null,
        linkedRecordLabel: '',
        deviations: '',
        notes: '',
      },
      {
        id: generateUuid('ms'),
        order: 2,
        title: 'Log equilibration completion and final measurements',
        description:
          'Record final pH and analytical assay results after equilibration.',
        status: 'pending',
        plannedDateTime: '',
        actualCompletedAt: null,
        linkedModule: 'analytical',
        linkedRecordId: null,
        linkedRecordLabel: '',
        deviations: '',
        notes: '',
      },
    ],
    timers: [
      {
        id: generateUuid('tmr'),
        name: 'Primary Equilibration Timer',
        mode: 'countdown',
        configuredDurationSec: 3600,
        activeDurationSec: 3600,
        elapsedMs: 0,
        remainingMs: 3600 * 1000,
        status: 'ready',
        lastTickAt: null,
        startedAt: null,
        completedAt: null,
        linkedMilestoneId: null,
        history: [],
      },
    ],
    sampleRegistryNotes: [],
    activityEvents: [
      {
        id: generateUuid('act'),
        eventType: 'experiment_created',
        module: 'overview',
        timestamp: now,
        experimentUuid: expUuid,
        sourceKind: 'experiment',
        sourceId: expUuid,
        sourceLabel: params.experimentId.trim(),
        author: params.researcher.trim() || 'Research Scientist',
        description: `Created experiment ${params.experimentId.trim()} (${params.type}).`,
      },
    ],
    snapshots: [],
    finalizedReports: [],
    uncertaintyRecords: [],
    benchChecklist: [],
    benchTimer: {
      elapsedMs: 0,
      elapsedStatus: 'ready',
      elapsedLastTickAt: null,
      countdownDurationSec: 3600,
      activeCountdownDurationSec: 3600,
      countdownRemainingMs: 3600 * 1000,
      countdownStatus: 'ready',
      countdownLastTickAt: null,
      startedAt: null,
      completedAt: null,
    },
    benchLogs: [],
    reportConfig: {
      mode: 'pre-experiment',
      reportType: 'complete-research',
      reportTitle: '',
      reportSubtitle: '',
      researcherName: '',
      reportDate: '',
      includeCoverPage: false,
      includePageNumbers: true,
      sectionOrder: [...DEFAULT_REPORT_SECTION_ORDER],
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includePlannedVsActual: true,
      includeResearchTimeline: false,
      includeSampleRegistry: true,
      includeSnapshotMetadata: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: true,
      includeAnalyticalFigures: true,
      includeDilutionRecords: true,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeCrossExperimentSummary: true,
      includeResearchMatrix: true,
      includeAdvancedStatistics: true,
      includeMeasurementUncertainty: true,
      includeCompatibilityLimitations: true,
      includeAnalysisAssumptions: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: true,
      includeBenchChecklist: true,
      researcherConclusions: '',
      selectedSurveyDatasetIds: [],
      selectedFigureIds: [],
      selectedAnalyticalSessionIds: [],
      selectedAnalyticalFigureIds: [],
      institutionHeader: 'SEA Workbench Laboratory Record',
      reportFooterNote:
        'Numerical analysis is exploratory; domain-specific SEA calculation models and analytical method validation remain pending independent scientific review.',
    },
  });
}

export function duplicateExperimentRecord(
  source: Experiment,
  existingExperiments: Experiment[]
): Experiment {
  const clone = structuredClone(source);
  const now = new Date().toISOString();
  const basePrefix = source.experimentId.replace(/(-COPY-\d+|-DEMO-\d+)$/i, '');
  const existingIds = new Set(
    existingExperiments.map((e) => e.experimentId.trim().toLowerCase())
  );

  let copyIdx = 1;
  let newId = `${basePrefix}-COPY-${String(copyIdx).padStart(2, '0')}`;
  while (existingIds.has(newId.toLowerCase())) {
    copyIdx += 1;
    newId = `${basePrefix}-COPY-${String(copyIdx).padStart(2, '0')}`;
  }

  const newExpUuid = generateUuid('exp');
  clone.uuid = newExpUuid;
  clone.experimentId = newId;
  clone.title = `${source.title} (Copy)`;
  clone.status = 'Draft';
  clone.isDemonstration = false;
  clone.scientificReviewStatus = 'Unreviewed';
  clone.createdAt = now;
  clone.updatedAt = now;

  // Regenerate analytical session IDs and remap all survey dataset links
  const analyticalIdMap = new Map<string, string>();
  const sessionIdMap = new Map<string, string>();
  const clonedSessions = [];
  for (const sess of source.analyticalSessions ?? []) {
    const dup = duplicateAnalyticalSessionRecord(sess, clonedSessions, newExpUuid);
    sessionIdMap.set(sess.id, dup.session.id);
    for (const [oldId, nextId] of dup.sampleIdMap.entries()) {
      analyticalIdMap.set(oldId, nextId);
    }
    clonedSessions.push(dup.session);
  }
  clone.analyticalSessions = clonedSessions;
  clone.activeAnalyticalSessionId =
    (source.activeAnalyticalSessionId &&
      sessionIdMap.get(source.activeAnalyticalSessionId)) ||
    clonedSessions[0]?.id ||
    null;
  clone.analyticalComparison = {
    ...clone.analyticalComparison,
    selectedSessionIds: (source.analyticalComparison?.selectedSessionIds ?? [])
      .map((sid) => sessionIdMap.get(sid))
      .filter((v): v is string => Boolean(v)),
  };

  const datasetIdMap = new Map<string, string>();
  const clonedDatasets: SurveyDataset[] = [];
  for (const ds of source.surveyDatasets ?? []) {
    const copiedDs = duplicateSurveyDatasetRecord(ds, clonedDatasets, analyticalIdMap);
    copiedDs.datasetId = ds.datasetId;
    copiedDs.title = ds.title;
    datasetIdMap.set(ds.id, copiedDs.id);
    clonedDatasets.push(copiedDs);
  }

  clone.surveyDatasets = clonedDatasets;
  clone.activeSurveyDatasetId =
    (source.activeSurveyDatasetId &&
      datasetIdMap.get(source.activeSurveyDatasetId)) ||
    clonedDatasets[0]?.id ||
    null;

  clone.datasetComparison = {
    ...clone.datasetComparison,
    selectedRefs: clone.datasetComparison.selectedRefs.map((ref) =>
      ref.experimentUuid === source.uuid && datasetIdMap.has(ref.datasetId)
        ? {
            experimentUuid: newExpUuid,
            datasetId: datasetIdMap.get(ref.datasetId) as string,
          }
        : ref
    ),
  };

  clone.observations = clone.observations.map((obs) => ({
    ...obs,
    id: generateUuid('obs'),
  }));
  const milestoneIdMap = new Map<string, string>();
  clone.milestones = (clone.milestones ?? []).map((ms, idx) => {
    const nextId = generateUuid('ms');
    milestoneIdMap.set(ms.id, nextId);
    return { ...ms, id: nextId, order: idx };
  });
  clone.timers = (clone.timers ?? []).map((tmr) => ({
    ...tmr,
    id: generateUuid('tmr'),
    status: 'ready',
    lastTickAt: null,
    linkedMilestoneId: tmr.linkedMilestoneId
      ? milestoneIdMap.get(tmr.linkedMilestoneId) ?? null
      : null,
    history: [],
  }));
  clone.sampleRegistryNotes = (clone.sampleRegistryNotes ?? []).map((n) => ({
    ...n,
  }));
  clone.lifecycleHistory = [
    {
      id: generateUuid('lc'),
      fromStatus: null,
      toStatus: 'Draft',
      timestamp: now,
      researcher: source.researcher || 'Research Scientist',
      explanation: `Duplicated as an independent record from ${source.experimentId}.`,
      snapshotId: null,
    },
  ];
  clone.activityEvents = [
    {
      id: generateUuid('act'),
      eventType: 'experiment_created',
      module: 'overview',
      timestamp: now,
      experimentUuid: newExpUuid,
      sourceKind: 'experiment',
      sourceId: newExpUuid,
      sourceLabel: newId,
      author: source.researcher || 'Research Scientist',
      description: `Duplicated experiment ${newId} from ${source.experimentId}.`,
    },
  ];
  clone.snapshots = [];
  clone.finalizedReports = [];
  clone.uncertaintyRecords = (source.uncertaintyRecords ?? []).map((u) => ({
    ...u,
    id: generateUuid('unc'),
    experimentUuid: newExpUuid,
    createdAt: now,
    updatedAt: now,
  }));
  clone.benchChecklist = clone.benchChecklist.map((item) => ({
    ...item,
    id: generateUuid('chk'),
  }));
  clone.benchLogs = [
    {
      id: generateUuid('log'),
      timestamp: now,
      eventType: 'status',
      message: `Duplicated as an independent record from ${source.experimentId}.`,
    },
  ];

  return projectExperimentCompatibilityMirrors(clone);
}

export function createDefaultExperimentTemplates(): ExperimentTemplate[] {
  const createdAt = '2026-11-18T09:00:00.000Z';
  return [
    {
      id: 'tmpl-exp-uptake-survey',
      name: 'SEA Uptake & PZC Survey Documentation Template',
      experimentType: 'Uptake Survey',
      description:
        'Reusable research planning & documentation structure for multi-pH uptake and PZC surveys. Documentation scaffold only — contains no operational synthesis recipes.',
      defaultObjective:
        'Map recorded metal uptake and equilibrium pH shifts across a structured pH survey series.',
      researchQuestions: [
        'How does recorded metal uptake vary across final equilibrium pH relative to the support reference PZC?',
      ],
      sampleNamingConvention: 'UPT-01..UPT-NN (replicates suffixed B/C); PZC-01..PZC-NN',
      plannedMeasurementRequirements:
        'Initial/final pH pairs, replicate survey rows, ICP-OES external calibration standards, and procedural blank verification.',
      plannedAnalyticalSessions:
        '1) Primary ICP-OES multi-analyte assay (target metal + support dissolution check); 2) Optional Flame AAS cross-check session.',
      expectedDeliverables:
        'Replicate-summarized uptake vs. pHf figure, pH-shift exploratory plot, consolidated review audit, and finalized A4 research report.',
      externalProtocolRefs: [
        'Internal group SOP reference (attach laboratory notebook ID / DOI before execution).',
      ],
      defaultMilestones: [
        {
          title: 'Verify material database snapshots and reference metadata',
          description: 'Lock support and precursor snapshots before logging rows.',
          plannedDateTime: '',
        },
        {
          title: 'Assign planned sample IDs and replicate group codes',
          description: 'Document planned survey sample series.',
          plannedDateTime: '',
        },
        {
          title: 'Record initial and final pH measurements across survey range',
          description: 'Log pHi and pHf measurements.',
          plannedDateTime: '',
        },
        {
          title: 'Import ICP-OES / AAS analytical assay and verify dilutions',
          description: 'Link analytical measurements to survey samples.',
          plannedDateTime: '',
        },
        {
          title: 'Review consolidated quality flags and create pre-report snapshot',
          description: 'Audit Review Center and capture immutable snapshot.',
          plannedDateTime: '',
        },
      ],
      preferredReportType: 'complete-research',
      createdAt,
    },
    {
      id: 'tmpl-exp-batch-synthesis',
      name: 'SEA Batch Synthesis Planning Template',
      experimentType: 'Batch Synthesis',
      description:
        'Reusable documentation scaffold for recording planned vs. actual batch synthesis parameters, deviations, and post-synthesis analytical checks. Non-operational documentation template.',
      defaultObjective:
        'Document planned vs. actual catalyst batch synthesis parameters, deviations, and post-contact analytical verification.',
      researchQuestions: [
        'What are the recorded supernatant metal concentrations and pH shifts during scaled catalyst batch preparation?',
      ],
      sampleNamingConvention: 'BTH-01-INIT, BTH-01-SUP-R1, BTH-01-SUP-R2',
      plannedMeasurementRequirements:
        'Support mass, solution volume, initial/final pH, initial & supernatant metal concentrations, and filtration/drying observations.',
      plannedAnalyticalSessions:
        'ICP-OES supernatant assay (initial stock + post-contact filtrate + procedural blank).',
      expectedDeliverables:
        'Batch synthesis documentation record, deviation log, supernatant ICP-OES check, and printable Research Planning Sheet.',
      externalProtocolRefs: [
        'Reference prior Uptake Survey experiment ID and external laboratory SOP.',
      ],
      defaultMilestones: [
        {
          title: 'Confirm support and precursor material snapshots',
          description: 'Lock support and precursor properties.',
          plannedDateTime: '',
        },
        {
          title: 'Record planned vs. actual batch parameters and pH readings',
          description: 'Document support mass, volume, and pH.',
          plannedDateTime: '',
        },
        {
          title: 'Log equilibration timing window and physical observations',
          description: 'Track contact timing and visual notes.',
          plannedDateTime: '',
        },
        {
          title: 'Submit initial and supernatant aliquots for analytical assay',
          description: 'Record ICP-OES/AAS supernatant results.',
          plannedDateTime: '',
        },
        {
          title: 'Document any synthesis deviations and finalize batch record',
          description: 'Capture deviations and finalize A4 report.',
          plannedDateTime: '',
        },
      ],
      preferredReportType: 'research-planning',
      createdAt,
    },
  ];
}

export function createInitialDemoWorkspace(): WorkspaceStateData {
  const demoCreatedAt = '2026-11-18T09:00:00.000Z';
  const demoUpdatedAt = '2026-11-22T14:30:00.000Z';

  const demoPrecursors: Precursor[] = [
    {
      id: 'prec-demo-pta',
      name: 'Tetraammineplatinum(II) Nitrate (Demo Fixture)',
      formula: '[Pt(NH3)4](NO3)2',
      metalIdentity: 'Pt',
      chargeClassification: 'Cationic',
      casNumber: '20634-12-2',
      molarMass: {
        value: 387.21,
        unit: 'g/mol',
        source: 'Demonstration fixture (unverified placeholder)',
        conditions: 'Anhydrous nominal formula',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Verify against supplier Certificate of Analysis before lab use.',
      },
      metalWeightFraction: {
        value: 50.38,
        unit: 'wt% Pt',
        source: 'Demonstration fixture (unverified placeholder)',
        conditions: 'Nominal stoichiometric estimate',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Requires COA confirmation per lot.',
      },
      purity: {
        value: 99.9,
        unit: '%',
        source: 'Demonstration fixture',
        conditions: 'Metals basis placeholder',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Not an operational specification.',
      },
      solubilityNotes:
        'Placeholder fixture — consult reagent datasheet prior to solution preparation.',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      references: [
        {
          id: 'ref-demo-1',
          title:
            'Demonstration Placeholder — Replace with verified Certificate of Analysis or literature source',
          authorOrOrganization: 'Synthetic Demonstration Fixture',
          year: 2026,
          doiOrUrl: '',
          sourceType: 'synthetic_demo_fixture',
          relevantProperty: 'Molar Mass & Metal wt%',
          measurementConditions: 'Nominal anhydrous placeholder',
          dateAccessed: '2026-11-18',
          verificationStatus: 'synthetic_fixture',
          reviewerNotes:
            'Synthetic fixture entry created solely to demonstrate structured reference tracking.',
        },
      ],
      notes:
        'Synthetic demonstration precursor record for illustrating SEA Workbench workflows.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'prec-demo-cpa',
      name: 'Hexachloroplatinic Acid Hydrate (Demo Fixture)',
      formula: 'H2PtCl6·xH2O',
      metalIdentity: 'Pt',
      chargeClassification: 'Anionic',
      casNumber: '16941-12-1',
      molarMass: {
        value: null,
        unit: 'g/mol',
        source: 'Lot-dependent hydration',
        conditions: 'Requires ICP assay or COA hydration determination',
        verificationStatus: 'unverified',
        provenance: 'unavailable',
        notes: 'Left blank intentionally to demonstrate missing-value handling.',
      },
      metalWeightFraction: {
        value: 38.0,
        unit: 'wt% Pt',
        source: 'Demonstration fixture (nominal placeholder)',
        conditions: 'Approximate hydrated basis',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Confirm exact Pt wt% by analytical assay.',
      },
      purity: {
        value: null,
        unit: '%',
        source: 'Not recorded',
        conditions: 'Pending COA entry',
        verificationStatus: 'unverified',
        provenance: 'unavailable',
        notes: '',
      },
      solubilityNotes: 'Placeholder fixture — enter verified datasheet notes.',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      references: [],
      notes:
        'Anionic demonstration complex record with intentionally incomplete molar mass to verify null handling.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
  ];

  const demoSupports: Support[] = [
    {
      id: 'supp-demo-sio2',
      name: 'Amorphous Silica — Grade S-300 (Demo Fixture)',
      composition: 'SiO2',
      supplierOrGrade: 'Synthetic Demo Lot A',
      betSurfaceArea: {
        value: 300.0,
        unit: 'm²/g',
        source: 'Demonstration fixture (synthetic)',
        conditions: 'N2 physisorption at 77 K (placeholder)',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Replace with measured multipoint BET report.',
      },
      pzc: {
        value: 3.8,
        unit: 'pH',
        source: 'Demonstration fixture (synthetic)',
        conditions: 'Illustrative pH shift baseline',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Synthetic illustrative value; not validated.',
      },
      poreVolume: {
        value: 1.15,
        unit: 'cm³/g',
        source: 'Demonstration fixture (synthetic)',
        conditions: 'BJH desorption placeholder',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: '',
      },
      particleSizeRange: '75–150 µm (placeholder)',
      measurementConditions:
        'Synthetic fixture — verify degas temperature and electrolyte ionic strength.',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      references: [
        {
          id: 'ref-supp-1',
          title:
            'Demonstration Placeholder — Attach internal BET/PZC characterization report',
          authorOrOrganization: 'Synthetic Demonstration Fixture',
          year: 2026,
          doiOrUrl: '',
          sourceType: 'synthetic_demo_fixture',
          relevantProperty: 'BET Surface Area & PZC',
          measurementConditions: 'Illustrative placeholder conditions',
          dateAccessed: '2026-11-18',
          verificationStatus: 'synthetic_fixture',
          reviewerNotes: 'Replace with verified laboratory characterization record.',
        },
      ],
      notes:
        'Low-PZC demonstration support for testing material snapshots and batch selection.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'supp-demo-al2o3',
      name: 'Gamma-Alumina — Grade A-180 (Demo Fixture)',
      composition: 'γ-Al2O3',
      supplierOrGrade: 'Synthetic Demo Lot B',
      betSurfaceArea: {
        value: 185.0,
        unit: 'm²/g',
        source: 'Demonstration fixture (synthetic)',
        conditions: 'N2 physisorption placeholder',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: '',
      },
      pzc: {
        value: 8.2,
        unit: 'pH',
        source: 'Demonstration fixture (synthetic)',
        conditions: 'Illustrative pH shift baseline',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Verify experimentally for specific calcination lot.',
      },
      poreVolume: {
        value: null,
        unit: 'cm³/g',
        source: 'Not recorded',
        conditions: 'Pending characterization',
        verificationStatus: 'unverified',
        provenance: 'unavailable',
        notes: 'Intentionally blank.',
      },
      particleSizeRange: '100–200 µm (placeholder)',
      measurementConditions: 'Synthetic fixture.',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      references: [],
      notes: 'High-PZC demonstration oxide support fixture.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
  ];

  const demoProject: ResearchProject = {
    id: 'prj-demo-01',
    code: 'PRJ-DEMO-01',
    name: 'Demonstration — Pt/SiO2 SEA Screening Study',
    description:
      'Synthetic demonstration project illustrating SEA Workbench data models, multi-dataset survey analysis, replicate grouping, Figure Studio customization, comparative overlays, and A4 reporting. Not validated laboratory data.',
    principalInvestigator: 'Dr. E. Lindqvist (Demo)',
    isDemonstration: true,
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  const demoSupportSnapshot = createSupportSnapshot(demoSupports[0]);
  const demoPrecursorSnapshot = createPrecursorSnapshot(demoPrecursors[0]);

  const primaryUptakeRows: SurveyMeasurement[] = [
    {
      id: 'sm-demo-1',
      sampleId: 'UPT-01',
      sampleGroupId: 'GRP-PH03',
      replicateId: 'R1',
      targetInitialPh: 3.0,
      measuredInitialPh: 3.05,
      measuredFinalPh: 3.18,
      initialConcPpm: 200.0,
      finalConcPpm: 198.2,
      supportMassMg: 167.0,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 0.08,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Low pH baseline point (synthetic).',
    },
    {
      id: 'sm-demo-2',
      sampleId: 'UPT-02',
      sampleGroupId: 'GRP-PH05',
      replicateId: 'R1',
      targetInitialPh: 5.0,
      measuredInitialPh: 5.02,
      measuredFinalPh: 4.84,
      initialConcPpm: 200.0,
      finalConcPpm: 186.5,
      supportMassMg: 167.2,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 0.42,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Synthetic fixture.',
    },
    {
      id: 'sm-demo-3',
      sampleId: 'UPT-03',
      sampleGroupId: 'GRP-PH07',
      replicateId: 'R1',
      targetInitialPh: 7.5,
      measuredInitialPh: 7.48,
      measuredFinalPh: 6.95,
      initialConcPpm: 200.0,
      finalConcPpm: 142.0,
      supportMassMg: 166.8,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.12,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Synthetic fixture.',
    },
    {
      id: 'sm-demo-3x',
      sampleId: 'UPT-03X',
      sampleGroupId: 'GRP-PH07',
      replicateId: 'R2',
      targetInitialPh: 7.5,
      measuredInitialPh: 7.51,
      measuredFinalPh: 6.91,
      initialConcPpm: 200.0,
      finalConcPpm: 168.0,
      supportMassMg: 167.0,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 0.64,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'excluded_by_user',
      exclusionReason:
        'Synthetic demonstration of documented user exclusion (simulated filter breakthrough).',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Excluded by user with documented reason.',
    },
    {
      id: 'sm-demo-4',
      sampleId: 'UPT-04',
      sampleGroupId: 'GRP-PH09',
      replicateId: 'R1',
      targetInitialPh: 9.5,
      measuredInitialPh: 9.52,
      measuredFinalPh: 8.88,
      initialConcPpm: 200.0,
      finalConcPpm: 94.6,
      supportMassMg: 167.1,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.84,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: 'im-demo-1',
      linkedFinalMeasurementId: 'im-demo-2',
      measurementDate: '2026-11-20',
      notes: 'Linked to ICP-UPT04-INIT and ICP-UPT04-FIN (synthetic).',
    },
    {
      id: 'sm-demo-4b',
      sampleId: 'UPT-04B',
      sampleGroupId: 'GRP-PH09',
      replicateId: 'R2',
      targetInitialPh: 9.5,
      measuredInitialPh: 9.49,
      measuredFinalPh: 8.94,
      initialConcPpm: 200.0,
      finalConcPpm: 97.4,
      supportMassMg: 167.3,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.76,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Replicate R2 in GRP-PH09 demonstrating n=2 mean & SD.',
    },
    {
      id: 'sm-demo-5',
      sampleId: 'UPT-05',
      sampleGroupId: 'GRP-PH11',
      replicateId: 'R1',
      targetInitialPh: 11.0,
      measuredInitialPh: 11.04,
      measuredFinalPh: 10.42,
      initialConcPpm: 200.0,
      finalConcPpm: 88.2,
      supportMassMg: 167.0,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.96,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Synthetic fixture.',
    },
    {
      id: 'sm-demo-5b',
      sampleId: 'UPT-05B',
      sampleGroupId: 'GRP-PH11',
      replicateId: 'R3',
      targetInitialPh: 11.0,
      measuredInitialPh: 11.06,
      measuredFinalPh: 10.45,
      initialConcPpm: 200.0,
      finalConcPpm: 93.8,
      supportMassMg: 166.9,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.85,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'flagged',
      exclusionReason:
        'Flagged synthetic note: minor equilibration temperature excursion (+1.4 °C). Included unless flagged exclusion is enabled.',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'Flagged replicate R3 in GRP-PH11.',
    },
    {
      id: 'sm-demo-6',
      sampleId: 'UPT-06',
      sampleGroupId: 'GRP-PH11',
      replicateId: 'R2',
      targetInitialPh: 11.0,
      measuredInitialPh: 11.01,
      measuredFinalPh: 10.39,
      initialConcPpm: 200.0,
      finalConcPpm: null,
      supportMassMg: 167.4,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: null,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'unavailable',
      qualityStatus: 'pending',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: 'im-demo-3',
      measurementDate: '2026-11-20',
      notes:
        'Pending ICP-OES final aliquot — intentionally left blank to demonstrate non-zero missing value handling.',
    },
    {
      id: 'sm-demo-7',
      sampleId: 'UPT-07',
      sampleGroupId: 'GRP-PH12',
      replicateId: 'R1',
      targetInitialPh: 12.2,
      measuredInitialPh: 12.18,
      measuredFinalPh: 11.91,
      initialConcPpm: 200.0,
      finalConcPpm: 138.4,
      supportMassMg: 166.9,
      solutionVolumeMl: 50.0,
      recordedUptakeUmolM2: 1.18,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: '2026-11-20',
      notes: 'High ionic strength synthetic point.',
    },
  ];

  const primaryFigure: FigureConfiguration = {
    ...createDefaultFigureConfig(
      'uptake',
      'Synthetic Demonstration — Recorded Pt Uptake vs. Final pH (1000 m²/L)',
      'fig-demo-upt-main'
    ),
    name: 'Uptake Profile with ±SD Replicate Error Bars',
    plotType: 'error_bar',
    displayMode: 'both',
    errorBarMode: 'sd',
    savedAt: demoUpdatedAt,
  };

  const primaryAnnotations: ResearchAnnotation[] = [
    {
      id: 'ann-demo-1',
      category: 'research_question',
      title: 'Exploratory pH Window Across Silica PZC (Synthetic Demo)',
      body: 'Examine how recorded synthetic Pt uptake varies across final equilibrium pH 3.2 to 11.9 relative to the support snapshot reference PZC (3.80). Descriptive analysis only — no automated optimization.',
      author: 'Dr. E. Lindqvist (Demo)',
      linkedDatasetId: 'ds-demo-upt-1',
      linkedMeasurementIds: [],
      linkedGroupIds: ['GRP-PH09', 'GRP-PH11'],
      linkedFigureId: 'fig-demo-upt-main',
      linkedReferenceIds: ['ref-supp-1'],
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'ann-demo-2',
      category: 'data_quality_concern',
      title: 'Pending Aliquot (UPT-06) & User Exclusion (UPT-03X)',
      body: 'UPT-06 final ICP-OES reading remains unrecorded (preserved as null). UPT-03X was explicitly excluded by the researcher due to simulated filter breakthrough; UPT-05B is flagged for minor temperature drift and stays included unless flagged exclusion is toggled in Statistical Analysis.',
      author: 'Dr. E. Lindqvist (Demo)',
      linkedDatasetId: 'ds-demo-upt-1',
      linkedMeasurementIds: ['sm-demo-6', 'sm-demo-3x', 'sm-demo-5b'],
      linkedGroupIds: ['GRP-PH07', 'GRP-PH11'],
      linkedFigureId: null,
      linkedReferenceIds: [],
      createdAt: demoUpdatedAt,
      updatedAt: demoUpdatedAt,
    },
  ];

  const dsUptakePrimary: SurveyDataset = {
    id: 'ds-demo-upt-1',
    datasetId: 'DS-UPT-01',
    title: 'Pt(NH3)4(NO3)2 on SiO2 — 1000 m²/L Uptake Series (Synthetic Demo)',
    mode: 'uptake',
    status: 'Active',
    objective:
      'Primary synthetic uptake survey illustrating explicit replicate groups, analytical aliquot linkage, missing-value null preservation, flagged vs. excluded handling, and error-bar visualization.',
    researcher: 'Dr. E. Lindqvist (Demo)',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    supportSnapshot: demoSupportSnapshot,
    precursorSnapshot: demoPrecursorSnapshot,
    config: {
      mode: 'uptake',
      targetSurfaceLoadingM2L: 1000,
      equilibrationTimeMin: 60,
      temperatureC: 22.0,
      backgroundElectrolyte: 'DI water (synthetic fixture)',
      phAdjustmentReagentsNote:
        'Demo metadata note only — no operational recipe generated.',
      dataProvenance: 'synthetic_demo',
      chartTitle:
        'Synthetic Demonstration — Recorded Pt Uptake vs. Final pH (1000 m²/L)',
      showSyntheticNotice: true,
      chartDisplayMode: 'both',
      errorBarMode: 'sd',
    },
    analysisConfig: {
      excludeFlaggedInStats: false,
      discrepancyTolerancePpm: 0.05,
      pzcPlotView: 'final_vs_initial',
    },
    referencePzcMarkers: [
      {
        id: 'pzc-ref-demo-1',
        label: 'SiO2 Grade S-300 Snapshot PZC',
        valuePh: 3.8,
        sourceType: 'support_snapshot',
        conditions: 'Illustrative pH shift baseline (synthetic)',
        notes: 'Snapshot reference from Amorphous Silica — Grade S-300.',
      },
    ],
    replicateGroupMeta: [
      {
        groupId: 'GRP-PH09',
        label: 'Target pH 9.5 Replicates',
        notes: 'n = 2 valid synthetic replicates.',
      },
      {
        groupId: 'GRP-PH11',
        label: 'Target pH 11.0 Replicates',
        notes: 'Contains 1 valid, 1 flagged, and 1 pending missing aliquot.',
      },
    ],
    measurements: primaryUptakeRows,
    figureConfig: primaryFigure,
    savedFigures: [primaryFigure],
    annotations: primaryAnnotations,
    notes:
      'Synthetic demonstration series for validating Phase 2 & Phase 3 numerical and visual workflows.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  // Second synthetic dataset: Higher surface loading (2500 m²/L) for comparative analysis
  const comparisonFigure: FigureConfiguration = {
    ...createDefaultFigureConfig(
      'uptake',
      'Synthetic Comparison — Pt Uptake at 2500 m²/L Surface Loading',
      'fig-demo-upt-highsl'
    ),
    name: 'High-SL Comparison Series (2500 m²/L)',
    plotType: 'error_bar',
    primaryColor: '#1F2937',
    markerShape: 'square',
    savedAt: demoUpdatedAt,
  };

  const dsUptakeHighSL: SurveyDataset = {
    id: 'ds-demo-upt-2',
    datasetId: 'DS-UPT-02',
    title: 'Pt(NH3)4(NO3)2 on SiO2 — 2500 m²/L Comparison Series (Synthetic Demo)',
    mode: 'uptake',
    status: 'Active',
    objective:
      'Secondary synthetic series at elevated surface loading (2500 m²/L) to illustrate multi-series comparative visualization and condition-difference warnings.',
    researcher: 'Dr. E. Lindqvist (Demo)',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    supportSnapshot: demoSupportSnapshot,
    precursorSnapshot: demoPrecursorSnapshot,
    config: {
      mode: 'uptake',
      targetSurfaceLoadingM2L: 2500,
      equilibrationTimeMin: 60,
      temperatureC: 22.0,
      backgroundElectrolyte: 'DI water (synthetic fixture)',
      phAdjustmentReagentsNote: 'Demo metadata note only.',
      dataProvenance: 'synthetic_demo',
      chartTitle:
        'Synthetic Comparison — Pt Uptake at 2500 m²/L Surface Loading',
      showSyntheticNotice: true,
      chartDisplayMode: 'both',
      errorBarMode: 'sd',
    },
    analysisConfig: {
      excludeFlaggedInStats: false,
      discrepancyTolerancePpm: 0.05,
      pzcPlotView: 'final_vs_initial',
    },
    referencePzcMarkers: [
      {
        id: 'pzc-ref-demo-2',
        label: 'SiO2 Grade S-300 Snapshot PZC',
        valuePh: 3.8,
        sourceType: 'support_snapshot',
        conditions: 'Illustrative pH shift baseline (synthetic)',
        notes: '',
      },
    ],
    replicateGroupMeta: [
      {
        groupId: 'HSL-PH09',
        label: 'High-SL Target pH 9.5',
        notes: 'n = 2 synthetic replicates.',
      },
      {
        groupId: 'HSL-PH11',
        label: 'High-SL Target pH 11.0',
        notes: 'n = 2 synthetic replicates.',
      },
    ],
    measurements: [
      {
        id: 'sm-hsl-1',
        sampleId: 'HSL-01',
        sampleGroupId: 'HSL-PH04',
        replicateId: 'R1',
        targetInitialPh: 4.0,
        measuredInitialPh: 4.03,
        measuredFinalPh: 3.94,
        initialConcPpm: 200.0,
        finalConcPpm: 193.5,
        supportMassMg: 417.0,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 0.14,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'High-SL low pH synthetic point.',
      },
      {
        id: 'sm-hsl-2',
        sampleId: 'HSL-02',
        sampleGroupId: 'HSL-PH07',
        replicateId: 'R1',
        targetInitialPh: 7.5,
        measuredInitialPh: 7.52,
        measuredFinalPh: 6.42,
        initialConcPpm: 200.0,
        finalConcPpm: 118.4,
        supportMassMg: 416.8,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 0.86,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'Stronger pH buffering shift at 2500 m²/L (synthetic).',
      },
      {
        id: 'sm-hsl-3',
        sampleId: 'HSL-03',
        sampleGroupId: 'HSL-PH09',
        replicateId: 'R1',
        targetInitialPh: 9.5,
        measuredInitialPh: 9.54,
        measuredFinalPh: 8.15,
        initialConcPpm: 200.0,
        finalConcPpm: 58.0,
        supportMassMg: 417.2,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 1.44,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'Replicate R1 (synthetic).',
      },
      {
        id: 'sm-hsl-3b',
        sampleId: 'HSL-03B',
        sampleGroupId: 'HSL-PH09',
        replicateId: 'R2',
        targetInitialPh: 9.5,
        measuredInitialPh: 9.48,
        measuredFinalPh: 8.22,
        initialConcPpm: 200.0,
        finalConcPpm: 62.5,
        supportMassMg: 416.9,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 1.38,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'Replicate R2 (synthetic).',
      },
      {
        id: 'sm-hsl-4',
        sampleId: 'HSL-04',
        sampleGroupId: 'HSL-PH11',
        replicateId: 'R1',
        targetInitialPh: 11.0,
        measuredInitialPh: 11.02,
        measuredFinalPh: 9.86,
        initialConcPpm: 200.0,
        finalConcPpm: 46.2,
        supportMassMg: 417.1,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 1.58,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'Replicate R1 (synthetic).',
      },
      {
        id: 'sm-hsl-4b',
        sampleId: 'HSL-04B',
        sampleGroupId: 'HSL-PH11',
        replicateId: 'R2',
        targetInitialPh: 11.0,
        measuredInitialPh: 11.05,
        measuredFinalPh: 9.91,
        initialConcPpm: 200.0,
        finalConcPpm: 49.0,
        supportMassMg: 416.7,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: 1.52,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-21',
        notes: 'Replicate R2 (synthetic).',
      },
    ],
    figureConfig: comparisonFigure,
    savedFigures: [comparisonFigure],
    annotations: [],
    notes: 'Synthetic comparison series at 2500 m²/L surface loading.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  // Third synthetic dataset: Dedicated PZC / pH-Shift Survey
  const pzcFigure: FigureConfiguration = {
    ...createDefaultFigureConfig(
      'pzc',
      'Synthetic pH-Shift Survey — Amorphous SiO2 (Final pH vs. Initial pH)',
      'fig-demo-pzc-main'
    ),
    name: 'pH Shift Curve with 1:1 Identity Line',
    plotType: 'pzc_final_vs_initial',
    showIdentityLine: true,
    showReferenceLine: true,
    savedAt: demoUpdatedAt,
  };

  const pzcDeltaFigure: FigureConfiguration = {
    ...createDefaultFigureConfig(
      'pzc',
      'Synthetic ΔpH Profile — Amorphous SiO2 (pHf − pHi vs. pHi)',
      'fig-demo-pzc-delta'
    ),
    name: 'ΔpH vs. Initial pH Profile',
    plotType: 'pzc_delta_vs_initial',
    yAxisTitle: 'Recorded ΔpH (pHf − pHi)',
    yAxisUnit: 'pH',
    yMin: null,
    yMax: null,
    showIdentityLine: false,
    showReferenceLine: true,
    savedAt: demoUpdatedAt,
  };

  const dsPzcShift: SurveyDataset = {
    id: 'ds-demo-pzc-1',
    datasetId: 'DS-PZC-01',
    title: 'Amorphous SiO2 — pH-Shift Characterization Series (Synthetic Demo)',
    mode: 'pzc',
    status: 'Active',
    objective:
      'Synthetic pH-shift series without metal precursor for demonstrating Final vs. Initial pH, ΔpH vs. Initial pH, 1:1 identity line, and user/literature reference PZC markers without automated PZC declaration.',
    researcher: 'Dr. E. Lindqvist (Demo)',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    supportSnapshot: demoSupportSnapshot,
    precursorSnapshot: null,
    config: {
      mode: 'pzc',
      targetSurfaceLoadingM2L: 5000,
      equilibrationTimeMin: 60,
      temperatureC: 22.0,
      backgroundElectrolyte: '0.01 M NaNO3 (synthetic fixture)',
      phAdjustmentReagentsNote: 'Demo metadata note only.',
      dataProvenance: 'synthetic_demo',
      chartTitle:
        'Synthetic pH-Shift Survey — Amorphous SiO2 (Final pH vs. Initial pH)',
      showSyntheticNotice: true,
      chartDisplayMode: 'both',
      errorBarMode: 'sd',
    },
    analysisConfig: {
      excludeFlaggedInStats: false,
      discrepancyTolerancePpm: 0.05,
      pzcPlotView: 'final_vs_initial',
    },
    referencePzcMarkers: [
      {
        id: 'pzc-ref-sio2-snap',
        label: 'Support Snapshot Reference PZC',
        valuePh: 3.8,
        sourceType: 'support_snapshot',
        conditions: 'Synthetic fixture snapshot',
        notes: 'Illustrative baseline marker only.',
      },
      {
        id: 'pzc-ref-sio2-lit',
        label: 'Illustrative Literature Reference Marker',
        valuePh: 3.5,
        sourceType: 'literature_reference',
        conditions: 'Placeholder entry — attach verified literature citation',
        notes: 'Demonstrates distinguishing literature vs. user-entered markers.',
      },
    ],
    replicateGroupMeta: [
      {
        groupId: 'PZC-PH04',
        label: 'pH 4.0 Crossing Region Replicates',
        notes: 'n = 2 synthetic replicates.',
      },
      {
        groupId: 'PZC-PH07',
        label: 'pH 7.0 Buffering Plateau Replicates',
        notes: 'n = 2 synthetic replicates.',
      },
    ],
    measurements: [
      {
        id: 'sm-pzc-1',
        sampleId: 'PZC-01',
        sampleGroupId: 'PZC-PH02',
        replicateId: 'R1',
        targetInitialPh: 2.0,
        measuredInitialPh: 2.02,
        measuredFinalPh: 2.34,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.0,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Positive ΔpH below reference PZC (synthetic).',
      },
      {
        id: 'sm-pzc-2',
        sampleId: 'PZC-02',
        sampleGroupId: 'PZC-PH04',
        replicateId: 'R1',
        targetInitialPh: 4.0,
        measuredInitialPh: 4.01,
        measuredFinalPh: 3.84,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.4,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Replicate R1 (synthetic).',
      },
      {
        id: 'sm-pzc-2b',
        sampleId: 'PZC-02B',
        sampleGroupId: 'PZC-PH04',
        replicateId: 'R2',
        targetInitialPh: 4.0,
        measuredInitialPh: 4.04,
        measuredFinalPh: 3.91,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 832.8,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Replicate R2 (synthetic).',
      },
      {
        id: 'sm-pzc-3',
        sampleId: 'PZC-03',
        sampleGroupId: 'PZC-PH06',
        replicateId: 'R1',
        targetInitialPh: 6.0,
        measuredInitialPh: 6.02,
        measuredFinalPh: 4.02,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.1,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Synthetic buffering region.',
      },
      {
        id: 'sm-pzc-4',
        sampleId: 'PZC-04',
        sampleGroupId: 'PZC-PH07',
        replicateId: 'R1',
        targetInitialPh: 7.5,
        measuredInitialPh: 7.49,
        measuredFinalPh: 4.18,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.5,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Replicate R1 (synthetic).',
      },
      {
        id: 'sm-pzc-4b',
        sampleId: 'PZC-04B',
        sampleGroupId: 'PZC-PH07',
        replicateId: 'R2',
        targetInitialPh: 7.5,
        measuredInitialPh: 7.52,
        measuredFinalPh: 4.26,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.0,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Replicate R2 (synthetic).',
      },
      {
        id: 'sm-pzc-5',
        sampleId: 'PZC-05',
        sampleGroupId: 'PZC-PH10',
        replicateId: 'R1',
        targetInitialPh: 10.0,
        measuredInitialPh: 10.03,
        measuredFinalPh: 6.45,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.2,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'High initial pH synthetic point.',
      },
      {
        id: 'sm-pzc-6',
        sampleId: 'PZC-06',
        sampleGroupId: 'PZC-PH12',
        replicateId: 'R1',
        targetInitialPh: 12.0,
        measuredInitialPh: 11.98,
        measuredFinalPh: 10.82,
        initialConcPpm: null,
        finalConcPpm: null,
        supportMassMg: 833.0,
        solutionVolumeMl: 50.0,
        recordedUptakeUmolM2: null,
        uptakeUnit: 'µmol/m²',
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        linkedInitialMeasurementId: null,
        linkedFinalMeasurementId: null,
        measurementDate: '2026-11-20',
        notes: 'Alkaline branch synthetic point.',
      },
    ],
    figureConfig: pzcFigure,
    savedFigures: [pzcFigure, pzcDeltaFigure],
    annotations: [
      {
        id: 'ann-demo-pzc-1',
        category: 'observed_trend',
        title: 'Exploratory Buffering Plateau Near pH 3.8–4.2 (Synthetic)',
        body: 'In this synthetic fixture, final pH trends close to 3.8–4.2 across initial pH 4.0 to 7.5. This is a researcher-authored exploratory note and not an automated PZC determination.',
        author: 'Dr. E. Lindqvist (Demo)',
        linkedDatasetId: 'ds-demo-pzc-1',
        linkedMeasurementIds: ['sm-pzc-2', 'sm-pzc-3', 'sm-pzc-4'],
        linkedGroupIds: ['PZC-PH04', 'PZC-PH07'],
        linkedFigureId: 'fig-demo-pzc-main',
        linkedReferenceIds: ['ref-supp-1'],
        createdAt: demoUpdatedAt,
        updatedAt: demoUpdatedAt,
      },
    ],
    notes: 'Synthetic pH-shift dataset demonstrating PZC analysis tools.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  const demoAnalyticalSessions = buildDemoExperimentAnalyticalSessions(
    'exp-demo-001',
    demoCreatedAt,
    demoUpdatedAt
  );

  const demoMilestones: ResearchMilestone[] = [
    {
      id: 'ms-demo-1',
      order: 0,
      title: 'Confirm experiment ID, project code, and material snapshot records',
      description:
        'Lock immutable snapshots for SiO2 support and [Pt(NH3)4](NO3)2 precursor before logging survey rows.',
      status: 'completed',
      plannedDateTime: '2026-11-20 09:00',
      actualCompletedAt: '2026-11-20T09:04:00.000Z',
      linkedModule: 'batch-synthesis',
      linkedRecordId: demoSupportSnapshot.snapshotId,
      linkedRecordLabel: 'SiO2 & [Pt(NH3)4](NO3)2 Snapshots',
      deviations: '',
      notes: 'Verified demonstration snapshots.',
    },
    {
      id: 'ms-demo-2',
      order: 1,
      title: 'Log initial pH measurements across survey series',
      description:
        'Record planned and measured initial pH across DS-UPT-01 and DS-PZC-01.',
      status: 'completed',
      plannedDateTime: '2026-11-20 09:30',
      actualCompletedAt: '2026-11-20T09:38:00.000Z',
      linkedModule: 'uptake-survey',
      linkedRecordId: dsUptakePrimary.id,
      linkedRecordLabel: dsUptakePrimary.datasetId,
      deviations: '',
      notes: '10 sample records entered across 6 explicit groups in DS-UPT-01.',
    },
    {
      id: 'ms-demo-3',
      order: 2,
      title: 'Complete equilibration timing window and record final pH',
      description:
        'Hold synthetic 60 min equilibration period and log post-contact pH.',
      status: 'completed',
      plannedDateTime: '2026-11-20 10:30',
      actualCompletedAt: '2026-11-20T10:35:00.000Z',
      linkedModule: 'bench-runner',
      linkedRecordId: 'tmr-demo-eq',
      linkedRecordLabel: 'Equilibration Run — Series A',
      deviations:
        'Synthetic deviation note: equilibration duration extended by 45 s during filtration handoff.',
      notes: '',
    },
    {
      id: 'ms-demo-4',
      order: 3,
      title: 'Record remaining ICP-OES analytical output for UPT-06 (R2)',
      description:
        'Complete pending aliquot analysis and resolve open Review Center items.',
      status: 'pending',
      plannedDateTime: '2026-11-21 14:00',
      actualCompletedAt: null,
      linkedModule: 'analytical',
      linkedRecordId: demoAnalyticalSessions[0].id,
      linkedRecordLabel: demoAnalyticalSessions[0].sessionId,
      deviations: '',
      notes: 'Pending instrument queue.',
    },
  ];

  const demoTimers: ResearchTimer[] = [
    {
      id: 'tmr-demo-eq',
      name: 'Equilibration Run — Series A',
      mode: 'elapsed',
      configuredDurationSec: 3600,
      activeDurationSec: 3600,
      status: 'paused',
      elapsedMs: 3645000,
      remainingMs: 0,
      lastTickAt: null,
      startedAt: '2026-11-20T09:30:00.000Z',
      completedAt: null,
      linkedMilestoneId: 'ms-demo-3',
      history: [
        {
          timestamp: '2026-11-20T09:30:00.000Z',
          action: 'started',
          detail: 'Series A equilibration timer started.',
        },
        {
          timestamp: '2026-11-20T10:30:45.000Z',
          action: 'paused',
          detail: 'Paused after 60 min 45 s.',
        },
      ],
    },
    {
      id: 'tmr-demo-hold',
      name: 'Filtration & Supernatant Settling Countdown',
      mode: 'countdown',
      configuredDurationSec: 3600,
      activeDurationSec: 3600,
      status: 'paused',
      elapsedMs: 1800000,
      remainingMs: 1800000,
      lastTickAt: null,
      startedAt: '2026-11-20T10:35:00.000Z',
      completedAt: null,
      linkedMilestoneId: 'ms-demo-4',
      history: [
        {
          timestamp: '2026-11-20T10:35:00.000Z',
          action: 'started',
          detail: '60 min settling countdown initiated.',
        },
      ],
    },
  ];

  const demoExperimentBase: Experiment = projectExperimentCompatibilityMirrors({
    uuid: 'exp-demo-001',
    experimentId: 'SEA-DEMO-001',
    title: 'Pt(NH3)4(NO3)2 on SiO2 — Synthetic Uptake & PZC Demonstration',
    projectId: demoProject.id,
    researcher: 'Dr. E. Lindqvist (Demo)',
    type: 'Uptake Survey',
    objective:
      'Demonstrate structured multi-dataset survey management, immutable material snapshots, explicit replicate grouping, multi-session ICP-OES & Flame AAS analytical records, Figure Studio customization, comparative analysis, snapshots, and finalized A4 reporting using clearly labeled synthetic fixtures.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
    experimentDate: '2026-11-20',
    status: 'In Progress',
    tags: ['demonstration', 'synthetic-fixture', 'Pt/SiO2'],
    generalObservations:
      'All numerical entries in this demonstration record are synthetic fixtures created to verify interface workflows, tabular alignment, statistical guardrails, null/qualifier handling, comparative plotting, snapshots, and A4 report printing.',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    dataVersion: EXPERIMENT_DATA_VERSION,
    calcEngineVersion: CALC_ENGINE_VERSION,
    batch: {
      supportId: demoSupports[0].id,
      precursorId: demoPrecursors[0].id,
      supportSnapshot: demoSupportSnapshot,
      precursorSnapshot: demoPrecursorSnapshot,
      plannedSupportMassG: 1.0,
      actualSupportMassG: 1.004,
      plannedSolutionVolumeMl: 50.0,
      actualSolutionVolumeMl: 50.0,
      plannedSurfaceLoadingM2L: 6000,
      actualSurfaceLoadingM2L: null,
      plannedTargetMetalLoadingWtPct: 1.5,
      actualMeasuredMetalLoadingWtPct: null,
      plannedInitialPh: 11.2,
      actualInitialPh: 11.18,
      actualFinalPh: 10.64,
      plannedPrecursorConcPpm: 200.0,
      actualPrecursorConcPpm: 198.4,
      contactTimeMin: 60,
      temperatureC: 22.0,
      agitationMode: 'Orbital shaker, 150 rpm (demo note)',
      filtrationNotes: 'Vacuum filtration record placeholder (demo)',
      dryingNotes: 'Ambient drying record placeholder (demo)',
      dataProvenance: 'synthetic_demo',
    },
    surveyConfig: structuredClone(dsUptakePrimary.config),
    surveyMeasurements: structuredClone(dsUptakePrimary.measurements),
    surveyDatasets: [dsUptakePrimary, dsUptakeHighSL, dsPzcShift],
    activeSurveyDatasetId: dsUptakePrimary.id,
    datasetComparison: {
      selectedRefs: [
        { experimentUuid: 'exp-demo-001', datasetId: dsUptakePrimary.id },
        { experimentUuid: 'exp-demo-001', datasetId: dsUptakeHighSL.id },
      ],
      comparePlotMode: 'uptake_vs_phf',
      showGroupMeans: true,
      errorBarMode: 'sd',
    },
    analyticalConfig: {
      instrumentType: 'ICP-OES',
      instrumentModel: 'Radial/Axial Optical Spectrometer 5800 (Demo Fixture)',
      analyteElement: 'Pt',
      wavelengthNm: 214.423,
      matrixDescription: 'Diluted aqueous matrix (demo fixture)',
      calibrationUnits: 'ppm',
      analystName: 'Dr. E. Lindqvist (Demo)',
      analysisDate: '2026-11-21',
      notes: 'Synthetic analytical records for numerical analysis demonstration.',
      dataProvenance: 'synthetic_demo',
    },
    calibrationStandards: [],
    instrumentMeasurements: [],
    analyticalSessions: demoAnalyticalSessions,
    activeAnalyticalSessionId: demoAnalyticalSessions[0].id,
    analyticalComparison: {
      selectedSessionIds: demoAnalyticalSessions.map((s) => s.id),
      compareAnalyteSymbol: 'Pt',
      plotMode: 'concentration_comparison',
    },
    researchPlan: {
      researchQuestions: [
        'How does recorded Pt uptake on amorphous SiO2 vary across final equilibrium pH (3.5–12.0)? (Synthetic demo)',
        'How consistent are ICP-OES and Flame AAS readings across paired replicate aliquots? (Synthetic demo)',
      ],
      plannedSampleIds: [
        'UPT-01',
        'UPT-02',
        'UPT-03',
        'UPT-04',
        'UPT-04B',
        'UPT-05',
        'UPT-06',
        'UPT-07',
        'PZC-01',
        'PZC-02',
      ],
      plannedMeasurementRequirements:
        'Paired initial/final pH readings across 6 pH targets, duplicate replicates at key points, multi-analyte ICP-OES (Pt 214.423 nm + Si 251.611 nm), procedural blanks, and Flame AAS cross-check.',
      plannedAnalyticalSessions:
        'ANA-ICP-01 (primary multi-analyte ICP-OES assay) and ANA-AAS-02 (comparative Flame AAS Pt 265.945 nm cross-check).',
      expectedDeliverables:
        'Replicate-grouped uptake vs. pHf figure, pH-shift exploratory figure, consolidated review record, reproducible ZIP package, and finalized A4 research report.',
      externalProtocolRefs: [
        'Demo Reference SOP-SEA-2026-01 (Synthetic placeholder — not an operational laboratory protocol).',
      ],
      deviations: [
        {
          id: 'dev-demo-1',
          timestamp: '2026-11-20T10:35:00.000Z',
          author: 'Dr. E. Lindqvist (Demo)',
          description:
            'Equilibration Duration (Series A): planned 60 min vs. actual 60 min 45 s.',
          reason:
            'Synthetic demonstration deviation: vacuum filtration manifold handoff added 45 s.',
        },
      ],
    },
    lifecycleHistory: [
      {
        id: 'lc-demo-1',
        fromStatus: null,
        toStatus: 'Draft',
        timestamp: '2026-11-18T09:00:00.000Z',
        researcher: 'Dr. E. Lindqvist (Demo)',
        explanation: 'Initialized synthetic demonstration experiment record.',
        snapshotId: null,
      },
      {
        id: 'lc-demo-2',
        fromStatus: 'Draft',
        toStatus: 'Planned',
        timestamp: '2026-11-19T11:15:00.000Z',
        researcher: 'Dr. E. Lindqvist (Demo)',
        explanation:
          'Locked SiO2 and [Pt(NH3)4](NO3)2 material snapshots and defined planned sample series.',
        snapshotId: null,
      },
      {
        id: 'lc-demo-3',
        fromStatus: 'Planned',
        toStatus: 'In Progress',
        timestamp: '2026-11-20T09:00:00.000Z',
        researcher: 'Dr. E. Lindqvist (Demo)',
        explanation:
          'Started survey data entry, bench milestones, and ICP-OES / Flame AAS analytical sessions.',
        snapshotId: null,
      },
    ],
    milestones: demoMilestones,
    timers: demoTimers,
    sampleRegistryNotes: [
      {
        sampleKey: 'sm-demo-4',
        classification: 'Primary Linked Uptake Sample',
        notes:
          'Anchor sample linked across DS-UPT-01, ICP-OES (im-demo-1, im-demo-2), and Flame AAS cross-check (im-aas-1, im-aas-2).',
      },
    ],
    activityEvents: [
      {
        id: 'act-demo-1',
        eventType: 'experiment_created',
        module: 'overview',
        timestamp: '2026-11-18T09:00:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'experiment',
        sourceId: 'exp-demo-001',
        sourceLabel: 'SEA-DEMO-001',
        author: 'Dr. E. Lindqvist (Demo)',
        description:
          'Initialized SEA-DEMO-001 synthetic demonstration experiment.',
      },
      {
        id: 'act-demo-2',
        eventType: 'material_changed',
        module: 'batch-synthesis',
        timestamp: '2026-11-19T11:15:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'experiment',
        sourceId: 'exp-demo-001',
        sourceLabel: 'SiO2 & Pt Snapshots',
        author: 'Dr. E. Lindqvist (Demo)',
        description:
          'Locked immutable material snapshots for Amorphous Silica (SiO2) and Tetraammineplatinum(II) Nitrate.',
      },
      {
        id: 'act-demo-3',
        eventType: 'survey_dataset_event',
        module: 'uptake-survey',
        timestamp: '2026-11-20T10:38:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'survey_dataset',
        sourceId: dsUptakePrimary.id,
        sourceLabel: dsUptakePrimary.datasetId,
        author: 'Dr. E. Lindqvist (Demo)',
        description:
          'Recorded primary uptake dataset DS-UPT-01 (10 rows), comparison series DS-UPT-02, and pH-shift dataset DS-PZC-01.',
      },
      {
        id: 'act-demo-4',
        eventType: 'measurement_link_changed',
        module: 'analytical',
        timestamp: '2026-11-21T15:10:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'analytical_session',
        sourceId: demoAnalyticalSessions[0].id,
        sourceLabel: demoAnalyticalSessions[0].sessionId,
        author: 'Dr. E. Lindqvist (Demo)',
        description:
          'Logged ICP-OES session ANA-ICP-01 (Pt & Si) and linked UPT-04 initial/final aliquots.',
      },
      {
        id: 'act-demo-5',
        eventType: 'quality_review_decision',
        module: 'analytical',
        timestamp: '2026-11-22T11:00:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'sample_measurement',
        sourceId: 'im-demo-5',
        sourceLabel: 'ICP-UPT05-FIN',
        author: 'Dr. E. Lindqvist (Demo)',
        description:
          'Marked instrument warning on ICP-UPT05-FIN as Under Review pending Flame AAS cross-check.',
      },
    ],
    snapshots: [],
    finalizedReports: [],
    observations: [
      {
        id: 'obs-demo-1',
        timestamp: '2026-11-20T09:15:00.000Z',
        module: 'batch-synthesis',
        category: 'General observation',
        author: 'Dr. E. Lindqvist (Demo)',
        text: 'Linked demonstration SiO2 support and [Pt(NH3)4](NO3)2 precursor records. Material snapshots locked at experiment initialization.',
        provenance: 'synthetic_demo',
        references: [
          {
            kind: 'material_snapshot',
            id: demoSupportSnapshot.snapshotId,
            label: 'SiO2 Support Snapshot',
          },
          {
            kind: 'material_snapshot',
            id: demoPrecursorSnapshot.snapshotId,
            label: 'Pt Precursor Snapshot',
          },
        ],
      },
      {
        id: 'obs-demo-2',
        timestamp: '2026-11-20T10:42:00.000Z',
        module: 'uptake-survey',
        category: 'Data-quality concern',
        author: 'Dr. E. Lindqvist (Demo)',
        text: 'Sample UPT-06 replicate R2 final ICP-OES reading intentionally left unrecorded to verify null gap rendering, qualifier tracking, and statistical missing-count guardrails.',
        provenance: 'synthetic_demo',
        references: [
          {
            kind: 'survey_dataset',
            id: dsUptakePrimary.id,
            label: dsUptakePrimary.datasetId,
          },
          {
            kind: 'sample_measurement',
            id: 'sm-demo-6',
            label: 'UPT-06',
          },
        ],
      },
      {
        id: 'obs-demo-3',
        timestamp: '2026-11-22T11:20:00.000Z',
        module: 'analytical',
        category: 'Analytical observation',
        author: 'Dr. E. Lindqvist (Demo)',
        text: 'Procedural rinse blank ICP-BLK-02 reported <0.02 ppm (below externally supplied LOD). Preserved with explicit qualifier and null numerical concentration.',
        provenance: 'synthetic_demo',
        references: [
          {
            kind: 'analytical_session',
            id: demoAnalyticalSessions[0].id,
            label: demoAnalyticalSessions[0].sessionId,
          },
        ],
      },
    ],
    benchChecklist: [],
    benchTimer: {
      elapsedMs: 3645000,
      elapsedStatus: 'paused',
      elapsedLastTickAt: null,
      countdownDurationSec: 3600,
      activeCountdownDurationSec: 3600,
      countdownRemainingMs: 1800000,
      countdownStatus: 'paused',
      countdownLastTickAt: null,
      startedAt: '2026-11-20T09:30:00.000Z',
      completedAt: null,
    },
    benchLogs: [
      {
        id: 'log-demo-1',
        timestamp: '2026-11-20T09:04:00.000Z',
        eventType: 'checklist',
        message:
          'Completed milestone: Confirm experiment ID, project code, and material snapshot records.',
      },
      {
        id: 'log-demo-2',
        timestamp: '2026-11-20T09:30:00.000Z',
        eventType: 'timer',
        message: 'Equilibration Run — Series A timer started.',
      },
    ],
    reportConfig: {
      mode: 'post-experiment',
      reportType: 'complete-research',
      reportTitle: '',
      reportSubtitle:
        'Integrated SEA Survey, Analytical Assay & Quality Review Record',
      researcherName: '',
      reportDate: '',
      includeCoverPage: false,
      includePageNumbers: true,
      sectionOrder: [...DEFAULT_REPORT_SECTION_ORDER],
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includePlannedVsActual: true,
      includeResearchTimeline: false,
      includeSampleRegistry: true,
      includeSnapshotMetadata: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeAnalyticalOverview: true,
      includeCalibrationRecords: true,
      includeAnalyticalFigures: true,
      includeDilutionRecords: true,
      includeAnalyticalQualityReview: true,
      includeSurveyAnalyticalLinks: true,
      includeCrossExperimentSummary: true,
      includeResearchMatrix: true,
      includeAdvancedStatistics: true,
      includeMeasurementUncertainty: true,
      includeCompatibilityLimitations: true,
      includeAnalysisAssumptions: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: true,
      includeBenchChecklist: true,
      researcherConclusions: '',
      selectedSurveyDatasetIds: ['ds-demo-upt-1', 'ds-demo-pzc-1'],
      selectedFigureIds: ['fig-demo-upt-main'],
      selectedAnalyticalSessionIds: ['as-demo-icp-01'],
      selectedAnalyticalFigureIds: ['afig-demo-icp-cal', 'afig-demo-icp-res'],
      institutionHeader: 'SEA Workbench — Demonstration Research Record',
      reportFooterNote:
        'Synthetic demonstration dataset — exploratory numerical outputs only; not validated for operational laboratory synthesis or analytical method validation.',
    },
  });

  // Stamp Phase 5 reproducibility provenance on demo survey & analytical saved figures
  demoExperimentBase.surveyDatasets = demoExperimentBase.surveyDatasets.map(
    (ds) => {
      const prov = buildSurveyAnalysisProvenance(demoExperimentBase, ds);
      const nextFigs = ds.savedFigures.map((fig) => ({
        ...fig,
        analysisProvenance: { ...prov, capturedAt: demoUpdatedAt },
      }));
      return {
        ...ds,
        savedFigures: nextFigs,
        figureConfig: nextFigs[0] ?? ds.figureConfig,
      };
    }
  );
  demoExperimentBase.analyticalSessions =
    demoExperimentBase.analyticalSessions.map((sess) => {
      const prov = buildAnalyticalAnalysisProvenance(demoExperimentBase, sess);
      const nextFigs = sess.savedFigures.map((fig) => ({
        ...fig,
        analysisProvenance: { ...prov, capturedAt: demoUpdatedAt },
      }));
      return {
        ...sess,
        savedFigures: nextFigs,
        figureConfig: nextFigs[0] ?? sess.figureConfig,
      };
    });

  // Create two deterministic immutable snapshots + 1 finalized report v1 on SEA-DEMO-001
  const baselineExpState = structuredClone(demoExperimentBase);
  baselineExpState.analyticalSessions = [
    demoExperimentBase.analyticalSessions[0],
  ];
  baselineExpState.status = 'Measurements Pending';
  const snap1 = createExperimentSnapshotRecord(baselineExpState, {
    snapshotId: 'snap-demo-01',
    name: 'Baseline Survey & Initial ICP-OES Capture',
    description:
      'Immutable baseline snapshot captured after completing primary survey datasets and initial ICP-OES assay, prior to Flame AAS cross-check.',
    researcher: 'Dr. E. Lindqvist (Demo)',
    capturedAt: '2026-11-21T16:00:00.000Z',
  });

  const snap2 = createExperimentSnapshotRecord(demoExperimentBase, {
    snapshotId: 'snap-demo-02',
    name: 'Pre-Review Multi-Session Snapshot (v1)',
    description:
      'Immutable snapshot encompassing all three survey datasets, both ICP-OES and Flame AAS sessions, and structured quality review items.',
    researcher: 'Dr. E. Lindqvist (Demo)',
    capturedAt: demoUpdatedAt,
  });

  const demoFinalizedReport: FinalizedReport = {
    id: 'frep-demo-v1',
    versionNumber: 1,
    title: 'SEA-DEMO-001 — Complete Research Report (Finalized v1)',
    reportType: 'complete-research',
    snapshotId: snap2.snapshotId,
    snapshotName: snap2.name,
    finalizedAt: demoUpdatedAt,
    researcher: 'Dr. E. Lindqvist (Demo)',
    scientificReviewStatus: demoExperimentBase.scientificReviewStatus,
    reportConfig: structuredClone(demoExperimentBase.reportConfig),
    notes:
      'Demonstration finalized report bound to immutable snapshot Pre-Review Multi-Session Snapshot (v1). Subsequent edits to the live experiment will not alter this archived report.',
  };

  const demoExperiment: Experiment = {
    ...demoExperimentBase,
    snapshots: [snap1, snap2],
    finalizedReports: [demoFinalizedReport],
    activityEvents: [
      ...(demoExperimentBase.activityEvents ?? []),
      {
        id: 'act-demo-6',
        eventType: 'snapshot_created',
        module: 'overview',
        timestamp: '2026-11-21T16:00:00.000Z',
        experimentUuid: 'exp-demo-001',
        sourceKind: 'snapshot',
        sourceId: snap1.snapshotId,
        sourceLabel: snap1.name,
        author: 'Dr. E. Lindqvist (Demo)',
        description: `Created immutable snapshot "${snap1.name}".`,
      },
      {
        id: 'act-demo-7',
        eventType: 'report_finalized',
        module: 'lab-report',
        timestamp: demoUpdatedAt,
        experimentUuid: 'exp-demo-001',
        sourceKind: 'finalized_report',
        sourceId: demoFinalizedReport.id,
        sourceLabel: 'Finalized Report v1',
        author: 'Dr. E. Lindqvist (Demo)',
        description: `Finalized report v1 ("${demoFinalizedReport.title}") bound to snapshot "${snap2.name}".`,
      },
    ],
  };

  // Second consistent synthetic demonstration experiment (Batch Synthesis — Planned)
  const demoAl2O3Snapshot: MaterialSnapshot = {
    snapshotId: 'snap-supp-demo-02',
    capturedAt: demoUpdatedAt,
    sourceMaterialId: demoSupports[1].id,
    materialKind: 'support',
    sourceUpdatedAt: demoSupports[1].updatedAt,
    supportData: structuredClone(demoSupports[1]),
  };
  const demoBatchExp = createBlankExperiment({
    experimentId: 'SEA-DEMO-002',
    title: 'PtCl6²⁻ on γ-Al2O3 — Synthetic Batch Synthesis Planning Record',
    projectId: demoProject.id,
    researcher: 'Dr. E. Lindqvist (Demo)',
    type: 'Batch Synthesis',
    objective:
      'Synthetic planning-stage batch synthesis experiment demonstrating anionic precursor pairing on γ-Al2O3 (high-PZC support), structured research planning, and multi-experiment portfolio management.',
    experimentDate: '2026-11-25',
    tags: ['demonstration', 'synthetic-fixture', 'Pt/Al2O3', 'planning'],
  });
  demoBatchExp.uuid = 'exp-demo-002';
  demoBatchExp.status = 'Planned';
  demoBatchExp.isDemonstration = true;
  demoBatchExp.scientificReviewStatus = 'Demonstration Fixture';
  demoBatchExp.createdAt = '2026-11-22T08:00:00.000Z';
  demoBatchExp.updatedAt = demoUpdatedAt;
  demoBatchExp.batch = {
    ...demoBatchExp.batch,
    supportId: demoSupports[1].id,
    precursorId: demoPrecursors[1].id,
    supportSnapshot: demoAl2O3Snapshot,
    precursorSnapshot: createPrecursorSnapshot(demoPrecursors[1]),
    plannedSupportMassG: 2.0,
    plannedSolutionVolumeMl: 100.0,
    plannedSurfaceLoadingM2L: 4200,
    plannedTargetMetalLoadingWtPct: 1.0,
    plannedInitialPh: 3.2,
    plannedPrecursorConcPpm: 200.0,
    contactTimeMin: 60,
    temperatureC: 22.0,
    agitationMode: 'Overhead stirring, 200 rpm (planned demo note)',
    dataProvenance: 'synthetic_demo',
  };
  demoBatchExp.researchPlan = {
    researchQuestions: [
      'Does acidic-regime anionic PtCl6²⁻ adsorption on γ-Al2O3 achieve consistent supernatant depletion in a 100 mL synthetic batch plan?',
    ],
    plannedSampleIds: ['BTH-01-INIT', 'BTH-01-SUP-R1', 'BTH-01-SUP-R2'],
    plannedMeasurementRequirements:
      'Planned support mass & volume verification, initial/final pH, and ICP-OES Pt assay of initial stock and post-filtration supernatant.',
    plannedAnalyticalSessions:
      'Planned ICP-OES session (Pt 214.423 nm + Al support dissolution monitoring).',
    expectedDeliverables:
      'Pre-experiment Research Planning Sheet and post-contact batch documentation record.',
    externalProtocolRefs: [
      'Synthetic Reference SOP-SEA-BATCH-02 (Documentation placeholder only).',
    ],
    deviations: [],
  };
  demoBatchExp.lifecycleHistory = [
    {
      id: 'lc-demo-201',
      fromStatus: null,
      toStatus: 'Draft',
      timestamp: '2026-11-22T08:00:00.000Z',
      researcher: 'Dr. E. Lindqvist (Demo)',
      explanation: 'Initialized synthetic batch synthesis planning record.',
      snapshotId: null,
    },
    {
      id: 'lc-demo-202',
      fromStatus: 'Draft',
      toStatus: 'Planned',
      timestamp: demoUpdatedAt,
      researcher: 'Dr. E. Lindqvist (Demo)',
      explanation:
        'Assigned γ-Al2O3 & H2PtCl6 material snapshots and completed planning metadata.',
      snapshotId: null,
    },
  ];
  demoBatchExp.reportConfig.reportType = 'research-planning';

  const demoUncertaintyRecords: MeasurementUncertaintyRecord[] = [
    {
      id: 'unc-demo-01',
      experimentUuid: 'exp-demo-001',
      targetKind: 'survey_measurement',
      measurementId: 'sm-demo-5',
      measurementLabel: 'UPT-05 (pH 10.5 Replicate R1)',
      quantityName: 'Recorded Metal Uptake (Γ)',
      value: 1.74,
      unit: 'µmol/m²',
      uncertaintyValue: 0.06,
      uncertaintyUnit: 'µmol/m²',
      uncertaintyType: 'standard_uncertainty',
      source: 'Propagated mass & ICP-OES concentration uncertainty (Demo Fixture)',
      reference: 'Synthetic Demo Calculation Note UNC-01',
      conditions: '22 °C, 1000 m²/L, 1 h equilibration',
      coverageFactor: 1,
      provenance: 'synthetic_demo',
      reviewStatus: 'Demonstration Fixture',
      notes: 'Synthetic standard uncertainty (1σ) attached to UPT-05 for demonstration of error-bar and propagation tools.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'unc-demo-02',
      experimentUuid: 'exp-demo-001',
      targetKind: 'survey_measurement',
      measurementId: 'sm-demo-5b',
      measurementLabel: 'UPT-05B (pH 10.5 Replicate R2)',
      quantityName: 'Recorded Metal Uptake (Γ)',
      value: 1.7,
      unit: 'µmol/m²',
      uncertaintyValue: 0.12,
      uncertaintyUnit: 'µmol/m²',
      uncertaintyType: 'expanded_uncertainty',
      source: 'Expanded uncertainty (k = 2) demonstration fixture',
      reference: 'Synthetic Demo Calculation Note UNC-02',
      conditions: '22 °C, 1000 m²/L, coverage factor k = 2',
      coverageFactor: 2,
      provenance: 'synthetic_demo',
      reviewStatus: 'Demonstration Fixture',
      notes: 'Illustrates explicit distinction between standard uncertainty (1σ) and expanded uncertainty (U = k·u_c).',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'unc-demo-03',
      experimentUuid: 'exp-demo-001',
      targetKind: 'survey_measurement',
      measurementId: 'sm-demo-3',
      measurementLabel: 'UPT-03 (pH 7.5 Replicate R1)',
      quantityName: 'Recorded Metal Uptake (Γ)',
      value: 1.12,
      unit: 'µmol/m²',
      uncertaintyValue: 0.05,
      uncertaintyUnit: 'µmol/m²',
      uncertaintyType: 'sample_sd',
      source: 'Replicate sample SD record (Demo Fixture)',
      reference: 'GRP-PH07 Replicate Group',
      conditions: 'n = 2 valid replicates (UPT-03X excluded)',
      coverageFactor: null,
      provenance: 'synthetic_demo',
      reviewStatus: 'Demonstration Fixture',
      notes: 'Recorded sample standard deviation across valid pH 7.5 replicates.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
    {
      id: 'unc-demo-04',
      experimentUuid: 'exp-demo-001',
      targetKind: 'material_property',
      measurementId: 'supp-demo-sio2-bet',
      measurementLabel: 'Amorphous Silica Grade S-300 — BET Surface Area',
      quantityName: 'BET Specific Surface Area',
      value: 300.0,
      unit: 'm²/g',
      uncertaintyValue: 6.5,
      uncertaintyUnit: 'm²/g',
      uncertaintyType: 'manufacturer_reported',
      source: 'Supplier lot characterization datasheet (Synthetic Fixture)',
      reference: 'ref-supp-1',
      conditions: 'N2 physisorption at 77 K',
      coverageFactor: null,
      provenance: 'synthetic_demo',
      reviewStatus: 'Demonstration Fixture',
      notes: 'Manufacturer-reported uncertainty interval for specific surface area.',
      createdAt: demoCreatedAt,
      updatedAt: demoUpdatedAt,
    },
  ];

  demoExperiment.uncertaintyRecords = demoUncertaintyRecords;

  const demoScopeWithSynthetic = {
    ...createDefaultResearchScopeFilter(true),
  };

  const defaultComparisonConfig: ResearchComparisonConfiguration = {
    id: 'rcmp-demo-01',
    name: 'Pt/SiO2 Multi-Series Uptake Comparison (Demo)',
    description:
      'Compares recorded Pt uptake across 1000 m²/L and 500 m²/L synthetic survey datasets with explicit surface-loading condition notes.',
    quantityKey: 'uptake_umol_m2',
    scope: demoScopeWithSynthetic,
    selectedExperimentUuids: [demoExperiment.uuid],
    selectedSurveyDatasetIds: ['ds-demo-upt-1', 'ds-demo-upt-2'],
    selectedAnalyticalSessionIds: [],
    excludeFlaggedMeasurements: true,
    errorBarMode: 'sd',
    sourceContentHash: '',
    calcEngineVersion: CALC_ENGINE_VERSION,
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  const defaultMatrixConfig: ResearchMatrixConfiguration = {
    id: 'rmtx-demo-01',
    name: 'Portfolio Survey Dataset Matrix (Demo)',
    description:
      'Structured comparison matrix of survey datasets with quartiles, IQR, MAD, material reference properties, and review status.',
    granularity: 'survey_dataset',
    quantityKey: 'uptake_umol_m2',
    columns: [...DEFAULT_RESEARCH_MATRIX_COLUMNS],
    sortColumn: 'recordId',
    sortDirection: 'asc',
    searchQuery: '',
    scope: demoScopeWithSynthetic,
    sourceContentHash: '',
    calcEngineVersion: CALC_ENGINE_VERSION,
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  const defaultAnalysisSnapshot: ResearchAnalysisSnapshot = {
    id: 'ras-demo-01',
    title: 'Baseline Pt/SiO2 Cross-Series Uptake Analysis Record (Demo)',
    analysisKind: 'cross_experiment_comparison',
    scope: demoScopeWithSynthetic,
    includedExperimentUuids: [demoExperiment.uuid],
    includedSurveyDatasetIds: ['ds-demo-upt-1', 'ds-demo-upt-2'],
    includedAnalyticalSessionIds: ['as-demo-icp-01'],
    includedMeasurementIds: ['sm-demo-1', 'sm-demo-2', 'sm-demo-3', 'sm-demo-3b', 'sm-demo-4', 'sm-demo-5', 'sm-demo-5b'],
    exclusionRulesSummary: 'User-excluded rows omitted; flagged rows excluded from descriptive stats.',
    unitSummary: 'µmol/m² (uptake), pH (acidity), ppm (ICP-OES concentration)',
    provenanceSummary: ['synthetic_demo'],
    scientificReviewStatus: 'Demonstration Fixture',
    containsSyntheticData: true,
    sourceContentHash: '',
    calcEngineVersion: CALC_ENGINE_VERSION,
    capturedAt: demoUpdatedAt,
    summaryNotes:
      'Demonstration reproducible analysis snapshot recording exact scope, inclusion rules, units, and calc engine version.',
  };

  const projectedDemoBatchExp = projectExperimentCompatibilityMirrors(demoBatchExp);
  let demoCrossSnapSeq = 0;
  demoFinalizedReport.crossExperimentSnapshots =
    captureCrossExperimentSnapshotsForReport(
      snap2.payload,
      [demoExperiment, projectedDemoBatchExp],
      demoExperimentBase.reportConfig,
      {
        capturedAt: demoUpdatedAt,
        researcher: 'Dr. E. Lindqvist (Demo)',
        idGenerator: (prefix) => `${prefix}-demo-${++demoCrossSnapSeq}`,
      }
    );

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    projects: [demoProject],
    experiments: [demoExperiment, projectedDemoBatchExp],
    activeExperimentUuid: demoExperiment.uuid,
    precursors: demoPrecursors,
    supports: demoSupports,
    importMappingTemplates: createDefaultImportMappingTemplates(),
    experimentTemplates: createDefaultExperimentTemplates(),
    researchComparisonConfigs: [defaultComparisonConfig],
    researchMatrixConfigs: [defaultMatrixConfig],
    researchAnalysisSnapshots: [defaultAnalysisSnapshot],
    preferences: {
      sidebarCollapsed: false,
      defaultResearcher: 'Research Scientist',
      lastBackupExportedAt: demoUpdatedAt,
    },
    hasInitializedDemo: true,
    lastSavedAt: demoUpdatedAt,
  };
}

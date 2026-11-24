import {
  APP_VERSION,
  CALC_ENGINE_VERSION,
  EXPERIMENT_DATA_VERSION,
  Experiment,
  ExperimentType,
  FigureConfiguration,
  MaterialSnapshot,
  Precursor,
  ResearchAnnotation,
  ResearchProject,
  Support,
  SurveyDataset,
  SurveyMeasurement,
  SurveyMode,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import { createDefaultFigureConfig } from '../../domain/calculations/surveyAnalysis';

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

  return {
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
      calibrationUnits: 'mg/L (ppm)',
      analystName: params.researcher.trim(),
      analysisDate: today,
      notes: '',
      dataProvenance: 'user_entered',
    },
    calibrationStandards: [],
    instrumentMeasurements: [],
    observations: [],
    benchChecklist: [
      {
        id: generateUuid('chk'),
        label: 'Verify material records and experiment metadata',
        completed: false,
        plannedTime: '',
        actualCompletedAt: null,
        notes: '',
      },
      {
        id: generateUuid('chk'),
        label: 'Record initial pH and sample identifiers',
        completed: false,
        plannedTime: '',
        actualCompletedAt: null,
        notes: '',
      },
      {
        id: generateUuid('chk'),
        label: 'Log equilibration completion and final measurements',
        completed: false,
        plannedTime: '',
        actualCompletedAt: null,
        notes: '',
      },
    ],
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
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: true,
      includeBenchChecklist: true,
      selectedSurveyDatasetIds: [],
      selectedFigureIds: [],
      institutionHeader: 'SEA Workbench Laboratory Record',
      reportFooterNote:
        'Numerical analysis is exploratory; domain-specific SEA calculation models remain pending independent scientific review.',
    },
  };
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

  // Regenerate analytical IDs and remap all survey dataset links
  const analyticalIdMap = new Map<string, string>();
  clone.instrumentMeasurements = clone.instrumentMeasurements.map((m) => {
    const nextId = generateUuid('im');
    analyticalIdMap.set(m.id, nextId);
    return { ...m, id: nextId };
  });

  const datasetIdMap = new Map<string, string>();
  const clonedDatasets: SurveyDataset[] = [];
  for (const ds of source.surveyDatasets ?? []) {
    const copiedDs = duplicateSurveyDatasetRecord(ds, clonedDatasets, analyticalIdMap);
    // Keep original datasetId label on experiment copy so series codes stay readable
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

  const activeDs =
    clonedDatasets.find((d) => d.id === clone.activeSurveyDatasetId) ??
    clonedDatasets[0];

  if (activeDs) {
    clone.surveyConfig = structuredClone(activeDs.config);
    clone.surveyMeasurements = structuredClone(activeDs.measurements);
  } else {
    clone.surveyMeasurements = clone.surveyMeasurements.map((row) => ({
      ...row,
      id: generateUuid('sm'),
      linkedInitialMeasurementId: row.linkedInitialMeasurementId
        ? analyticalIdMap.get(row.linkedInitialMeasurementId) ?? null
        : null,
      linkedFinalMeasurementId: row.linkedFinalMeasurementId
        ? analyticalIdMap.get(row.linkedFinalMeasurementId) ?? null
        : null,
    }));
  }

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

  clone.calibrationStandards = clone.calibrationStandards.map((std) => ({
    ...std,
    id: generateUuid('cal'),
  }));
  clone.observations = clone.observations.map((obs) => ({
    ...obs,
    id: generateUuid('obs'),
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

  return clone;
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

  const demoExperiment: Experiment = {
    uuid: 'exp-demo-001',
    experimentId: 'SEA-DEMO-001',
    title: 'Pt(NH3)4(NO3)2 on SiO2 — Synthetic Uptake & PZC Demonstration',
    projectId: demoProject.id,
    researcher: 'Dr. E. Lindqvist (Demo)',
    type: 'Uptake Survey',
    objective:
      'Demonstrate structured multi-dataset survey management, immutable material snapshots, explicit replicate grouping, linked ICP-OES analytical records, Figure Studio customization, comparative analysis, and A4 reporting using clearly labeled synthetic fixtures.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
    experimentDate: '2026-11-20',
    status: 'In Progress',
    tags: ['demonstration', 'synthetic-fixture', 'Pt/SiO2'],
    generalObservations:
      'All numerical entries in this demonstration record are synthetic fixtures created to verify interface workflows, tabular alignment, statistical guardrails, null handling, comparative plotting, and A4 report printing.',
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
      instrumentModel: 'Radial/Axial Optical Spectrometer (Demo Fixture)',
      analyteElement: 'Pt',
      wavelengthNm: 214.424,
      matrixDescription: 'Diluted aqueous matrix (demo fixture)',
      calibrationUnits: 'mg/L (ppm)',
      analystName: 'Dr. E. Lindqvist (Demo)',
      analysisDate: '2026-11-21',
      notes: 'Synthetic analytical records for numerical analysis demonstration.',
      dataProvenance: 'synthetic_demo',
    },
    calibrationStandards: [
      {
        id: 'cal-demo-1',
        standardId: 'CAL-00',
        nominalConc: 0.0,
        unit: 'ppm',
        instrumentResponse: 112.4,
        responseUnit: 'cps',
        replicateNumber: 1,
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        notes: 'Matrix blank (synthetic).',
      },
      {
        id: 'cal-demo-2',
        standardId: 'CAL-05',
        nominalConc: 5.0,
        unit: 'ppm',
        instrumentResponse: 18420.0,
        responseUnit: 'cps',
        replicateNumber: 1,
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        notes: 'Synthetic calibration point.',
      },
      {
        id: 'cal-demo-3',
        standardId: 'CAL-25',
        nominalConc: 25.0,
        unit: 'ppm',
        instrumentResponse: 91640.0,
        responseUnit: 'cps',
        replicateNumber: 1,
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        notes: 'Synthetic calibration point.',
      },
      {
        id: 'cal-demo-4',
        standardId: 'CAL-50',
        nominalConc: 50.0,
        unit: 'ppm',
        instrumentResponse: 182910.0,
        responseUnit: 'cps',
        replicateNumber: 1,
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        notes: 'Synthetic calibration point.',
      },
    ],
    instrumentMeasurements: [
      {
        id: 'im-demo-1',
        sampleId: 'ICP-UPT04-INIT',
        linkedSurveySampleId: 'UPT-04',
        analyte: 'Pt',
        stage: 'Initial',
        replicateId: 'R1',
        dilutionFactor: 10,
        rawSignal: 73410.0,
        signalUnit: 'cps',
        reportedConc: 20.02,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: '2026-11-21',
        notes: 'Initial aliquot record (10× dilution → 200.2 ppm effective, synthetic).',
      },
      {
        id: 'im-demo-2',
        sampleId: 'ICP-UPT04-FIN',
        linkedSurveySampleId: 'UPT-04',
        analyte: 'Pt',
        stage: 'Final',
        replicateId: 'R1',
        dilutionFactor: 10,
        rawSignal: 34820.0,
        signalUnit: 'cps',
        reportedConc: 9.46,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: '2026-11-21',
        notes: 'Final supernatant aliquot record (10× dilution → 94.6 ppm effective, synthetic).',
      },
      {
        id: 'im-demo-3',
        sampleId: 'ICP-UPT06-FIN',
        linkedSurveySampleId: 'UPT-06',
        analyte: 'Pt',
        stage: 'Final',
        replicateId: 'R2',
        dilutionFactor: 10,
        rawSignal: null,
        signalUnit: 'cps',
        reportedConc: null,
        concUnit: 'ppm',
        provenance: 'unavailable',
        qualityStatus: 'pending',
        measurementDate: '2026-11-21',
        notes: 'Queued for measurement — intentionally blank.',
      },
    ],
    observations: [
      {
        id: 'obs-demo-1',
        timestamp: '2026-11-20T09:15:00.000Z',
        module: 'batch-synthesis',
        category: 'Synthesis',
        author: 'Dr. E. Lindqvist (Demo)',
        text: 'Linked demonstration SiO2 support and [Pt(NH3)4](NO3)2 precursor records. Material snapshots locked at experiment initialization.',
        provenance: 'synthetic_demo',
      },
      {
        id: 'obs-demo-2',
        timestamp: '2026-11-20T10:42:00.000Z',
        module: 'uptake-survey',
        category: 'Survey',
        author: 'Dr. E. Lindqvist (Demo)',
        text: 'Sample UPT-06 replicate R2 final ICP-OES reading intentionally left unrecorded to verify null gap rendering and statistical missing-count guardrails.',
        provenance: 'synthetic_demo',
      },
    ],
    benchChecklist: [
      {
        id: 'chk-demo-1',
        label: 'Confirm experiment ID, project code, and material snapshot records',
        completed: true,
        plannedTime: '09:00',
        actualCompletedAt: '2026-11-20T09:04:00.000Z',
        notes: 'Verified demonstration snapshots.',
      },
      {
        id: 'chk-demo-2',
        label: 'Log initial pH measurements across survey series',
        completed: true,
        plannedTime: '09:30',
        actualCompletedAt: '2026-11-20T09:38:00.000Z',
        notes: '10 sample records entered across 6 explicit groups in DS-UPT-01.',
      },
      {
        id: 'chk-demo-3',
        label: 'Complete equilibration timing window and record final pH',
        completed: true,
        plannedTime: '10:30',
        actualCompletedAt: '2026-11-20T10:35:00.000Z',
        notes: '',
      },
      {
        id: 'chk-demo-4',
        label: 'Record remaining ICP-OES analytical output for UPT-06 (R2)',
        completed: false,
        plannedTime: '14:00',
        actualCompletedAt: null,
        notes: 'Pending instrument queue.',
      },
    ],
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
          'Completed checklist item: Confirm experiment ID, project code, and material snapshot records.',
      },
      {
        id: 'log-demo-2',
        timestamp: '2026-11-20T09:30:00.000Z',
        eventType: 'timer',
        message: 'Elapsed experiment timer started.',
      },
    ],
    reportConfig: {
      mode: 'post-experiment',
      includeMaterialSnapshots: true,
      includeBatchRecords: true,
      includeSurveyOverview: true,
      includeSurveyTable: true,
      includeSurveyFigure: true,
      includeStatisticalSummaries: true,
      includeComparativeSummary: true,
      includeAnalyticalRecords: true,
      includeRegressionSummary: true,
      includeDataQualityLimitations: true,
      includeResearchInterpretations: true,
      includeScientificReferences: true,
      includeObservations: true,
      includeBenchChecklist: true,
      selectedSurveyDatasetIds: ['ds-demo-upt-1', 'ds-demo-pzc-1'],
      selectedFigureIds: ['fig-demo-upt-main'],
      institutionHeader: 'SEA Workbench — Demonstration Research Record',
      reportFooterNote:
        'Synthetic demonstration dataset — exploratory numerical outputs only; not validated for operational laboratory synthesis.',
    },
  };

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    projects: [demoProject],
    experiments: [demoExperiment],
    activeExperimentUuid: demoExperiment.uuid,
    precursors: demoPrecursors,
    supports: demoSupports,
    preferences: {
      sidebarCollapsed: false,
      defaultResearcher: 'Research Scientist',
    },
    hasInitializedDemo: true,
    lastSavedAt: demoUpdatedAt,
  };
}

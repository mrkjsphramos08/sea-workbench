'use client';

import { create } from 'zustand';
import {
  APP_VERSION,
  ActiveModule,
  AnalyticalAnalyte,
  AnalyticalComparisonConfig,
  AnalyticalConfiguration,
  AnalyticalFigureConfiguration,
  AnalyticalQualityIssueCategory,
  AnalyticalReviewRecord,
  AnalyticalReviewStatus,
  AnalyticalSession,
  BatchConfiguration,
  BenchChecklistItem,
  BenchLog,
  BenchTimerState,
  CalibrationDataset,
  CalibrationStandard,
  DataProvenance,
  DatasetComparisonConfig,
  DilutionRecord,
  Experiment,
  ExperimentActivityEvent,
  ExperimentLifecycleEvent,
  ExperimentSnapshot,
  ExperimentStatus,
  ExperimentTemplate,
  ExperimentType,
  ExperimentalObservation,
  FigureConfiguration,
  FinalizedReport,
  ImportMappingTemplate,
  InstrumentImportRecord,
  InstrumentMeasurement,
  InstrumentType,
  MeasurementUncertaintyRecord,
  OverviewWorkspaceTab,
  Precursor,
  ReferencePzcMarker,
  ReplicateGroupMeta,
  ReportConfiguration,
  ResearchAnalysisSnapshot,
  ResearchAnalyticsTab,
  ResearchAnnotation,
  ResearchComparisonConfiguration,
  ResearchMatrixConfiguration,
  ResearchMilestone,
  ResearchPlanMetadata,
  ResearchProject,
  ResearchTimer,
  SampleRegistryNote,
  Support,
  SurveyAnalysisConfiguration,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
  SurveyMode,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../domain/models/types';
import { projectExperimentCompatibilityMirrors } from '../domain/models/projections';
import {
  buildAnalyticalAnalysisProvenance,
  buildSurveyAnalysisProvenance,
  captureCrossExperimentSnapshotsForReport,
  createDefaultResearchPlan,
  createExperimentSnapshotRecord,
  restoreSnapshotAsIndependentExperiment,
} from '../domain/calculations/workflowEngine';
import {
  createBlankAnalyticalSession,
  createBlankExperiment,
  createBlankSurveyDataset,
  createDefaultExperimentTemplates,
  createInitialDemoWorkspace,
  createPrecursorSnapshot,
  createSupportSnapshot,
  createSyntheticAnalyticalSession,
  createSyntheticDemoDataset,
  duplicateAnalyticalSessionRecord,
  duplicateExperimentRecord,
  duplicateSurveyDatasetRecord,
  generateUniqueDatasetId,
  generateUniqueExperimentId,
  generateUniqueSessionId,
  generateUuid,
} from '../data/demo/demoWorkspace';
import {
  StorageDiagnostics,
  computeStorageDiagnostics,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from '../services/persistence/storage';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface NavigationContextState {
  overviewTab: OverviewWorkspaceTab;
  surveyTab: string | null;
  analyticalTab: string | null;
  analyticsTab: ResearchAnalyticsTab;
  highlightRecordId: string | null;
  navigationNonce: number;
}

export interface WorkbenchStore extends WorkspaceStateData {
  activeModule: ActiveModule;
  hydrated: boolean;
  saveStatus: SaveStatus;
  storageBytes: number;
  storageError: string | null;
  storageDiagnostics: StorageDiagnostics | null;
  navigationContext: NavigationContextState;
  statusBanner: {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
  } | null;

  // Phase 5 & Phase 6 Cross-Module Navigation
  navigateToContext: (target: {
    module: ActiveModule;
    experimentUuid?: string;
    surveyDatasetId?: string;
    analyticalSessionId?: string;
    overviewTab?: OverviewWorkspaceTab;
    surveyTab?: string;
    analyticalTab?: string;
    analyticsTab?: ResearchAnalyticsTab;
    highlightRecordId?: string;
  }) => void;
  setOverviewTab: (tab: OverviewWorkspaceTab) => void;
  setAnalyticsTab: (tab: ResearchAnalyticsTab) => void;
  markBackupExported: () => void;

  // Lifecycle & persistence
  hydrateFromStorage: () => void;
  saveNow: () => boolean;
  dismissBanner: () => void;
  setActiveModule: (module: ActiveModule) => void;
  toggleSidebar: () => void;

  // Projects
  createProject: (input: {
    code: string;
    name: string;
    description: string;
    principalInvestigator: string;
  }) => ResearchProject;
  deleteProject: (projectId: string) => void;

  // Experiments
  createExperiment: (input: {
    experimentId?: string;
    title: string;
    projectId: string | null;
    researcher: string;
    type: ExperimentType;
    objective?: string;
    experimentDate?: string;
    tags?: string[];
  }) => Experiment;
  openExperiment: (uuid: string, targetModule?: ActiveModule) => void;
  updateExperimentMeta: (
    uuid: string,
    patch: Partial<
      Pick<
        Experiment,
        | 'experimentId'
        | 'title'
        | 'projectId'
        | 'researcher'
        | 'type'
        | 'objective'
        | 'experimentDate'
        | 'status'
        | 'tags'
        | 'generalObservations'
        | 'scientificReviewStatus'
      >
    >
  ) => void;
  duplicateExperiment: (uuid: string) => Experiment | null;
  archiveExperiment: (uuid: string) => void;
  deleteExperiment: (uuid: string) => void;

  // Batch Synthesis & Material Snapshots
  updateBatchConfig: (uuid: string, patch: Partial<BatchConfiguration>) => void;
  assignSupportToExperiment: (uuid: string, supportId: string | null) => void;
  assignPrecursorToExperiment: (
    uuid: string,
    precursorId: string | null
  ) => void;
  refreshMaterialSnapshot: (uuid: string, kind: 'support' | 'precursor') => void;

  // Phase 3 Multi-Dataset Uptake & PZC Survey Management
  selectSurveyDataset: (uuid: string, datasetId: string) => void;
  createSurveyDataset: (
    uuid: string,
    input: {
      datasetId?: string;
      title: string;
      mode: SurveyMode;
      objective?: string;
    }
  ) => SurveyDataset | null;
  loadSyntheticSurveyDataset: (uuid: string, mode: SurveyMode) => SurveyDataset | null;
  updateSurveyDatasetMeta: (
    uuid: string,
    datasetId: string,
    patch: Partial<
      Pick<
        SurveyDataset,
        | 'datasetId'
        | 'title'
        | 'mode'
        | 'objective'
        | 'researcher'
        | 'provenance'
        | 'scientificReviewStatus'
        | 'notes'
        | 'status'
      >
    >
  ) => void;
  duplicateSurveyDataset: (uuid: string, datasetId: string) => SurveyDataset | null;
  archiveSurveyDataset: (uuid: string, datasetId: string) => void;
  deleteSurveyDataset: (uuid: string, datasetId: string) => void;

  // Active Survey Dataset Config & Measurements (automatically synchronized with experiment mirrors)
  updateSurveyConfig: (uuid: string, patch: Partial<SurveyConfiguration>) => void;
  updateSurveyAnalysisConfig: (
    uuid: string,
    patch: Partial<SurveyAnalysisConfiguration>
  ) => void;
  addSurveyMeasurement: (
    uuid: string,
    initial?: Partial<SurveyMeasurement>
  ) => void;
  addSurveyMeasurementsBulk: (
    uuid: string,
    rows: SurveyMeasurement[]
  ) => void;
  duplicateSurveyMeasurements: (uuid: string, rowIds: string[]) => void;
  updateSurveyMeasurement: (
    uuid: string,
    rowId: string,
    patch: Partial<SurveyMeasurement>
  ) => void;
  deleteSurveyMeasurement: (uuid: string, rowId: string) => void;
  deleteSurveyMeasurementsBulk: (uuid: string, rowIds: string[]) => void;

  // Replicate Groups & Reference PZC Markers
  createReplicateGroupMeta: (
    uuid: string,
    group: ReplicateGroupMeta
  ) => void;
  renameReplicateGroup: (
    uuid: string,
    oldGroupId: string,
    newGroupId: string
  ) => void;
  updateReplicateGroupMeta: (
    uuid: string,
    groupId: string,
    patch: Partial<ReplicateGroupMeta>
  ) => void;
  assignRowsToReplicateGroup: (
    uuid: string,
    rowIds: string[],
    targetGroupId: string
  ) => void;
  removeRowFromReplicateGroup: (uuid: string, rowId: string) => void;
  addReferencePzcMarker: (
    uuid: string,
    marker: Omit<ReferencePzcMarker, 'id'>
  ) => void;
  deleteReferencePzcMarker: (uuid: string, markerId: string) => void;

  // Scientific Figure Studio & Comparative Analysis
  updateFigureConfig: (
    uuid: string,
    patch: Partial<FigureConfiguration>
  ) => void;
  saveFigurePreset: (uuid: string, name?: string) => FigureConfiguration | null;
  loadFigurePreset: (uuid: string, figureId: string) => void;
  deleteFigurePreset: (uuid: string, figureId: string) => void;
  updateDatasetComparison: (
    uuid: string,
    patch: Partial<DatasetComparisonConfig>
  ) => void;

  // Research Interpretations & Annotations
  addResearchAnnotation: (
    uuid: string,
    annotation: Omit<ResearchAnnotation, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  updateResearchAnnotation: (
    uuid: string,
    annotationId: string,
    patch: Partial<ResearchAnnotation>
  ) => void;
  deleteResearchAnnotation: (uuid: string, annotationId: string) => void;

  // Phase 4 Analytical Chemistry & Instrument Data Workspace
  selectAnalyticalSession: (uuid: string, sessionId: string) => void;
  createAnalyticalSession: (
    uuid: string,
    input: {
      sessionId?: string;
      title: string;
      technique: InstrumentType;
      customTechniqueName?: string;
      analyst?: string;
    }
  ) => AnalyticalSession | null;
  loadSyntheticAnalyticalSession: (
    uuid: string,
    technique: 'ICP-OES' | 'Flame AAS'
  ) => AnalyticalSession | null;
  updateAnalyticalSessionMeta: (
    uuid: string,
    sessionId: string,
    patch: Partial<
      Pick<
        AnalyticalSession,
        | 'sessionId'
        | 'title'
        | 'technique'
        | 'customTechniqueName'
        | 'instrumentManufacturer'
        | 'instrumentModel'
        | 'instrumentIdentifier'
        | 'methodReference'
        | 'analyst'
        | 'analysisDate'
        | 'matrixDescription'
        | 'conditionsNote'
        | 'observations'
        | 'provenance'
        | 'scientificReviewStatus'
        | 'notes'
        | 'status'
      >
    >
  ) => void;
  duplicateAnalyticalSession: (
    uuid: string,
    sessionId: string
  ) => AnalyticalSession | null;
  archiveAnalyticalSession: (uuid: string, sessionId: string) => void;
  deleteAnalyticalSession: (uuid: string, sessionId: string) => void;

  // Multi-Analyte Management
  selectAnalyticalAnalyte: (uuid: string, analyteId: string) => void;
  addAnalyticalAnalyte: (
    uuid: string,
    input: Omit<AnalyticalAnalyte, 'id'>
  ) => AnalyticalAnalyte | null;
  updateAnalyticalAnalyte: (
    uuid: string,
    analyteId: string,
    patch: Partial<AnalyticalAnalyte>
  ) => void;
  deleteAnalyticalAnalyte: (uuid: string, analyteId: string) => void;

  // Multi-Calibration Dataset Management
  selectCalibrationDataset: (uuid: string, calId: string) => void;
  createCalibrationDataset: (
    uuid: string,
    input: {
      calibrationId?: string;
      title: string;
      analyteId: string | null;
      concUnit: string;
      responseUnit: string;
      referenceMethod?: string;
    }
  ) => CalibrationDataset | null;
  duplicateCalibrationDataset: (
    uuid: string,
    calId: string
  ) => CalibrationDataset | null;
  updateCalibrationDatasetMeta: (
    uuid: string,
    calId: string,
    patch: Partial<
      Pick<
        CalibrationDataset,
        | 'calibrationId'
        | 'title'
        | 'analyteId'
        | 'referenceMethod'
        | 'concUnit'
        | 'responseUnit'
        | 'analyst'
        | 'analysisDate'
        | 'provenance'
        | 'notes'
      >
    >
  ) => void;
  deleteCalibrationDataset: (uuid: string, calId: string) => void;
  addCalibrationStandardToDataset: (
    uuid: string,
    calId: string,
    initial?: Partial<CalibrationStandard>
  ) => void;
  addCalibrationStandardsBulk: (
    uuid: string,
    calId: string,
    standards: CalibrationStandard[]
  ) => void;
  updateCalibrationStandardInDataset: (
    uuid: string,
    calId: string,
    stdId: string,
    patch: Partial<CalibrationStandard>
  ) => void;
  deleteCalibrationStandardInDataset: (
    uuid: string,
    calId: string,
    stdId: string
  ) => void;

  // Sample Measurements & Bulk Import
  addAnalyticalSamplesBulk: (
    uuid: string,
    rows: InstrumentMeasurement[],
    importRecord?: InstrumentImportRecord
  ) => void;
  duplicateAnalyticalSamples: (uuid: string, rowIds: string[]) => void;
  bulkUpdateAnalyticalSamples: (
    uuid: string,
    rowIds: string[],
    patch: Partial<InstrumentMeasurement>
  ) => void;
  deleteAnalyticalSamplesBulk: (uuid: string, rowIds: string[]) => void;

  // Dilution Records
  addDilutionRecord: (
    uuid: string,
    record: Omit<DilutionRecord, 'id'>
  ) => void;
  updateDilutionRecord: (
    uuid: string,
    recordId: string,
    patch: Partial<DilutionRecord>
  ) => void;
  deleteDilutionRecord: (uuid: string, recordId: string) => void;

  // Quality Review Workflow
  updateAnalyticalReviewStatus: (
    uuid: string,
    input: {
      issueKey: string;
      category: AnalyticalQualityIssueCategory;
      recordId: string;
      recordLabel: string;
      description: string;
      provenance: DataProvenance;
      status: AnalyticalReviewStatus;
      researcherNotes: string;
      author: string;
    }
  ) => void;

  // Survey <-> Analytical Traceable Linkage
  linkAnalyticalToSurveyMeasurement: (
    uuid: string,
    params: {
      surveyDatasetId: string;
      surveyMeasurementId: string;
      stage: 'Initial' | 'Final';
      instrumentMeasurementId: string;
    }
  ) => void;
  unlinkAnalyticalFromSurveyMeasurement: (
    uuid: string,
    params: {
      surveyDatasetId: string;
      surveyMeasurementId: string;
      stage: 'Initial' | 'Final';
    }
  ) => void;
  applyAnalyticalValueToSurvey: (
    uuid: string,
    params: {
      surveyDatasetId: string;
      surveyMeasurementId: string;
      stage: 'Initial' | 'Final';
      effectiveConcPpm: number;
    }
  ) => void;

  // Analytical Figure Studio & Cross-Session Comparison
  updateAnalyticalFigureConfig: (
    uuid: string,
    patch: Partial<AnalyticalFigureConfiguration>
  ) => void;
  saveAnalyticalFigurePreset: (
    uuid: string,
    name?: string
  ) => AnalyticalFigureConfiguration | null;
  loadAnalyticalFigurePreset: (uuid: string, figureId: string) => void;
  deleteAnalyticalFigurePreset: (uuid: string, figureId: string) => void;
  updateAnalyticalComparison: (
    uuid: string,
    patch: Partial<AnalyticalComparisonConfig>
  ) => void;

  // Reusable Import Mapping Templates
  saveImportMappingTemplate: (
    template: Omit<ImportMappingTemplate, 'id' | 'createdAt'>
  ) => ImportMappingTemplate;
  deleteImportMappingTemplate: (templateId: string) => void;

  // Legacy-compatible Analytical Actions (routed through active AnalyticalSession)
  updateAnalyticalConfig: (
    uuid: string,
    patch: Partial<AnalyticalConfiguration>
  ) => void;
  addCalibrationStandard: (uuid: string) => void;
  updateCalibrationStandard: (
    uuid: string,
    stdId: string,
    patch: Partial<CalibrationStandard>
  ) => void;
  deleteCalibrationStandard: (uuid: string, stdId: string) => void;
  addInstrumentMeasurement: (
    uuid: string,
    stage?: InstrumentMeasurement['stage']
  ) => void;
  updateInstrumentMeasurement: (
    uuid: string,
    rowId: string,
    patch: Partial<InstrumentMeasurement>
  ) => void;
  deleteInstrumentMeasurement: (uuid: string, rowId: string) => void;

  // Observations & Bench Runner
  addObservation: (
    uuid: string,
    obs: Omit<ExperimentalObservation, 'id' | 'timestamp'>
  ) => void;
  deleteObservation: (uuid: string, obsId: string) => void;
  addChecklistItem: (uuid: string, label: string, plannedTime?: string) => void;
  updateChecklistItem: (
    uuid: string,
    itemId: string,
    patch: Partial<BenchChecklistItem>
  ) => void;
  toggleChecklistItem: (uuid: string, itemId: string) => void;
  deleteChecklistItem: (uuid: string, itemId: string) => void;
  updateBenchTimer: (
    uuid: string,
    patch: Partial<BenchTimerState>,
    logMessage?: string
  ) => void;
  appendBenchLog: (
    uuid: string,
    eventType: BenchLog['eventType'],
    message: string
  ) => void;

  // Report Configuration
  updateReportConfig: (uuid: string, patch: Partial<ReportConfiguration>) => void;

  // Material Databases (editing/deleting here NEVER mutates existing experiment snapshots)
  addPrecursor: (
    precursor: Omit<Precursor, 'id' | 'createdAt' | 'updatedAt'>
  ) => Precursor;
  updatePrecursor: (id: string, patch: Partial<Precursor>) => void;
  deletePrecursor: (id: string) => void;
  addSupport: (support: Omit<Support, 'id' | 'createdAt' | 'updatedAt'>) => Support;
  updateSupport: (id: string, patch: Partial<Support>) => void;
  deleteSupport: (id: string) => void;

  // Phase 5 Lifecycle, Research Planning & Templates
  transitionExperimentStatus: (
    uuid: string,
    newStatus: ExperimentStatus,
    explanation?: string,
    options?: { createSnapshot?: boolean; snapshotName?: string }
  ) => void;
  updateResearchPlan: (
    uuid: string,
    patch: Partial<ResearchPlanMetadata>
  ) => void;
  addPlanDeviation: (
    uuid: string,
    deviation: {
      description: string;
      reason: string;
      author?: string;
    }
  ) => void;
  deletePlanDeviation: (uuid: string, deviationId: string) => void;
  saveExperimentTemplate: (
    template: Omit<ExperimentTemplate, 'id' | 'createdAt'>
  ) => ExperimentTemplate;
  deleteExperimentTemplate: (templateId: string) => void;
  applyExperimentTemplate: (uuid: string, templateId: string) => void;

  // Phase 5 Milestones & Multiple Independent Timers
  addMilestone: (
    uuid: string,
    input: {
      title: string;
      description?: string;
      plannedDateTime?: string;
      linkedModule?: ActiveModule | null;
      linkedRecordId?: string | null;
      linkedRecordLabel?: string;
    }
  ) => void;
  updateMilestone: (
    uuid: string,
    milestoneId: string,
    patch: Partial<ResearchMilestone>
  ) => void;
  reorderMilestone: (
    uuid: string,
    milestoneId: string,
    direction: 'up' | 'down'
  ) => void;
  duplicateMilestone: (uuid: string, milestoneId: string) => void;
  setMilestoneStatus: (
    uuid: string,
    milestoneId: string,
    status: ResearchMilestone['status']
  ) => void;
  deleteMilestone: (uuid: string, milestoneId: string) => void;
  addResearchTimer: (
    uuid: string,
    input: {
      name: string;
      mode: 'elapsed' | 'countdown';
      configuredDurationSec?: number;
      linkedMilestoneId?: string | null;
    }
  ) => void;
  updateResearchTimer: (
    uuid: string,
    timerId: string,
    patch: Partial<ResearchTimer>,
    historyNote?: {
      action: ResearchTimer['history'][number]['action'];
      detail: string;
    }
  ) => void;
  deleteResearchTimer: (uuid: string, timerId: string) => void;

  // Phase 5 Sample Registry, Snapshots & Finalized Reports
  updateSampleRegistryNote: (uuid: string, note: SampleRegistryNote) => void;
  createExperimentSnapshot: (
    uuid: string,
    input: { name: string; description?: string; researcher?: string }
  ) => ExperimentSnapshot | null;
  deleteExperimentSnapshot: (uuid: string, snapshotId: string) => void;
  restoreExperimentSnapshot: (
    sourceUuid: string,
    snapshotId: string
  ) => Experiment | null;
  createFinalizedReport: (
    uuid: string,
    input: {
      title: string;
      notes?: string;
      snapshotId?: string;
      snapshotName?: string;
    }
  ) => FinalizedReport | null;
  deleteFinalizedReport: (uuid: string, reportId: string) => void;

  // Phase 6 Measurement Uncertainty & Research Analytics Configurations
  addUncertaintyRecord: (
    uuid: string,
    input: Omit<
      MeasurementUncertaintyRecord,
      'id' | 'experimentUuid' | 'createdAt' | 'updatedAt'
    >
  ) => MeasurementUncertaintyRecord | null;
  updateUncertaintyRecord: (
    uuid: string,
    recordId: string,
    patch: Partial<MeasurementUncertaintyRecord>
  ) => void;
  deleteUncertaintyRecord: (uuid: string, recordId: string) => void;
  saveResearchComparisonConfig: (
    config: Omit<
      ResearchComparisonConfiguration,
      'id' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ) => ResearchComparisonConfiguration;
  deleteResearchComparisonConfig: (configId: string) => void;
  saveResearchMatrixConfig: (
    config: Omit<
      ResearchMatrixConfiguration,
      'id' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ) => ResearchMatrixConfiguration;
  deleteResearchMatrixConfig: (configId: string) => void;
  saveResearchAnalysisSnapshot: (
    snapshot: Omit<ResearchAnalysisSnapshot, 'id' | 'capturedAt'>
  ) => ResearchAnalysisSnapshot;
  deleteResearchAnalysisSnapshot: (snapshotId: string) => void;

  // Workspace Import / Reset
  replaceWorkspace: (workspace: WorkspaceStateData) => void;
  getSerializableWorkspace: () => WorkspaceStateData;
}

function extractWorkspaceData(state: WorkbenchStore): WorkspaceStateData {
  return {
    schemaVersion: state.schemaVersion,
    appVersion: state.appVersion,
    projects: state.projects,
    experiments: state.experiments,
    activeExperimentUuid: state.activeExperimentUuid,
    precursors: state.precursors,
    supports: state.supports,
    importMappingTemplates: state.importMappingTemplates ?? [],
    experimentTemplates: state.experimentTemplates ?? [],
    researchComparisonConfigs: state.researchComparisonConfigs ?? [],
    researchMatrixConfigs: state.researchMatrixConfigs ?? [],
    researchAnalysisSnapshots: state.researchAnalysisSnapshots ?? [],
    preferences: state.preferences,
    hasInitializedDemo: state.hasInitializedDemo,
    lastSavedAt: state.lastSavedAt,
  };
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(
  get: () => WorkbenchStore,
  set: (partial: Partial<WorkbenchStore>) => void
) {
  set({ saveStatus: 'saving' });
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    const data = extractWorkspaceData(get());
    const result = saveWorkspaceToStorage(data);
    const diag = computeStorageDiagnostics(data);
    if (result.ok) {
      set({
        saveStatus: 'saved',
        lastSavedAt: result.savedAt,
        storageBytes: result.byteSize,
        storageError: null,
        storageDiagnostics: diag,
      });
    } else {
      set({
        saveStatus: 'error',
        storageError: result.error,
        storageDiagnostics: diag,
        statusBanner: {
          type: 'error',
          message: result.error ?? 'Failed to save workspace locally.',
        },
      });
    }
  }, 250);
}

function updateExperimentInList(
  experiments: Experiment[],
  uuid: string,
  updater: (exp: Experiment) => Experiment
): Experiment[] {
  const now = new Date().toISOString();
  return experiments.map((exp) =>
    exp.uuid === uuid
      ? {
          ...updater(exp),
          updatedAt: now,
        }
      : exp
  );
}

/**
 * Updates the active SurveyDataset inside an experiment and mirrors its `config`
 * and `measurements` back onto `experiment.surveyConfig` and `experiment.surveyMeasurements`
 * so all legacy readers and single-source-of-truth invariants stay in sync.
 */
function updateActiveSurveyDataset(
  exp: Experiment,
  updater: (ds: SurveyDataset) => SurveyDataset,
  explicitDatasetId?: string
): Experiment {
  const now = new Date().toISOString();
  const targetId =
    explicitDatasetId ??
    exp.activeSurveyDatasetId ??
    exp.surveyDatasets[0]?.id ??
    null;

  if (!targetId) return exp;

  let updatedTarget: SurveyDataset | null = null;
  const nextDatasets = exp.surveyDatasets.map((ds) => {
    if (ds.id !== targetId) return ds;
    const next = { ...updater(ds), updatedAt: now };
    updatedTarget = next;
    return next;
  });

  const activeId = exp.activeSurveyDatasetId ?? targetId;
  const activeDs =
    (updatedTarget && (updatedTarget as SurveyDataset).id === activeId
      ? (updatedTarget as SurveyDataset)
      : nextDatasets.find((d) => d.id === activeId)) ?? nextDatasets[0];

  return projectExperimentCompatibilityMirrors({
    ...exp,
    surveyDatasets: nextDatasets,
    activeSurveyDatasetId: activeDs?.id ?? null,
  });
}

/**
 * Updates the active (or specified) AnalyticalSession inside an experiment and
 * projects all compatibility mirrors deterministically.
 */
function updateActiveAnalyticalSession(
  exp: Experiment,
  updater: (session: AnalyticalSession) => AnalyticalSession,
  explicitSessionId?: string
): Experiment {
  const now = new Date().toISOString();
  const targetId =
    explicitSessionId ??
    exp.activeAnalyticalSessionId ??
    exp.analyticalSessions?.[0]?.id ??
    null;

  if (!targetId) return exp;

  const nextSessions = (exp.analyticalSessions ?? []).map((sess) =>
    sess.id === targetId ? { ...updater(sess), updatedAt: now } : sess
  );

  return projectExperimentCompatibilityMirrors({
    ...exp,
    analyticalSessions: nextSessions,
  });
}

const initialBlankState: WorkspaceStateData = {
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  projects: [],
  experiments: [],
  activeExperimentUuid: null,
  precursors: [],
  supports: [],
  importMappingTemplates: [],
  experimentTemplates: [],
  researchComparisonConfigs: [],
  researchMatrixConfigs: [],
  researchAnalysisSnapshots: [],
  preferences: {
    sidebarCollapsed: false,
    defaultResearcher: 'Research Scientist',
    lastBackupExportedAt: null,
  },
  hasInitializedDemo: false,
  lastSavedAt: null,
};

function appendActivityEvent(
  exp: Experiment,
  event: Omit<ExperimentActivityEvent, 'id' | 'timestamp' | 'experimentUuid'>,
  timestamp = new Date().toISOString()
): ExperimentActivityEvent[] {
  return [
    {
      ...event,
      id: generateUuid('act'),
      timestamp,
      experimentUuid: exp.uuid,
    },
    ...(exp.activityEvents ?? []),
  ].slice(0, 400);
}

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...initialBlankState,
  activeModule: 'library',
  hydrated: false,
  saveStatus: 'idle',
  storageBytes: 0,
  storageError: null,
  storageDiagnostics: null,
  navigationContext: {
    overviewTab: 'summary',
    surveyTab: null,
    analyticalTab: null,
    analyticsTab: 'overview',
    highlightRecordId: null,
    navigationNonce: 0,
  },
  statusBanner: null,

  navigateToContext: (target) => {
    set((state) => {
      const nextExpUuid =
        target.experimentUuid &&
        state.experiments.some((e) => e.uuid === target.experimentUuid)
          ? target.experimentUuid
          : state.activeExperimentUuid;

      let nextExperiments = state.experiments;
      if (
        nextExpUuid &&
        (target.surveyDatasetId || target.analyticalSessionId)
      ) {
        nextExperiments = state.experiments.map((exp) => {
          if (exp.uuid !== nextExpUuid) return exp;
          let updated = exp;
          if (
            target.surveyDatasetId &&
            exp.surveyDatasets.some((d) => d.id === target.surveyDatasetId)
          ) {
            updated = {
              ...updated,
              activeSurveyDatasetId: target.surveyDatasetId,
            };
          }
          if (
            target.analyticalSessionId &&
            exp.analyticalSessions.some(
              (s) => s.id === target.analyticalSessionId
            )
          ) {
            updated = {
              ...updated,
              activeAnalyticalSessionId: target.analyticalSessionId,
            };
          }
          return updated === exp
            ? exp
            : projectExperimentCompatibilityMirrors(updated);
        });
      }

      return {
        experiments: nextExperiments,
        activeExperimentUuid: nextExpUuid,
        activeModule: target.module,
        navigationContext: {
          overviewTab: target.overviewTab ?? state.navigationContext.overviewTab,
          surveyTab: target.surveyTab ?? state.navigationContext.surveyTab,
          analyticalTab:
            target.analyticalTab ?? state.navigationContext.analyticalTab,
          analyticsTab:
            target.analyticsTab ?? state.navigationContext.analyticsTab,
          highlightRecordId: target.highlightRecordId ?? null,
          navigationNonce: state.navigationContext.navigationNonce + 1,
        },
      };
    });
    schedulePersist(get, set);
  },

  setOverviewTab: (tab) =>
    set((state) => ({
      navigationContext: {
        ...state.navigationContext,
        overviewTab: tab,
      },
    })),

  setAnalyticsTab: (tab) =>
    set((state) => ({
      navigationContext: {
        ...state.navigationContext,
        analyticsTab: tab,
      },
    })),

  markBackupExported: () => {
    const now = new Date().toISOString();
    set((state) => {
      const nextPrefs = {
        ...state.preferences,
        lastBackupExportedAt: now,
      };
      const nextData = {
        ...extractWorkspaceData(state),
        preferences: nextPrefs,
      };
      return {
        preferences: nextPrefs,
        storageDiagnostics: computeStorageDiagnostics(nextData),
      };
    });
    schedulePersist(get, set);
  },

  hydrateFromStorage: () => {
    if (get().hydrated) return;
    const loaded = loadWorkspaceFromStorage();

    if (loaded.status === 'loaded' && loaded.data) {
      const validActive = loaded.data.experiments.some(
        (e) => e.uuid === loaded.data!.activeExperimentUuid
      )
        ? loaded.data.activeExperimentUuid
        : loaded.data.experiments[0]?.uuid ?? null;

      let byteSize = loaded.byteSize;
      let savedAt = loaded.data.lastSavedAt;
      if (loaded.warnings.length > 0) {
        const persisted = saveWorkspaceToStorage(loaded.data);
        if (persisted.ok) {
          byteSize = persisted.byteSize;
          savedAt = persisted.savedAt ?? savedAt;
        }
      }

      const normalizedLoaded: WorkspaceStateData = {
        ...loaded.data,
        experimentTemplates:
          loaded.data.experimentTemplates &&
          loaded.data.experimentTemplates.length > 0
            ? loaded.data.experimentTemplates
            : createDefaultExperimentTemplates(),
      };

      set({
        ...normalizedLoaded,
        activeExperimentUuid: validActive,
        hydrated: true,
        saveStatus: 'saved',
        lastSavedAt: savedAt,
        storageBytes: byteSize,
        storageError: null,
        storageDiagnostics: computeStorageDiagnostics(normalizedLoaded),
        statusBanner:
          loaded.warnings.length > 0
            ? {
                type: 'info',
                message: loaded.warnings[loaded.warnings.length - 1],
              }
            : null,
      });
      return;
    }

    const demo = createInitialDemoWorkspace();
    if (loaded.status === 'corrupted') {
      set({
        ...demo,
        hydrated: true,
        saveStatus: 'error',
        storageBytes: loaded.byteSize,
        storageError: loaded.error,
        storageDiagnostics: computeStorageDiagnostics(demo),
        statusBanner: {
          type: 'error',
          message:
            loaded.error ??
            'Stored local data was malformed. Loaded fallback demonstration workspace.',
        },
      });
      return;
    }

    const persisted = saveWorkspaceToStorage(demo);
    set({
      ...demo,
      hydrated: true,
      saveStatus: persisted.ok ? 'saved' : 'error',
      lastSavedAt: persisted.savedAt ?? demo.lastSavedAt,
      storageBytes: persisted.byteSize,
      storageError: persisted.error,
      storageDiagnostics: computeStorageDiagnostics(demo),
    });
  },

  saveNow: () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    const data = extractWorkspaceData(get());
    const result = saveWorkspaceToStorage(data);
    const diag = computeStorageDiagnostics(data);
    if (result.ok) {
      set({
        saveStatus: 'saved',
        lastSavedAt: result.savedAt,
        storageBytes: result.byteSize,
        storageError: null,
        storageDiagnostics: diag,
        statusBanner: {
          type: 'success',
          message: 'Workspace saved to local browser storage.',
        },
      });
      return true;
    }
    set({
      saveStatus: 'error',
      storageError: result.error,
      storageDiagnostics: diag,
      statusBanner: {
        type: 'error',
        message: result.error ?? 'Failed to save workspace locally.',
      },
    });
    return false;
  },

  dismissBanner: () => set({ statusBanner: null }),

  setActiveModule: (module) => set({ activeModule: module }),

  toggleSidebar: () => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        sidebarCollapsed: !state.preferences.sidebarCollapsed,
      },
    }));
    schedulePersist(get, set);
  },

  createProject: (input) => {
    const now = new Date().toISOString();
    const project: ResearchProject = {
      id: generateUuid('prj'),
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      principalInvestigator: input.principalInvestigator.trim(),
      isDemonstration: false,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ projects: [project, ...state.projects] }));
    schedulePersist(get, set);
    return project;
  },

  deleteProject: (projectId) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      experiments: state.experiments.map((e) =>
        e.projectId === projectId ? { ...e, projectId: null } : e
      ),
    }));
    schedulePersist(get, set);
  },

  createExperiment: (input) => {
    const state = get();
    const expId =
      input.experimentId?.trim() ||
      generateUniqueExperimentId(state.experiments);
    const created = createBlankExperiment({
      experimentId: expId,
      title: input.title,
      projectId: input.projectId,
      researcher: input.researcher || state.preferences.defaultResearcher,
      type: input.type,
      objective: input.objective,
      experimentDate: input.experimentDate,
      tags: input.tags,
    });
    set((prev) => ({
      experiments: [created, ...prev.experiments],
      activeExperimentUuid: created.uuid,
      preferences: {
        ...prev.preferences,
        defaultResearcher:
          input.researcher.trim() || prev.preferences.defaultResearcher,
      },
    }));
    schedulePersist(get, set);
    return created;
  },

  openExperiment: (uuid, targetModule) => {
    set((state) => {
      const exists = state.experiments.some((e) => e.uuid === uuid);
      if (!exists) return state;
      return {
        activeExperimentUuid: uuid,
        activeModule: targetModule ?? state.activeModule,
      };
    });
    schedulePersist(get, set);
  },

  updateExperimentMeta: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        ...patch,
      })),
    }));
    schedulePersist(get, set);
  },

  duplicateExperiment: (uuid) => {
    const state = get();
    const source = state.experiments.find((e) => e.uuid === uuid);
    if (!source) return null;
    const copy = duplicateExperimentRecord(source, state.experiments);
    set((prev) => ({
      experiments: [copy, ...prev.experiments],
      activeExperimentUuid: copy.uuid,
      statusBanner: {
        type: 'info',
        message: `Created independent duplicate ${copy.experimentId}.`,
      },
    }));
    schedulePersist(get, set);
    return copy;
  },

  archiveExperiment: (uuid) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        status:
          exp.status === 'Archived'
            ? ('Draft' as ExperimentStatus)
            : ('Archived' as ExperimentStatus),
      })),
    }));
    schedulePersist(get, set);
  },

  deleteExperiment: (uuid) => {
    set((state) => {
      const remaining = state.experiments.filter((e) => e.uuid !== uuid);
      const nextActive =
        state.activeExperimentUuid === uuid
          ? remaining[0]?.uuid ?? null
          : state.activeExperimentUuid;
      return {
        experiments: remaining,
        activeExperimentUuid: nextActive,
        hasInitializedDemo: true,
      };
    });
    schedulePersist(get, set);
  },

  updateBatchConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        batch: { ...exp.batch, ...patch },
      })),
    }));
    schedulePersist(get, set);
  },

  assignSupportToExperiment: (uuid, supportId) => {
    const support = supportId
      ? get().supports.find((s) => s.id === supportId) ?? null
      : null;
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const snap = support ? createSupportSnapshot(support) : null;
        return {
          ...exp,
          batch: {
            ...exp.batch,
            supportId: support ? support.id : null,
            supportSnapshot: snap,
          },
        };
      }),
    }));
    schedulePersist(get, set);
  },

  assignPrecursorToExperiment: (uuid, precursorId) => {
    const precursor = precursorId
      ? get().precursors.find((p) => p.id === precursorId) ?? null
      : null;
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const snap = precursor ? createPrecursorSnapshot(precursor) : null;
        return {
          ...exp,
          batch: {
            ...exp.batch,
            precursorId: precursor ? precursor.id : null,
            precursorSnapshot: snap,
          },
        };
      }),
    }));
    schedulePersist(get, set);
  },

  refreshMaterialSnapshot: (uuid, kind) => {
    const state = get();
    const exp = state.experiments.find((e) => e.uuid === uuid);
    if (!exp) return;

    if (kind === 'support' && exp.batch.supportId) {
      const support = state.supports.find((s) => s.id === exp.batch.supportId);
      if (!support) return;
      set((prev) => ({
        experiments: updateExperimentInList(prev.experiments, uuid, (e) => ({
          ...e,
          batch: {
            ...e.batch,
            supportSnapshot: createSupportSnapshot(support),
          },
        })),
      }));
      schedulePersist(get, set);
    }

    if (kind === 'precursor' && exp.batch.precursorId) {
      const precursor = state.precursors.find(
        (p) => p.id === exp.batch.precursorId
      );
      if (!precursor) return;
      set((prev) => ({
        experiments: updateExperimentInList(prev.experiments, uuid, (e) => ({
          ...e,
          batch: {
            ...e.batch,
            precursorSnapshot: createPrecursorSnapshot(precursor),
          },
        })),
      }));
      schedulePersist(get, set);
    }
  },

  /* ==========================================================================
   * PHASE 3 MULTI-DATASET SURVEY MANAGEMENT
   * ========================================================================== */

  selectSurveyDataset: (uuid, datasetId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const target = exp.surveyDatasets.find((d) => d.id === datasetId);
        if (!target) return exp;
        return {
          ...exp,
          activeSurveyDatasetId: target.id,
          surveyConfig: target.config,
          surveyMeasurements: target.measurements,
        };
      }),
    }));
    schedulePersist(get, set);
  },

  createSurveyDataset: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const datasetId =
      input.datasetId?.trim() ||
      generateUniqueDatasetId(exp.surveyDatasets, input.mode);
    const created = createBlankSurveyDataset({
      datasetId,
      title: input.title,
      mode: input.mode,
      researcher: exp.researcher || get().preferences.defaultResearcher,
      objective: input.objective,
      supportSnapshot: exp.batch.supportSnapshot,
      precursorSnapshot:
        input.mode === 'uptake' ? exp.batch.precursorSnapshot : null,
    });

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        surveyDatasets: [...e.surveyDatasets, created],
        activeSurveyDatasetId: created.id,
        surveyConfig: created.config,
        surveyMeasurements: created.measurements,
      })),
      statusBanner: {
        type: 'success',
        message: `Created survey dataset ${created.datasetId} (${created.title}).`,
      },
    }));
    schedulePersist(get, set);
    return created;
  },

  loadSyntheticSurveyDataset: (uuid, mode) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const demoDs = createSyntheticDemoDataset(
      mode,
      exp.surveyDatasets,
      exp.batch.supportSnapshot,
      exp.batch.precursorSnapshot,
      exp.researcher
    );

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        surveyDatasets: [...e.surveyDatasets, demoDs],
        activeSurveyDatasetId: demoDs.id,
        surveyConfig: demoDs.config,
        surveyMeasurements: demoDs.measurements,
      })),
      statusBanner: {
        type: 'info',
        message: `Loaded clearly labeled synthetic demonstration dataset ${demoDs.datasetId}.`,
      },
    }));
    schedulePersist(get, set);
    return demoDs;
  },

  updateSurveyDatasetMeta: (uuid, datasetId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(
          exp,
          (ds) => ({
            ...ds,
            ...patch,
            config: {
              ...ds.config,
              ...(patch.mode ? { mode: patch.mode } : {}),
              ...(patch.provenance ? { dataProvenance: patch.provenance } : {}),
            },
          }),
          datasetId
        )
      ),
    }));
    schedulePersist(get, set);
  },

  duplicateSurveyDataset: (uuid, datasetId) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const source = exp.surveyDatasets.find((d) => d.id === datasetId);
    if (!source) return null;
    const copy = duplicateSurveyDatasetRecord(source, exp.surveyDatasets);

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        surveyDatasets: [...e.surveyDatasets, copy],
        activeSurveyDatasetId: copy.id,
        surveyConfig: copy.config,
        surveyMeasurements: copy.measurements,
      })),
      statusBanner: {
        type: 'info',
        message: `Duplicated dataset independently as ${copy.datasetId}.`,
      },
    }));
    schedulePersist(get, set);
    return copy;
  },

  archiveSurveyDataset: (uuid, datasetId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(
          exp,
          (ds) => ({
            ...ds,
            status: ds.status === 'Archived' ? 'Active' : 'Archived',
          }),
          datasetId
        )
      ),
    }));
    schedulePersist(get, set);
  },

  deleteSurveyDataset: (uuid, datasetId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const remaining = exp.surveyDatasets.filter((d) => d.id !== datasetId);
        const nextActive =
          exp.activeSurveyDatasetId === datasetId
            ? remaining[0] ?? null
            : remaining.find((d) => d.id === exp.activeSurveyDatasetId) ??
              remaining[0] ??
              null;

        return {
          ...exp,
          surveyDatasets: remaining,
          activeSurveyDatasetId: nextActive?.id ?? null,
          surveyConfig: nextActive ? nextActive.config : exp.surveyConfig,
          surveyMeasurements: nextActive ? nextActive.measurements : [],
          datasetComparison: {
            ...exp.datasetComparison,
            selectedRefs: exp.datasetComparison.selectedRefs.filter(
              (r) => !(r.experimentUuid === uuid && r.datasetId === datasetId)
            ),
          },
        };
      }),
    }));
    schedulePersist(get, set);
  },

  updateSurveyConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          mode: patch.mode ?? ds.mode,
          provenance: patch.dataProvenance ?? ds.provenance,
          config: { ...ds.config, ...patch },
          figureConfig: {
            ...ds.figureConfig,
            ...(patch.chartDisplayMode
              ? { displayMode: patch.chartDisplayMode }
              : {}),
            ...(patch.errorBarMode ? { errorBarMode: patch.errorBarMode } : {}),
            ...(patch.chartTitle ? { title: patch.chartTitle } : {}),
          },
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateSurveyAnalysisConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          analysisConfig: { ...ds.analysisConfig, ...patch },
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  addSurveyMeasurement: (uuid, initial) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => {
          const nextNum = ds.measurements.length + 1;
          const prefix = ds.mode === 'pzc' ? 'PZC' : 'UPT';
          const row: SurveyMeasurement = {
            id: generateUuid('sm'),
            sampleId:
              initial?.sampleId ?? `${prefix}-${String(nextNum).padStart(2, '0')}`,
            sampleGroupId:
              initial?.sampleGroupId ??
              `GRP-${String(nextNum).padStart(2, '0')}`,
            replicateId: initial?.replicateId ?? 'R1',
            targetInitialPh: initial?.targetInitialPh ?? null,
            measuredInitialPh: initial?.measuredInitialPh ?? null,
            measuredFinalPh: initial?.measuredFinalPh ?? null,
            initialConcPpm: initial?.initialConcPpm ?? null,
            finalConcPpm: initial?.finalConcPpm ?? null,
            supportMassMg: initial?.supportMassMg ?? null,
            solutionVolumeMl: initial?.solutionVolumeMl ?? null,
            recordedUptakeUmolM2: initial?.recordedUptakeUmolM2 ?? null,
            uptakeUnit: initial?.uptakeUnit ?? 'µmol/m²',
            concUnit: initial?.concUnit ?? 'ppm',
            provenance: initial?.provenance ?? 'user_entered',
            qualityStatus: initial?.qualityStatus ?? 'valid',
            exclusionReason: initial?.exclusionReason,
            linkedInitialMeasurementId:
              initial?.linkedInitialMeasurementId ?? null,
            linkedFinalMeasurementId: initial?.linkedFinalMeasurementId ?? null,
            measurementDate: initial?.measurementDate ?? exp.experimentDate,
            notes: initial?.notes ?? '',
          };
          return {
            ...ds,
            measurements: [...ds.measurements, row],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  addSurveyMeasurementsBulk: (uuid, rows) => {
    if (rows.length === 0) return;
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: [
            ...ds.measurements,
            ...rows.map((r) => ({ ...r, id: r.id || generateUuid('sm') })),
          ],
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  duplicateSurveyMeasurements: (uuid, rowIds) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => {
          const copies: SurveyMeasurement[] = [];
          for (const row of ds.measurements) {
            if (!idSet.has(row.id)) continue;
            copies.push({
              ...structuredClone(row),
              id: generateUuid('sm'),
              sampleId: `${row.sampleId}-COPY`,
              replicateId: row.replicateId === 'R1' ? 'R2' : `${row.replicateId}b`,
            });
          }
          return {
            ...ds,
            measurements: [...ds.measurements, ...copies],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  updateSurveyMeasurement: (uuid, rowId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.map((r) =>
            r.id === rowId ? { ...r, ...patch } : r
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteSurveyMeasurement: (uuid, rowId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.filter((r) => r.id !== rowId),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteSurveyMeasurementsBulk: (uuid, rowIds) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.filter((r) => !idSet.has(r.id)),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  /* ==========================================================================
   * REPLICATE GROUPS & REFERENCE PZC MARKERS
   * ========================================================================== */

  createReplicateGroupMeta: (uuid, group) => {
    const trimmedId = group.groupId.trim();
    if (!trimmedId) return;
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => {
          if (ds.replicateGroupMeta.some((g) => g.groupId === trimmedId)) {
            return ds;
          }
          return {
            ...ds,
            replicateGroupMeta: [
              ...ds.replicateGroupMeta,
              {
                groupId: trimmedId,
                label: group.label.trim() || trimmedId,
                notes: group.notes.trim(),
              },
            ],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  renameReplicateGroup: (uuid, oldGroupId, newGroupId) => {
    const cleanNew = newGroupId.trim();
    if (!cleanNew || cleanNew === oldGroupId) return;
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.map((m) =>
            m.sampleGroupId === oldGroupId
              ? { ...m, sampleGroupId: cleanNew }
              : m
          ),
          replicateGroupMeta: ds.replicateGroupMeta.map((g) =>
            g.groupId === oldGroupId ? { ...g, groupId: cleanNew } : g
          ),
          annotations: ds.annotations.map((a) => ({
            ...a,
            linkedGroupIds: a.linkedGroupIds.map((gid) =>
              gid === oldGroupId ? cleanNew : gid
            ),
          })),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateReplicateGroupMeta: (uuid, groupId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => {
          const exists = ds.replicateGroupMeta.some(
            (g) => g.groupId === groupId
          );
          const nextMeta = exists
            ? ds.replicateGroupMeta.map((g) =>
                g.groupId === groupId ? { ...g, ...patch } : g
              )
            : [
                ...ds.replicateGroupMeta,
                {
                  groupId,
                  label: patch.label ?? groupId,
                  notes: patch.notes ?? '',
                },
              ];
          return { ...ds, replicateGroupMeta: nextMeta };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  assignRowsToReplicateGroup: (uuid, rowIds, targetGroupId) => {
    const idSet = new Set(rowIds);
    const cleanGroup = targetGroupId.trim();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.map((m) =>
            idSet.has(m.id) ? { ...m, sampleGroupId: cleanGroup } : m
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  removeRowFromReplicateGroup: (uuid, rowId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          measurements: ds.measurements.map((m) =>
            m.id === rowId
              ? { ...m, sampleGroupId: `UNG-${m.sampleId || m.id.slice(-4)}` }
              : m
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  addReferencePzcMarker: (uuid, marker) => {
    const newMarker: ReferencePzcMarker = {
      ...marker,
      id: generateUuid('pzc-ref'),
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          referencePzcMarkers: [...ds.referencePzcMarkers, newMarker],
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteReferencePzcMarker: (uuid, markerId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          referencePzcMarkers: ds.referencePzcMarkers.filter(
            (m) => m.id !== markerId
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  /* ==========================================================================
   * SCIENTIFIC FIGURE STUDIO & COMPARATIVE ANALYSIS
   * ========================================================================== */

  updateFigureConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          figureConfig: {
            ...ds.figureConfig,
            ...patch,
            savedAt: new Date().toISOString(),
          },
          config: {
            ...ds.config,
            ...(patch.displayMode ? { chartDisplayMode: patch.displayMode } : {}),
            ...(patch.errorBarMode ? { errorBarMode: patch.errorBarMode } : {}),
            ...(patch.title !== undefined ? { chartTitle: patch.title } : {}),
          },
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  saveFigurePreset: (uuid, name) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const ds = exp.surveyDatasets.find(
      (d) => d.id === exp.activeSurveyDatasetId
    );
    if (!ds) return null;
    const now = new Date().toISOString();
    const baseSaved: FigureConfiguration = {
      ...structuredClone(ds.figureConfig),
      id: generateUuid('fig'),
      name:
        name?.trim() ||
        ds.figureConfig.name.trim() ||
        `Saved Figure ${ds.savedFigures.length + 1}`,
      savedAt: now,
    };
    const saved: FigureConfiguration = {
      ...baseSaved,
      analysisProvenance: {
        ...buildSurveyAnalysisProvenance(exp, ds),
        capturedAt: now,
      },
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => {
        const updated = updateActiveSurveyDataset(e, (activeDs) => ({
          ...activeDs,
          savedFigures: [...activeDs.savedFigures, saved],
        }));
        return {
          ...updated,
          activityEvents: appendActivityEvent(
            updated,
            {
              module: 'uptake-survey',
              eventType: 'figure_saved',
              sourceKind: 'survey_figure',
              sourceId: saved.id,
              sourceLabel: saved.name,
              author: e.researcher || 'Research Scientist',
              description: `Saved survey figure "${saved.name}" on dataset ${ds.datasetId}.`,
            },
            now
          ),
        };
      }),
      statusBanner: {
        type: 'success',
        message: `Saved reproducible figure configuration "${saved.name}".`,
      },
    }));
    schedulePersist(get, set);
    return saved;
  },

  loadFigurePreset: (uuid, figureId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => {
          const found = ds.savedFigures.find((f) => f.id === figureId);
          if (!found) return ds;
          return {
            ...ds,
            figureConfig: structuredClone(found),
            config: {
              ...ds.config,
              chartTitle: found.title,
              chartDisplayMode: found.displayMode,
              errorBarMode: found.errorBarMode,
            },
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  deleteFigurePreset: (uuid, figureId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          savedFigures: ds.savedFigures.filter((f) => f.id !== figureId),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateDatasetComparison: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        datasetComparison: { ...exp.datasetComparison, ...patch },
      })),
    }));
    schedulePersist(get, set);
  },

  /* ==========================================================================
   * RESEARCH INTERPRETATIONS & ANNOTATIONS
   * ========================================================================== */

  addResearchAnnotation: (uuid, annotation) => {
    const now = new Date().toISOString();
    const record: ResearchAnnotation = {
      ...annotation,
      id: generateUuid('ann'),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          annotations: [record, ...ds.annotations],
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateResearchAnnotation: (uuid, annotationId, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          annotations: ds.annotations.map((a) =>
            a.id === annotationId ? { ...a, ...patch, updatedAt: now } : a
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteResearchAnnotation: (uuid, annotationId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveSurveyDataset(exp, (ds) => ({
          ...ds,
          annotations: ds.annotations.filter((a) => a.id !== annotationId),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  /* ==========================================================================
   * PHASE 4 ANALYTICAL CHEMISTRY & INSTRUMENT DATA WORKSPACE
   * ========================================================================== */

  selectAnalyticalSession: (uuid, sessionId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        if (!exp.analyticalSessions.some((s) => s.id === sessionId)) return exp;
        return projectExperimentCompatibilityMirrors({
          ...exp,
          activeAnalyticalSessionId: sessionId,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  createAnalyticalSession: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const sessionCode =
      input.sessionId?.trim() ||
      generateUniqueSessionId(exp.analyticalSessions ?? [], input.technique);
    const created = createBlankAnalyticalSession({
      experimentUuid: exp.uuid,
      sessionId: sessionCode,
      title: input.title,
      technique: input.technique,
      customTechniqueName: input.customTechniqueName,
      analyst: input.analyst?.trim() || exp.researcher || get().preferences.defaultResearcher,
      analysisDate: exp.experimentDate,
    });

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        projectExperimentCompatibilityMirrors({
          ...e,
          analyticalSessions: [...(e.analyticalSessions ?? []), created],
          activeAnalyticalSessionId: created.id,
        })
      ),
      statusBanner: {
        type: 'success',
        message: `Created analytical session ${created.sessionId} (${created.title}).`,
      },
    }));
    schedulePersist(get, set);
    return created;
  },

  loadSyntheticAnalyticalSession: (uuid, technique) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const demoSess = createSyntheticAnalyticalSession({
      experimentUuid: exp.uuid,
      technique,
      existingSessions: exp.analyticalSessions ?? [],
      analyst: exp.researcher || 'Demo Analyst',
    });

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        projectExperimentCompatibilityMirrors({
          ...e,
          analyticalSessions: [...(e.analyticalSessions ?? []), demoSess],
          activeAnalyticalSessionId: demoSess.id,
        })
      ),
      statusBanner: {
        type: 'info',
        message: `Loaded synthetic demonstration session ${demoSess.sessionId} (${technique}).`,
      },
    }));
    schedulePersist(get, set);
    return demoSess;
  },

  updateAnalyticalSessionMeta: (uuid, sessionId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(
          exp,
          (sess) => ({ ...sess, ...patch }),
          sessionId
        )
      ),
    }));
    schedulePersist(get, set);
  },

  duplicateAnalyticalSession: (uuid, sessionId) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const source = (exp.analyticalSessions ?? []).find((s) => s.id === sessionId);
    if (!source) return null;
    const { session: copy } = duplicateAnalyticalSessionRecord(
      source,
      exp.analyticalSessions ?? []
    );

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        projectExperimentCompatibilityMirrors({
          ...e,
          analyticalSessions: [...(e.analyticalSessions ?? []), copy],
          activeAnalyticalSessionId: copy.id,
        })
      ),
      statusBanner: {
        type: 'info',
        message: `Created independent analytical session duplicate ${copy.sessionId}.`,
      },
    }));
    schedulePersist(get, set);
    return copy;
  },

  archiveAnalyticalSession: (uuid, sessionId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(
          exp,
          (sess) => ({
            ...sess,
            status: sess.status === 'Archived' ? 'Active' : 'Archived',
          }),
          sessionId
        )
      ),
    }));
    schedulePersist(get, set);
  },

  deleteAnalyticalSession: (uuid, sessionId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const remaining = (exp.analyticalSessions ?? []).filter(
          (s) => s.id !== sessionId
        );
        const nextActive =
          exp.activeAnalyticalSessionId === sessionId
            ? remaining[0]?.id ?? null
            : exp.activeAnalyticalSessionId;
        return projectExperimentCompatibilityMirrors({
          ...exp,
          analyticalSessions: remaining,
          activeAnalyticalSessionId: nextActive,
          analyticalComparison: {
            ...exp.analyticalComparison,
            selectedSessionIds: (
              exp.analyticalComparison?.selectedSessionIds ?? []
            ).filter((id) => id !== sessionId),
          },
        });
      }),
    }));
    schedulePersist(get, set);
  },

  selectAnalyticalAnalyte: (uuid, analyteId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const target = sess.analytes.find((a) => a.id === analyteId);
          if (!target) return sess;
          return {
            ...sess,
            activeAnalyteId: target.id,
            activeCalibrationDatasetId:
              target.calibrationDatasetId &&
              sess.calibrationDatasets.some(
                (c) => c.id === target.calibrationDatasetId
              )
                ? target.calibrationDatasetId
                : sess.activeCalibrationDatasetId,
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  addAnalyticalAnalyte: (uuid, input) => {
    const record: AnalyticalAnalyte = {
      ...input,
      id: generateUuid('an'),
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          analytes: [...sess.analytes, record],
          activeAnalyteId: record.id,
        }))
      ),
    }));
    schedulePersist(get, set);
    return record;
  },

  updateAnalyticalAnalyte: (uuid, analyteId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          analytes: sess.analytes.map((a) =>
            a.id === analyteId ? { ...a, ...patch } : a
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteAnalyticalAnalyte: (uuid, analyteId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const remaining = sess.analytes.filter((a) => a.id !== analyteId);
          return {
            ...sess,
            analytes: remaining,
            activeAnalyteId:
              sess.activeAnalyteId === analyteId
                ? remaining[0]?.id ?? null
                : sess.activeAnalyteId,
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  selectCalibrationDataset: (uuid, calId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          activeCalibrationDatasetId: sess.calibrationDatasets.some(
            (c) => c.id === calId
          )
            ? calId
            : sess.activeCalibrationDatasetId,
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  createCalibrationDataset: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    if (!exp || !sess) return null;

    const now = new Date().toISOString();
    const seq = sess.calibrationDatasets.length + 1;
    const cal: CalibrationDataset = {
      id: generateUuid('calds'),
      calibrationId:
        input.calibrationId?.trim() || `CAL-${String(seq).padStart(2, '0')}`,
      title: input.title.trim() || `Calibration Dataset ${seq}`,
      sessionId: sess.id,
      analyteId: input.analyteId,
      referenceMethod: input.referenceMethod?.trim() ?? '',
      concUnit: input.concUnit.trim() || 'ppm',
      responseUnit: input.responseUnit.trim() || 'cps',
      analyst: sess.analyst || exp.researcher,
      analysisDate: sess.analysisDate || exp.experimentDate,
      provenance: 'user_entered',
      standards: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        updateActiveAnalyticalSession(e, (s) => ({
          ...s,
          calibrationDatasets: [...s.calibrationDatasets, cal],
          activeCalibrationDatasetId: cal.id,
          analytes: s.analytes.map((a) =>
            a.id === input.analyteId && !a.calibrationDatasetId
              ? { ...a, calibrationDatasetId: cal.id }
              : a
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
    return cal;
  },

  duplicateCalibrationDataset: (uuid, calId) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    const source = sess?.calibrationDatasets.find((c) => c.id === calId);
    if (!exp || !sess || !source) return null;

    const now = new Date().toISOString();
    const copy: CalibrationDataset = {
      ...structuredClone(source),
      id: generateUuid('calds'),
      calibrationId: `${source.calibrationId}-COPY`,
      title: `${source.title} (Copy)`,
      standards: source.standards.map((s) => ({
        ...structuredClone(s),
        id: generateUuid('cal'),
      })),
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        updateActiveAnalyticalSession(e, (s) => ({
          ...s,
          calibrationDatasets: [...s.calibrationDatasets, copy],
          activeCalibrationDatasetId: copy.id,
        }))
      ),
    }));
    schedulePersist(get, set);
    return copy;
  },

  updateCalibrationDatasetMeta: (uuid, calId, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          calibrationDatasets: sess.calibrationDatasets.map((c) =>
            c.id === calId ? { ...c, ...patch, updatedAt: now } : c
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteCalibrationDataset: (uuid, calId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const remaining = sess.calibrationDatasets.filter(
            (c) => c.id !== calId
          );
          return {
            ...sess,
            calibrationDatasets: remaining,
            activeCalibrationDatasetId:
              sess.activeCalibrationDatasetId === calId
                ? remaining[0]?.id ?? null
                : sess.activeCalibrationDatasetId,
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  addCalibrationStandardToDataset: (uuid, calId, initial) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          calibrationDatasets: sess.calibrationDatasets.map((c) => {
            if (c.id !== calId) return c;
            const nextNum = c.standards.length + 1;
            const std: CalibrationStandard = {
              id: generateUuid('cal'),
              standardId:
                initial?.standardId ?? `CAL-${String(nextNum).padStart(2, '0')}`,
              analyteId: initial?.analyteId ?? c.analyteId,
              isBlank: initial?.isBlank ?? false,
              replicateGroupId: initial?.replicateGroupId,
              nominalConc: initial?.nominalConc ?? null,
              unit: initial?.unit ?? c.concUnit ?? 'ppm',
              instrumentResponse: initial?.instrumentResponse ?? null,
              responseUnit: initial?.responseUnit ?? c.responseUnit ?? 'cps',
              replicateNumber: initial?.replicateNumber ?? 1,
              provenance: initial?.provenance ?? 'user_entered',
              qualityStatus: initial?.qualityStatus ?? 'valid',
              exclusionReason: initial?.exclusionReason,
              notes: initial?.notes ?? '',
            };
            return {
              ...c,
              standards: [...c.standards, std],
              updatedAt: now,
            };
          }),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  addCalibrationStandardsBulk: (uuid, calId, standards) => {
    if (standards.length === 0) return;
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          calibrationDatasets: sess.calibrationDatasets.map((c) =>
            c.id === calId
              ? {
                  ...c,
                  standards: [...c.standards, ...standards],
                  updatedAt: now,
                }
              : c
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateCalibrationStandardInDataset: (uuid, calId, stdId, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          calibrationDatasets: sess.calibrationDatasets.map((c) =>
            c.id === calId
              ? {
                  ...c,
                  standards: c.standards.map((s) =>
                    s.id === stdId ? { ...s, ...patch } : s
                  ),
                  updatedAt: now,
                }
              : c
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteCalibrationStandardInDataset: (uuid, calId, stdId) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          calibrationDatasets: sess.calibrationDatasets.map((c) =>
            c.id === calId
              ? {
                  ...c,
                  standards: c.standards.filter((s) => s.id !== stdId),
                  updatedAt: now,
                }
              : c
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  addAnalyticalSamplesBulk: (uuid, rows, importRecord) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          sampleMeasurements: [
            ...sess.sampleMeasurements,
            ...rows.map((r) => ({
              ...r,
              id: r.id || generateUuid('im'),
              sessionId: sess.id,
            })),
          ],
          importHistory: importRecord
            ? [importRecord, ...sess.importHistory]
            : sess.importHistory,
        }))
      ),
      statusBanner: importRecord
        ? {
            type: 'success',
            message: `Imported ${rows.length} analytical measurement row(s) from ${importRecord.filename}.`,
          }
        : state.statusBanner,
    }));
    schedulePersist(get, set);
  },

  duplicateAnalyticalSamples: (uuid, rowIds) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const copies: InstrumentMeasurement[] = [];
          for (const row of sess.sampleMeasurements) {
            if (!idSet.has(row.id)) continue;
            copies.push({
              ...structuredClone(row),
              id: generateUuid('im'),
              sampleId: `${row.sampleId}-COPY`,
              replicateId: row.replicateId === 'R1' ? 'R2' : `${row.replicateId}b`,
              linkedSurveyDatasetId: null,
              linkedSurveyMeasurementId: null,
            });
          }
          return {
            ...sess,
            sampleMeasurements: [...sess.sampleMeasurements, ...copies],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  bulkUpdateAnalyticalSamples: (uuid, rowIds, patch) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.map((m) =>
            idSet.has(m.id) ? { ...m, ...patch } : m
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteAnalyticalSamplesBulk: (uuid, rowIds) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.filter(
            (m) => !idSet.has(m.id)
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  addDilutionRecord: (uuid, record) => {
    const newRec: DilutionRecord = {
      ...record,
      id: generateUuid('dil'),
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          dilutionRecords: [...sess.dilutionRecords, newRec],
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateDilutionRecord: (uuid, recordId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          dilutionRecords: sess.dilutionRecords.map((d) =>
            d.id === recordId ? { ...d, ...patch } : d
          ),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  deleteDilutionRecord: (uuid, recordId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          dilutionRecords: sess.dilutionRecords.filter((d) => d.id !== recordId),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateAnalyticalReviewStatus: (uuid, input) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const existing = sess.reviewRecords.find(
            (r) => r.issueKey === input.issueKey
          );
          const historyEntry = {
            timestamp: now,
            status: input.status,
            author: input.author || sess.analyst || exp.researcher,
            note: input.researcherNotes.trim(),
          };
          if (existing) {
            return {
              ...sess,
              reviewRecords: sess.reviewRecords.map((r) =>
                r.issueKey === input.issueKey
                  ? {
                      ...r,
                      status: input.status,
                      researcherNotes: input.researcherNotes,
                      history: [historyEntry, ...r.history],
                    }
                  : r
              ),
            };
          }
          const created: AnalyticalReviewRecord = {
            id: generateUuid('rev'),
            issueKey: input.issueKey,
            category: input.category,
            sessionId: sess.id,
            recordId: input.recordId,
            recordLabel: input.recordLabel,
            description: input.description,
            provenance: input.provenance,
            identifiedAt: now,
            status: input.status,
            researcherNotes: input.researcherNotes,
            history: [historyEntry],
          };
          return {
            ...sess,
            reviewRecords: [created, ...sess.reviewRecords],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  linkAnalyticalToSurveyMeasurement: (uuid, params) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const now = new Date().toISOString();
        let surveyLabel = '';
        const nextDatasets = exp.surveyDatasets.map((ds) => {
          if (ds.id !== params.surveyDatasetId) return ds;
          return {
            ...ds,
            updatedAt: now,
            measurements: ds.measurements.map((m) => {
              if (m.id !== params.surveyMeasurementId) return m;
              surveyLabel = m.sampleId;
              return params.stage === 'Initial'
                ? {
                    ...m,
                    linkedInitialMeasurementId: params.instrumentMeasurementId,
                  }
                : {
                    ...m,
                    linkedFinalMeasurementId: params.instrumentMeasurementId,
                  };
            }),
          };
        });

        const nextSessions = exp.analyticalSessions.map((sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.map((im) =>
            im.id === params.instrumentMeasurementId
              ? {
                  ...im,
                  linkedSurveyDatasetId: params.surveyDatasetId,
                  linkedSurveyMeasurementId: params.surveyMeasurementId,
                  linkedSurveySampleId: surveyLabel || im.linkedSurveySampleId,
                }
              : im
          ),
        }));

        return projectExperimentCompatibilityMirrors({
          ...exp,
          surveyDatasets: nextDatasets,
          analyticalSessions: nextSessions,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  unlinkAnalyticalFromSurveyMeasurement: (uuid, params) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const now = new Date().toISOString();
        let removedInstrumentId: string | null = null;
        const nextDatasets = exp.surveyDatasets.map((ds) => {
          if (ds.id !== params.surveyDatasetId) return ds;
          return {
            ...ds,
            updatedAt: now,
            measurements: ds.measurements.map((m) => {
              if (m.id !== params.surveyMeasurementId) return m;
              if (params.stage === 'Initial') {
                removedInstrumentId = m.linkedInitialMeasurementId;
                return { ...m, linkedInitialMeasurementId: null };
              }
              removedInstrumentId = m.linkedFinalMeasurementId;
              return { ...m, linkedFinalMeasurementId: null };
            }),
          };
        });

        const nextSessions = exp.analyticalSessions.map((sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.map((im) =>
            im.id === removedInstrumentId
              ? {
                  ...im,
                  linkedSurveyDatasetId: null,
                  linkedSurveyMeasurementId: null,
                }
              : im
          ),
        }));

        return projectExperimentCompatibilityMirrors({
          ...exp,
          surveyDatasets: nextDatasets,
          analyticalSessions: nextSessions,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  applyAnalyticalValueToSurvey: (uuid, params) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const now = new Date().toISOString();
        const rounded = Number(params.effectiveConcPpm.toFixed(4));
        const nextDatasets = exp.surveyDatasets.map((ds) => {
          if (ds.id !== params.surveyDatasetId) return ds;
          return {
            ...ds,
            updatedAt: now,
            measurements: ds.measurements.map((m) => {
              if (m.id !== params.surveyMeasurementId) return m;
              return params.stage === 'Initial'
                ? { ...m, initialConcPpm: rounded }
                : { ...m, finalConcPpm: rounded };
            }),
          };
        });
        return projectExperimentCompatibilityMirrors({
          ...exp,
          surveyDatasets: nextDatasets,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  updateAnalyticalFigureConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          figureConfig: {
            ...sess.figureConfig,
            ...patch,
            savedAt: new Date().toISOString(),
          },
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  saveAnalyticalFigurePreset: (uuid, name) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    if (!exp || !sess) return null;
    const now = new Date().toISOString();
    const baseSaved: AnalyticalFigureConfiguration = {
      ...structuredClone(sess.figureConfig),
      id: generateUuid('afig'),
      name:
        name?.trim() ||
        sess.figureConfig.name.trim() ||
        `Analytical Figure ${sess.savedFigures.length + 1}`,
      savedAt: now,
    };
    const saved: AnalyticalFigureConfiguration = {
      ...baseSaved,
      analysisProvenance: {
        ...buildAnalyticalAnalysisProvenance(exp, sess),
        capturedAt: now,
      },
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => {
        const updated = updateActiveAnalyticalSession(e, (s) => ({
          ...s,
          savedFigures: [...s.savedFigures, saved],
        }));
        return {
          ...updated,
          activityEvents: appendActivityEvent(
            updated,
            {
              module: 'analytical',
              eventType: 'figure_saved',
              sourceKind: 'analytical_figure',
              sourceId: saved.id,
              sourceLabel: saved.name,
              author: e.researcher || 'Research Scientist',
              description: `Saved analytical figure "${saved.name}" on session ${sess.sessionId}.`,
            },
            now
          ),
        };
      }),
      statusBanner: {
        type: 'success',
        message: `Saved reproducible analytical figure preset "${saved.name}".`,
      },
    }));
    schedulePersist(get, set);
    return saved;
  },

  loadAnalyticalFigurePreset: (uuid, figureId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const found = sess.savedFigures.find((f) => f.id === figureId);
          if (!found) return sess;
          return {
            ...sess,
            figureConfig: structuredClone(found),
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  deleteAnalyticalFigurePreset: (uuid, figureId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => ({
          ...sess,
          savedFigures: sess.savedFigures.filter((f) => f.id !== figureId),
        }))
      ),
    }));
    schedulePersist(get, set);
  },

  updateAnalyticalComparison: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        analyticalComparison: { ...exp.analyticalComparison, ...patch },
      })),
    }));
    schedulePersist(get, set);
  },

  saveImportMappingTemplate: (template) => {
    const created: ImportMappingTemplate = {
      ...template,
      id: generateUuid('tmpl'),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      importMappingTemplates: [
        created,
        ...(state.importMappingTemplates ?? []),
      ],
      statusBanner: {
        type: 'success',
        message: `Saved reusable import template "${created.name}".`,
      },
    }));
    schedulePersist(get, set);
    return created;
  },

  deleteImportMappingTemplate: (templateId) => {
    set((state) => ({
      importMappingTemplates: (state.importMappingTemplates ?? []).filter(
        (t) => t.id !== templateId
      ),
    }));
    schedulePersist(get, set);
  },

  /* ==========================================================================
   * LEGACY-COMPATIBLE ANALYTICAL MUTATORS (Routed through active AnalyticalSession)
   * ========================================================================== */

  updateAnalyticalConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const activeAn =
            sess.analytes.find((a) => a.id === sess.activeAnalyteId) ??
            sess.analytes[0];
          return {
            ...sess,
            ...(patch.instrumentType ? { technique: patch.instrumentType } : {}),
            ...(patch.instrumentModel !== undefined
              ? { instrumentModel: patch.instrumentModel }
              : {}),
            ...(patch.matrixDescription !== undefined
              ? { matrixDescription: patch.matrixDescription }
              : {}),
            ...(patch.analystName !== undefined
              ? { analyst: patch.analystName }
              : {}),
            ...(patch.analysisDate !== undefined
              ? { analysisDate: patch.analysisDate }
              : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(patch.dataProvenance ? { provenance: patch.dataProvenance } : {}),
            analytes:
              activeAn &&
              (patch.analyteElement !== undefined ||
                patch.wavelengthNm !== undefined ||
                patch.calibrationUnits !== undefined)
                ? sess.analytes.map((a) =>
                    a.id === activeAn.id
                      ? {
                          ...a,
                          ...(patch.analyteElement !== undefined
                            ? { symbol: patch.analyteElement }
                            : {}),
                          ...(patch.wavelengthNm !== undefined
                            ? { wavelengthNm: patch.wavelengthNm }
                            : {}),
                          ...(patch.calibrationUnits !== undefined
                            ? { measurementUnit: patch.calibrationUnits }
                            : {}),
                        }
                      : a
                  )
                : sess.analytes,
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  addCalibrationStandard: (uuid) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    const calId =
      sess?.activeCalibrationDatasetId ?? sess?.calibrationDatasets[0]?.id;
    if (!calId) return;
    get().addCalibrationStandardToDataset(uuid, calId);
  },

  updateCalibrationStandard: (uuid, stdId, patch) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    const calId =
      sess?.calibrationDatasets.find((c) =>
        c.standards.some((s) => s.id === stdId)
      )?.id ?? sess?.activeCalibrationDatasetId;
    if (!calId) return;
    get().updateCalibrationStandardInDataset(uuid, calId, stdId, patch);
  },

  deleteCalibrationStandard: (uuid, stdId) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    const sess = exp?.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    const calId =
      sess?.calibrationDatasets.find((c) =>
        c.standards.some((s) => s.id === stdId)
      )?.id ?? sess?.activeCalibrationDatasetId;
    if (!calId) return;
    get().deleteCalibrationStandardInDataset(uuid, calId, stdId);
  },

  addInstrumentMeasurement: (uuid, stage = 'Initial') => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        updateActiveAnalyticalSession(exp, (sess) => {
          const activeAn =
            sess.analytes.find((a) => a.id === sess.activeAnalyteId) ??
            sess.analytes[0];
          const nextNum = sess.sampleMeasurements.length + 1;
          const tag =
            stage === 'Initial'
              ? 'INIT'
              : stage === 'Final'
                ? 'FIN'
                : stage.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          const row: InstrumentMeasurement = {
            id: generateUuid('im'),
            sampleId: `ANA-${String(nextNum).padStart(2, '0')}-${tag}`,
            sessionId: sess.id,
            analyteId: activeAn?.id ?? null,
            calibrationDatasetId:
              activeAn?.calibrationDatasetId ??
              sess.activeCalibrationDatasetId ??
              null,
            linkedSurveyDatasetId: null,
            linkedSurveyMeasurementId: null,
            linkedSurveySampleId: '',
            stage,
            analyte: activeAn?.symbol || activeAn?.name || '',
            replicateId: 'R1',
            dilutionFactor: null,
            reportedValueBasis: 'unspecified',
            rawSignal: null,
            signalUnit: sess.technique.includes('AAS') ? 'Abs' : 'cps',
            reportedConc: null,
            concUnit: activeAn?.measurementUnit || 'ppm',
            provenance: 'measured_experimental',
            qualityStatus: 'valid',
            measurementDate: sess.analysisDate || exp.experimentDate,
            notes: '',
          };
          return {
            ...sess,
            sampleMeasurements: [...sess.sampleMeasurements, row],
          };
        })
      ),
    }));
    schedulePersist(get, set);
  },

  updateInstrumentMeasurement: (uuid, rowId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const nextSessions = exp.analyticalSessions.map((sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.map((m) =>
            m.id === rowId ? { ...m, ...patch } : m
          ),
        }));
        return projectExperimentCompatibilityMirrors({
          ...exp,
          analyticalSessions: nextSessions,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  deleteInstrumentMeasurement: (uuid, rowId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const nextSessions = exp.analyticalSessions.map((sess) => ({
          ...sess,
          sampleMeasurements: sess.sampleMeasurements.filter(
            (m) => m.id !== rowId
          ),
        }));
        return projectExperimentCompatibilityMirrors({
          ...exp,
          analyticalSessions: nextSessions,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  addObservation: (uuid, obs) => {
    const now = new Date().toISOString();
    const record: ExperimentalObservation = {
      ...obs,
      id: generateUuid('obs'),
      timestamp: now,
      references: obs.references ?? [],
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        observations: [record, ...exp.observations],
        benchLogs: [
          {
            id: generateUuid('log'),
            timestamp: now,
            eventType: 'observation',
            message: `[${obs.category}] ${obs.text.slice(0, 120)}`,
          },
          ...exp.benchLogs,
        ],
        activityEvents: appendActivityEvent(
          exp,
          {
            module: obs.module,
            eventType: 'observation_logged',
            sourceKind: 'observation',
            sourceId: record.id,
            sourceLabel: obs.category,
            author: obs.author || exp.researcher || 'Research Scientist',
            description: `[${obs.category}] ${obs.text.slice(0, 140)}`,
          },
          now
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  deleteObservation: (uuid, obsId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        observations: exp.observations.filter((o) => o.id !== obsId),
      })),
    }));
    schedulePersist(get, set);
  },

  addChecklistItem: (uuid, label, plannedTime = '') => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const item: BenchChecklistItem = {
      id: generateUuid('chk'),
      label: trimmed,
      completed: false,
      plannedTime,
      actualCompletedAt: null,
      notes: '',
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        benchChecklist: [...exp.benchChecklist, item],
        benchLogs: [
          {
            id: generateUuid('log'),
            timestamp: now,
            eventType: 'checklist',
            message: `Added checklist task: ${trimmed}`,
          },
          ...exp.benchLogs,
        ],
      })),
    }));
    schedulePersist(get, set);
  },

  updateChecklistItem: (uuid, itemId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        benchChecklist: exp.benchChecklist.map((c) =>
          c.id === itemId ? { ...c, ...patch } : c
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  toggleChecklistItem: (uuid, itemId) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const target = exp.benchChecklist.find((c) => c.id === itemId);
        const nextCompleted = target ? !target.completed : false;
        return {
          ...exp,
          benchChecklist: exp.benchChecklist.map((c) =>
            c.id === itemId
              ? {
                  ...c,
                  completed: nextCompleted,
                  actualCompletedAt: nextCompleted ? now : null,
                }
              : c
          ),
          benchLogs: target
            ? [
                {
                  id: generateUuid('log'),
                  timestamp: now,
                  eventType: 'checklist',
                  message: `${nextCompleted ? 'Completed' : 'Reopened'} task: ${target.label}`,
                },
                ...exp.benchLogs,
              ]
            : exp.benchLogs,
        };
      }),
    }));
    schedulePersist(get, set);
  },

  deleteChecklistItem: (uuid, itemId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        benchChecklist: exp.benchChecklist.filter((c) => c.id !== itemId),
      })),
    }));
    schedulePersist(get, set);
  },

  updateBenchTimer: (uuid, patch, logMessage) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        benchTimer: { ...exp.benchTimer, ...patch },
        benchLogs: logMessage
          ? [
              {
                id: generateUuid('log'),
                timestamp: now,
                eventType: 'timer',
                message: logMessage,
              },
              ...exp.benchLogs,
            ]
          : exp.benchLogs,
      })),
    }));
    schedulePersist(get, set);
  },

  appendBenchLog: (uuid, eventType, message) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        benchLogs: [
          {
            id: generateUuid('log'),
            timestamp: now,
            eventType,
            message,
          },
          ...exp.benchLogs,
        ],
      })),
    }));
    schedulePersist(get, set);
  },

  updateReportConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        reportConfig: { ...exp.reportConfig, ...patch },
      })),
    }));
    schedulePersist(get, set);
  },

  addPrecursor: (input) => {
    const now = new Date().toISOString();
    const record: Precursor = {
      ...input,
      id: generateUuid('prec'),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ precursors: [record, ...state.precursors] }));
    schedulePersist(get, set);
    return record;
  },

  updatePrecursor: (id, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      precursors: state.precursors.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now } : p
      ),
    }));
    schedulePersist(get, set);
  },

  deletePrecursor: (id) => {
    set((state) => ({
      precursors: state.precursors.filter((p) => p.id !== id),
    }));
    schedulePersist(get, set);
  },

  addSupport: (input) => {
    const now = new Date().toISOString();
    const record: Support = {
      ...input,
      id: generateUuid('supp'),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ supports: [record, ...state.supports] }));
    schedulePersist(get, set);
    return record;
  },

  updateSupport: (id, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      supports: state.supports.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now } : s
      ),
    }));
    schedulePersist(get, set);
  },

  deleteSupport: (id) => {
    set((state) => ({
      supports: state.supports.filter((s) => s.id !== id),
    }));
    schedulePersist(get, set);
  },

  transitionExperimentStatus: (uuid, newStatus, explanation = '', options) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        if (exp.status === newStatus && !explanation.trim()) return exp;
        let nextSnapshots = exp.snapshots ?? [];
        let relatedSnapshotId: string | null = null;
        if (options?.createSnapshot) {
          const snap = createExperimentSnapshotRecord(exp, {
            snapshotId: generateUuid('snap'),
            name:
              options.snapshotName?.trim() ||
              `Status Transition Snapshot (${newStatus})`,
            description:
              explanation.trim() ||
              `Captured automatically when transitioning ${exp.experimentId} from ${exp.status} to ${newStatus}.`,
            researcher: exp.researcher || 'Research Scientist',
            capturedAt: now,
          });
          nextSnapshots = [...nextSnapshots, snap];
          relatedSnapshotId = snap.snapshotId;
        }
        const lcEvent: ExperimentLifecycleEvent = {
          id: generateUuid('lc'),
          fromStatus: exp.status,
          toStatus: newStatus,
          timestamp: now,
          researcher: exp.researcher || 'Research Scientist',
          explanation: explanation.trim(),
          snapshotId: relatedSnapshotId,
        };
        const nextExp: Experiment = {
          ...exp,
          status: newStatus,
          snapshots: nextSnapshots,
          lifecycleHistory: [...(exp.lifecycleHistory ?? []), lcEvent],
          benchLogs: [
            {
              id: generateUuid('log'),
              timestamp: now,
              eventType: 'status',
              message: `Status changed: ${exp.status} → ${newStatus}${explanation.trim() ? ` (${explanation.trim()})` : ''}.`,
            },
            ...exp.benchLogs,
          ],
          activityEvents: appendActivityEvent(
            exp,
            {
              module: 'overview',
              eventType:
                newStatus === 'Archived'
                  ? 'experiment_archived'
                  : 'lifecycle_transition',
              sourceKind: relatedSnapshotId ? 'snapshot' : 'experiment',
              sourceId: relatedSnapshotId ?? exp.uuid,
              sourceLabel: newStatus,
              author: exp.researcher || 'Research Scientist',
              description: `Lifecycle status changed from ${exp.status} to ${newStatus}${explanation.trim() ? ` — ${explanation.trim()}` : ''}.`,
            },
            now
          ),
        };
        return nextExp;
      }),
      statusBanner: {
        type: 'info',
        message: `Experiment status transitioned to ${newStatus}.`,
      },
    }));
    schedulePersist(get, set);
  },

  updateResearchPlan: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        researchPlan: {
          ...(exp.researchPlan ?? createDefaultResearchPlan()),
          ...patch,
        },
      })),
    }));
    schedulePersist(get, set);
  },

  addPlanDeviation: (uuid, deviation) => {
    const now = new Date().toISOString();
    const id = generateUuid('dev');
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const plan = exp.researchPlan ?? createDefaultResearchPlan();
        return {
          ...exp,
          researchPlan: {
            ...plan,
            deviations: [
              {
                id,
                timestamp: now,
                author:
                  deviation.author?.trim() ||
                  exp.researcher ||
                  'Research Scientist',
                description: deviation.description.trim(),
                reason: deviation.reason.trim(),
              },
              ...(plan.deviations ?? []),
            ],
          },
          activityEvents: appendActivityEvent(
            exp,
            {
              module: 'batch-synthesis',
              eventType: 'metadata_edited',
              sourceKind: 'experiment',
              sourceId: exp.uuid,
              sourceLabel: 'Research Deviation',
              author:
                deviation.author?.trim() ||
                exp.researcher ||
                'Research Scientist',
              description: `Logged plan deviation: ${deviation.description.trim()}.`,
            },
            now
          ),
        };
      }),
    }));
    schedulePersist(get, set);
  },

  deletePlanDeviation: (uuid, deviationId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const plan = exp.researchPlan ?? createDefaultResearchPlan();
        return {
          ...exp,
          researchPlan: {
            ...plan,
            deviations: (plan.deviations ?? []).filter(
              (d) => d.id !== deviationId
            ),
          },
        };
      }),
    }));
    schedulePersist(get, set);
  },

  saveExperimentTemplate: (template) => {
    const now = new Date().toISOString();
    const record: ExperimentTemplate = {
      ...template,
      id: generateUuid('tmpl-exp'),
      createdAt: now,
    };
    set((state) => ({
      experimentTemplates: [record, ...(state.experimentTemplates ?? [])],
      statusBanner: {
        type: 'success',
        message: `Saved documentation template "${record.name}".`,
      },
    }));
    schedulePersist(get, set);
    return record;
  },

  deleteExperimentTemplate: (templateId) => {
    set((state) => ({
      experimentTemplates: (state.experimentTemplates ?? []).filter(
        (t) => t.id !== templateId
      ),
    }));
    schedulePersist(get, set);
  },

  applyExperimentTemplate: (uuid, templateId) => {
    const tmpl = (get().experimentTemplates ?? []).find(
      (t) => t.id === templateId
    );
    if (!tmpl) return;
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const plan = exp.researchPlan ?? createDefaultResearchPlan();
        const existingTitles = new Set(
          (exp.milestones ?? []).map((m) => m.title.trim().toLowerCase())
        );
        const addedMilestones: ResearchMilestone[] = tmpl.defaultMilestones
          .filter(
            (ms) => !existingTitles.has(ms.title.trim().toLowerCase())
          )
          .map((ms, idx) => ({
            id: generateUuid('ms'),
            order: (exp.milestones?.length ?? 0) + idx,
            title: ms.title,
            description: ms.description || `Added from template "${tmpl.name}".`,
            status: 'pending',
            plannedDateTime: ms.plannedDateTime || '',
            actualCompletedAt: null,
            linkedModule: null,
            linkedRecordId: null,
            linkedRecordLabel: '',
            deviations: '',
            notes: '',
          }));
        const nextExp: Experiment = projectExperimentCompatibilityMirrors({
          ...exp,
          objective: exp.objective.trim() || tmpl.defaultObjective,
          researchPlan: {
            ...plan,
            researchQuestions:
              plan.researchQuestions.length > 0
                ? plan.researchQuestions
                : [...tmpl.researchQuestions],
            plannedMeasurementRequirements:
              plan.plannedMeasurementRequirements.trim() ||
              tmpl.plannedMeasurementRequirements,
            plannedAnalyticalSessions:
              plan.plannedAnalyticalSessions.trim() ||
              tmpl.plannedAnalyticalSessions,
            expectedDeliverables:
              plan.expectedDeliverables.trim() || tmpl.expectedDeliverables,
            externalProtocolRefs:
              plan.externalProtocolRefs.length > 0
                ? plan.externalProtocolRefs
                : [...tmpl.externalProtocolRefs],
          },
          milestones: [...(exp.milestones ?? []), ...addedMilestones],
          activityEvents: appendActivityEvent(
            exp,
            {
              module: 'batch-synthesis',
              eventType: 'metadata_edited',
              sourceKind: 'experiment',
              sourceId: exp.uuid,
              sourceLabel: tmpl.name,
              author: exp.researcher || 'Research Scientist',
              description: `Applied documentation template "${tmpl.name}" (${addedMilestones.length} milestones appended).`,
            },
            now
          ),
        });
        return nextExp;
      }),
      statusBanner: {
        type: 'success',
        message: `Applied documentation template "${tmpl.name}".`,
      },
    }));
    schedulePersist(get, set);
  },

  addMilestone: (uuid, input) => {
    const trimmed = input.title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const id = generateUuid('ms');
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const current = exp.milestones ?? [];
        const next: ResearchMilestone = {
          id,
          order: current.length,
          title: trimmed,
          description: input.description?.trim() ?? '',
          status: 'pending',
          plannedDateTime: input.plannedDateTime?.trim() ?? '',
          actualCompletedAt: null,
          linkedModule: input.linkedModule ?? null,
          linkedRecordId: input.linkedRecordId ?? null,
          linkedRecordLabel: input.linkedRecordLabel?.trim() ?? '',
          deviations: '',
          notes: '',
        };
        return projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: [...current, next],
          benchLogs: [
            {
              id: generateUuid('log'),
              timestamp: now,
              eventType: 'checklist',
              message: `Added milestone: ${trimmed}`,
            },
            ...exp.benchLogs,
          ],
          activityEvents: appendActivityEvent(
            exp,
            {
              module: 'bench-runner',
              eventType: 'milestone_updated',
              sourceKind: 'milestone',
              sourceId: id,
              sourceLabel: trimmed,
              author: exp.researcher || 'Research Scientist',
              description: `Added workflow milestone "${trimmed}".`,
            },
            now
          ),
        });
      }),
    }));
    schedulePersist(get, set);
  },

  updateMilestone: (uuid, milestoneId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) =>
        projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: (exp.milestones ?? []).map((m) =>
            m.id === milestoneId ? { ...m, ...patch } : m
          ),
        })
      ),
    }));
    schedulePersist(get, set);
  },

  reorderMilestone: (uuid, milestoneId, direction) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const list = [...(exp.milestones ?? [])].sort(
          (a, b) => a.order - b.order
        );
        const idx = list.findIndex((m) => m.id === milestoneId);
        if (idx === -1) return exp;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= list.length) return exp;
        const tmp = list[idx];
        list[idx] = list[swapIdx];
        list[swapIdx] = tmp;
        const reordered = list.map((m, i) => ({ ...m, order: i }));
        return projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: reordered,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  duplicateMilestone: (uuid, milestoneId) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const list = [...(exp.milestones ?? [])].sort(
          (a, b) => a.order - b.order
        );
        const source = list.find((m) => m.id === milestoneId);
        if (!source) return exp;
        const copy: ResearchMilestone = {
          ...structuredClone(source),
          id: generateUuid('ms'),
          title: `${source.title} (Copy)`,
          status: 'pending',
          actualCompletedAt: null,
          order: list.length,
        };
        return projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: [...list, copy],
          benchLogs: [
            {
              id: generateUuid('log'),
              timestamp: now,
              eventType: 'checklist',
              message: `Duplicated milestone: ${source.title}`,
            },
            ...exp.benchLogs,
          ],
        });
      }),
    }));
    schedulePersist(get, set);
  },

  setMilestoneStatus: (uuid, milestoneId, status) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const target = (exp.milestones ?? []).find((m) => m.id === milestoneId);
        if (!target) return exp;
        const nextMilestones = (exp.milestones ?? []).map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                status,
                actualCompletedAt: status === 'completed' ? now : null,
              }
            : m
        );
        return projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: nextMilestones,
          benchLogs: [
            {
              id: generateUuid('log'),
              timestamp: now,
              eventType: 'checklist',
              message: `Milestone "${target.title}" set to ${status}.`,
            },
            ...exp.benchLogs,
          ],
          activityEvents: appendActivityEvent(
            exp,
            {
              module: 'bench-runner',
              eventType: 'milestone_updated',
              sourceKind: 'milestone',
              sourceId: target.id,
              sourceLabel: target.title,
              author: exp.researcher || 'Research Scientist',
              description: `Milestone "${target.title}" marked as ${status}.`,
            },
            now
          ),
        });
      }),
    }));
    schedulePersist(get, set);
  },

  deleteMilestone: (uuid, milestoneId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const remaining = (exp.milestones ?? [])
          .filter((m) => m.id !== milestoneId)
          .map((m, i) => ({ ...m, order: i }));
        return projectExperimentCompatibilityMirrors({
          ...exp,
          milestones: remaining,
        });
      }),
    }));
    schedulePersist(get, set);
  },

  addResearchTimer: (uuid, input) => {
    const name = input.name.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const durSec = Math.max(10, Math.round(input.configuredDurationSec ?? 1800));
    const timer: ResearchTimer = {
      id: generateUuid('tmr'),
      name,
      mode: input.mode,
      configuredDurationSec: durSec,
      activeDurationSec: durSec,
      elapsedMs: 0,
      remainingMs: input.mode === 'countdown' ? durSec * 1000 : 0,
      status: 'ready',
      lastTickAt: null,
      startedAt: null,
      completedAt: null,
      linkedMilestoneId: input.linkedMilestoneId ?? null,
      history: [
        {
          timestamp: now,
          action: 'created',
          detail: `Created ${input.mode} timer "${name}".`,
        },
      ],
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        timers: [...(exp.timers ?? []), timer],
        benchLogs: [
          {
            id: generateUuid('log'),
            timestamp: now,
            eventType: 'timer',
            message: `Created ${input.mode} timer "${name}".`,
          },
          ...exp.benchLogs,
        ],
      })),
    }));
    schedulePersist(get, set);
  },

  updateResearchTimer: (uuid, timerId, patch, historyNote) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const nextTimers = (exp.timers ?? []).map((t) => {
          if (t.id !== timerId) return t;
          const merged = { ...t, ...patch };
          if (historyNote) {
            merged.history = [
              {
                timestamp: now,
                action: historyNote.action,
                detail: historyNote.detail,
              },
              ...(t.history ?? []),
            ].slice(0, 60);
          }
          return merged;
        });
        return {
          ...exp,
          timers: nextTimers,
          benchLogs: historyNote
            ? [
                {
                  id: generateUuid('log'),
                  timestamp: now,
                  eventType: 'timer',
                  message: historyNote.detail,
                },
                ...exp.benchLogs,
              ]
            : exp.benchLogs,
          activityEvents:
            historyNote &&
            (historyNote.action === 'started' ||
              historyNote.action === 'completed')
              ? appendActivityEvent(
                  exp,
                  {
                    module: 'bench-runner',
                    eventType: 'timer_event',
                    sourceKind: 'timer',
                    sourceId: timerId,
                    sourceLabel:
                      nextTimers.find((t) => t.id === timerId)?.name ?? 'Timer',
                    author: exp.researcher || 'Research Scientist',
                    description: historyNote.detail,
                  },
                  now
                )
              : exp.activityEvents,
        };
      }),
    }));
    schedulePersist(get, set);
  },

  deleteResearchTimer: (uuid, timerId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        timers: (exp.timers ?? []).filter((t) => t.id !== timerId),
      })),
    }));
    schedulePersist(get, set);
  },

  updateSampleRegistryNote: (uuid, note) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const existing = exp.sampleRegistryNotes ?? [];
        const has = existing.some((n) => n.sampleKey === note.sampleKey);
        const nextNotes = has
          ? existing.map((n) =>
              n.sampleKey === note.sampleKey ? { ...n, ...note } : n
            )
          : [...existing, note];
        return {
          ...exp,
          sampleRegistryNotes: nextNotes,
        };
      }),
    }));
    schedulePersist(get, set);
  },

  createExperimentSnapshot: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const now = new Date().toISOString();
    const snap = createExperimentSnapshotRecord(exp, {
      snapshotId: generateUuid('snap'),
      name:
        input.name.trim() ||
        `Snapshot ${(exp.snapshots?.length ?? 0) + 1} (${now.slice(0, 10)})`,
      description: input.description?.trim() ?? '',
      researcher:
        input.researcher?.trim() || exp.researcher || 'Research Scientist',
      capturedAt: now,
    });
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        snapshots: [...(e.snapshots ?? []), snap],
        activityEvents: appendActivityEvent(
          e,
          {
            module: 'overview',
            eventType: 'snapshot_created',
            sourceKind: 'snapshot',
            sourceId: snap.snapshotId,
            sourceLabel: snap.name,
            author: snap.researcher,
            description: `Created immutable snapshot "${snap.name}".`,
          },
          now
        ),
      })),
      statusBanner: {
        type: 'success',
        message: `Created immutable snapshot "${snap.name}".`,
      },
    }));
    schedulePersist(get, set);
    return snap;
  },

  deleteExperimentSnapshot: (uuid, snapshotId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const isBound = (exp.finalizedReports ?? []).some(
          (r) => r.snapshotId === snapshotId
        );
        if (isBound) return exp;
        return {
          ...exp,
          snapshots: (exp.snapshots ?? []).filter(
            (s) => s.snapshotId !== snapshotId
          ),
        };
      }),
    }));
    schedulePersist(get, set);
  },

  restoreExperimentSnapshot: (sourceUuid, snapshotId) => {
    const state = get();
    const sourceExp = state.experiments.find((e) => e.uuid === sourceUuid);
    const snap = sourceExp?.snapshots?.find((s) => s.snapshotId === snapshotId);
    if (!sourceExp || !snap) return null;

    const restored = restoreSnapshotAsIndependentExperiment(
      snap,
      state.experiments,
      generateUuid,
      generateUniqueExperimentId
    );

    set((prev) => ({
      experiments: [restored, ...prev.experiments],
      activeExperimentUuid: restored.uuid,
      activeModule: 'overview',
      statusBanner: {
        type: 'success',
        message: `Restored snapshot "${snap.name}" as new independent experiment ${restored.experimentId}.`,
      },
    }));
    schedulePersist(get, set);
    return restored;
  },

  createFinalizedReport: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const now = new Date().toISOString();
    const nextVersion =
      (exp.finalizedReports ?? []).reduce(
        (max, r) => Math.max(max, r.versionNumber),
        0
      ) + 1;

    let boundSnapshot: ExperimentSnapshot | undefined = input.snapshotId
      ? (exp.snapshots ?? []).find((s) => s.snapshotId === input.snapshotId)
      : undefined;
    let createdNewSnapshot: ExperimentSnapshot | null = null;

    if (!boundSnapshot) {
      createdNewSnapshot = createExperimentSnapshotRecord(exp, {
        snapshotId: generateUuid('snap'),
        name:
          input.snapshotName?.trim() ||
          `Finalized Report v${nextVersion} Snapshot`,
        description: `Immutable snapshot automatically created to lock Finalized Report v${nextVersion}.`,
        researcher: exp.researcher || 'Research Scientist',
        capturedAt: now,
      });
      boundSnapshot = createdNewSnapshot;
    }

    const crossExperimentSnapshots = captureCrossExperimentSnapshotsForReport(
      boundSnapshot.payload,
      get().experiments,
      exp.reportConfig,
      {
        capturedAt: now,
        researcher: exp.researcher || 'Research Scientist',
        idGenerator: generateUuid,
      }
    );

    const report: FinalizedReport = {
      id: generateUuid('frep'),
      versionNumber: nextVersion,
      title:
        input.title.trim() ||
        `${exp.experimentId} — Research Report (Finalized v${nextVersion})`,
      reportType: exp.reportConfig.reportType ?? 'complete-research',
      snapshotId: boundSnapshot.snapshotId,
      snapshotName: boundSnapshot.name,
      finalizedAt: now,
      researcher: exp.researcher || 'Research Scientist',
      scientificReviewStatus: boundSnapshot.scientificReviewStatus,
      reportConfig: structuredClone(exp.reportConfig),
      notes: input.notes?.trim() ?? '',
      crossExperimentSnapshots,
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        snapshots: createdNewSnapshot
          ? [...(e.snapshots ?? []), createdNewSnapshot]
          : e.snapshots ?? [],
        finalizedReports: [report, ...(e.finalizedReports ?? [])],
        activityEvents: appendActivityEvent(
          e,
          {
            module: 'lab-report',
            eventType: 'report_finalized',
            sourceKind: 'finalized_report',
            sourceId: report.id,
            sourceLabel: `Report v${nextVersion}`,
            author: report.researcher,
            description: `Finalized Report v${nextVersion} ("${report.title}") bound to snapshot "${boundSnapshot!.name}".`,
          },
          now
        ),
      })),
      statusBanner: {
        type: 'success',
        message: `Finalized Report v${nextVersion} bound to immutable snapshot "${boundSnapshot.name}".`,
      },
    }));
    schedulePersist(get, set);
    return report;
  },

  deleteFinalizedReport: (uuid, reportId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        finalizedReports: (exp.finalizedReports ?? []).filter(
          (r) => r.id !== reportId
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  addUncertaintyRecord: (uuid, input) => {
    const exp = get().experiments.find((e) => e.uuid === uuid);
    if (!exp) return null;
    const now = new Date().toISOString();
    const record: MeasurementUncertaintyRecord = {
      ...input,
      id: generateUuid('unc'),
      experimentUuid: uuid,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        uncertaintyRecords: [record, ...(e.uncertaintyRecords ?? [])],
      })),
      statusBanner: {
        type: 'success',
        message: `Recorded ${record.uncertaintyType} uncertainty for ${record.measurementLabel}.`,
      },
    }));
    schedulePersist(get, set);
    return record;
  },

  updateUncertaintyRecord: (uuid, recordId, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        uncertaintyRecords: (e.uncertaintyRecords ?? []).map((u) =>
          u.id === recordId ? { ...u, ...patch, updatedAt: now } : u
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  deleteUncertaintyRecord: (uuid, recordId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) => ({
        ...e,
        uncertaintyRecords: (e.uncertaintyRecords ?? []).filter(
          (u) => u.id !== recordId
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  saveResearchComparisonConfig: (input) => {
    const now = new Date().toISOString();
    const existing = (get().researchComparisonConfigs ?? []).find(
      (c) => c.id === input.id
    );
    const saved: ResearchComparisonConfiguration = {
      ...input,
      id: existing ? existing.id : input.id || generateUuid('rcmp'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    set((state) => {
      const list = state.researchComparisonConfigs ?? [];
      const next = existing
        ? list.map((c) => (c.id === saved.id ? saved : c))
        : [saved, ...list];
      return {
        researchComparisonConfigs: next,
        statusBanner: {
          type: 'success',
          message: `Saved comparison configuration "${saved.name}".`,
        },
      };
    });
    schedulePersist(get, set);
    return saved;
  },

  deleteResearchComparisonConfig: (configId) => {
    set((state) => ({
      researchComparisonConfigs: (state.researchComparisonConfigs ?? []).filter(
        (c) => c.id !== configId
      ),
    }));
    schedulePersist(get, set);
  },

  saveResearchMatrixConfig: (input) => {
    const now = new Date().toISOString();
    const existing = (get().researchMatrixConfigs ?? []).find(
      (c) => c.id === input.id
    );
    const saved: ResearchMatrixConfiguration = {
      ...input,
      id: existing ? existing.id : input.id || generateUuid('rmtx'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    set((state) => {
      const list = state.researchMatrixConfigs ?? [];
      const next = existing
        ? list.map((c) => (c.id === saved.id ? saved : c))
        : [saved, ...list];
      return {
        researchMatrixConfigs: next,
        statusBanner: {
          type: 'success',
          message: `Saved matrix configuration "${saved.name}".`,
        },
      };
    });
    schedulePersist(get, set);
    return saved;
  },

  deleteResearchMatrixConfig: (configId) => {
    set((state) => ({
      researchMatrixConfigs: (state.researchMatrixConfigs ?? []).filter(
        (c) => c.id !== configId
      ),
    }));
    schedulePersist(get, set);
  },

  saveResearchAnalysisSnapshot: (input) => {
    const now = new Date().toISOString();
    const saved: ResearchAnalysisSnapshot = {
      ...input,
      id: generateUuid('ras'),
      capturedAt: now,
    };
    set((state) => ({
      researchAnalysisSnapshots: [
        saved,
        ...(state.researchAnalysisSnapshots ?? []),
      ],
      statusBanner: {
        type: 'success',
        message: `Captured reproducible analysis snapshot "${saved.title}".`,
      },
    }));
    schedulePersist(get, set);
    return saved;
  },

  deleteResearchAnalysisSnapshot: (snapshotId) => {
    set((state) => ({
      researchAnalysisSnapshots: (state.researchAnalysisSnapshots ?? []).filter(
        (s) => s.id !== snapshotId
      ),
    }));
    schedulePersist(get, set);
  },

  replaceWorkspace: (workspace) => {
    const validActive = workspace.experiments.some(
      (e) => e.uuid === workspace.activeExperimentUuid
    )
      ? workspace.activeExperimentUuid
      : workspace.experiments[0]?.uuid ?? null;

    const normalized: WorkspaceStateData = {
      ...workspace,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      activeExperimentUuid: validActive,
      experimentTemplates:
        workspace.experimentTemplates && workspace.experimentTemplates.length > 0
          ? workspace.experimentTemplates
          : createDefaultExperimentTemplates(),
      researchComparisonConfigs: workspace.researchComparisonConfigs ?? [],
      researchMatrixConfigs: workspace.researchMatrixConfigs ?? [],
      researchAnalysisSnapshots: workspace.researchAnalysisSnapshots ?? [],
      hasInitializedDemo: true,
    };
    const saved = saveWorkspaceToStorage(normalized);
    set({
      ...normalized,
      saveStatus: saved.ok ? 'saved' : 'error',
      lastSavedAt: saved.savedAt ?? normalized.lastSavedAt,
      storageBytes: saved.byteSize,
      storageError: saved.error,
      storageDiagnostics: computeStorageDiagnostics(normalized),
      statusBanner: {
        type: 'success',
        message: `Imported workspace (${normalized.experiments.length} experiments, ${normalized.precursors.length} precursors, ${normalized.supports.length} supports).`,
      },
    });
  },

  getSerializableWorkspace: () => extractWorkspaceData(get()),
}));

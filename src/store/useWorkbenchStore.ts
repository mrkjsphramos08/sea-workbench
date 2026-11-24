'use client';

import { create } from 'zustand';
import {
  APP_VERSION,
  ActiveModule,
  AnalyticalConfiguration,
  BatchConfiguration,
  BenchChecklistItem,
  BenchLog,
  BenchTimerState,
  CalibrationStandard,
  DatasetComparisonConfig,
  Experiment,
  ExperimentStatus,
  ExperimentType,
  ExperimentalObservation,
  FigureConfiguration,
  InstrumentMeasurement,
  Precursor,
  ReferencePzcMarker,
  ReplicateGroupMeta,
  ReportConfiguration,
  ResearchAnnotation,
  ResearchProject,
  Support,
  SurveyAnalysisConfiguration,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
  SurveyMode,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../domain/models/types';
import {
  createBlankExperiment,
  createBlankSurveyDataset,
  createInitialDemoWorkspace,
  createPrecursorSnapshot,
  createSupportSnapshot,
  createSyntheticDemoDataset,
  duplicateExperimentRecord,
  duplicateSurveyDatasetRecord,
  generateUniqueDatasetId,
  generateUniqueExperimentId,
  generateUuid,
} from '../data/demo/demoWorkspace';
import {
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from '../services/persistence/storage';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface WorkbenchStore extends WorkspaceStateData {
  activeModule: ActiveModule;
  hydrated: boolean;
  saveStatus: SaveStatus;
  storageBytes: number;
  storageError: string | null;
  statusBanner: {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
  } | null;

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

  // Analytical (Dilution & Standards)
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
    if (result.ok) {
      set({
        saveStatus: 'saved',
        lastSavedAt: result.savedAt,
        storageBytes: result.byteSize,
        storageError: null,
      });
    } else {
      set({
        saveStatus: 'error',
        storageError: result.error,
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

  return {
    ...exp,
    surveyDatasets: nextDatasets,
    activeSurveyDatasetId: activeDs?.id ?? null,
    surveyConfig: activeDs ? activeDs.config : exp.surveyConfig,
    surveyMeasurements: activeDs ? activeDs.measurements : exp.surveyMeasurements,
  };
}

const initialBlankState: WorkspaceStateData = {
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  projects: [],
  experiments: [],
  activeExperimentUuid: null,
  precursors: [],
  supports: [],
  preferences: {
    sidebarCollapsed: false,
    defaultResearcher: 'Research Scientist',
  },
  hasInitializedDemo: false,
  lastSavedAt: null,
};

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...initialBlankState,
  activeModule: 'library',
  hydrated: false,
  saveStatus: 'idle',
  storageBytes: 0,
  storageError: null,
  statusBanner: null,

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

      set({
        ...loaded.data,
        activeExperimentUuid: validActive,
        hydrated: true,
        saveStatus: 'saved',
        lastSavedAt: savedAt,
        storageBytes: byteSize,
        storageError: null,
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
    });
  },

  saveNow: () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    const data = extractWorkspaceData(get());
    const result = saveWorkspaceToStorage(data);
    if (result.ok) {
      set({
        saveStatus: 'saved',
        lastSavedAt: result.savedAt,
        storageBytes: result.byteSize,
        storageError: null,
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
    const saved: FigureConfiguration = {
      ...structuredClone(ds.figureConfig),
      id: generateUuid('fig'),
      name:
        name?.trim() ||
        ds.figureConfig.name.trim() ||
        `Saved Figure ${ds.savedFigures.length + 1}`,
      savedAt: now,
    };

    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (e) =>
        updateActiveSurveyDataset(e, (activeDs) => ({
          ...activeDs,
          savedFigures: [...activeDs.savedFigures, saved],
        }))
      ),
      statusBanner: {
        type: 'success',
        message: `Saved figure configuration "${saved.name}".`,
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
   * ANALYTICAL, BENCH, REPORT & DATABASES (Preserved from Phases 1 & 2)
   * ========================================================================== */

  updateAnalyticalConfig: (uuid, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        analyticalConfig: { ...exp.analyticalConfig, ...patch },
      })),
    }));
    schedulePersist(get, set);
  },

  addCalibrationStandard: (uuid) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const nextNum = exp.calibrationStandards.length + 1;
        const std: CalibrationStandard = {
          id: generateUuid('cal'),
          standardId: `CAL-${String(nextNum).padStart(2, '0')}`,
          nominalConc: null,
          unit: 'ppm',
          instrumentResponse: null,
          responseUnit: 'cps',
          replicateNumber: 1,
          provenance: 'user_entered',
          qualityStatus: 'valid',
          notes: '',
        };
        return {
          ...exp,
          calibrationStandards: [...exp.calibrationStandards, std],
        };
      }),
    }));
    schedulePersist(get, set);
  },

  updateCalibrationStandard: (uuid, stdId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        calibrationStandards: exp.calibrationStandards.map((s) =>
          s.id === stdId ? { ...s, ...patch } : s
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  deleteCalibrationStandard: (uuid, stdId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        calibrationStandards: exp.calibrationStandards.filter(
          (s) => s.id !== stdId
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  addInstrumentMeasurement: (uuid, stage = 'Initial') => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => {
        const nextNum = exp.instrumentMeasurements.length + 1;
        const tag =
          stage === 'Initial'
            ? 'INIT'
            : stage === 'Final'
              ? 'FIN'
              : stage.toUpperCase();
        const row: InstrumentMeasurement = {
          id: generateUuid('im'),
          sampleId: `ANA-${String(nextNum).padStart(2, '0')}-${tag}`,
          linkedSurveySampleId: '',
          stage,
          analyte: exp.analyticalConfig.analyteElement || '',
          replicateId: 'R1',
          dilutionFactor: null,
          rawSignal: null,
          signalUnit: 'cps',
          reportedConc: null,
          concUnit: 'ppm',
          provenance: 'measured_experimental',
          qualityStatus: 'valid',
          measurementDate:
            exp.analyticalConfig.analysisDate || exp.experimentDate,
          notes: '',
        };
        return {
          ...exp,
          instrumentMeasurements: [...exp.instrumentMeasurements, row],
        };
      }),
    }));
    schedulePersist(get, set);
  },

  updateInstrumentMeasurement: (uuid, rowId, patch) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        instrumentMeasurements: exp.instrumentMeasurements.map((m) =>
          m.id === rowId ? { ...m, ...patch } : m
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  deleteInstrumentMeasurement: (uuid, rowId) => {
    set((state) => ({
      experiments: updateExperimentInList(state.experiments, uuid, (exp) => ({
        ...exp,
        instrumentMeasurements: exp.instrumentMeasurements.filter(
          (m) => m.id !== rowId
        ),
      })),
    }));
    schedulePersist(get, set);
  },

  addObservation: (uuid, obs) => {
    const now = new Date().toISOString();
    const record: ExperimentalObservation = {
      ...obs,
      id: generateUuid('obs'),
      timestamp: now,
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
      hasInitializedDemo: true,
    };
    const saved = saveWorkspaceToStorage(normalized);
    set({
      ...normalized,
      saveStatus: saved.ok ? 'saved' : 'error',
      lastSavedAt: saved.savedAt ?? normalized.lastSavedAt,
      storageBytes: saved.byteSize,
      storageError: saved.error,
      statusBanner: {
        type: 'success',
        message: `Imported workspace (${normalized.experiments.length} experiments, ${normalized.precursors.length} precursors, ${normalized.supports.length} supports).`,
      },
    });
  },

  getSerializableWorkspace: () => extractWorkspaceData(get()),
}));

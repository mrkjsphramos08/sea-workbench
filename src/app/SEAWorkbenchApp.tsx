'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkbenchStore } from '../store/useWorkbenchStore';
import { TopBar } from '../components/layout/TopBar';
import { Sidebar } from '../components/layout/Sidebar';
import { Button, EmptyState } from '../components/ui/Primitives';
import { ExperimentLibrary } from '../features/experiments/ExperimentLibrary';
import { NewExperimentModal } from '../features/experiments/NewExperimentModal';
import { WorkspaceTransferModal } from '../features/experiments/WorkspaceTransferModal';
import { BatchSynthesisWorkspace } from '../features/batch-synthesis/BatchSynthesisWorkspace';
import { UptakeSurveyWorkspace } from '../features/uptake-survey/UptakeSurveyWorkspace';
import { DilutionStandardsWorkspace } from '../features/analytical/DilutionStandardsWorkspace';
import { BenchRunnerWorkspace } from '../features/bench-runner/BenchRunnerWorkspace';
import { LabReportWorkspace } from '../features/reports/LabReportWorkspace';
import { DatabasesWorkspace } from '../features/databases/DatabasesWorkspace';

export function SEAWorkbenchApp() {
  const store = useWorkbenchStore();
  const [newExpOpen, setNewExpOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    store.hydrateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeExperiment =
    store.experiments.find((e) => e.uuid === store.activeExperimentUuid) ?? null;

  const handlePrintReport = () => {
    if (!activeExperiment) return;
    if (store.activeModule !== 'lab-report') {
      store.setActiveModule('lab-report');
      window.setTimeout(() => window.print(), 180);
    } else {
      window.print();
    }
  };

  if (!store.hydrated) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center text-[13px] text-[#4B5563] font-mono">
        Initializing SEA Workbench workspace...
      </div>
    );
  }

  const requiresActiveExperiment =
    store.activeModule !== 'library' && store.activeModule !== 'databases';

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#F8F9FA] text-[#111827] print:h-auto print:overflow-visible">
      <TopBar
        activeExperiment={activeExperiment}
        sidebarCollapsed={store.preferences.sidebarCollapsed}
        saveStatus={store.saveStatus}
        lastSavedAt={store.lastSavedAt}
        onToggleSidebar={store.toggleSidebar}
        onUpdateTitle={(title) => {
          if (activeExperiment) {
            store.updateExperimentMeta(activeExperiment.uuid, { title });
          }
        }}
        onUpdateStatus={(status) => {
          if (activeExperiment) {
            store.updateExperimentMeta(activeExperiment.uuid, { status });
          }
        }}
        onOpenNewExperiment={() => setNewExpOpen(true)}
        onSaveRun={() => {
          store.saveNow();
        }}
        onOpenLoadRun={() => setTransferOpen(true)}
        onPrintReport={handlePrintReport}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden print:overflow-visible">
        <Sidebar
          activeModule={store.activeModule}
          collapsed={store.preferences.sidebarCollapsed}
          storageBytes={store.storageBytes}
          storageError={store.storageError}
          experimentCount={store.experiments.length}
          onSelectModule={store.setActiveModule}
        />

        <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 print:overflow-visible print:p-0">
          {/* Status / Error Banner */}
          {store.statusBanner && (
            <div
              role="status"
              className={`mb-4 px-3.5 py-2.5 rounded-[6px] border text-[12.5px] flex items-center justify-between gap-3 no-print ${
                store.statusBanner.type === 'error'
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                  : store.statusBanner.type === 'warning'
                    ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                    : store.statusBanner.type === 'success'
                      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                      : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
              }`}
            >
              <span>{store.statusBanner.message}</span>
              <button
                type="button"
                onClick={store.dismissBanner}
                aria-label="Dismiss notification"
                className="p-0.5 opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )}

          {/* Module Content */}
          <div className="max-w-[1440px] mx-auto">
            {store.activeModule === 'library' && (
              <ExperimentLibrary
                experiments={store.experiments}
                projects={store.projects}
                activeExperimentUuid={store.activeExperimentUuid}
                onOpenNewExperiment={() => setNewExpOpen(true)}
                onOpenExperiment={store.openExperiment}
                onRenameExperiment={(uuid, title) =>
                  store.updateExperimentMeta(uuid, { title })
                }
                onDuplicateExperiment={(uuid) => {
                  store.duplicateExperiment(uuid);
                }}
                onArchiveExperiment={store.archiveExperiment}
                onDeleteExperiment={store.deleteExperiment}
                onCreateProject={store.createProject}
                onDeleteProject={store.deleteProject}
              />
            )}

            {store.activeModule === 'databases' && (
              <DatabasesWorkspace
                precursors={store.precursors}
                supports={store.supports}
                onAddPrecursor={store.addPrecursor}
                onUpdatePrecursor={store.updatePrecursor}
                onDeletePrecursor={store.deletePrecursor}
                onAddSupport={store.addSupport}
                onUpdateSupport={store.updateSupport}
                onDeleteSupport={store.deleteSupport}
              />
            )}

            {requiresActiveExperiment && !activeExperiment && (
              <EmptyState
                title="No Active Experiment Selected"
                description="Select an experiment from the Experiment Library or create a new blank experiment to work in this module."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => store.setActiveModule('library')}
                    >
                      Go to Experiment Library
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setNewExpOpen(true)}
                    >
                      New Blank Experiment
                    </Button>
                  </div>
                }
              />
            )}

            {activeExperiment && store.activeModule === 'batch-synthesis' && (
              <BatchSynthesisWorkspace
                experiment={activeExperiment}
                projects={store.projects}
                supports={store.supports}
                precursors={store.precursors}
                onUpdateMeta={(patch) =>
                  store.updateExperimentMeta(activeExperiment.uuid, patch)
                }
                onUpdateBatch={(patch) =>
                  store.updateBatchConfig(activeExperiment.uuid, patch)
                }
                onAssignSupport={(supportId) =>
                  store.assignSupportToExperiment(
                    activeExperiment.uuid,
                    supportId
                  )
                }
                onAssignPrecursor={(precursorId) =>
                  store.assignPrecursorToExperiment(
                    activeExperiment.uuid,
                    precursorId
                  )
                }
                onRefreshSnapshot={(kind) =>
                  store.refreshMaterialSnapshot(activeExperiment.uuid, kind)
                }
                onAddObservation={(text) =>
                  store.addObservation(activeExperiment.uuid, {
                    module: 'batch-synthesis',
                    category: 'Synthesis',
                    author: activeExperiment.researcher || 'Researcher',
                    text,
                    provenance: 'user_entered',
                  })
                }
                onDeleteObservation={(obsId) =>
                  store.deleteObservation(activeExperiment.uuid, obsId)
                }
              />
            )}

            {activeExperiment && store.activeModule === 'uptake-survey' && (
              <UptakeSurveyWorkspace
                experiment={activeExperiment}
                allExperiments={store.experiments}
                onSelectDataset={(datasetId) =>
                  store.selectSurveyDataset(activeExperiment.uuid, datasetId)
                }
                onCreateDataset={(input) =>
                  store.createSurveyDataset(activeExperiment.uuid, input)
                }
                onLoadSyntheticDataset={(mode) =>
                  store.loadSyntheticSurveyDataset(activeExperiment.uuid, mode)
                }
                onUpdateDatasetMeta={(datasetId, patch) =>
                  store.updateSurveyDatasetMeta(
                    activeExperiment.uuid,
                    datasetId,
                    patch
                  )
                }
                onDuplicateDataset={(datasetId) =>
                  store.duplicateSurveyDataset(activeExperiment.uuid, datasetId)
                }
                onArchiveDataset={(datasetId) =>
                  store.archiveSurveyDataset(activeExperiment.uuid, datasetId)
                }
                onDeleteDataset={(datasetId) =>
                  store.deleteSurveyDataset(activeExperiment.uuid, datasetId)
                }
                onUpdateConfig={(patch) =>
                  store.updateSurveyConfig(activeExperiment.uuid, patch)
                }
                onUpdateAnalysisConfig={(patch) =>
                  store.updateSurveyAnalysisConfig(activeExperiment.uuid, patch)
                }
                onAddRow={() => store.addSurveyMeasurement(activeExperiment.uuid)}
                onAddRowsBulk={(rows) =>
                  store.addSurveyMeasurementsBulk(activeExperiment.uuid, rows)
                }
                onDuplicateRows={(rowIds) =>
                  store.duplicateSurveyMeasurements(
                    activeExperiment.uuid,
                    rowIds
                  )
                }
                onUpdateRow={(rowId, patch) =>
                  store.updateSurveyMeasurement(
                    activeExperiment.uuid,
                    rowId,
                    patch
                  )
                }
                onDeleteRow={(rowId) =>
                  store.deleteSurveyMeasurement(activeExperiment.uuid, rowId)
                }
                onDeleteRowsBulk={(rowIds) =>
                  store.deleteSurveyMeasurementsBulk(
                    activeExperiment.uuid,
                    rowIds
                  )
                }
                onCreateReplicateGroup={(group) =>
                  store.createReplicateGroupMeta(activeExperiment.uuid, group)
                }
                onRenameReplicateGroup={(oldGroupId, newGroupId) =>
                  store.renameReplicateGroup(
                    activeExperiment.uuid,
                    oldGroupId,
                    newGroupId
                  )
                }
                onUpdateReplicateGroupMeta={(groupId, patch) =>
                  store.updateReplicateGroupMeta(
                    activeExperiment.uuid,
                    groupId,
                    patch
                  )
                }
                onAssignRowsToGroup={(rowIds, targetGroupId) =>
                  store.assignRowsToReplicateGroup(
                    activeExperiment.uuid,
                    rowIds,
                    targetGroupId
                  )
                }
                onRemoveRowFromGroup={(rowId) =>
                  store.removeRowFromReplicateGroup(
                    activeExperiment.uuid,
                    rowId
                  )
                }
                onAddReferencePzcMarker={(marker) =>
                  store.addReferencePzcMarker(activeExperiment.uuid, marker)
                }
                onDeleteReferencePzcMarker={(markerId) =>
                  store.deleteReferencePzcMarker(
                    activeExperiment.uuid,
                    markerId
                  )
                }
                onUpdateFigureConfig={(patch) =>
                  store.updateFigureConfig(activeExperiment.uuid, patch)
                }
                onSaveFigurePreset={(name) =>
                  store.saveFigurePreset(activeExperiment.uuid, name)
                }
                onLoadFigurePreset={(figureId) =>
                  store.loadFigurePreset(activeExperiment.uuid, figureId)
                }
                onDeleteFigurePreset={(figureId) =>
                  store.deleteFigurePreset(activeExperiment.uuid, figureId)
                }
                onUpdateComparison={(patch) =>
                  store.updateDatasetComparison(activeExperiment.uuid, patch)
                }
                onAddAnnotation={(annotation) =>
                  store.addResearchAnnotation(activeExperiment.uuid, annotation)
                }
                onUpdateAnnotation={(annotationId, patch) =>
                  store.updateResearchAnnotation(
                    activeExperiment.uuid,
                    annotationId,
                    patch
                  )
                }
                onDeleteAnnotation={(annotationId) =>
                  store.deleteResearchAnnotation(
                    activeExperiment.uuid,
                    annotationId
                  )
                }
              />
            )}

            {activeExperiment && store.activeModule === 'analytical' && (
              <DilutionStandardsWorkspace
                experiment={activeExperiment}
                onUpdateConfig={(patch) =>
                  store.updateAnalyticalConfig(activeExperiment.uuid, patch)
                }
                onAddStandard={() =>
                  store.addCalibrationStandard(activeExperiment.uuid)
                }
                onUpdateStandard={(stdId, patch) =>
                  store.updateCalibrationStandard(
                    activeExperiment.uuid,
                    stdId,
                    patch
                  )
                }
                onDeleteStandard={(stdId) =>
                  store.deleteCalibrationStandard(activeExperiment.uuid, stdId)
                }
                onAddSample={(stage) =>
                  store.addInstrumentMeasurement(activeExperiment.uuid, stage)
                }
                onUpdateSample={(rowId, patch) =>
                  store.updateInstrumentMeasurement(
                    activeExperiment.uuid,
                    rowId,
                    patch
                  )
                }
                onDeleteSample={(rowId) =>
                  store.deleteInstrumentMeasurement(activeExperiment.uuid, rowId)
                }
              />
            )}

            {activeExperiment && store.activeModule === 'bench-runner' && (
              <BenchRunnerWorkspace
                key={activeExperiment.uuid}
                experiment={activeExperiment}
                onAddChecklistItem={(label, plannedTime) =>
                  store.addChecklistItem(
                    activeExperiment.uuid,
                    label,
                    plannedTime
                  )
                }
                onUpdateChecklistItem={(itemId, patch) =>
                  store.updateChecklistItem(
                    activeExperiment.uuid,
                    itemId,
                    patch
                  )
                }
                onToggleChecklistItem={(itemId) =>
                  store.toggleChecklistItem(activeExperiment.uuid, itemId)
                }
                onDeleteChecklistItem={(itemId) =>
                  store.deleteChecklistItem(activeExperiment.uuid, itemId)
                }
                onUpdateTimer={(patch, logMessage) =>
                  store.updateBenchTimer(
                    activeExperiment.uuid,
                    patch,
                    logMessage
                  )
                }
                onAddObservation={(text) =>
                  store.addObservation(activeExperiment.uuid, {
                    module: 'bench-runner',
                    category: 'Bench',
                    author: activeExperiment.researcher || 'Researcher',
                    text,
                    provenance: 'user_entered',
                  })
                }
                onDeleteObservation={(obsId) =>
                  store.deleteObservation(activeExperiment.uuid, obsId)
                }
              />
            )}

            {activeExperiment && store.activeModule === 'lab-report' && (
              <LabReportWorkspace
                experiment={activeExperiment}
                allExperiments={store.experiments}
                projects={store.projects}
                onUpdateReportConfig={(patch) =>
                  store.updateReportConfig(activeExperiment.uuid, patch)
                }
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Modals */}
      <NewExperimentModal
        open={newExpOpen}
        onClose={() => setNewExpOpen(false)}
        projects={store.projects}
        existingExperiments={store.experiments}
        defaultResearcher={store.preferences.defaultResearcher}
        onCreate={(input) => {
          const created = store.createExperiment(input);
          if (created.type === 'Batch Synthesis') {
            store.setActiveModule('batch-synthesis');
          } else {
            store.setActiveModule('uptake-survey');
          }
        }}
      />

      <WorkspaceTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        getSerializableWorkspace={store.getSerializableWorkspace}
        onImportWorkspace={store.replaceWorkspace}
      />
    </div>
  );
}

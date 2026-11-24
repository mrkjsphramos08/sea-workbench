'use client';

import React, { useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpen,
  Copy,
  FileSpreadsheet,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  DatasetComparisonConfig,
  Experiment,
  FigureConfiguration,
  ReferencePzcMarker,
  ReplicateGroupMeta,
  ResearchAnnotation,
  SurveyAnalysisConfiguration,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
  SurveyMode,
  SurveyWorkspaceTab,
} from '../../domain/models/types';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  Modal,
  ProvenanceIndicator,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';
import { SurveyOverviewTab } from './SurveyOverviewTab';
import { MeasurementDataTab } from './MeasurementDataTab';
import { StatisticalAnalysisTab } from './StatisticalAnalysisTab';
import { FiguresComparisonTab } from './FiguresComparisonTab';
import { ResearchInterpretationTab } from './ResearchInterpretationTab';

export interface UptakeSurveyWorkspaceProps {
  experiment: Experiment;
  allExperiments: Experiment[];
  onSelectDataset: (datasetId: string) => void;
  onCreateDataset: (input: {
    datasetId?: string;
    title: string;
    mode: SurveyMode;
    objective?: string;
  }) => void;
  onLoadSyntheticDataset: (mode: SurveyMode) => void;
  onUpdateDatasetMeta: (
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
  onDuplicateDataset: (datasetId: string) => void;
  onArchiveDataset: (datasetId: string) => void;
  onDeleteDataset: (datasetId: string) => void;
  onUpdateConfig: (patch: Partial<SurveyConfiguration>) => void;
  onUpdateAnalysisConfig: (patch: Partial<SurveyAnalysisConfiguration>) => void;
  onAddRow: () => void;
  onAddRowsBulk: (rows: SurveyMeasurement[]) => void;
  onDuplicateRows: (rowIds: string[]) => void;
  onUpdateRow: (rowId: string, patch: Partial<SurveyMeasurement>) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteRowsBulk: (rowIds: string[]) => void;
  onCreateReplicateGroup: (group: ReplicateGroupMeta) => void;
  onRenameReplicateGroup: (oldGroupId: string, newGroupId: string) => void;
  onUpdateReplicateGroupMeta: (
    groupId: string,
    patch: Partial<ReplicateGroupMeta>
  ) => void;
  onAssignRowsToGroup: (rowIds: string[], targetGroupId: string) => void;
  onRemoveRowFromGroup: (rowId: string) => void;
  onAddReferencePzcMarker: (marker: Omit<ReferencePzcMarker, 'id'>) => void;
  onDeleteReferencePzcMarker: (markerId: string) => void;
  onUpdateFigureConfig: (patch: Partial<FigureConfiguration>) => void;
  onSaveFigurePreset: (name?: string) => void;
  onLoadFigurePreset: (figureId: string) => void;
  onDeleteFigurePreset: (figureId: string) => void;
  onUpdateComparison: (patch: Partial<DatasetComparisonConfig>) => void;
  onAddAnnotation: (
    annotation: Omit<ResearchAnnotation, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<ResearchAnnotation>
  ) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

const WORKSPACE_TABS: Array<{
  id: SurveyWorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'overview', label: 'Survey Overview', icon: LayoutDashboard },
  { id: 'data', label: 'Measurement Data', icon: FileSpreadsheet },
  { id: 'analysis', label: 'Statistical Analysis', icon: BarChart3 },
  { id: 'figures', label: 'Figures & Comparison', icon: LineChart },
  { id: 'interpretation', label: 'Research Interpretation', icon: BookOpen },
];

export function UptakeSurveyWorkspace(props: UptakeSurveyWorkspaceProps) {
  const { experiment } = props;
  const [activeTab, setActiveTab] = useState<SurveyWorkspaceTab>('overview');
  const [datasetSearch, setDatasetSearch] = useState('');
  const [datasetModeFilter, setDatasetModeFilter] = useState<
    'all' | 'uptake' | 'pzc' | 'archived'
  >('all');
  const [newDatasetModalOpen, setNewDatasetModalOpen] = useState(false);
  const [newDsTitle, setNewDsTitle] = useState('');
  const [newDsMode, setNewDsMode] = useState<SurveyMode>('uptake');
  const [newDsObjective, setNewDsObjective] = useState('');
  const [deleteDatasetTarget, setDeleteDatasetTarget] =
    useState<SurveyDataset | null>(null);

  const activeDataset = useMemo(() => {
    return (
      experiment.surveyDatasets.find(
        (d) => d.id === experiment.activeSurveyDatasetId
      ) ??
      experiment.surveyDatasets[0] ??
      null
    );
  }, [experiment.surveyDatasets, experiment.activeSurveyDatasetId]);

  const filteredDatasets = useMemo(() => {
    const q = datasetSearch.trim().toLowerCase();
    return experiment.surveyDatasets.filter((ds) => {
      if (datasetModeFilter === 'archived') {
        if (ds.status !== 'Archived') return false;
      } else {
        if (ds.status === 'Archived') return false;
        if (datasetModeFilter !== 'all' && ds.mode !== datasetModeFilter)
          return false;
      }
      if (q) {
        const hay = `${ds.datasetId} ${ds.title} ${ds.objective}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [experiment.surveyDatasets, datasetSearch, datasetModeFilter]);

  const handleCreateDatasetSubmit = () => {
    if (!newDsTitle.trim()) return;
    props.onCreateDataset({
      title: newDsTitle.trim(),
      mode: newDsMode,
      objective: newDsObjective.trim(),
    });
    setNewDsTitle('');
    setNewDsObjective('');
    setNewDatasetModalOpen(false);
  };

  if (!activeDataset) {
    return (
      <div className="p-8 bg-white border border-[#E5E7EB] rounded-[8px] text-center space-y-3">
        <h2 className="text-[15px] font-semibold text-[#111827]">
          No Survey Datasets in Experiment
        </h2>
        <p className="text-[13px] text-[#6B7280]">
          Create a new blank Uptake or PZC / pH Shift survey dataset to begin.
        </p>
        <div className="flex justify-center gap-2">
          <Button
            variant="primary"
            onClick={() => setNewDatasetModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            New Survey Dataset
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        title="Uptake & PZC Research Workspace"
        description="Organize multi-series uptake and PZC/pH-shift datasets, manage explicit replicate groups, customize publication figures, compare series, and document traceable interpretations."
        metadata={
          <>
            <span>
              Experiment:{' '}
              <strong className="font-mono text-[#0F52BA]">
                {experiment.experimentId}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Active Series:{' '}
              <strong className="font-mono text-[#111827]">
                {activeDataset.datasetId}
              </strong>{' '}
              ({activeDataset.mode === 'pzc' ? 'PZC / pH Shift' : 'Uptake'})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Datasets:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {experiment.surveyDatasets.length}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <ProvenanceIndicator provenance={activeDataset.provenance} />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => props.onLoadSyntheticDataset(activeDataset.mode)}
            >
              <FlaskConical className="w-3.5 h-3.5" strokeWidth={1.75} />
              Load Synthetic Demo Series
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewDsMode(activeDataset.mode);
                setNewDatasetModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New Dataset
            </Button>
          </>
        }
      />

      {/* Compact Multi-Dataset Switcher & Management Bar */}
      <section
        aria-label="Survey dataset selector and management"
        className="bg-white border border-[#E5E7EB] rounded-[8px] p-3 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="text"
                aria-label="Filter survey datasets"
                value={datasetSearch}
                onChange={(e) => setDatasetSearch(e.target.value)}
                placeholder="Filter datasets..."
                className="h-7 pl-8 pr-2.5 w-44 text-[12px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[5px] focus:bg-white focus:border-[#0F52BA]"
              />
            </div>
            <select
              aria-label="Filter datasets by type"
              value={datasetModeFilter}
              onChange={(e) =>
                setDatasetModeFilter(
                  e.target.value as 'all' | 'uptake' | 'pzc' | 'archived'
                )
              }
              className="h-7 px-2 text-[12px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[5px]"
            >
              <option value="all">
                Active Datasets (
                {
                  experiment.surveyDatasets.filter((d) => d.status !== 'Archived')
                    .length
                }
                )
              </option>
              <option value="uptake">Uptake Only</option>
              <option value="pzc">PZC / pH Shift Only</option>
              <option value="archived">
                Archived (
                {
                  experiment.surveyDatasets.filter((d) => d.status === 'Archived')
                    .length
                }
                )
              </option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => props.onDuplicateDataset(activeDataset.id)}
            >
              <Copy className="w-3 h-3" strokeWidth={1.75} />
              Duplicate Series
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => props.onArchiveDataset(activeDataset.id)}
            >
              <Archive className="w-3 h-3" strokeWidth={1.75} />
              {activeDataset.status === 'Archived' ? 'Restore' : 'Archive'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={experiment.surveyDatasets.length <= 1}
              onClick={() => setDeleteDatasetTarget(activeDataset)}
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Delete
            </Button>
          </div>
        </div>

        {/* Dataset Cards Strip */}
        <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5">
          {filteredDatasets.length === 0 ? (
            <div className="text-[12px] text-[#6B7280] py-1">
              No datasets match the current filter.
            </div>
          ) : (
            filteredDatasets.map((ds) => {
              const isSelected = ds.id === activeDataset.id;
              return (
                <button
                  key={ds.id}
                  type="button"
                  onClick={() => props.onSelectDataset(ds.id)}
                  className={`text-left px-3 py-2 rounded-[6px] border min-w-[210px] max-w-[270px] shrink-0 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EFF6FF] border-[#0F52BA]'
                      : 'bg-[#F8F9FA] border-[#E5E7EB] hover:bg-white hover:border-[#D1D5DB]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-[11.5px] font-semibold ${
                        isSelected ? 'text-[#0F52BA]' : 'text-[#111827]'
                      }`}
                    >
                      {ds.datasetId}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[3px] border border-[#E5E7EB] bg-white text-[#4B5563]">
                      {ds.mode === 'pzc' ? 'PZC' : 'Uptake'}
                    </span>
                  </div>
                  <div className="text-[12px] font-medium text-[#111827] truncate mt-0.5">
                    {ds.title}
                  </div>
                  <div className="text-[10.5px] font-mono text-[#6B7280] mt-0.5">
                    {ds.measurements.length} rows · {ds.savedFigures.length}{' '}
                    fig · {ds.annotations.length} notes
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Compact 5-View Horizontal Navigation Bar (Global Sidebar Unchanged) */}
      <nav
        aria-label="Uptake and PZC research views"
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto border-b border-[#E5E7EB]"
      >
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 whitespace-nowrap transition-colors cursor-pointer -mb-px ${
                isActive
                  ? 'border-[#0F52BA] text-[#0F52BA] bg-white'
                  : 'border-transparent text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{tab.label}</span>
              {tab.id === 'data' && (
                <span className="font-mono text-[10.5px] text-[#6B7280]">
                  ({activeDataset.measurements.length})
                </span>
              )}
              {tab.id === 'interpretation' &&
                activeDataset.annotations.length > 0 && (
                  <span className="font-mono text-[10.5px] text-[#6B7280]">
                    ({activeDataset.annotations.length})
                  </span>
                )}
            </button>
          );
        })}
      </nav>

      {/* Active View Panel */}
      <div>
        {activeTab === 'overview' && (
          <SurveyOverviewTab
            experiment={experiment}
            dataset={activeDataset}
            onUpdateDatasetMeta={(patch) =>
              props.onUpdateDatasetMeta(activeDataset.id, patch)
            }
            onUpdateConfig={props.onUpdateConfig}
          />
        )}

        {activeTab === 'data' && (
          <MeasurementDataTab
            experiment={experiment}
            dataset={activeDataset}
            onAddRow={props.onAddRow}
            onAddRowsBulk={props.onAddRowsBulk}
            onDuplicateRows={props.onDuplicateRows}
            onUpdateRow={props.onUpdateRow}
            onDeleteRow={props.onDeleteRow}
            onDeleteRowsBulk={props.onDeleteRowsBulk}
          />
        )}

        {activeTab === 'analysis' && (
          <StatisticalAnalysisTab
            experiment={experiment}
            dataset={activeDataset}
            onUpdateAnalysisConfig={props.onUpdateAnalysisConfig}
            onCreateReplicateGroup={props.onCreateReplicateGroup}
            onRenameReplicateGroup={props.onRenameReplicateGroup}
            onUpdateReplicateGroupMeta={props.onUpdateReplicateGroupMeta}
            onAssignRowsToGroup={props.onAssignRowsToGroup}
            onRemoveRowFromGroup={props.onRemoveRowFromGroup}
            onUpdateRow={props.onUpdateRow}
            onAddReferencePzcMarker={props.onAddReferencePzcMarker}
            onDeleteReferencePzcMarker={props.onDeleteReferencePzcMarker}
          />
        )}

        {activeTab === 'figures' && (
          <FiguresComparisonTab
            experiment={experiment}
            allExperiments={props.allExperiments}
            dataset={activeDataset}
            onUpdateFigureConfig={props.onUpdateFigureConfig}
            onSaveFigurePreset={props.onSaveFigurePreset}
            onLoadFigurePreset={props.onLoadFigurePreset}
            onDeleteFigurePreset={props.onDeleteFigurePreset}
            onUpdateComparison={props.onUpdateComparison}
          />
        )}

        {activeTab === 'interpretation' && (
          <ResearchInterpretationTab
            experiment={experiment}
            dataset={activeDataset}
            onAddAnnotation={props.onAddAnnotation}
            onUpdateAnnotation={props.onUpdateAnnotation}
            onDeleteAnnotation={props.onDeleteAnnotation}
          />
        )}
      </div>

      {/* Create New Survey Dataset Modal */}
      <Modal
        open={newDatasetModalOpen}
        onClose={() => setNewDatasetModalOpen(false)}
        title="Create New Survey Dataset"
        description="Creates an independent, empty experimental series inside the active experiment record."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3.5">
          <div>
            <FieldLabel htmlFor="new-ds-title" required>
              Dataset Title
            </FieldLabel>
            <input
              id="new-ds-title"
              type="text"
              value={newDsTitle}
              onChange={(e) => setNewDsTitle(e.target.value)}
              placeholder="e.g., Pt/SiO2 Uptake Series — 1000 m²/L"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-ds-mode" required>
              Survey Type
            </FieldLabel>
            <select
              id="new-ds-mode"
              value={newDsMode}
              onChange={(e) => setNewDsMode(e.target.value as SurveyMode)}
              className={inputBaseClass}
            >
              <option value="uptake">Uptake Survey</option>
              <option value="pzc">PZC / pH Shift Survey</option>
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="new-ds-obj">Research Objective</FieldLabel>
            <textarea
              id="new-ds-obj"
              rows={2}
              value={newDsObjective}
              onChange={(e) => setNewDsObjective(e.target.value)}
              placeholder="Brief experimental question for this series..."
              className="w-full p-2.5 text-[12.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setNewDatasetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newDsTitle.trim()}
              onClick={handleCreateDatasetSubmit}
            >
              Create Dataset
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Dataset Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteDatasetTarget)}
        title="Delete Survey Dataset"
        message={`Permanently delete dataset "${deleteDatasetTarget?.datasetId} — ${deleteDatasetTarget?.title}" and all ${deleteDatasetTarget?.measurements.length ?? 0} measurement rows, saved figures, and annotations?`}
        confirmLabel="Delete Dataset"
        variant="danger"
        onConfirm={() => {
          if (deleteDatasetTarget) {
            props.onDeleteDataset(deleteDatasetTarget.id);
          }
          setDeleteDatasetTarget(null);
        }}
        onCancel={() => setDeleteDatasetTarget(null)}
      />
    </div>
  );
}

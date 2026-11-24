'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Package,
  ShieldAlert,
} from 'lucide-react';
import {
  ActiveModule,
  AnalyticalQualityIssueCategory,
  AnalyticalReviewStatus,
  Experiment,
  ExperimentStatus,
  OverviewWorkspaceTab,
  Precursor,
  ResearchProject,
  SampleRegistryNote,
  Support,
} from '../../domain/models/types';
import {
  CONSOLIDATED_REVIEW_GROUP_LABELS,
  buildConsolidatedReviewItems,
  buildExperimentTimeline,
  buildUnifiedSampleRegistry,
  evaluateFigureReproducibility,
  hasExperimentChangedSinceSnapshot,
} from '../../domain/calculations/workflowEngine';
import {
  buildResearchExportPackage,
  triggerBinaryDownload,
} from '../../services/import-export/researchPackage';
import { Panel, StatusText } from '../../components/ui/Primitives';
import { SampleRegistryTab } from './SampleRegistryTab';
import { ResearchTimelineTab } from './ResearchTimelineTab';
import { ResearchReviewCenterTab } from './ResearchReviewCenterTab';
import { SnapshotsRevisionTab } from './SnapshotsRevisionTab';

const ALL_EXPERIMENT_STATUSES: ExperimentStatus[] = [
  'Draft',
  'Planned',
  'In Progress',
  'Measurements Pending',
  'Analysis in Progress',
  'Under Review',
  'Completed',
  'Archived',
];

interface ExperimentOverviewWorkspaceProps {
  experiment: Experiment;
  project: ResearchProject | null;
  supports: Support[];
  precursors: Precursor[];
  activeTab: OverviewWorkspaceTab;
  onChangeTab: (tab: OverviewWorkspaceTab) => void;
  onTransitionStatus: (
    newStatus: ExperimentStatus,
    explanation: string,
    options?: { createSnapshot?: boolean; snapshotName?: string }
  ) => void;
  onUpdateSampleNote: (note: SampleRegistryNote) => void;
  onUpdateAnalyticalReview: (
    sessionId: string,
    payload: {
      issueKey: string;
      category: AnalyticalQualityIssueCategory;
      recordId: string;
      recordLabel: string;
      description: string;
      status: AnalyticalReviewStatus;
      researcherNotes: string;
      author: string;
    }
  ) => void;
  onCreateSnapshot: (input: { name: string; description: string }) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onNavigate: (target: {
    module: ActiveModule;
    surveyDatasetId?: string;
    analyticalSessionId?: string;
    overviewTab?: OverviewWorkspaceTab;
    surveyTab?: 'overview' | 'data' | 'analysis' | 'figures' | 'interpretation';
    analyticalTab?:
      | 'overview'
      | 'calibration'
      | 'samples'
      | 'dilutions'
      | 'quality'
      | 'figures';
    highlightRecordId?: string;
  }) => void;
}

export function ExperimentOverviewWorkspace({
  experiment,
  project,
  supports,
  precursors,
  activeTab,
  onChangeTab,
  onTransitionStatus,
  onUpdateSampleNote,
  onUpdateAnalyticalReview,
  onCreateSnapshot,
  onDeleteSnapshot,
  onRestoreSnapshot,
  onNavigate,
}: ExperimentOverviewWorkspaceProps) {
  const [showLifecycleForm, setShowLifecycleForm] = useState(false);
  const [nextStatus, setNextStatus] = useState<ExperimentStatus>(
    experiment.status
  );
  const [transitionNote, setTransitionNote] = useState('');
  const [captureOnTransition, setCaptureOnTransition] = useState(false);

  const sampleRegistry = useMemo(
    () => buildUnifiedSampleRegistry(experiment),
    [experiment]
  );
  const reviewItems = useMemo(
    () => buildConsolidatedReviewItems(experiment, supports, precursors),
    [experiment, supports, precursors]
  );
  const openReviewItems = useMemo(
    () =>
      reviewItems.filter(
        (i) =>
          i.status !== 'Resolved' &&
          i.status !== 'Acknowledged' &&
          i.status !== 'Excluded by Researcher'
      ),
    [reviewItems]
  );
  const resolvedReviewCount = reviewItems.length - openReviewItems.length;

  const timeline = useMemo(
    () => buildExperimentTimeline(experiment),
    [experiment]
  );

  const savedFiguresSummary = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      kind: 'survey' | 'analytical';
      sourceCode: string;
      sourceId: string;
      status:
        | 'saved_current'
        | 'requires_regeneration'
        | 'source_unavailable'
        | 'legacy_untracked';
      label: string;
      message: string;
    }> = [];
    for (const ds of experiment.surveyDatasets ?? []) {
      for (const fig of ds.savedFigures ?? []) {
        const evalRes = evaluateFigureReproducibility(
          experiment,
          'survey',
          fig,
          ds.id
        );
        items.push({
          id: fig.id,
          name: fig.name || fig.title,
          kind: 'survey',
          sourceCode: ds.datasetId,
          sourceId: ds.id,
          status: evalRes.status,
          label: evalRes.label,
          message: evalRes.message,
        });
      }
    }
    for (const sess of experiment.analyticalSessions ?? []) {
      for (const fig of sess.savedFigures ?? []) {
        const evalRes = evaluateFigureReproducibility(
          experiment,
          'analytical',
          fig,
          sess.id
        );
        items.push({
          id: fig.id,
          name: fig.name || fig.title,
          kind: 'analytical',
          sourceCode: sess.sessionId,
          sourceId: sess.id,
          status: evalRes.status,
          label: evalRes.label,
          message: evalRes.message,
        });
      }
    }
    return items;
  }, [experiment]);

  const completedMilestones = (experiment.milestones ?? []).filter(
    (m) => m.status === 'completed'
  ).length;
  const totalMilestones = (experiment.milestones ?? []).length;

  const handleExportZipPackage = () => {
    const pkg = buildResearchExportPackage(experiment);
    triggerBinaryDownload(pkg.zipBytes, pkg.filename);
  };

  const handleSubmitTransition = (e: React.FormEvent) => {
    e.preventDefault();
    onTransitionStatus(nextStatus, transitionNote, {
      createSnapshot: captureOnTransition,
    });
    setTransitionNote('');
    setCaptureOnTransition(false);
    setShowLifecycleForm(false);
  };

  const tabs: Array<{
    id: OverviewWorkspaceTab;
    label: string;
    count?: number;
  }> = [
    { id: 'summary', label: 'Overview' },
    {
      id: 'samples',
      label: 'Sample Registry',
      count: sampleRegistry.entries.length,
    },
    {
      id: 'timeline',
      label: 'Research Timeline',
      count: timeline.length,
    },
    {
      id: 'review',
      label: 'Review Center',
      count: openReviewItems.length,
    },
    {
      id: 'snapshots',
      label: 'Snapshots & Revisions',
      count: (experiment.snapshots ?? []).length,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white border border-[#E5E7EB] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold text-[#0F52BA]">
                {experiment.experimentId}
              </span>
              {project && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                  {project.code}
                </span>
              )}
              <StatusText status={experiment.status} />
              <StatusText label={experiment.scientificReviewStatus} />
              <span className="text-[11px] font-mono text-[#6B7280]">
                {experiment.type} · {experiment.experimentDate}
              </span>
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-[#111827] leading-snug">
              {experiment.title}
            </h1>
            {experiment.objective && (
              <p className="text-[12.5px] text-[#4B5563] max-w-4xl leading-relaxed">
                {experiment.objective}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setNextStatus(experiment.status);
                setShowLifecycleForm((v) => !v);
              }}
              className="h-8 px-3 text-[12px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] inline-flex items-center gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              Transition Status
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('snapshots')}
              className="h-8 px-3 text-[12px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] inline-flex items-center gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              Snapshot
            </button>
            <button
              type="button"
              onClick={handleExportZipPackage}
              className="h-8 px-3 text-[12px] font-medium bg-[#0F52BA] text-white hover:bg-[#0D47A1] inline-flex items-center gap-1.5"
            >
              <Package className="h-3.5 w-3.5" />
              Export Package (.zip)
            </button>
          </div>
        </div>

        {/* Inline Lifecycle Transition Form */}
        {showLifecycleForm && (
          <form
            onSubmit={handleSubmitTransition}
            className="mt-3 pt-3 border-t border-[#E5E7EB] bg-[#F8F9FA] p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-3 space-y-1">
              <label
                htmlFor="lifecycle-status-select"
                className="text-[11px] font-medium text-[#374151] block"
              >
                New Lifecycle Status
              </label>
              <select
                id="lifecycle-status-select"
                value={nextStatus}
                onChange={(e) =>
                  setNextStatus(e.target.value as ExperimentStatus)
                }
                className="w-full h-8 px-2 text-[12px] border border-[#E5E7EB] bg-white text-[#111827]"
              >
                {ALL_EXPERIMENT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-5 space-y-1">
              <label
                htmlFor="lifecycle-note-input"
                className="text-[11px] font-medium text-[#374151] block"
              >
                Transition Explanation (Logged to Lifecycle History)
              </label>
              <input
                id="lifecycle-note-input"
                type="text"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder={
                  experiment.status === 'Completed'
                    ? 'Reason for reopening completed record (prior snapshots preserved)...'
                    : 'Optional rationale for status change...'
                }
                className="w-full h-8 px-2.5 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-1.5 pb-1.5">
              <input
                id="snap-on-transition"
                type="checkbox"
                checked={captureOnTransition}
                onChange={(e) => setCaptureOnTransition(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#0F52BA]"
              />
              <label
                htmlFor="snap-on-transition"
                className="text-[11px] text-[#374151]"
              >
                Capture snapshot
              </label>
            </div>
            <div className="md:col-span-2 flex gap-1.5">
              <button
                type="submit"
                className="flex-1 h-8 px-2.5 text-[12px] font-medium bg-[#0F52BA] text-white"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowLifecycleForm(false)}
                className="h-8 px-2.5 text-[12px] border border-[#E5E7EB] bg-white text-[#4B5563]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Sub-Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Experiment overview sections"
          className="mt-4 -mb-4 flex flex-wrap gap-1 border-t border-[#E5E7EB] pt-2"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'border-[#0F52BA] text-[#0F52BA]'
                    : 'border-transparent text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 ${
                      tab.id === 'review' && tab.count > 0
                        ? 'bg-[#FEF3C7] text-[#92400E]'
                        : 'bg-[#F3F4F6] text-[#4B5563]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-view Body */}
      {activeTab === 'samples' && (
        <SampleRegistryTab
          experiment={experiment}
          onUpdateSampleNote={onUpdateSampleNote}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'timeline' && (
        <ResearchTimelineTab experiment={experiment} onNavigate={onNavigate} />
      )}

      {activeTab === 'review' && (
        <ResearchReviewCenterTab
          experiment={experiment}
          supports={supports}
          precursors={precursors}
          onUpdateAnalyticalReview={onUpdateAnalyticalReview}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'snapshots' && (
        <SnapshotsRevisionTab
          experiment={experiment}
          onCreateSnapshot={onCreateSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
          onRestoreSnapshot={onRestoreSnapshot}
        />
      )}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Compact Quantitative Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => onNavigate({ module: 'uptake-survey' })}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Survey Datasets
              </div>
              <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827] mt-0.5">
                {experiment.surveyDatasets.length}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                {experiment.surveyDatasets.reduce(
                  (acc, d) => acc + d.measurements.length,
                  0
                )}{' '}
                rows
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate({ module: 'analytical' })}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Analytical Sessions
              </div>
              <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827] mt-0.5">
                {experiment.analyticalSessions.length}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                {experiment.analyticalSessions.reduce(
                  (acc, s) => acc + s.sampleMeasurements.length,
                  0
                )}{' '}
                assays
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('samples')}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Unified Samples
              </div>
              <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827] mt-0.5">
                {sampleRegistry.entries.length}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                {sampleRegistry.duplicateLabelWarnings.length > 0
                  ? `${sampleRegistry.duplicateLabelWarnings.length} dup label`
                  : 'unique IDs'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('review')}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Open Review Items
              </div>
              <div
                className={`text-[18px] font-semibold font-mono tabular-nums mt-0.5 ${
                  openReviewItems.length > 0
                    ? 'text-[#B45309]'
                    : 'text-[#047857]'
                }`}
              >
                {openReviewItems.length}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                {resolvedReviewCount} resolved
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate({ module: 'bench-runner' })}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Milestones
              </div>
              <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827] mt-0.5">
                {completedMilestones}/{totalMilestones}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                {(experiment.timers ?? []).length} timers
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('snapshots')}
              className="text-left bg-white border border-[#E5E7EB] p-3 hover:border-[#0F52BA] transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                Snapshots / Reports
              </div>
              <div className="text-[18px] font-semibold font-mono tabular-nums text-[#0F52BA] mt-0.5">
                {(experiment.snapshots ?? []).length} /{' '}
                {(experiment.finalizedReports ?? []).length}
              </div>
              <div className="text-[11px] text-[#6B7280] font-mono">
                immutable records
              </div>
            </button>
          </div>

          {/* Two-Column Hub Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column (7 cols): Materials, Datasets, Analytical, Figures */}
            <div className="lg:col-span-7 space-y-4">
              {/* Material Snapshots & Planning */}
              <Panel
                title="Material Snapshots & Research Plan"
                subtitle="Immutable material records locked to this experiment and planning summary."
                actions={
                  <button
                    type="button"
                    onClick={() => onNavigate({ module: 'batch-synthesis' })}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F52BA] hover:underline"
                  >
                    Open Planning & Batch
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                  <div className="border border-[#E5E7EB] bg-[#F8F9FA] p-2.5">
                    <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                      Support Snapshot
                    </div>
                    {experiment.batch.supportSnapshot?.supportData ? (
                      <div className="mt-1 space-y-0.5">
                        <div className="font-semibold text-[#111827]">
                          {experiment.batch.supportSnapshot.supportData.name}
                        </div>
                        <div className="font-mono text-[11px] text-[#4B5563]">
                          {
                            experiment.batch.supportSnapshot.supportData
                              .composition
                          }{' '}
                          · BET{' '}
                          {experiment.batch.supportSnapshot.supportData
                            .betSurfaceArea.value ?? '—'}{' '}
                          m²/g · PZC{' '}
                          {experiment.batch.supportSnapshot.supportData.pzc
                            .value ?? '—'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[#6B7280] mt-1">
                        No support assigned.
                      </div>
                    )}
                  </div>
                  <div className="border border-[#E5E7EB] bg-[#F8F9FA] p-2.5">
                    <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                      Precursor Snapshot
                    </div>
                    {experiment.batch.precursorSnapshot?.precursorData ? (
                      <div className="mt-1 space-y-0.5">
                        <div className="font-semibold text-[#111827]">
                          {
                            experiment.batch.precursorSnapshot.precursorData
                              .name
                          }
                        </div>
                        <div className="font-mono text-[11px] text-[#4B5563]">
                          {
                            experiment.batch.precursorSnapshot.precursorData
                              .formula
                          }{' '}
                          ·{' '}
                          {
                            experiment.batch.precursorSnapshot.precursorData
                              .chargeClassification
                          }
                        </div>
                      </div>
                    ) : (
                      <div className="text-[#6B7280] mt-1">
                        No precursor assigned.
                      </div>
                    )}
                  </div>
                </div>
                {(experiment.researchPlan?.researchQuestions ?? []).length >
                  0 && (
                  <div className="mt-3 pt-2.5 border-t border-[#E5E7EB] text-[12px]">
                    <span className="text-[10px] font-mono uppercase text-[#6B7280] block mb-1">
                      Research Questions
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[#111827]">
                      {experiment.researchPlan!.researchQuestions.map(
                        (q, i) => (
                          <li key={i}>{q}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </Panel>

              {/* Survey Datasets & Analytical Sessions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Panel
                  title={`Survey Datasets (${experiment.surveyDatasets.length})`}
                  actions={
                    <button
                      type="button"
                      onClick={() => onNavigate({ module: 'uptake-survey' })}
                      className="text-[11px] font-medium text-[#0F52BA] hover:underline inline-flex items-center gap-0.5"
                    >
                      Open
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  }
                >
                  {experiment.surveyDatasets.length === 0 ? (
                    <p className="text-[12px] text-[#6B7280]">
                      No survey datasets recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5E7EB] text-[12px]">
                      {experiment.surveyDatasets.map((ds) => (
                        <div
                          key={ds.id}
                          className="py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-[#111827] truncate">
                              {ds.datasetId}{' '}
                              <span className="font-sans font-normal text-[#4B5563]">
                                — {ds.title}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-[#6B7280]">
                              {ds.mode.toUpperCase()} · {ds.measurements.length}{' '}
                              rows · {ds.savedFigures.length} saved figs
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                module: 'uptake-survey',
                                surveyDatasetId: ds.id,
                                surveyTab: 'data',
                              })
                            }
                            className="text-[11px] text-[#0F52BA] hover:underline shrink-0"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel
                  title={`Analytical Sessions (${experiment.analyticalSessions.length})`}
                  actions={
                    <button
                      type="button"
                      onClick={() => onNavigate({ module: 'analytical' })}
                      className="text-[11px] font-medium text-[#0F52BA] hover:underline inline-flex items-center gap-0.5"
                    >
                      Open
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  }
                >
                  {experiment.analyticalSessions.length === 0 ? (
                    <p className="text-[12px] text-[#6B7280]">
                      No analytical sessions recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5E7EB] text-[12px]">
                      {experiment.analyticalSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-[#111827] truncate">
                              {sess.sessionId}{' '}
                              <span className="font-sans font-normal text-[#4B5563]">
                                ({sess.technique})
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-[#6B7280]">
                              {sess.analytes
                                .map((a) => a.symbol || a.name)
                                .join(', ')}{' '}
                              · {sess.sampleMeasurements.length} samples ·{' '}
                              {sess.calibrationDatasets.length} cal
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                module: 'analytical',
                                analyticalSessionId: sess.id,
                                analyticalTab: 'samples',
                              })
                            }
                            className="text-[11px] text-[#0F52BA] hover:underline shrink-0"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {/* Saved Figures & Reproducibility Status */}
              <Panel
                title={`Saved Reproducible Figures (${savedFiguresSummary.length})`}
                subtitle="Figures track source dataset/session content hashes to flag when underlying records change."
              >
                {savedFiguresSummary.length === 0 ? (
                  <p className="text-[12px] text-[#6B7280]">
                    No saved figure configurations yet. Save presets in Uptake
                    Survey or Analytical Figure Studio.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E7EB] text-[12px]">
                    {savedFiguresSummary.map((fig) => (
                      <div
                        key={fig.id}
                        className="py-2 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#111827] flex items-center gap-2 flex-wrap">
                            <span>{fig.name}</span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
                              {fig.sourceCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6B7280]">
                            {fig.message}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusText
                            label={fig.label}
                            tone={
                              fig.status === 'saved_current'
                                ? 'success'
                                : fig.status === 'legacy_untracked'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              fig.kind === 'survey'
                                ? onNavigate({
                                    module: 'uptake-survey',
                                    surveyDatasetId: fig.sourceId,
                                    surveyTab: 'figures',
                                  })
                                : onNavigate({
                                    module: 'analytical',
                                    analyticalSessionId: fig.sourceId,
                                    analyticalTab: 'figures',
                                  })
                            }
                            className="text-[11px] text-[#0F52BA] hover:underline"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Right Column (5 cols): Lifecycle History, Finalized Reports, Review Preview, Recent Activity */}
            <div className="lg:col-span-5 space-y-4">
              {/* Finalized Reports */}
              <Panel
                title={`Finalized Reports (${(experiment.finalizedReports ?? []).length})`}
                subtitle="Archived report versions locked to immutable snapshots."
                actions={
                  <button
                    type="button"
                    onClick={() => onNavigate({ module: 'lab-report' })}
                    className="text-[11px] font-medium text-[#0F52BA] hover:underline inline-flex items-center gap-0.5"
                  >
                    Report Builder
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              >
                {(experiment.finalizedReports ?? []).length === 0 ? (
                  <p className="text-[12px] text-[#6B7280]">
                    No finalized reports yet. Build and finalize a versioned A4
                    report in Lab Reports.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E7EB] text-[12px]">
                    {(experiment.finalizedReports ?? []).map((rep) => {
                      const boundSnap = (experiment.snapshots ?? []).find(
                        (s) => s.snapshotId === rep.snapshotId
                      );
                      const changed = boundSnap
                        ? hasExperimentChangedSinceSnapshot(
                            experiment,
                            boundSnap
                          )
                        : false;
                      return (
                        <div key={rep.id} className="py-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-[#111827] flex items-center gap-1.5 min-w-0">
                              <Lock className="h-3.5 w-3.5 text-[#0F52BA] shrink-0" />
                              <span className="truncate">{rep.title}</span>
                            </div>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#EFF6FF] text-[#0F52BA] border border-[#BFDBFE] shrink-0">
                              v{rep.versionNumber}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[#6B7280] flex flex-wrap items-center gap-2">
                            <span>Snapshot: {rep.snapshotName}</span>
                            <span>· {rep.finalizedAt.slice(0, 10)}</span>
                            {changed && (
                              <StatusText
                                label="Newer Live Revision"
                                tone="warning"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              {/* Lifecycle History */}
              <Panel
                title="Lifecycle Transition History"
                subtitle="Recorded workflow state progression (supports reopening completed records without losing prior snapshots)."
              >
                <div className="divide-y divide-[#E5E7EB] text-[12px] max-h-52 overflow-y-auto">
                  {[...(experiment.lifecycleHistory ?? [])]
                    .reverse()
                    .map((ev) => (
                      <div key={ev.id} className="py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-[#111827]">
                            {ev.fromStatus
                              ? `${ev.fromStatus} → ${ev.toStatus}`
                              : ev.toStatus}
                          </span>
                          <span className="font-mono text-[10px] text-[#6B7280]">
                            {ev.timestamp.slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                        {ev.explanation && (
                          <p className="text-[11.5px] text-[#4B5563]">
                            {ev.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </Panel>

              {/* Open Review Summary */}
              <Panel
                title={`Open Review Queue (${openReviewItems.length})`}
                actions={
                  <button
                    type="button"
                    onClick={() => onChangeTab('review')}
                    className="text-[11px] font-medium text-[#0F52BA] hover:underline"
                  >
                    Open Review Center
                  </button>
                }
              >
                {openReviewItems.length === 0 ? (
                  <div className="flex items-center gap-2 text-[12px] text-[#047857]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>All automated review checks are currently clear.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E7EB] text-[12px]">
                    {openReviewItems.slice(0, 4).map((item) => (
                      <div
                        key={item.issueKey}
                        className="py-2 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.group === 'analytical_discrepancies' ||
                            item.group === 'incompatible_units' ||
                            item.group === 'conflicting_values' ? (
                              <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-[#B45309] shrink-0" />
                            )}
                            <span className="font-mono text-[11px] font-semibold text-[#111827]">
                              {item.recordLabel}
                            </span>
                            <span className="text-[10px] font-mono text-[#6B7280]">
                              ({CONSOLIDATED_REVIEW_GROUP_LABELS[item.group]})
                            </span>
                          </div>
                          <p className="text-[11.5px] text-[#4B5563] line-clamp-2 mt-0.5">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Recent Activity */}
              <Panel
                title="Recent Activity"
                actions={
                  <button
                    type="button"
                    onClick={() => onChangeTab('timeline')}
                    className="text-[11px] font-medium text-[#0F52BA] hover:underline"
                  >
                    Full Timeline
                  </button>
                }
              >
                <div className="divide-y divide-[#E5E7EB] text-[11.5px]">
                  {timeline.slice(0, 5).map((ev) => (
                    <div key={ev.id} className="py-1.5 space-y-0.5">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#6B7280]">
                        <Clock className="h-3 w-3" />
                        <span>
                          {ev.timestamp.slice(0, 16).replace('T', ' ')}
                        </span>
                        <span>· {ev.eventType.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-[#111827] leading-snug">
                        {ev.description}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import {
  Archive,
  Copy,
  Database,
  FlaskConical,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AnalyticalAnalyte,
  AnalyticalComparisonConfig,
  AnalyticalFigureConfiguration,
  AnalyticalQualityIssueCategory,
  AnalyticalReviewStatus,
  AnalyticalSession,
  AnalyticalWorkspaceTab,
  CalibrationDataset,
  CalibrationStandard,
  DataProvenance,
  DilutionRecord,
  Experiment,
  ImportMappingTemplate,
  InstrumentImportRecord,
  InstrumentMeasurement,
  InstrumentType,
  SampleStage,
} from '../../domain/models/types';
import {
  getActiveAnalyte,
  getActiveAnalyticalSession,
  getActiveCalibrationDataset,
} from '../../domain/models/projections';
import {
  analyzeCalibrationDataset,
  detectAnalyticalQualityIssues,
  evaluateAnalyticalSessionOverview,
  evaluateDilutionConsistency,
} from '../../domain/calculations/seaMath';
import { AnalyticalOverviewTab } from './AnalyticalOverviewTab';
import { CalibrationRegressionTab } from './CalibrationRegressionTab';
import { SampleMeasurementsTab } from './SampleMeasurementsTab';
import { DilutionRecordsTab } from './DilutionRecordsTab';
import { QualityReviewTab } from './QualityReviewTab';
import { AnalyticalFiguresComparisonTab } from './AnalyticalFiguresComparisonTab';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  Modal,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

const INSTRUMENT_TECHNIQUES: InstrumentType[] = [
  'ICP-OES',
  'Flame AAS',
  'Graphite Furnace AAS',
  'AAS',
  'ICP-MS',
  'UV-Vis',
  'Other',
];

const TABS: Array<{ id: AnalyticalWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Analytical Overview' },
  { id: 'calibration', label: 'Calibration & Regression' },
  { id: 'samples', label: 'Sample Measurements' },
  { id: 'dilutions', label: 'Dilution Records' },
  { id: 'quality', label: 'Quality Review' },
  { id: 'figures', label: 'Figures & Documentation' },
];

export interface DilutionStandardsWorkspaceProps {
  experiment: Experiment;
  templates: ImportMappingTemplate[];
  requestedTab?: AnalyticalWorkspaceTab | null;
  navigationNonce?: number;

  // Session Management
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (input: {
    sessionId?: string;
    title: string;
    technique: InstrumentType;
    customTechniqueName?: string;
    analyst?: string;
  }) => void;
  onLoadSyntheticSession: (technique: 'ICP-OES' | 'Flame AAS') => void;
  onUpdateSessionMeta: (
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
  onDuplicateSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;

  // Multi-Analyte Management
  onSelectAnalyte: (analyteId: string) => void;
  onAddAnalyte: (analyte: Omit<AnalyticalAnalyte, 'id'>) => void;
  onUpdateAnalyte: (analyteId: string, patch: Partial<AnalyticalAnalyte>) => void;
  onDeleteAnalyte: (analyteId: string) => void;

  // Multi-Calibration Dataset Management
  onSelectCalDataset: (calId: string) => void;
  onCreateCalDataset: (input: {
    calibrationId?: string;
    title: string;
    analyteId: string | null;
    concUnit: string;
    responseUnit: string;
    referenceMethod?: string;
  }) => void;
  onDuplicateCalDataset: (calId: string) => void;
  onUpdateCalDatasetMeta: (
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
  onDeleteCalDataset: (calId: string) => void;
  onAddStandard: (calId: string, initial?: Partial<CalibrationStandard>) => void;
  onAddStandardsBulk: (calId: string, standards: CalibrationStandard[]) => void;
  onUpdateStandard: (
    calId: string,
    stdId: string,
    patch: Partial<CalibrationStandard>
  ) => void;
  onDeleteStandard: (calId: string, stdId: string) => void;

  // Sample Measurements & Bulk Import
  onAddSample: (stage?: SampleStage) => void;
  onAddSamplesBulk: (
    rows: InstrumentMeasurement[],
    importRecord?: InstrumentImportRecord
  ) => void;
  onDuplicateSamples: (rowIds: string[]) => void;
  onBulkUpdateSamples: (
    rowIds: string[],
    patch: Partial<InstrumentMeasurement>
  ) => void;
  onUpdateSample: (rowId: string, patch: Partial<InstrumentMeasurement>) => void;
  onDeleteSample: (rowId: string) => void;
  onDeleteSamplesBulk: (rowIds: string[]) => void;

  // Import Mapping Templates
  onSaveTemplate: (
    template: Omit<ImportMappingTemplate, 'id' | 'createdAt'>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;

  // Survey <-> Analytical Linkage
  onLinkToSurvey: (params: {
    surveyDatasetId: string;
    surveyMeasurementId: string;
    stage: 'Initial' | 'Final';
    instrumentMeasurementId: string;
  }) => void;
  onUnlinkFromSurvey: (params: {
    surveyDatasetId: string;
    surveyMeasurementId: string;
    stage: 'Initial' | 'Final';
  }) => void;
  onApplyAnalyticalToSurvey: (params: {
    surveyDatasetId: string;
    surveyMeasurementId: string;
    stage: 'Initial' | 'Final';
    effectiveConcPpm: number;
  }) => void;

  // Dilution Records
  onAddDilutionRecord: (record: Omit<DilutionRecord, 'id'>) => void;
  onUpdateDilutionRecord: (
    recordId: string,
    patch: Partial<DilutionRecord>
  ) => void;
  onDeleteDilutionRecord: (recordId: string) => void;

  // Quality Review Workflow
  onUpdateReviewStatus: (input: {
    issueKey: string;
    category: AnalyticalQualityIssueCategory;
    recordId: string;
    recordLabel: string;
    description: string;
    provenance: DataProvenance;
    status: AnalyticalReviewStatus;
    researcherNotes: string;
    author: string;
  }) => void;

  // Analytical Figure Studio & Cross-Session Comparison
  onUpdateFigureConfig: (patch: Partial<AnalyticalFigureConfiguration>) => void;
  onSaveFigurePreset: (name?: string) => void;
  onLoadFigurePreset: (figureId: string) => void;
  onDeleteFigurePreset: (figureId: string) => void;
  onUpdateComparison: (patch: Partial<AnalyticalComparisonConfig>) => void;
}

export function DilutionStandardsWorkspace({
  experiment,
  templates,
  requestedTab,
  navigationNonce,
  onSelectSession,
  onCreateSession,
  onLoadSyntheticSession,
  onUpdateSessionMeta,
  onDuplicateSession,
  onArchiveSession,
  onDeleteSession,
  onSelectAnalyte,
  onAddAnalyte,
  onUpdateAnalyte,
  onDeleteAnalyte,
  onSelectCalDataset,
  onCreateCalDataset,
  onDuplicateCalDataset,
  onUpdateCalDatasetMeta,
  onDeleteCalDataset,
  onAddStandard,
  onAddStandardsBulk,
  onUpdateStandard,
  onDeleteStandard,
  onAddSample,
  onAddSamplesBulk,
  onDuplicateSamples,
  onBulkUpdateSamples,
  onUpdateSample,
  onDeleteSample,
  onDeleteSamplesBulk,
  onSaveTemplate,
  onDeleteTemplate,
  onLinkToSurvey,
  onUnlinkFromSurvey,
  onApplyAnalyticalToSurvey,
  onAddDilutionRecord,
  onUpdateDilutionRecord,
  onDeleteDilutionRecord,
  onUpdateReviewStatus,
  onUpdateFigureConfig,
  onSaveFigurePreset,
  onLoadFigurePreset,
  onDeleteFigurePreset,
  onUpdateComparison,
}: DilutionStandardsWorkspaceProps) {
  const [tabState, setTabState] = useState<{
    nonce: number | undefined;
    tab: AnalyticalWorkspaceTab;
  }>({
    nonce: navigationNonce,
    tab: requestedTab ?? 'overview',
  });
  const activeTab: AnalyticalWorkspaceTab =
    requestedTab && navigationNonce !== undefined && tabState.nonce !== navigationNonce
      ? requestedTab
      : tabState.tab;
  const setActiveTab = (tab: AnalyticalWorkspaceTab) => {
    setTabState({ nonce: navigationNonce, tab });
  };
  const [sessionSearch, setSessionSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSessionCode, setNewSessionCode] = useState('');
  const [newTechnique, setNewTechnique] = useState<InstrumentType>('ICP-OES');
  const [newCustomTechnique, setNewCustomTechnique] = useState('');
  const [newAnalyst, setNewAnalyst] = useState(experiment.researcher || '');

  const [deleteSessionTarget, setDeleteSessionTarget] =
    useState<AnalyticalSession | null>(null);

  const sessions = useMemo(
    () => experiment.analyticalSessions ?? [],
    [experiment.analyticalSessions]
  );
  const activeSession = getActiveAnalyticalSession(experiment);
  const activeAnalyte = activeSession ? getActiveAnalyte(activeSession) : null;
  const activeCalDataset = activeSession
    ? getActiveCalibrationDataset(activeSession)
    : null;

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    return sessions.filter((s) => {
      if (!showArchived && s.status === 'Archived') {
        if (!activeSession || s.id !== activeSession.id) return false;
      }
      if (!q) return true;
      return (
        s.sessionId.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.technique.toLowerCase().includes(q) ||
        s.analytes.some((a) => a.symbol.toLowerCase().includes(q))
      );
    });
  }, [sessions, showArchived, sessionSearch, activeSession]);

  // Derived shared Phase 4 calculations (single source of truth)
  const calibrationAnalysis = useMemo(
    () =>
      activeCalDataset ? analyzeCalibrationDataset(activeCalDataset) : null,
    [activeCalDataset]
  );

  const dilutionDiagnostics = useMemo(
    () => (activeSession ? evaluateDilutionConsistency(activeSession) : []),
    [activeSession]
  );

  const qualityIssues = useMemo(
    () =>
      activeSession
        ? detectAnalyticalQualityIssues(experiment, activeSession)
        : [],
    [activeSession, experiment]
  );

  const overview = useMemo(
    () =>
      activeSession
        ? evaluateAnalyticalSessionOverview(experiment, activeSession)
        : null,
    [activeSession, experiment]
  );

  const openQualityCount = overview?.openQualityIssueCount ?? 0;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || `${newTechnique} Analytical Session`;
    onCreateSession({
      sessionId: newSessionCode.trim() || undefined,
      title,
      technique: newTechnique,
      customTechniqueName:
        newTechnique === 'Other' ? newCustomTechnique.trim() : undefined,
      analyst: newAnalyst.trim() || experiment.researcher,
    });
    setNewModalOpen(false);
    setNewTitle('');
    setNewSessionCode('');
    setNewCustomTechnique('');
    setActiveTab('overview');
  };

  const archivedCount = sessions.filter((s) => s.status === 'Archived').length;

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        title="Dilution & Standards — Analytical Chemistry Workspace"
        description="Manage ICP-OES, AAS, and related analytical sessions, calibration standards, exploratory OLS regressions, sample measurements, traceable dilution logs, quality reviews, and publication-grade analytical figures."
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
              Sessions:{' '}
              <strong className="font-mono text-[#111827]">
                {sessions.length}
              </strong>
            </span>
            {activeSession && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Active:{' '}
                  <strong className="font-mono text-[#111827]">
                    {activeSession.sessionId} ({activeSession.technique})
                  </strong>
                </span>
                {activeSession.isDemonstration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[#B45309] font-medium">
                      Synthetic Demo Session
                    </span>
                  </>
                )}
              </>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLoadSyntheticSession('ICP-OES')}
            >
              <Database className="w-3.5 h-3.5" strokeWidth={1.75} />
              Load Demo ICP-OES
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLoadSyntheticSession('Flame AAS')}
            >
              <FlaskConical className="w-3.5 h-3.5" strokeWidth={1.75} />
              Load Demo Flame AAS
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewAnalyst(experiment.researcher || '');
                setNewModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New Analytical Session
            </Button>
          </>
        }
      />

      {/* Analytical Session Management Bar */}
      <div className="bg-white border border-[#E5E7EB] rounded-[8px] px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <label
              htmlFor="analytical-session-selector"
              className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] shrink-0"
            >
              Analytical Session
            </label>
            <select
              id="analytical-session-selector"
              aria-label="Select analytical session"
              value={activeSession?.id ?? ''}
              onChange={(e) => onSelectSession(e.target.value)}
              className={`${inputBaseClass} !w-auto min-w-[260px] max-w-[440px] font-medium`}
            >
              {filteredSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionId} — {s.title} [{s.technique}]
                  {s.status === 'Archived' ? ' (Archived)' : ''}
                  {s.isDemonstration ? ' · Demo' : ''}
                </option>
              ))}
              {filteredSessions.length === 0 && (
                <option value="">No matching analytical sessions</option>
              )}
            </select>

            <div className="relative w-44">
              <Search
                className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="search"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Filter sessions..."
                aria-label="Filter analytical sessions"
                className={`${inputBaseClass} !pl-8 !py-1 text-[12px]`}
              />
            </div>

            {archivedCount > 0 && (
              <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[#4B5563] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-[#0F52BA]"
                />
                <span>Archived ({archivedCount})</span>
              </label>
            )}
          </div>

          {activeSession && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDuplicateSession(activeSession.id)}
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                Duplicate
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onArchiveSession(activeSession.id)}
              >
                {activeSession.status === 'Archived' ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Archive
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteSessionTarget(activeSession)}
                aria-label={`Delete analytical session ${activeSession.sessionId}`}
                className="text-[#991B1B] hover:bg-[#FEF2F2]"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Multi-Analyte Quick Switcher & Active Context Strip */}
        {activeSession && (
          <div className="pt-2 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
                Analytes
              </span>
              {activeSession.analytes.length === 0 ? (
                <span className="text-[#6B7280] text-[11.5px]">
                  No analytes registered yet (add in Analytical Overview).
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {activeSession.analytes.map((a) => {
                    const selected = activeAnalyte?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelectAnalyte(a.id)}
                        className={`px-2 py-0.5 rounded-[4px] border text-[11.5px] font-mono cursor-pointer transition-colors ${
                          selected
                            ? 'bg-[#EFF6FF] border-[#0F52BA] text-[#0F52BA] font-semibold'
                            : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
                        }`}
                      >
                        {a.symbol}
                        {a.wavelengthNm !== null ? ` (${a.wavelengthNm} nm)` : ''}{' '}
                        · {a.measurementUnit}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="font-mono tabular-nums text-[11.5px] text-[#4B5563] flex flex-wrap items-center gap-3">
              <span>
                Calibrations:{' '}
                <strong className="text-[#111827]">
                  {activeSession.calibrationDatasets.length}
                </strong>
              </span>
              <span>
                Samples:{' '}
                <strong className="text-[#111827]">
                  {activeSession.sampleMeasurements.length}
                </strong>
              </span>
              <span>
                Dilutions:{' '}
                <strong className="text-[#111827]">
                  {activeSession.dilutionRecords.length}
                </strong>
              </span>
              {activeSession.status === 'Archived' && (
                <span className="text-[#B45309] font-sans font-medium">
                  Archived Session
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty State if all sessions were deleted */}
      {!activeSession || !overview ? (
        <EmptyState
          title="No Analytical Sessions Recorded"
          description="Create a blank ICP-OES, AAS, ICP-MS, or UV-Vis analytical session, or load a clearly labeled synthetic demonstration session to explore calibration regression, sample import, dilution logging, and quality review."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => setNewModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                New Blank Analytical Session
              </Button>
              <Button
                variant="secondary"
                onClick={() => onLoadSyntheticSession('ICP-OES')}
              >
                Load Synthetic ICP-OES Demo
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Compact 6-View Analytical Navigation Bar */}
          <div
            role="tablist"
            aria-label="Analytical chemistry workspace views"
            className="flex flex-wrap items-center gap-1 border-b border-[#E5E7EB] pb-2"
          >
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-[5px] text-[12.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 border ${
                    selected
                      ? 'bg-white border-[#0F52BA] text-[#0F52BA]'
                      : 'bg-transparent border-transparent text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'quality' && openQualityCount > 0 && (
                    <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded-[3px] bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                      {openQualityCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Sub-View */}
          {activeTab === 'overview' && (
            <AnalyticalOverviewTab
              session={activeSession}
              overview={overview}
              onUpdateSessionMeta={(patch) =>
                onUpdateSessionMeta(activeSession.id, patch)
              }
              onSelectAnalyte={onSelectAnalyte}
              onAddAnalyte={onAddAnalyte}
              onUpdateAnalyte={onUpdateAnalyte}
              onDeleteAnalyte={onDeleteAnalyte}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'calibration' && (
            <CalibrationRegressionTab
              experimentId={experiment.experimentId}
              session={activeSession}
              activeCalDataset={activeCalDataset}
              calibrationAnalysis={calibrationAnalysis}
              onSelectCalDataset={onSelectCalDataset}
              onCreateCalDataset={onCreateCalDataset}
              onDuplicateCalDataset={onDuplicateCalDataset}
              onUpdateCalDatasetMeta={onUpdateCalDatasetMeta}
              onDeleteCalDataset={onDeleteCalDataset}
              onAddStandard={onAddStandard}
              onAddStandardsBulk={onAddStandardsBulk}
              onUpdateStandard={onUpdateStandard}
              onDeleteStandard={onDeleteStandard}
            />
          )}

          {activeTab === 'samples' && (
            <SampleMeasurementsTab
              experiment={experiment}
              session={activeSession}
              activeAnalyte={activeAnalyte}
              templates={templates}
              onAddSample={onAddSample}
              onAddSamplesBulk={onAddSamplesBulk}
              onDuplicateSamples={onDuplicateSamples}
              onBulkUpdateSamples={onBulkUpdateSamples}
              onUpdateSample={onUpdateSample}
              onDeleteSample={onDeleteSample}
              onDeleteSamplesBulk={onDeleteSamplesBulk}
              onSaveTemplate={onSaveTemplate}
              onDeleteTemplate={onDeleteTemplate}
              onLinkToSurvey={onLinkToSurvey}
              onUnlinkFromSurvey={onUnlinkFromSurvey}
              onApplyAnalyticalToSurvey={onApplyAnalyticalToSurvey}
            />
          )}

          {activeTab === 'dilutions' && (
            <DilutionRecordsTab
              experimentId={experiment.experimentId}
              session={activeSession}
              diagnostics={dilutionDiagnostics}
              onAddDilutionRecord={onAddDilutionRecord}
              onUpdateDilutionRecord={onUpdateDilutionRecord}
              onDeleteDilutionRecord={onDeleteDilutionRecord}
            />
          )}

          {activeTab === 'quality' && (
            <QualityReviewTab
              experimentId={experiment.experimentId}
              session={activeSession}
              issues={qualityIssues}
              analystName={activeSession.analyst || experiment.researcher || 'Analyst'}
              onUpdateReviewStatus={onUpdateReviewStatus}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'figures' && (
            <AnalyticalFiguresComparisonTab
              experiment={experiment}
              session={activeSession}
              activeCalDataset={activeCalDataset}
              calibrationAnalysis={calibrationAnalysis}
              qualityIssues={qualityIssues}
              onUpdateFigureConfig={onUpdateFigureConfig}
              onSaveFigurePreset={onSaveFigurePreset}
              onLoadFigurePreset={onLoadFigurePreset}
              onDeleteFigurePreset={onDeleteFigurePreset}
              onUpdateComparison={onUpdateComparison}
            />
          )}
        </>
      )}

      {/* New Blank Analytical Session Modal */}
      <Modal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        title="New Blank Analytical Session"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <p className="text-[12.5px] text-[#4B5563]">
            Create a clean, empty analytical session with no fabricated
            standards or sample concentrations. Configure analytes, calibrations,
            and measurements manually or via CSV/TSV import.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="new-ana-code">
                Session Code (Optional)
              </FieldLabel>
              <input
                id="new-ana-code"
                type="text"
                value={newSessionCode}
                onChange={(e) => setNewSessionCode(e.target.value)}
                placeholder="Auto-assigned (e.g. ANA-003)"
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="new-ana-technique">
                Analytical Technique
              </FieldLabel>
              <select
                id="new-ana-technique"
                value={newTechnique}
                onChange={(e) =>
                  setNewTechnique(e.target.value as InstrumentType)
                }
                className={inputBaseClass}
              >
                {INSTRUMENT_TECHNIQUES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {newTechnique === 'Other' && (
            <div>
              <FieldLabel htmlFor="new-ana-custom-tech">
                Custom Technique Label
              </FieldLabel>
              <input
                id="new-ana-custom-tech"
                type="text"
                value={newCustomTechnique}
                onChange={(e) => setNewCustomTechnique(e.target.value)}
                placeholder="e.g., Ion Chromatography, XRF"
                className={inputBaseClass}
              />
            </div>
          )}

          <div>
            <FieldLabel htmlFor="new-ana-title">Session Title</FieldLabel>
            <input
              id="new-ana-title"
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., ICP-OES Post-Contact Pt & Support Leaching Run"
              className={inputBaseClass}
            />
          </div>

          <div>
            <FieldLabel htmlFor="new-ana-analyst">Analyst Name</FieldLabel>
            <input
              id="new-ana-analyst"
              type="text"
              value={newAnalyst}
              onChange={(e) => setNewAnalyst(e.target.value)}
              placeholder="Analyst / Researcher"
              className={inputBaseClass}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNewModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Blank Session
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Session Confirmation */}
      <ConfirmDialog
        open={deleteSessionTarget !== null}
        onCancel={() => setDeleteSessionTarget(null)}
        onConfirm={() => {
          if (deleteSessionTarget) {
            onDeleteSession(deleteSessionTarget.id);
            setDeleteSessionTarget(null);
          }
        }}
        title="Delete Analytical Session"
        message={
          deleteSessionTarget
            ? `Permanently delete analytical session ${deleteSessionTarget.sessionId} (“${deleteSessionTarget.title}”) along with its ${deleteSessionTarget.calibrationDatasets.length} calibration dataset(s) and ${deleteSessionTarget.sampleMeasurements.length} sample measurement(s)? Any linked survey measurements will retain their manual values and display a source-unavailable warning.`
            : ''
        }
        confirmLabel="Delete Session"
        variant="danger"
      />
    </div>
  );
}

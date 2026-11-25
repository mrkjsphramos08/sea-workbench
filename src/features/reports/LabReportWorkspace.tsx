'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  Lock,
  Package,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  APP_VERSION,
  AnalyticalFigureConfiguration,
  AnalyticalSession,
  CALC_ENGINE_VERSION,
  Experiment,
  ExperimentSnapshot,
  FigureConfiguration,
  FinalizedReport,
  ReportConfiguration,
  ReportMode,
  ReportSectionId,
  ReportType,
  ResearchProject,
  SurveyDataset,
  WORKSPACE_SCHEMA_VERSION,
} from '../../domain/models/types';
import {
  getAllExperimentInstrumentMeasurements,
  getAllExperimentSurveyMeasurements,
} from '../../domain/models/projections';
import {
  DEFAULT_REPORT_SECTION_ORDER,
  REPORT_SECTION_LABELS,
  REPORT_TYPE_PRESETS,
  analyzeCalibrationDataset,
  analyzeSurveyDataset,
  buildDatasetComparison,
  buildExperimentTimeline,
  buildUnifiedSampleRegistry,
  computeAdvancedDescriptiveStatistics,
  convertToRelativeUncertainty,
  detectAnalyticalQualityIssues,
  evaluateBatchSynthesisBoundary,
  evaluateDilutionConsistency,
  evaluateSurveyCompleteness,
  formatQualifiedMeasurementValue,
  formatScientificNumber,
  formatUncertaintyTypeLabel,
  formatWithScientificNotation,
  hasExperimentChangedSinceSnapshot,
  resolveFinalizedReportContext,
  resolveSurveyAnalyticalLinks,
} from '../../domain/calculations/seaMath';
import {
  buildResearchExportPackage,
  triggerBinaryDownload,
} from '../../services/import-export/researchPackage';
import { ScientificFigureCanvas } from '../../components/charts/ScientificFigureCanvas';
import { AnalyticalFigureCanvas } from '../../components/charts/AnalyticalFigureCanvas';
import { ANNOTATION_CATEGORY_LABELS } from '../uptake-survey/ResearchInterpretationTab';
import {
  Button,
  PROVENANCE_LABELS,
  VERIFICATION_LABELS,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

const REPORT_TYPE_KEYS: ReportType[] = [
  'research-planning',
  'experiment-progress',
  'survey-analysis',
  'analytical-data',
  'complete-research',
  'data-review-summary',
];

export function LabReportWorkspace({
  experiment,
  allExperiments = [],
  projects,
  onUpdateReportConfig,
  onCreateFinalizedReport,
  onDeleteFinalizedReport,
}: {
  experiment: Experiment;
  allExperiments?: Experiment[];
  projects: ResearchProject[];
  onUpdateReportConfig: (patch: Partial<ReportConfiguration>) => void;
  onCreateFinalizedReport?: (input: {
    title: string;
    notes?: string;
    snapshotId?: string;
    snapshotName?: string;
  }) => FinalizedReport | null | void;
  onDeleteFinalizedReport?: (reportId: string) => void;
}) {
  const [selectedFinalizedId, setSelectedFinalizedId] = useState<string | null>(
    null
  );
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);
  const [finalizeTitle, setFinalizeTitle] = useState('');
  const [finalizeNotes, setFinalizeNotes] = useState('');
  const [finalizeSnapshotChoice, setFinalizeSnapshotChoice] = useState('new');
  const [showSectionOrder, setShowSectionOrder] = useState(false);
  const [exportStatusMsg, setExportStatusMsg] = useState<string | null>(null);

  const finalizedReports = useMemo(
    () => experiment.finalizedReports ?? [],
    [experiment.finalizedReports]
  );
  const snapshots = useMemo(
    () => experiment.snapshots ?? [],
    [experiment.snapshots]
  );

  const activeFinalizedReport: FinalizedReport | null = useMemo(() => {
    if (!selectedFinalizedId) return null;
    return finalizedReports.find((r) => r.id === selectedFinalizedId) ?? null;
  }, [finalizedReports, selectedFinalizedId]);

  const {
    effectiveExperiment,
    crossExperimentPool,
    boundSnapshot,
    hasFrozenComparisonSnapshots,
  } = useMemo(
    () =>
      resolveFinalizedReportContext(
        experiment,
        activeFinalizedReport,
        allExperiments
      ),
    [experiment, activeFinalizedReport, allExperiments]
  );

  const reportConfig: ReportConfiguration = activeFinalizedReport
    ? activeFinalizedReport.reportConfig
    : experiment.reportConfig;

  const isViewingFinalized = Boolean(activeFinalizedReport);

  const liveChangedSinceFinalized = useMemo(() => {
    if (!boundSnapshot) return false;
    return hasExperimentChangedSinceSnapshot(experiment, boundSnapshot);
  }, [experiment, boundSnapshot]);

  const project = effectiveExperiment.projectId
    ? projects.find((p) => p.id === effectiveExperiment.projectId) ?? null
    : null;
  const supportSnap =
    effectiveExperiment.batch.supportSnapshot?.supportData ?? null;
  const precursorSnap =
    effectiveExperiment.batch.precursorSnapshot?.precursorData ?? null;

  const calcBoundary = useMemo(
    () => evaluateBatchSynthesisBoundary(effectiveExperiment.batch),
    [effectiveExperiment.batch]
  );

  // Resolve selected survey datasets (default to active dataset if empty)
  const selectedDatasets: SurveyDataset[] = useMemo(() => {
    const allDs = effectiveExperiment.surveyDatasets ?? [];
    if (allDs.length === 0) return [];
    if (
      reportConfig.selectedSurveyDatasetIds &&
      reportConfig.selectedSurveyDatasetIds.length > 0
    ) {
      const matched = allDs.filter((d) =>
        reportConfig.selectedSurveyDatasetIds.includes(d.id)
      );
      if (matched.length > 0) return matched;
    }
    const active =
      allDs.find((d) => d.id === effectiveExperiment.activeSurveyDatasetId) ??
      allDs[0];
    return active ? [active] : [];
  }, [
    effectiveExperiment.surveyDatasets,
    effectiveExperiment.activeSurveyDatasetId,
    reportConfig.selectedSurveyDatasetIds,
  ]);

  // Precompute shared analysis & completeness for every selected dataset
  const datasetReports = useMemo(() => {
    return selectedDatasets.map((ds) => ({
      dataset: ds,
      analysis: analyzeSurveyDataset(ds.measurements, {
        excludeFlagged: ds.analysisConfig.excludeFlaggedInStats,
      }),
      completeness: evaluateSurveyCompleteness(
        ds,
        effectiveExperiment.instrumentMeasurements
      ),
    }));
  }, [selectedDatasets, effectiveExperiment.instrumentMeasurements]);

  const availableSavedFigures = useMemo(() => {
    const figs: Array<{ dataset: SurveyDataset; figure: FigureConfiguration }> =
      [];
    for (const ds of selectedDatasets) {
      for (const f of ds.savedFigures) {
        figs.push({ dataset: ds, figure: f });
      }
    }
    return figs;
  }, [selectedDatasets]);

  const comparativeSummary = useMemo(() => {
    const refs = effectiveExperiment.datasetComparison?.selectedRefs ?? [];
    const items: Array<{ experiment: Experiment; dataset: SurveyDataset }> = [];
    for (const ref of refs) {
      const exp = crossExperimentPool.find((e) => e.uuid === ref.experimentUuid);
      const ds = exp?.surveyDatasets.find((d) => d.id === ref.datasetId);
      if (exp && ds) items.push({ experiment: exp, dataset: ds });
    }
    if (items.length < 2 && selectedDatasets.length >= 2) {
      return buildDatasetComparison(
        selectedDatasets.map((ds) => ({
          experiment: effectiveExperiment,
          dataset: ds,
        }))
      );
    }
    return buildDatasetComparison(items);
  }, [effectiveExperiment, crossExperimentPool, selectedDatasets]);

  // Phase 4: Resolve selected analytical sessions
  const selectedAnalyticalSessions: AnalyticalSession[] = useMemo(() => {
    const allSessions = effectiveExperiment.analyticalSessions ?? [];
    if (allSessions.length === 0) return [];
    const chosenIds = reportConfig.selectedAnalyticalSessionIds ?? [];
    if (chosenIds.length > 0) {
      const matched = allSessions.filter((s) => chosenIds.includes(s.id));
      if (matched.length > 0) return matched;
    }
    const active =
      allSessions.find(
        (s) => s.id === effectiveExperiment.activeAnalyticalSessionId
      ) ?? allSessions[0];
    return active ? [active] : [];
  }, [
    effectiveExperiment.analyticalSessions,
    effectiveExperiment.activeAnalyticalSessionId,
    reportConfig.selectedAnalyticalSessionIds,
  ]);

  const analyticalSessionReports = useMemo(() => {
    return selectedAnalyticalSessions.map((session) => {
      const activeCal =
        session.calibrationDatasets.find(
          (c) => c.id === session.activeCalibrationDatasetId
        ) ??
        session.calibrationDatasets[0] ??
        null;
      const calAnalyses = session.calibrationDatasets.map((cal) => ({
        dataset: cal,
        analysis: analyzeCalibrationDataset(cal),
      }));
      const activeCalAnalysis = activeCal
        ? calAnalyses.find((c) => c.dataset.id === activeCal.id)?.analysis ??
          null
        : null;
      const dilutionDiagnostics = evaluateDilutionConsistency(session);
      const qualityIssues = detectAnalyticalQualityIssues(
        effectiveExperiment,
        session
      );
      const reviewMap = new Map(
        session.reviewRecords.map((r) => [r.issueKey, r])
      );
      return {
        session,
        activeCal,
        activeCalAnalysis,
        calAnalyses,
        dilutionDiagnostics,
        qualityIssues,
        reviewMap,
      };
    });
  }, [selectedAnalyticalSessions, effectiveExperiment]);

  const availableSavedAnalyticalFigures = useMemo(() => {
    const figs: Array<{
      session: AnalyticalSession;
      figure: AnalyticalFigureConfiguration;
    }> = [];
    for (const s of selectedAnalyticalSessions) {
      for (const f of s.savedFigures ?? []) {
        figs.push({ session: s, figure: f });
      }
    }
    return figs;
  }, [selectedAnalyticalSessions]);

  const surveyAnalyticalLinkSummary = useMemo(() => {
    const allSurvey = getAllExperimentSurveyMeasurements(effectiveExperiment);
    const allInst = getAllExperimentInstrumentMeasurements(effectiveExperiment);
    const linkMap = resolveSurveyAnalyticalLinks(
      allSurvey.map((s) => s.measurement),
      allInst
    );
    const rows: Array<{
      datasetId: string;
      sampleId: string;
      stage: 'Initial' | 'Final';
      surveyValue: number | null;
      analyticalSampleId: string;
      effectiveConc: number | null;
      hasDiscrepancy: boolean;
      sourceUnavailable: boolean;
    }> = [];
    for (const entry of allSurvey) {
      const link = linkMap[entry.measurement.id];
      if (!link) continue;
      if (entry.measurement.linkedInitialMeasurementId) {
        rows.push({
          datasetId: entry.datasetCode,
          sampleId: entry.measurement.sampleId,
          stage: 'Initial',
          surveyValue: entry.measurement.initialConcPpm,
          analyticalSampleId:
            link.initial.linkedRecord?.sampleId ??
            entry.measurement.linkedInitialMeasurementId,
          effectiveConc: link.initial.linkedEffectiveConcPpm,
          hasDiscrepancy: link.initial.hasDiscrepancy,
          sourceUnavailable: link.initial.sourceUnavailable,
        });
      }
      if (entry.measurement.linkedFinalMeasurementId) {
        rows.push({
          datasetId: entry.datasetCode,
          sampleId: entry.measurement.sampleId,
          stage: 'Final',
          surveyValue: entry.measurement.finalConcPpm,
          analyticalSampleId:
            link.final.linkedRecord?.sampleId ??
            entry.measurement.linkedFinalMeasurementId,
          effectiveConc: link.final.linkedEffectiveConcPpm,
          hasDiscrepancy: link.final.hasDiscrepancy,
          sourceUnavailable: link.final.sourceUnavailable,
        });
      }
    }
    return rows;
  }, [effectiveExperiment]);

  const sampleRegistrySummary = useMemo(
    () => buildUnifiedSampleRegistry(effectiveExperiment),
    [effectiveExperiment]
  );

  const timelineSummary = useMemo(
    () => buildExperimentTimeline(effectiveExperiment),
    [effectiveExperiment]
  );

  const allScientificReferences = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      id: string;
      sourceLabel: string;
      title: string;
      author: string;
      year: number | null;
      doiOrUrl: string;
      conditions: string;
      verification: string;
    }> = [];
    const pushRefs = (
      sourceLabel: string,
      refs: NonNullable<typeof supportSnap>['references'] | undefined
    ) => {
      if (!refs) return;
      for (const r of refs) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        list.push({
          id: r.id,
          sourceLabel,
          title: r.title || r.citation || 'Untitled Reference',
          author: r.authorOrOrganization || 'Unspecified',
          year: r.year,
          doiOrUrl: r.doiOrUrl || '—',
          conditions: r.measurementConditions || '—',
          verification: VERIFICATION_LABELS[r.verificationStatus],
        });
      }
    };
    pushRefs(`Support (${supportSnap?.name ?? 'N/A'})`, supportSnap?.references);
    pushRefs(
      `Precursor (${precursorSnap?.name ?? 'N/A'})`,
      precursorSnap?.references
    );
    return list;
  }, [supportSnap, precursorSnap]);

  const generatedAt = useMemo(
    () => new Date().toISOString().slice(0, 16).replace('T', ' '),
    []
  );

  const activeSectionOrder: ReportSectionId[] = useMemo(() => {
    const raw =
      reportConfig.sectionOrder && reportConfig.sectionOrder.length > 0
        ? reportConfig.sectionOrder
        : DEFAULT_REPORT_SECTION_ORDER;
    const merged = [...raw];
    for (const id of DEFAULT_REPORT_SECTION_ORDER) {
      if (!merged.includes(id)) merged.push(id);
    }
    return merged;
  }, [reportConfig.sectionOrder]);

  const moveSection = (index: number, direction: -1 | 1) => {
    if (isViewingFinalized) return;
    const target = index + direction;
    if (target < 0 || target >= activeSectionOrder.length) return;
    const next = [...activeSectionOrder];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onUpdateReportConfig({ sectionOrder: next });
  };

  const handleModeChange = (mode: ReportMode) => {
    if (isViewingFinalized) return;
    onUpdateReportConfig({ mode });
  };

  const handleApplyPreset = (presetKey: ReportType) => {
    if (isViewingFinalized) return;
    const preset = REPORT_TYPE_PRESETS[presetKey];
    if (!preset) return;
    onUpdateReportConfig({
      ...preset.patch,
      reportType: presetKey,
    });
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleExportZipPackage = () => {
    const pkg = buildResearchExportPackage(experiment, {
      snapshot: boundSnapshot ?? undefined,
    });
    triggerBinaryDownload(pkg.zipBytes, pkg.filename, 'application/zip');
    setExportStatusMsg(
      `Exported ${pkg.filename} (${pkg.entries.length} files, ${(
        pkg.zipBytes.length / 1024
      ).toFixed(1)} KB).`
    );
  };

  const handleCreateFinalized = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateFinalizedReport) return;
    const defaultTitle =
      reportConfig.reportTitle?.trim() ||
      `${REPORT_TYPE_PRESETS[reportConfig.reportType ?? 'complete-research']?.label ?? 'Research Report'} — ${experiment.experimentId}`;
    const created = onCreateFinalizedReport({
      title: finalizeTitle.trim() || defaultTitle,
      notes: finalizeNotes.trim(),
      snapshotId:
        finalizeSnapshotChoice !== 'new' ? finalizeSnapshotChoice : undefined,
      snapshotName:
        finalizeSnapshotChoice === 'new'
          ? `Report v${finalizedReports.length + 1} Snapshot`
          : undefined,
    });
    setFinalizeTitle('');
    setFinalizeNotes('');
    setFinalizeSnapshotChoice('new');
    setShowFinalizeForm(false);
    if (created && typeof created === 'object' && 'id' in created) {
      setSelectedFinalizedId(created.id);
    }
  };

  const toggleReportDataset = (dsId: string) => {
    if (isViewingFinalized) return;
    const current = selectedDatasets.map((d) => d.id);
    const exists = current.includes(dsId);
    const next = exists
      ? current.filter((id) => id !== dsId)
      : [...current, dsId];
    onUpdateReportConfig({ selectedSurveyDatasetIds: next });
  };

  const toggleReportFigure = (figId: string) => {
    if (isViewingFinalized) return;
    const current = reportConfig.selectedFigureIds ?? [];
    const exists = current.includes(figId);
    const next = exists
      ? current.filter((id) => id !== figId)
      : [...current, figId];
    onUpdateReportConfig({ selectedFigureIds: next });
  };

  const toggleAnalyticalSession = (sessionId: string) => {
    if (isViewingFinalized) return;
    const current = selectedAnalyticalSessions.map((s) => s.id);
    const exists = current.includes(sessionId);
    const next = exists
      ? current.filter((id) => id !== sessionId)
      : [...current, sessionId];
    onUpdateReportConfig({ selectedAnalyticalSessionIds: next });
  };

  const toggleAnalyticalFigure = (figId: string) => {
    if (isViewingFinalized) return;
    const current = reportConfig.selectedAnalyticalFigureIds ?? [];
    const exists = current.includes(figId);
    const next = exists
      ? current.filter((id) => id !== figId)
      : [...current, figId];
    onUpdateReportConfig({ selectedAnalyticalFigureIds: next });
  };

  const showAnalyticalOverview =
    reportConfig.includeAnalyticalOverview ??
    reportConfig.includeAnalyticalRecords;
  const showCalibrationRecords =
    reportConfig.includeCalibrationRecords ??
    reportConfig.includeRegressionSummary;
  const showAnalyticalFigures =
    reportConfig.includeAnalyticalFigures ??
    reportConfig.includeRegressionSummary;
  const showDilutionRecords =
    reportConfig.includeDilutionRecords ?? reportConfig.includeAnalyticalRecords;
  const showAnalyticalQuality =
    reportConfig.includeAnalyticalQualityReview ??
    reportConfig.includeAnalyticalRecords;
  const showSurveyAnalyticalLinks =
    reportConfig.includeSurveyAnalyticalLinks ??
    reportConfig.includeAnalyticalRecords;

  const displayReportTitle =
    reportConfig.reportTitle?.trim() ||
    (reportConfig.reportType && REPORT_TYPE_PRESETS[reportConfig.reportType]
      ? REPORT_TYPE_PRESETS[reportConfig.reportType].label
      : reportConfig.mode === 'pre-experiment'
        ? 'Pre-Experiment Planning Sheet'
        : 'Post-Experiment Research Report');

  const displayResearcher =
    reportConfig.researcherName?.trim() ||
    effectiveExperiment.researcher ||
    '—';
  const displayReportDate =
    reportConfig.reportDate?.trim() ||
    effectiveExperiment.experimentDate ||
    '—';

  return (
    <div className="space-y-5">
      {/* Screen-only toolbar */}
      <div className="no-print space-y-4">
        <WorkspaceHeader
          title="Lab Report Builder & Archive (A4)"
          description="Publication-grade A4 research report builder with report-type presets, customizable sections, immutable snapshot-bound finalized report versions, and portable ZIP research packages."
          metadata={
            <>
              <span>
                Active Record:{' '}
                <strong className="font-mono text-[#0F52BA]">
                  {experiment.experimentId}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Mode:{' '}
                <strong className="text-[#111827]">
                  {isViewingFinalized && activeFinalizedReport
                    ? `Finalized v${activeFinalizedReport.versionNumber} (Locked Snapshot)`
                    : 'Live Working Report'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Finalized Versions:{' '}
                <strong className="font-mono text-[#111827]">
                  {finalizedReports.length}
                </strong>
              </span>
            </>
          }
          actions={
            <>
              <Button variant="secondary" onClick={handleExportZipPackage}>
                <Package className="w-3.5 h-3.5" strokeWidth={1.75} />
                Export Package (.zip)
              </Button>
              {onCreateFinalizedReport && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFinalizeTitle(
                      `${displayReportTitle} — v${finalizedReports.length + 1}`
                    );
                    setShowFinalizeForm((prev) => !prev);
                  }}
                >
                  <BookmarkCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Finalize Version
                </Button>
              )}
              <Button variant="primary" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                Print / Save as PDF
              </Button>
            </>
          }
        />

        {exportStatusMsg && (
          <div className="px-3.5 py-2 rounded-[6px] bg-[#ECFDF5] border border-[#A7F3D0] text-[12px] text-[#065F46] flex items-center justify-between gap-2">
            <span>{exportStatusMsg}</span>
            <button
              type="button"
              onClick={() => setExportStatusMsg(null)}
              className="text-[11px] underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Live vs. Finalized Report Version Switcher */}
        <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                Report View:
              </span>
              <button
                type="button"
                onClick={() => setSelectedFinalizedId(null)}
                className={`px-2.5 py-1 text-[12px] font-medium rounded-[5px] border cursor-pointer transition-colors ${
                  !isViewingFinalized
                    ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                    : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                Live Working Report
              </button>
              {finalizedReports.map((fr) => {
                const selected = selectedFinalizedId === fr.id;
                return (
                  <div
                    key={fr.id}
                    className={`inline-flex items-center rounded-[5px] border ${
                      selected
                        ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                        : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFinalizedId(fr.id)}
                      className="px-2.5 py-1 text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3 h-3" strokeWidth={1.75} />
                      <span className="font-mono">v{fr.versionNumber}</span>
                      <span className="truncate max-w-[160px]">{fr.title}</span>
                    </button>
                    {onDeleteFinalizedReport && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedFinalizedId === fr.id) {
                            setSelectedFinalizedId(null);
                          }
                          onDeleteFinalizedReport(fr.id);
                        }}
                        aria-label={`Delete finalized report v${fr.versionNumber}`}
                        className="px-1.5 py-1 border-l border-[#E5E7EB] text-[#6B7280] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {!isViewingFinalized && (
              <div
                role="tablist"
                aria-label="A4 report mode"
                className="inline-flex items-center p-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportConfig.mode === 'pre-experiment'}
                  onClick={() => handleModeChange('pre-experiment')}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                    reportConfig.mode === 'pre-experiment'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  Planning Mode
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportConfig.mode === 'post-experiment'}
                  onClick={() => handleModeChange('post-experiment')}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                    reportConfig.mode === 'post-experiment'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  Post-Experiment Mode
                </button>
              </div>
            )}
          </div>

          {/* Locked Finalized Report Archival Banner */}
          {isViewingFinalized && activeFinalizedReport && (
            <div className="p-3 rounded-[6px] bg-[#F8F9FA] border border-[#D1D5DB] space-y-2 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#111827]">
                  <Lock className="w-3.5 h-3.5 text-[#0F52BA]" strokeWidth={1.75} />
                  <strong>
                    Archived Finalized Report v{activeFinalizedReport.versionNumber}
                  </strong>
                  <span className="font-mono text-[11px] text-[#4B5563]">
                    Snapshot {activeFinalizedReport.snapshotId} ({activeFinalizedReport.snapshotName})
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#6B7280]">
                  Finalized {activeFinalizedReport.finalizedAt.slice(0, 16).replace('T', ' ')} by{' '}
                  {activeFinalizedReport.researcher}
                </span>
              </div>
              {activeFinalizedReport.notes && (
                <p className="text-[#4B5563]">{activeFinalizedReport.notes}</p>
              )}
              {liveChangedSinceFinalized && (
                <div className="p-2.5 rounded-[5px] bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                    <span>
                      <strong>Newer Live Revision Available:</strong> The active experiment has been modified since snapshot{' '}
                      <span className="font-mono">{activeFinalizedReport.snapshotId}</span>. This finalized report remains frozen at its archived snapshot.
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedFinalizedId(null)}
                    >
                      View Live Report
                    </Button>
                    {onCreateFinalizedReport && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          setSelectedFinalizedId(null);
                          setFinalizeTitle(
                            `${displayReportTitle} — v${finalizedReports.length + 1}`
                          );
                          setShowFinalizeForm(true);
                        }}
                      >
                        Create New Finalized Revision
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Create Finalized Report Inline Form */}
          {showFinalizeForm && onCreateFinalizedReport && (
            <form
              onSubmit={handleCreateFinalized}
              className="p-3 rounded-[6px] bg-[#F8F9FA] border border-[#D1D5DB] space-y-3"
            >
              <div className="text-[12px] font-semibold text-[#111827]">
                Finalize Report Version (Binds to Immutable Experiment Snapshot)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                    Finalized Report Title
                  </label>
                  <input
                    type="text"
                    required
                    value={finalizeTitle}
                    onChange={(e) => setFinalizeTitle(e.target.value)}
                    placeholder="e.g., Complete Research Report — v2"
                    className={inputBaseClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                    Snapshot Source
                  </label>
                  <select
                    value={finalizeSnapshotChoice}
                    onChange={(e) => setFinalizeSnapshotChoice(e.target.value)}
                    className={inputBaseClass}
                  >
                    <option value="new">
                      Capture New Immutable Snapshot Now
                    </option>
                    {snapshots.map((s) => (
                      <option key={s.snapshotId} value={s.snapshotId}>
                        Bind Existing: {s.snapshotId} — {s.name} (
                        {s.capturedAt.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                    Archival Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={finalizeNotes}
                    onChange={(e) => setFinalizeNotes(e.target.value)}
                    placeholder="Scope, milestone, or revision note"
                    className={inputBaseClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowFinalizeForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Finalized Report v{finalizedReports.length + 1}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Report Presets, Metadata & Section Controls (Live Mode Only) */}
        {!isViewingFinalized && (
          <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-4 space-y-4">
            {/* 6 Report Type Presets */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                Report Type Presets
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {REPORT_TYPE_KEYS.map((key) => {
                  const preset = REPORT_TYPE_PRESETS[key];
                  const active =
                    (reportConfig.reportType ?? 'complete-research') === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleApplyPreset(key)}
                      title={preset.description}
                      className={`text-left px-2.5 py-2 rounded-[6px] border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                          : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#374151] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <div className="text-[11.5px] font-semibold leading-snug">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Metadata & Cover Controls */}
            <div className="pt-3 border-t border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-[12px]">
              <div>
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Report Title
                </label>
                <input
                  type="text"
                  value={reportConfig.reportTitle ?? ''}
                  onChange={(e) =>
                    onUpdateReportConfig({ reportTitle: e.target.value })
                  }
                  placeholder={displayReportTitle}
                  className={inputBaseClass}
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={reportConfig.reportSubtitle ?? ''}
                  onChange={(e) =>
                    onUpdateReportConfig({ reportSubtitle: e.target.value })
                  }
                  placeholder="Optional report subtitle"
                  className={inputBaseClass}
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Researcher Name
                </label>
                <input
                  type="text"
                  value={reportConfig.researcherName ?? ''}
                  onChange={(e) =>
                    onUpdateReportConfig({ researcherName: e.target.value })
                  }
                  placeholder={experiment.researcher || 'Researcher'}
                  className={inputBaseClass}
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Report Date
                </label>
                <input
                  type="date"
                  value={reportConfig.reportDate ?? ''}
                  onChange={(e) =>
                    onUpdateReportConfig({ reportDate: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Institution Header
                </label>
                <input
                  type="text"
                  aria-label="Report institution header"
                  value={reportConfig.institutionHeader}
                  onChange={(e) =>
                    onUpdateReportConfig({ institutionHeader: e.target.value })
                  }
                  placeholder="Institution / Laboratory Header"
                  className={inputBaseClass}
                />
              </div>
            </div>

            {/* Section Toggles + Cover/Order Controls */}
            <div className="pt-3 border-t border-[#E5E7EB] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                  Included Sections &amp; Print Layout
                </span>
                <div className="flex items-center gap-3 text-[12px] text-[#4B5563]">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(reportConfig.includeCoverPage)}
                      onChange={(e) =>
                        onUpdateReportConfig({
                          includeCoverPage: e.target.checked,
                        })
                      }
                      className="accent-[#0F52BA]"
                    />
                    <span>Cover Page</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportConfig.includePageNumbers !== false}
                      onChange={(e) =>
                        onUpdateReportConfig({
                          includePageNumbers: e.target.checked,
                        })
                      }
                      className="accent-[#0F52BA]"
                    />
                    <span>Footer Metadata</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSectionOrder((prev) => !prev)}
                    className="text-[11.5px] font-medium text-[#0F52BA] hover:underline cursor-pointer"
                  >
                    {showSectionOrder ? 'Hide Section Order' : 'Reorder Sections'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#4B5563]">
                {[
                  { key: 'includeMaterialSnapshots', label: 'Materials' },
                  { key: 'includeBatchRecords', label: 'Batch Records' },
                  { key: 'includePlannedVsActual', label: 'Research Plan & Deviations' },
                  { key: 'includeSampleRegistry', label: 'Sample Registry' },
                  { key: 'includeResearchTimeline', label: 'Research Timeline' },
                  { key: 'includeSurveyOverview', label: 'Survey Overview' },
                  { key: 'includeSurveyTable', label: 'Survey Tables' },
                  { key: 'includeStatisticalSummaries', label: 'Stats & Replicates' },
                  { key: 'includeSurveyFigure', label: 'Survey Figures' },
                  { key: 'includeComparativeSummary', label: 'Comparative Summary' },
                  { key: 'includeDataQualityLimitations', label: 'Survey Quality' },
                  { key: 'includeResearchInterpretations', label: 'Interpretations' },
                  { key: 'includeAnalyticalOverview', label: 'Analytical Overview' },
                  { key: 'includeCalibrationRecords', label: 'Calibration & OLS' },
                  { key: 'includeAnalyticalFigures', label: 'Analytical Figures' },
                  { key: 'includeAnalyticalRecords', label: 'Analytical Samples' },
                  { key: 'includeDilutionRecords', label: 'Dilution Records' },
                  { key: 'includeAnalyticalQualityReview', label: 'Analytical Quality' },
                  { key: 'includeSurveyAnalyticalLinks', label: 'Survey–Analytical Links' },
                  { key: 'includeScientificReferences', label: 'References' },
                  { key: 'includeObservations', label: 'Lab Log Notes' },
                  { key: 'includeBenchChecklist', label: 'Milestones / Checklist' },
                  { key: 'includeCrossExperimentSummary', label: 'Cross-Exp Summary' },
                  { key: 'includeResearchMatrix', label: 'Research Matrix' },
                  { key: 'includeAdvancedStatistics', label: 'Quartiles / IQR / MAD' },
                  { key: 'includeMeasurementUncertainty', label: 'Measurement Uncertainty' },
                  { key: 'includeSnapshotMetadata', label: 'Provenance Block' },
                ].map((opt) => {
                  const rawVal =
                    reportConfig[opt.key as keyof ReportConfiguration];
                  const checked =
                    typeof rawVal === 'boolean'
                      ? rawVal
                      : opt.key === 'includeAnalyticalOverview' ||
                          opt.key === 'includeDilutionRecords' ||
                          opt.key === 'includeAnalyticalQualityReview' ||
                          opt.key === 'includeSurveyAnalyticalLinks'
                        ? reportConfig.includeAnalyticalRecords
                        : opt.key === 'includeCalibrationRecords' ||
                            opt.key === 'includeAnalyticalFigures'
                          ? reportConfig.includeRegressionSummary
                          : false;
                  return (
                    <label
                      key={opt.key}
                      className="inline-flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const patch: Partial<ReportConfiguration> = {
                            [opt.key]: e.target.checked,
                          };
                          if (opt.key === 'includeCalibrationRecords') {
                            patch.includeRegressionSummary = e.target.checked;
                          }
                          onUpdateReportConfig(patch);
                        }}
                        className="accent-[#0F52BA]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              {showSectionOrder && (
                <div className="p-3 rounded-[6px] bg-[#F8F9FA] border border-[#E5E7EB] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#4B5563]">
                      A4 Section Ordering
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateReportConfig({
                          sectionOrder: [...DEFAULT_REPORT_SECTION_ORDER],
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-[#4B5563] hover:text-[#111827] cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
                      Reset Default
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11.5px]">
                    {activeSectionOrder.map((secId, idx) => (
                      <div
                        key={secId}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white border border-[#E5E7EB] rounded-[5px]"
                      >
                        <span className="truncate">
                          <span className="font-mono text-[#6B7280] mr-1.5">
                            {idx + 1}.
                          </span>
                          {REPORT_SECTION_LABELS[secId]}
                        </span>
                        <div className="inline-flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSection(idx, -1)}
                            aria-label={`Move ${REPORT_SECTION_LABELS[secId]} up`}
                            className="p-0.5 text-[#4B5563] hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activeSectionOrder.length - 1}
                            onClick={() => moveSection(idx, 1)}
                            aria-label={`Move ${REPORT_SECTION_LABELS[secId]} down`}
                            className="p-0.5 text-[#4B5563] hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Researcher Conclusions Input */}
              <div className="pt-2">
                <label className="block text-[10.5px] uppercase tracking-[0.04em] font-semibold text-[#4B5563] mb-1">
                  Researcher Conclusions &amp; Summary Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reportConfig.researcherConclusions ?? ''}
                  onChange={(e) =>
                    onUpdateReportConfig({
                      researcherConclusions: e.target.value,
                    })
                  }
                  placeholder="Enter researcher-authored conclusions or next-step recommendations to include in the printed report..."
                  className={inputBaseClass}
                />
              </div>
            </div>

            {/* Dataset & Saved Figure Selectors */}
            {effectiveExperiment.surveyDatasets.length > 0 && (
              <div className="pt-3 border-t border-[#E5E7EB] grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] mb-1.5">
                    Included Survey Datasets ({selectedDatasets.length} of{' '}
                    {effectiveExperiment.surveyDatasets.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveExperiment.surveyDatasets.map((ds) => {
                      const checked = selectedDatasets.some(
                        (s) => s.id === ds.id
                      );
                      return (
                        <label
                          key={ds.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border cursor-pointer ${
                            checked
                              ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                              : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReportDataset(ds.id)}
                            className="accent-[#0F52BA]"
                          />
                          <span className="font-mono font-medium">
                            {ds.datasetId}
                          </span>
                          <span className="truncate max-w-[140px]">
                            {ds.title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {availableSavedFigures.length > 0 && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] mb-1.5">
                      Additional Saved Figures to Embed
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availableSavedFigures.map(({ dataset, figure }) => {
                        const checked = (
                          reportConfig.selectedFigureIds ?? []
                        ).includes(figure.id);
                        return (
                          <label
                            key={figure.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border cursor-pointer ${
                              checked
                                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                                : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleReportFigure(figure.id)}
                              className="accent-[#0F52BA]"
                            />
                            <span className="font-mono text-[11px]">
                              {dataset.datasetId}:
                            </span>
                            <span className="truncate max-w-[150px]">
                              {figure.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Analytical Session & Saved Analytical Figure Selectors */}
            {(effectiveExperiment.analyticalSessions ?? []).length > 0 && (
              <div className="pt-3 border-t border-[#E5E7EB] grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] mb-1.5">
                    Included Analytical Sessions (
                    {selectedAnalyticalSessions.length} of{' '}
                    {effectiveExperiment.analyticalSessions.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveExperiment.analyticalSessions.map((session) => {
                      const checked = selectedAnalyticalSessions.some(
                        (s) => s.id === session.id
                      );
                      return (
                        <label
                          key={session.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border cursor-pointer ${
                            checked
                              ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                              : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAnalyticalSession(session.id)}
                            className="accent-[#0F52BA]"
                          />
                          <span className="font-mono font-medium">
                            {session.sessionId}
                          </span>
                          <span className="truncate max-w-[150px]">
                            {session.technique} · {session.title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {availableSavedAnalyticalFigures.length > 0 && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] mb-1.5">
                      Additional Saved Analytical Figures
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availableSavedAnalyticalFigures.map(
                        ({ session, figure }) => {
                          const checked = (
                            reportConfig.selectedAnalyticalFigureIds ?? []
                          ).includes(figure.id);
                          return (
                            <label
                              key={figure.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border cursor-pointer ${
                                checked
                                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                                  : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleAnalyticalFigure(figure.id)
                                }
                                className="accent-[#0F52BA]"
                              />
                              <span className="font-mono text-[11px]">
                                {session.sessionId}:
                              </span>
                              <span className="truncate max-w-[150px]">
                                {figure.name}
                              </span>
                            </label>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* A4 Document Sheet */}
      <article
        aria-label="A4 Laboratory Report Preview"
        className="print-sheet mx-auto bg-white border border-[#D1D5DB] rounded-[2px] w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-10 text-[#111827] space-y-6"
      >
        {/* Optional Cover Page Header Block */}
        {reportConfig.includeCoverPage && (
          <section className="pb-6 border-b-2 border-[#111827] space-y-3 print-avoid-break">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[#0F52BA]">
              {reportConfig.institutionHeader || 'SEA Workbench Laboratory Dossier'}
            </div>
            <h1 className="text-[22px] font-semibold text-[#111827] leading-tight">
              {displayReportTitle}
            </h1>
            {reportConfig.reportSubtitle && (
              <p className="text-[13px] text-[#4B5563]">
                {reportConfig.reportSubtitle}
              </p>
            )}
            <div className="text-[14px] font-medium text-[#111827]">
              {effectiveExperiment.title}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#E5E7EB] text-[11.5px]">
              <div>
                <div className="text-[10px] uppercase text-[#6B7280]">Experiment ID</div>
                <div className="font-mono font-semibold text-[#0F52BA]">
                  {effectiveExperiment.experimentId}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#6B7280]">Researcher</div>
                <div className="font-medium">{displayResearcher}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#6B7280]">Date</div>
                <div className="font-mono">{displayReportDate}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#6B7280]">Record Status</div>
                <div className="font-medium">{effectiveExperiment.status}</div>
              </div>
            </div>
          </section>
        )}

        {/* Document Header */}
        <header className="pb-4 border-b-2 border-[#111827] flex items-start justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#4B5563]">
              {reportConfig.institutionHeader
                ?.trim()
                .toLowerCase()
                .startsWith('sea workbench')
                ? reportConfig.institutionHeader
                : `SEA Workbench · ${reportConfig.institutionHeader || 'Laboratory Record'}`}
            </div>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-1 leading-tight">
              {displayReportTitle}
            </h2>
            {reportConfig.reportSubtitle && (
              <p className="text-[12px] text-[#4B5563] mt-0.5">
                {reportConfig.reportSubtitle}
              </p>
            )}
            <p className="text-[13.5px] font-medium text-[#111827] mt-1.5">
              {effectiveExperiment.title}
            </p>
          </div>
          <div className="text-right font-mono tabular-nums text-[11.5px] text-[#4B5563] shrink-0 space-y-0.5">
            <div className="text-[13px] font-semibold text-[#0F52BA]">
              {effectiveExperiment.experimentId}
            </div>
            <div>Type: {effectiveExperiment.type}</div>
            <div>Status: {effectiveExperiment.status}</div>
            {activeFinalizedReport ? (
              <div className="text-[#0F52BA] font-semibold">
                Finalized v{activeFinalizedReport.versionNumber} ·{' '}
                {activeFinalizedReport.snapshotId}
              </div>
            ) : (
              <div>Generated: {generatedAt}</div>
            )}
          </div>
        </header>

        {/* Demonstration / Review Status Banner */}
        {(effectiveExperiment.isDemonstration ||
          effectiveExperiment.scientificReviewStatus !== 'Reviewed') && (
          <div className="p-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-[11.5px] text-[#92400E] print-avoid-break">
            <strong>Scientific Review &amp; Provenance Notice:</strong> Review Status:{' '}
            <span className="font-mono">
              {effectiveExperiment.scientificReviewStatus}
            </span>
            .{' '}
            {effectiveExperiment.isDemonstration
              ? 'This document contains synthetic demonstration fixtures and must not be interpreted as validated experimental evidence.'
              : 'Descriptive statistics and exploratory OLS regression are computed deterministically for inspection; SEA stoichiometric models, isotherm fits, and analytical method validation remain pending independent scientific review.'}
          </div>
        )}

        {/* Metadata Block */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] pb-4 border-b border-[#E5E7EB] print-avoid-break">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
              Researcher
            </div>
            <div className="font-medium mt-0.5">{displayResearcher}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
              Experiment / Report Date
            </div>
            <div className="font-mono tabular-nums mt-0.5">
              {displayReportDate}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
              Research Project
            </div>
            <div className="mt-0.5">
              {project ? `${project.code} — ${project.name}` : 'Unassigned'}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
              Record Version
            </div>
            <div className="font-mono tabular-nums mt-0.5">
              v{effectiveExperiment.dataVersion} · App {APP_VERSION}
            </div>
          </div>
        </section>

        {/* Research Objective */}
        <section className="print-avoid-break">
          <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563] mb-1.5">
            1. Research Objective
          </h3>
          <p className="text-[12.5px] text-[#111827] leading-relaxed">
            {effectiveExperiment.objective || 'No research objective recorded.'}
          </p>
        </section>

        {/* Material Snapshots */}
        {reportConfig.includeMaterialSnapshots && (
          <section className="print-avoid-break space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              2. Associated Material Snapshots (Experiment-Specific)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div className="border border-[#E5E7EB] p-3">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Support Material
                </div>
                {supportSnap ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-semibold">{supportSnap.name}</div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      Composition: {supportSnap.composition} · Grade:{' '}
                      {supportSnap.supplierOrGrade || '—'}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-[#4B5563]">
                      BET:{' '}
                      {formatScientificNumber(supportSnap.betSurfaceArea.value, 1)}{' '}
                      {supportSnap.betSurfaceArea.unit} · PZC:{' '}
                      {formatScientificNumber(supportSnap.pzc.value, 2)}{' '}
                      {supportSnap.pzc.unit}
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Verification:{' '}
                      {VERIFICATION_LABELS[supportSnap.verificationStatus]} ·
                      Snapshot:{' '}
                      {effectiveExperiment.batch.supportSnapshot?.capturedAt.slice(
                        0,
                        10
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[#6B7280]">No support attached.</div>
                )}
              </div>

              <div className="border border-[#E5E7EB] p-3">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Metal Precursor
                </div>
                {precursorSnap ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-semibold">{precursorSnap.name}</div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      Formula: {precursorSnap.formula} · Charge:{' '}
                      {precursorSnap.chargeClassification}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-[#4B5563]">
                      MW:{' '}
                      {formatScientificNumber(precursorSnap.molarMass.value, 2)}{' '}
                      {precursorSnap.molarMass.unit} · Metal wt%:{' '}
                      {formatScientificNumber(
                        precursorSnap.metalWeightFraction.value,
                        2
                      )}{' '}
                      {precursorSnap.metalWeightFraction.unit}
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Verification:{' '}
                      {VERIFICATION_LABELS[precursorSnap.verificationStatus]} ·
                      Snapshot:{' '}
                      {effectiveExperiment.batch.precursorSnapshot?.capturedAt.slice(
                        0,
                        10
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[#6B7280]">No precursor attached.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Batch Synthesis Parameters */}
        {reportConfig.includeBatchRecords && (
          <section className="print-avoid-break space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              3. Experimental Parameters (
              {reportConfig.mode === 'pre-experiment'
                ? 'Planned Target Sheet'
                : 'Planned vs. Actual Record'}
              )
            </h3>
            <table className="w-full text-left border-collapse text-[11.5px] border border-[#D1D5DB]">
              <thead>
                <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                  <th className="py-1.5 px-2.5 font-medium">Parameter</th>
                  <th className="py-1.5 px-2.5 font-medium text-right">Planned</th>
                  {reportConfig.mode === 'post-experiment' && (
                    <th className="py-1.5 px-2.5 font-medium text-right">
                      Actual / Recorded
                    </th>
                  )}
                  <th className="py-1.5 px-2.5 font-medium">Unit</th>
                  <th className="py-1.5 px-2.5 font-medium">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {[
                  {
                    name: 'Support Mass',
                    planned: effectiveExperiment.batch.plannedSupportMassG,
                    actual: effectiveExperiment.batch.actualSupportMassG,
                    unit: 'g',
                    d: 3,
                  },
                  {
                    name: 'Solution Volume',
                    planned: effectiveExperiment.batch.plannedSolutionVolumeMl,
                    actual: effectiveExperiment.batch.actualSolutionVolumeMl,
                    unit: 'mL',
                    d: 2,
                  },
                  {
                    name: 'Surface Loading (SL)',
                    planned: effectiveExperiment.batch.plannedSurfaceLoadingM2L,
                    actual: effectiveExperiment.batch.actualSurfaceLoadingM2L,
                    unit: 'm²/L',
                    d: 1,
                  },
                  {
                    name: 'Metal Loading',
                    planned:
                      effectiveExperiment.batch.plannedTargetMetalLoadingWtPct,
                    actual:
                      effectiveExperiment.batch.actualMeasuredMetalLoadingWtPct,
                    unit: 'wt%',
                    d: 2,
                  },
                  {
                    name: 'Initial pH',
                    planned: effectiveExperiment.batch.plannedInitialPh,
                    actual: effectiveExperiment.batch.actualInitialPh,
                    unit: 'pH',
                    d: 2,
                  },
                  {
                    name: 'Final pH',
                    planned: null,
                    actual: effectiveExperiment.batch.actualFinalPh,
                    unit: 'pH',
                    d: 2,
                  },
                  {
                    name: 'Precursor Concentration',
                    planned: effectiveExperiment.batch.plannedPrecursorConcPpm,
                    actual: effectiveExperiment.batch.actualPrecursorConcPpm,
                    unit: 'ppm',
                    d: 1,
                  },
                ].map((r) => (
                  <tr key={r.name}>
                    <td className="py-1.5 px-2.5 font-medium">{r.name}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                      {formatScientificNumber(r.planned, r.d)}
                    </td>
                    {reportConfig.mode === 'post-experiment' && (
                      <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                        {formatScientificNumber(r.actual, r.d)}
                      </td>
                    )}
                    <td className="py-1.5 px-2.5 font-mono text-[#4B5563]">
                      {r.unit}
                    </td>
                    <td className="py-1.5 px-2.5 text-[#4B5563]">
                      {r.planned === null && r.actual === null
                        ? 'Unavailable'
                        : PROVENANCE_LABELS[
                            effectiveExperiment.batch.dataProvenance
                          ]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11px] text-[#6B7280]">
              Derived SEA domain outputs (
              {calcBoundary.fields.map((f) => f.label).join(', ')}):{' '}
              <strong>Pending Independent Scientific Review</strong> (
              {calcBoundary.engineVersion}).
            </div>
          </section>
        )}

        {/* Phase 5 Research Plan & Deviations */}
        {reportConfig.includePlannedVsActual &&
          effectiveExperiment.researchPlan &&
          ((effectiveExperiment.researchPlan.researchQuestions ?? []).length >
            0 ||
            (effectiveExperiment.researchPlan.plannedSampleIds ?? []).length >
              0 ||
            Boolean(
              effectiveExperiment.researchPlan.plannedMeasurementRequirements
            ) ||
            (effectiveExperiment.researchPlan.deviations ?? []).length > 0) && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                3b. Research Plan, Scope &amp; Recorded Deviations
              </h3>
              <div className="border border-[#E5E7EB] p-3 text-[11px] space-y-2 bg-[#F8F9FA]">
                {(effectiveExperiment.researchPlan.researchQuestions ?? [])
                  .length > 0 && (
                  <div>
                    <div className="font-semibold text-[#111827] mb-0.5">
                      Research Questions / Hypotheses
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[#374151]">
                      {effectiveExperiment.researchPlan.researchQuestions.map(
                        (q, i) => (
                          <li key={i}>{q}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
                {(effectiveExperiment.researchPlan.plannedSampleIds ?? [])
                  .length > 0 && (
                  <div>
                    <span className="font-semibold text-[#111827]">
                      Planned Sample IDs:{' '}
                    </span>
                    <span className="font-mono text-[#374151]">
                      {effectiveExperiment.researchPlan.plannedSampleIds.join(
                        ', '
                      )}
                    </span>
                  </div>
                )}
                {effectiveExperiment.researchPlan
                  .plannedMeasurementRequirements && (
                  <div>
                    <span className="font-semibold text-[#111827]">
                      Measurement Requirements:{' '}
                    </span>
                    <span className="text-[#374151]">
                      {
                        effectiveExperiment.researchPlan
                          .plannedMeasurementRequirements
                      }
                    </span>
                  </div>
                )}
                {(effectiveExperiment.researchPlan.deviations ?? []).length >
                  0 && (
                  <div className="pt-1 border-t border-[#E5E7EB]">
                    <div className="font-semibold text-[#92400E] mb-0.5">
                      Recorded Deviations from Plan (
                      {effectiveExperiment.researchPlan.deviations.length})
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[#374151]">
                      {effectiveExperiment.researchPlan.deviations.map(
                        (dev) => (
                          <li key={dev.id}>
                            <span className="font-mono text-[10px] text-[#6B7280]">
                              [{dev.timestamp.slice(0, 10)}]
                            </span>{' '}
                            <strong>{dev.description}</strong>
                            {dev.reason ? ` — Reason: ${dev.reason}` : ''}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

        {/* Selected Survey Datasets (Overview, Tables, Stats, Figures, Quality & Interpretations) */}
        {datasetReports.map(({ dataset, analysis, completeness }, dsIndex) => (
          <div key={dataset.id} className="space-y-4 pt-2 border-t border-[#D1D5DB]">
            {reportConfig.includeSurveyOverview && (
              <section className="print-avoid-break space-y-1.5">
                <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                  4.{dsIndex + 1} Survey Dataset Overview — {dataset.datasetId}:{' '}
                  {dataset.title}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] border border-[#E5E7EB] p-2.5 bg-[#F8F9FA]">
                  <div>
                    <span className="text-[#6B7280]">Type: </span>
                    <strong>
                      {dataset.mode === 'pzc' ? 'PZC / pH Shift' : 'Uptake Survey'}
                    </strong>
                  </div>
                  <div className="font-mono">
                    <span className="font-sans text-[#6B7280]">Target SL: </span>
                    {dataset.config.targetSurfaceLoadingM2L !== null
                      ? `${dataset.config.targetSurfaceLoadingM2L} m²/L`
                      : '—'}
                  </div>
                  <div className="font-mono">
                    <span className="font-sans text-[#6B7280]">Equil. / T: </span>
                    {dataset.config.equilibrationTimeMin ?? '—'} min ·{' '}
                    {dataset.config.temperatureC ?? '—'} °C
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Provenance: </span>
                    <strong>{PROVENANCE_LABELS[dataset.provenance]}</strong>
                  </div>
                </div>
                {dataset.objective && (
                  <p className="text-[12px] text-[#374151]">{dataset.objective}</p>
                )}
              </section>
            )}

            {/* Measurement Table */}
            {reportConfig.includeSurveyTable && (
              <section className="space-y-2">
                <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                  Survey Measurements — {dataset.datasetId} ({dataset.measurements.length} rows)
                </h4>
                {dataset.measurements.length === 0 ? (
                  <p className="text-[12px] text-[#6B7280]">
                    No survey measurements recorded in this dataset.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-[10.5px] border border-[#D1D5DB]">
                    <thead>
                      <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                        <th className="py-1.5 px-2 font-medium">Sample ID</th>
                        <th className="py-1.5 px-2 font-medium">Group</th>
                        <th className="py-1.5 px-2 font-medium">Rep</th>
                        <th className="py-1.5 px-2 font-medium text-right">pHi</th>
                        <th className="py-1.5 px-2 font-medium text-right">pHf</th>
                        <th className="py-1.5 px-2 font-medium text-right">ΔpH</th>
                        {dataset.mode === 'uptake' && (
                          <>
                            <th className="py-1.5 px-2 font-medium text-right">
                              C₀ (ppm)
                            </th>
                            <th className="py-1.5 px-2 font-medium text-right">
                              Cf (ppm)
                            </th>
                            <th className="py-1.5 px-2 font-medium text-right">
                              Uptake (µmol/m²)
                            </th>
                          </>
                        )}
                        <th className="py-1.5 px-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                      {dataset.measurements.map((row) => {
                        const dPh =
                          row.measuredInitialPh !== null &&
                          row.measuredFinalPh !== null
                            ? row.measuredFinalPh - row.measuredInitialPh
                            : null;
                        return (
                          <tr
                            key={row.id}
                            className={
                              row.qualityStatus === 'excluded_by_user'
                                ? 'opacity-50 line-through'
                                : ''
                            }
                          >
                            <td className="py-1 px-2 font-medium">
                              {row.sampleId}
                            </td>
                            <td className="py-1 px-2">{row.sampleGroupId}</td>
                            <td className="py-1 px-2">{row.replicateId}</td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(row.measuredInitialPh, 2)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(row.measuredFinalPh, 2)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(dPh, 2)}
                            </td>
                            {dataset.mode === 'uptake' && (
                              <>
                                <td className="py-1 px-2 text-right">
                                  {formatScientificNumber(row.initialConcPpm, 1)}
                                </td>
                                <td className="py-1 px-2 text-right">
                                  {formatScientificNumber(row.finalConcPpm, 1)}
                                </td>
                                <td className="py-1 px-2 text-right">
                                  {formatScientificNumber(
                                    row.recordedUptakeUmolM2,
                                    2
                                  )}
                                </td>
                              </>
                            )}
                            <td className="py-1 px-2 font-sans text-[#4B5563]">
                              {row.qualityStatus}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {/* Replicate Statistical Summary (Shared analyzeSurveyDataset) */}
            {reportConfig.includeStatisticalSummaries &&
              reportConfig.mode === 'post-experiment' &&
              analysis.replicateGroups.length > 0 && (
                <section className="print-avoid-break space-y-2">
                  <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                    Explicit Replicate Group Summary — {dataset.datasetId} (
                    {analysis.engineVersion})
                  </h4>
                  <table className="w-full text-left border-collapse text-[10.5px] border border-[#D1D5DB]">
                    <thead>
                      <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                        <th className="py-1.5 px-2 font-medium">Group ID</th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          Valid n
                        </th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          Mean pHi
                        </th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          Mean pHf
                        </th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          {dataset.mode === 'pzc'
                            ? 'Mean ΔpH'
                            : 'Mean Uptake (µmol/m²)'}
                        </th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          Sample SD
                        </th>
                        <th className="py-1.5 px-2 font-medium text-right">
                          SEM
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                      {analysis.replicateGroups.map((g) => {
                        const primary =
                          dataset.mode === 'pzc'
                            ? g.deltaPhStats.value
                            : g.uptakeStats.value;
                        return (
                          <tr key={g.sampleGroupId}>
                            <td className="py-1 px-2 font-medium">
                              {g.sampleGroupId}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {primary.validCount}/{g.totalRowCount}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(
                                g.initialPhStats.value.mean,
                                2
                              )}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(
                                g.finalPhStats.value.mean,
                                2
                              )}
                            </td>
                            <td className="py-1 px-2 text-right font-semibold">
                              {formatScientificNumber(primary.mean, 3)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(primary.sampleStdDev, 3)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(primary.sem, 3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}

            {/* Embedded Figures */}
            {reportConfig.includeSurveyFigure &&
              reportConfig.mode === 'post-experiment' &&
              dataset.measurements.length > 0 && (
                <section className="print-avoid-break space-y-3">
                  <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                    Figure — {dataset.datasetId} ({dataset.figureConfig.name})
                  </h4>
                  <ScientificFigureCanvas
                    dataset={dataset}
                    figureConfig={dataset.figureConfig}
                    experimentId={effectiveExperiment.experimentId}
                    referencePzcMarkers={dataset.referencePzcMarkers}
                    comparison={comparativeSummary}
                    comparePlotMode={
                      effectiveExperiment.datasetComparison?.comparePlotMode
                    }
                    compareShowGroupMeans={
                      effectiveExperiment.datasetComparison?.showGroupMeans
                    }
                    height={235}
                    compact
                    hideExports
                  />
                  {dataset.savedFigures
                    .filter((f) =>
                      (reportConfig.selectedFigureIds ?? []).includes(f.id)
                    )
                    .map((savedFig) => (
                      <div key={savedFig.id} className="print-avoid-break">
                        <ScientificFigureCanvas
                          dataset={dataset}
                          figureConfig={savedFig}
                          experimentId={effectiveExperiment.experimentId}
                          referencePzcMarkers={dataset.referencePzcMarkers}
                          comparison={comparativeSummary}
                          comparePlotMode={
                            effectiveExperiment.datasetComparison?.comparePlotMode
                          }
                          compareShowGroupMeans={
                            effectiveExperiment.datasetComparison?.showGroupMeans
                          }
                          height={230}
                          compact
                          hideExports
                        />
                      </div>
                    ))}
                </section>
              )}

            {/* Data Quality & Completeness Limitations */}
            {reportConfig.includeDataQualityLimitations && (
              <section className="print-avoid-break border border-[#E5E7EB] p-3 text-[11px] space-y-1 bg-[#F8F9FA]">
                <div className="font-semibold text-[#111827]">
                  Data Completeness &amp; Quality Limitations ({dataset.datasetId})
                </div>
                <div className="font-mono text-[#4B5563]">
                  Complete rows: {completeness.completeMeasurementRows}/
                  {completeness.totalSamples} · Missing uptake:{' '}
                  {completeness.missingUptakeCount} · Flagged:{' '}
                  {completeness.flaggedCount} · Excluded:{' '}
                  {completeness.excludedCount} · Unresolved link discrepancies:{' '}
                  {completeness.unresolvedDiscrepancyCount}
                </div>
                <div className="text-[#6B7280]">
                  {completeness.completenessDisclaimer}
                </div>
              </section>
            )}

            {/* Researcher-Authored Interpretations */}
            {reportConfig.includeResearchInterpretations &&
              dataset.annotations.length > 0 && (
                <section className="print-avoid-break space-y-1.5">
                  <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                    Researcher-Authored Interpretations — {dataset.datasetId}
                  </h4>
                  <div className="divide-y divide-[#E5E7EB] border border-[#D1D5DB] text-[11px]">
                    {dataset.annotations.map((ann) => (
                      <div key={ann.id} className="p-2.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-[#111827]">
                            [{ANNOTATION_CATEGORY_LABELS[ann.category]}]{' '}
                            {ann.title}
                          </strong>
                          <span className="font-mono text-[10px] text-[#6B7280]">
                            {ann.author} · {ann.updatedAt.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-[#374151] leading-relaxed">
                          {ann.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
          </div>
        ))}

        {/* Comparative Summary Section */}
        {reportConfig.includeComparativeSummary &&
          reportConfig.mode === 'post-experiment' &&
          comparativeSummary.entries.length >= 2 && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                5. Multi-Dataset Comparative Summary (
                {comparativeSummary.entries.length} Series)
              </h3>
              {comparativeSummary.conditionDifferences.length > 0 && (
                <div className="p-2 bg-[#FFFBEB] border border-[#FDE68A] text-[10.5px] text-[#92400E]">
                  <strong>Condition Differences:</strong>{' '}
                  {comparativeSummary.conditionDifferences.join(' ')}
                </div>
              )}
              <table className="w-full text-left border-collapse text-[10.5px] border border-[#D1D5DB]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                    <th className="py-1.5 px-2 font-medium">Dataset</th>
                    <th className="py-1.5 px-2 font-medium">Conditions</th>
                    <th className="py-1.5 px-2 font-medium text-right">n</th>
                    <th className="py-1.5 px-2 font-medium text-right">
                      Mean pHf
                    </th>
                    <th className="py-1.5 px-2 font-medium text-right">
                      Mean Uptake
                    </th>
                    <th className="py-1.5 px-2 font-medium text-right">SD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                  {comparativeSummary.entries.map((entry) => (
                    <tr key={`${entry.experimentUuid}:${entry.dataset.id}`}>
                      <td className="py-1 px-2 font-sans">
                        <span className="font-mono font-semibold text-[#0F52BA]">
                          {entry.experimentId}/{entry.dataset.datasetId}
                        </span>{' '}
                        — {entry.dataset.title}
                      </td>
                      <td className="py-1 px-2 text-[#4B5563]">
                        SL {entry.dataset.config.targetSurfaceLoadingM2L ?? '—'}{' '}
                        m²/L · {entry.dataset.config.temperatureC ?? '—'} °C
                      </td>
                      <td className="py-1 px-2 text-right">
                        {entry.analysis.includedRows}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(
                          entry.analysis.finalPhStats.value.mean,
                          2
                        )}
                      </td>
                      <td className="py-1 px-2 text-right font-semibold">
                        {formatScientificNumber(
                          entry.analysis.uptakeStats.value.mean,
                          3
                        )}{' '}
                        {entry.uptakeUnit}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(
                          entry.analysis.uptakeStats.value.sampleStdDev,
                          3
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

        {/* Phase 4 Multi-Session Analytical Chemistry Sections */}
        {reportConfig.mode === 'post-experiment' &&
          (showAnalyticalOverview ||
            showCalibrationRecords ||
            showAnalyticalFigures ||
            reportConfig.includeAnalyticalRecords ||
            showDilutionRecords ||
            showAnalyticalQuality ||
            showSurveyAnalyticalLinks) && (
            <div className="space-y-4 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                6. Analytical Chemistry &amp; Instrument Data Sessions (
                {analyticalSessionReports.length} Selected)
              </h3>

              {analyticalSessionReports.length === 0 ? (
                <p className="text-[12px] text-[#6B7280]">
                  No analytical sessions selected for this report.
                </p>
              ) : (
                analyticalSessionReports.map(
                  (
                    {
                      session,
                      activeCal,
                      activeCalAnalysis,
                      calAnalyses,
                      dilutionDiagnostics,
                      qualityIssues,
                      reviewMap,
                    },
                    sIdx
                  ) => (
                    <div
                      key={session.id}
                      className="space-y-3 pt-2 border-t border-[#E5E7EB]"
                    >
                      {/* 6.x Overview & Metadata */}
                      {showAnalyticalOverview && (
                        <section className="print-avoid-break space-y-1.5">
                          <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#111827]">
                            6.{sIdx + 1} Session {session.sessionId} —{' '}
                            {session.title}
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] border border-[#E5E7EB] p-2.5 bg-[#F8F9FA]">
                            <div>
                              <span className="text-[#6B7280]">Technique: </span>
                              <strong>
                                {session.technique === 'Other' &&
                                session.customTechniqueName
                                  ? session.customTechniqueName
                                  : session.technique}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[#6B7280]">Instrument: </span>
                              <span className="font-mono">
                                {[
                                  session.instrumentManufacturer,
                                  session.instrumentModel,
                                ]
                                  .filter(Boolean)
                                  .join(' ') || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#6B7280]">
                                Analyst / Date:{' '}
                              </span>
                              <span className="font-mono">
                                {session.analyst || '—'} ·{' '}
                                {session.analysisDate || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#6B7280]">
                                Provenance:{' '}
                              </span>
                              <strong>
                                {PROVENANCE_LABELS[session.provenance]}
                              </strong>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Matrix: </span>
                              <span>{session.matrixDescription || '—'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">
                                Method / Analytes:{' '}
                              </span>
                              <span className="font-mono">
                                {session.methodReference || '—'} ·{' '}
                                {session.analytes
                                  .map(
                                    (a) =>
                                      `${a.symbol}${
                                        a.wavelengthNm !== null
                                          ? ` (${a.wavelengthNm} nm)`
                                          : ''
                                      }`
                                  )
                                  .join(', ') || 'None'}
                              </span>
                            </div>
                          </div>
                          {session.isDemonstration && (
                            <div className="text-[10.5px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1">
                              Synthetic Demonstration Analytical Session — for
                              workflow inspection only; not real laboratory data.
                            </div>
                          )}
                        </section>
                      )}

                      {/* Calibration Standards & Exploratory OLS Regression */}
                      {showCalibrationRecords && calAnalyses.length > 0 && (
                        <section className="print-avoid-break space-y-2">
                          <h4 className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                            Calibration Standards &amp; Exploratory OLS
                            Regression — {session.sessionId}
                          </h4>
                          {calAnalyses.map(({ dataset: cal, analysis }) => {
                            if (!analysis) return null;
                            const reg = analysis.regression.value;
                            const maxAbsResid =
                              analysis.diagnosticPoints.length > 0
                                ? Math.max(
                                    ...analysis.diagnosticPoints.map((p) =>
                                      Math.abs(p.residual)
                                    )
                                  )
                                : null;
                            return (
                              <div
                                key={cal.id}
                                className="border border-[#D1D5DB] p-2.5 space-y-2 text-[10.5px]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <strong className="font-mono text-[#111827]">
                                    {cal.calibrationId}: {cal.title}
                                  </strong>
                                  <span className="font-mono text-[#4B5563]">
                                    Units: {cal.concUnit} → {cal.responseUnit} ·
                                    Included n={reg.validCount}/
                                    {cal.standards.length}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 font-mono tabular-nums bg-[#F8F9FA] p-2 border border-[#E5E7EB]">
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      Slope
                                    </div>
                                    <div className="font-semibold">
                                      {formatWithScientificNotation(reg.slope, {
                                        fixedDecimals: 4,
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      Intercept
                                    </div>
                                    <div>
                                      {formatWithScientificNotation(
                                        reg.intercept,
                                        { fixedDecimals: 4 }
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      R²
                                    </div>
                                    <div className="font-semibold">
                                      {reg.rSquared !== null
                                        ? reg.rSquared.toFixed(6)
                                        : '—'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      RSS
                                    </div>
                                    <div>
                                      {formatWithScientificNotation(reg.rss, {
                                        fixedDecimals: 4,
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      SEE
                                    </div>
                                    <div>
                                      {formatWithScientificNotation(
                                        reg.standardErrorOfEstimate,
                                        { fixedDecimals: 4 }
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-sans text-[9.5px] uppercase text-[#6B7280]">
                                      Max |Resid|
                                    </div>
                                    <div>
                                      {formatWithScientificNotation(
                                        maxAbsResid,
                                        { fixedDecimals: 3 }
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-[10px] text-[#92400E]">
                                  Exploratory Numerical Analysis — Not
                                  Analytical Method Validation. Unweighted OLS
                                  with free intercept; no LOD/LOQ or regulatory
                                  acceptance is asserted.
                                </div>
                              </div>
                            );
                          })}
                        </section>
                      )}

                      {/* Embedded Analytical Figures */}
                      {showAnalyticalFigures &&
                        (activeCalAnalysis ||
                          session.sampleMeasurements.length > 0) && (
                          <section className="print-avoid-break space-y-2.5">
                            <h4 className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                              Analytical Figure — {session.sessionId} (
                              {session.figureConfig.name})
                            </h4>
                            <AnalyticalFigureCanvas
                              session={session}
                              calibrationDataset={activeCal}
                              calibrationAnalysis={activeCalAnalysis}
                              config={session.figureConfig}
                              height={225}
                              compact
                              showExportButtons={false}
                            />
                            {(session.savedFigures ?? [])
                              .filter((f) =>
                                (
                                  reportConfig.selectedAnalyticalFigureIds ?? []
                                ).includes(f.id)
                              )
                              .map((savedFig) => (
                                <div
                                  key={savedFig.id}
                                  className="print-avoid-break"
                                >
                                  <AnalyticalFigureCanvas
                                    session={session}
                                    calibrationDataset={activeCal}
                                    calibrationAnalysis={activeCalAnalysis}
                                    config={savedFig}
                                    height={220}
                                    compact
                                    showExportButtons={false}
                                  />
                                </div>
                              ))}
                          </section>
                        )}

                      {/* Sample Measurements Table */}
                      {reportConfig.includeAnalyticalRecords && (
                        <section className="space-y-1.5">
                          <h4 className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                            Recorded Instrument Sample Measurements —{' '}
                            {session.sessionId} (
                            {session.sampleMeasurements.length} rows)
                          </h4>
                          {session.sampleMeasurements.length === 0 ? (
                            <p className="text-[11.5px] text-[#6B7280]">
                              No instrument sample records logged in this
                              session.
                            </p>
                          ) : (
                            <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                              <thead>
                                <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                                  <th className="py-1.5 px-2 font-medium">
                                    Sample ID
                                  </th>
                                  <th className="py-1.5 px-2 font-medium">
                                    Analyte
                                  </th>
                                  <th className="py-1.5 px-2 font-medium">
                                    Stage
                                  </th>
                                  <th className="py-1.5 px-2 font-medium">
                                    Rep
                                  </th>
                                  <th className="py-1.5 px-2 font-medium text-right">
                                    Dilution (×)
                                  </th>
                                  <th className="py-1.5 px-2 font-medium text-right">
                                    Raw Signal
                                  </th>
                                  <th className="py-1.5 px-2 font-medium text-right">
                                    Reported Conc.
                                  </th>
                                  <th className="py-1.5 px-2 font-medium">
                                    Basis / Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E5E7EB]">
                                {session.sampleMeasurements.map((m) => (
                                  <tr
                                    key={m.id}
                                    className={
                                      m.qualityStatus === 'excluded_by_user'
                                        ? 'opacity-50 line-through'
                                        : ''
                                    }
                                  >
                                    <td className="py-1 px-2 font-mono font-medium">
                                      {m.sampleId}
                                    </td>
                                    <td className="py-1 px-2 font-mono">
                                      {m.analyte || '—'}
                                    </td>
                                    <td className="py-1 px-2">{m.stage}</td>
                                    <td className="py-1 px-2 font-mono">
                                      {m.replicateId}
                                    </td>
                                    <td className="py-1 px-2 text-right font-mono tabular-nums">
                                      {formatScientificNumber(
                                        m.dilutionFactor,
                                        2
                                      )}
                                    </td>
                                    <td className="py-1 px-2 text-right font-mono tabular-nums">
                                      {formatScientificNumber(m.rawSignal, 1)}{' '}
                                      {m.signalUnit}
                                    </td>
                                    <td className="py-1 px-2 text-right font-mono tabular-nums">
                                      {formatQualifiedMeasurementValue(m)}
                                    </td>
                                    <td className="py-1 px-2 text-[#4B5563]">
                                      {m.reportedValueBasis ===
                                      'already_dilution_corrected'
                                        ? 'Pre-corrected'
                                        : 'As-measured'}{' '}
                                      · {m.valueQualifier ?? 'valid_numeric'} ·{' '}
                                      {m.qualityStatus || 'valid'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </section>
                      )}

                      {/* Dilution Records */}
                      {showDilutionRecords &&
                        session.dilutionRecords.length > 0 && (
                          <section className="print-avoid-break space-y-1.5">
                            <h4 className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                              Recorded Dilution Documentation —{' '}
                              {session.sessionId} (
                              {session.dilutionRecords.length})
                            </h4>
                            <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                              <thead>
                                <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                                  <th className="py-1 px-2 font-medium">
                                    Sample ID
                                  </th>
                                  <th className="py-1 px-2 font-medium">
                                    Stage
                                  </th>
                                  <th className="py-1 px-2 font-medium text-right">
                                    Factor (×)
                                  </th>
                                  <th className="py-1 px-2 font-medium text-right">
                                    Aliquot / Final (mL)
                                  </th>
                                  <th className="py-1 px-2 font-medium">
                                    Diluent &amp; Basis
                                  </th>
                                  <th className="py-1 px-2 font-medium">
                                    Verification
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E5E7EB]">
                                {session.dilutionRecords.map((d) => (
                                  <tr key={d.id}>
                                    <td className="py-1 px-2 font-mono font-medium">
                                      {d.sampleId}
                                    </td>
                                    <td className="py-1 px-2">{d.stage}</td>
                                    <td className="py-1 px-2 text-right font-mono tabular-nums">
                                      {formatScientificNumber(
                                        d.dilutionFactor,
                                        2
                                      )}
                                    </td>
                                    <td className="py-1 px-2 text-right font-mono tabular-nums">
                                      {formatScientificNumber(
                                        d.sourceVolumeMl,
                                        2
                                      )}{' '}
                                      /{' '}
                                      {formatScientificNumber(
                                        d.finalVolumeMl,
                                        2
                                      )}
                                    </td>
                                    <td className="py-1 px-2 text-[#4B5563]">
                                      {d.matrixDescription || '—'} ·{' '}
                                      {d.reportedValueBasis ===
                                      'already_dilution_corrected'
                                        ? 'Already corrected'
                                        : 'As-measured'}
                                    </td>
                                    <td className="py-1 px-2 text-[#4B5563]">
                                      {VERIFICATION_LABELS[d.verificationStatus]}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {dilutionDiagnostics.length > 0 && (
                              <div className="text-[10px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1">
                                Dilution diagnostics:{' '}
                                {dilutionDiagnostics.length} consistency
                                finding(s) flagged for review.
                              </div>
                            )}
                          </section>
                        )}

                      {/* Analytical Quality Review Summary */}
                      {showAnalyticalQuality && (
                        <section className="print-avoid-break border border-[#E5E7EB] p-2.5 bg-[#F8F9FA] text-[10.5px] space-y-1">
                          <div className="font-semibold text-[#111827]">
                            Analytical Quality Review Summary —{' '}
                            {session.sessionId} ({qualityIssues.length}{' '}
                            diagnostic finding(s))
                          </div>
                          {qualityIssues.length === 0 ? (
                            <div className="text-[#4B5563]">
                              No automated completeness or metadata diagnostics
                              triggered. Data completeness does not constitute
                              analytical method validation.
                            </div>
                          ) : (
                            <ul className="list-disc pl-4 space-y-0.5 text-[#374151]">
                              {qualityIssues.slice(0, 8).map((iss) => {
                                const rec = reviewMap.get(iss.issueKey);
                                return (
                                  <li key={iss.issueKey}>
                                    <span className="font-mono font-medium">
                                      [{rec?.status ?? 'Open'}]
                                    </span>{' '}
                                    <strong>{iss.recordLabel}</strong>:{' '}
                                    {iss.description}
                                    {rec?.researcherNotes
                                      ? ` — Note: ${rec.researcherNotes}`
                                      : ''}
                                  </li>
                                );
                              })}
                              {qualityIssues.length > 8 && (
                                <li className="text-[#6B7280]">
                                  …and {qualityIssues.length - 8} additional
                                  finding(s) recorded in the Quality Review
                                  workspace.
                                </li>
                              )}
                            </ul>
                          )}
                        </section>
                      )}
                    </div>
                  )
                )
              )}

              {/* Survey <-> Analytical Linkage Traceability Table */}
              {showSurveyAnalyticalLinks &&
                surveyAnalyticalLinkSummary.length > 0 && (
                  <section className="print-avoid-break space-y-1.5 pt-2 border-t border-[#E5E7EB]">
                    <h4 className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[#4B5563]">
                      6b. Survey–Analytical Measurement Linkage Traceability (
                      {surveyAnalyticalLinkSummary.length} active link(s))
                    </h4>
                    <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                      <thead>
                        <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                          <th className="py-1 px-2 font-medium">Survey</th>
                          <th className="py-1 px-2 font-medium">Stage</th>
                          <th className="py-1 px-2 font-medium text-right">
                            Survey Conc. (ppm)
                          </th>
                          <th className="py-1 px-2 font-medium">
                            Linked Analytical Sample
                          </th>
                          <th className="py-1 px-2 font-medium text-right">
                            Effective Analytical (ppm)
                          </th>
                          <th className="py-1 px-2 font-medium">Link Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                        {surveyAnalyticalLinkSummary.map((row, idx) => (
                          <tr
                            key={`${row.datasetId}-${row.sampleId}-${row.stage}-${idx}`}
                          >
                            <td className="py-1 px-2">
                              {row.datasetId} / {row.sampleId}
                            </td>
                            <td className="py-1 px-2 font-sans">{row.stage}</td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(row.surveyValue, 2)}
                            </td>
                            <td className="py-1 px-2">
                              {row.analyticalSampleId}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatScientificNumber(row.effectiveConc, 2)}
                            </td>
                            <td className="py-1 px-2 font-sans">
                              {row.sourceUnavailable
                                ? 'Source Unavailable'
                                : row.hasDiscrepancy
                                  ? 'Discrepancy Flagged'
                                  : 'Aligned'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
            </div>
          )}

        {/* Scientific References */}
        {reportConfig.includeScientificReferences &&
          allScientificReferences.length > 0 && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                7. Associated Scientific References
              </h3>
              <ul className="divide-y divide-[#E5E7EB] border border-[#D1D5DB] text-[11px]">
                {allScientificReferences.map((ref) => (
                  <li key={ref.id} className="p-2.5 space-y-0.5">
                    <div className="font-medium text-[#111827]">
                      {ref.title}{' '}
                      <span className="font-normal text-[#4B5563]">
                        — {ref.author}
                        {ref.year ? ` (${ref.year})` : ''}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-[#6B7280]">
                      {ref.sourceLabel} · {ref.verification} · DOI/URL:{' '}
                      {ref.doiOrUrl}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

        {/* Unified Sample Registry Summary */}
        {reportConfig.includeSampleRegistry &&
          sampleRegistrySummary.entries.length > 0 && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                7b. Unified Sample Registry Summary (
                {sampleRegistrySummary.entries.length} samples)
              </h3>
              <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                    <th className="py-1 px-2 font-medium">Sample Label</th>
                    <th className="py-1 px-2 font-medium">Source Modules</th>
                    <th className="py-1 px-2 font-medium text-right">
                      Survey Rows
                    </th>
                    <th className="py-1 px-2 font-medium text-right">
                      Analytical Rows
                    </th>
                    <th className="py-1 px-2 font-medium">Doc Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {sampleRegistrySummary.entries.slice(0, 24).map((entry) => (
                    <tr key={entry.sampleKey}>
                      <td className="py-1 px-2 font-mono font-medium">
                        {entry.sampleId}
                      </td>
                      <td className="py-1 px-2 text-[#4B5563]">
                        {entry.origin}
                      </td>
                      <td className="py-1 px-2 text-right font-mono tabular-nums">
                        {entry.surveyMeasurement ? 1 : 0}
                      </td>
                      <td className="py-1 px-2 text-right font-mono tabular-nums">
                        {entry.analyticalLinks.length}
                      </td>
                      <td className="py-1 px-2 text-[#374151]">
                        {entry.documentationStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sampleRegistrySummary.entries.length > 24 && (
                <div className="text-[10px] text-[#6B7280]">
                  Showing first 24 of {sampleRegistrySummary.entries.length}{' '}
                  tracked sample records (complete sample registry included in
                  JSON/ZIP export).
                </div>
              )}
            </section>
          )}

        {/* Bench Checklist & Milestones */}
        {reportConfig.includeBenchChecklist &&
          effectiveExperiment.benchChecklist.length > 0 && (
            <section className="print-avoid-break space-y-2">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                8. Research Milestones &amp; Documentation Checklist
              </h3>
              <ul className="text-[11.5px] space-y-1 border border-[#E5E7EB] p-3">
                {effectiveExperiment.benchChecklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span>
                      [{item.completed ? 'X' : ' '}] {item.label}
                    </span>
                    <span className="font-mono text-[10.5px] text-[#6B7280] shrink-0">
                      Plan: {item.plannedTime || '—'} · Act:{' '}
                      {item.actualCompletedAt
                        ? item.actualCompletedAt.slice(0, 16).replace('T', ' ')
                        : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        {/* Chronological Research Timeline */}
        {reportConfig.includeResearchTimeline && timelineSummary.length > 0 && (
          <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              8b. Chronological Research Timeline ({timelineSummary.length}{' '}
              events)
            </h3>
            <ul className="divide-y divide-[#E5E7EB] border border-[#D1D5DB] text-[10.5px]">
              {timelineSummary.slice(0, 15).map((ev) => (
                <li
                  key={ev.id}
                  className="px-2.5 py-1.5 flex items-baseline justify-between gap-3"
                >
                  <div>
                    <span className="font-mono text-[10px] text-[#6B7280]">
                      [{ev.timestamp.slice(0, 16).replace('T', ' ')}]
                    </span>{' '}
                    <strong>{ev.sourceLabel || ev.eventType}</strong> —{' '}
                    <span className="text-[#374151]">{ev.description}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#6B7280] shrink-0">
                    {ev.author}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Observations */}
        {reportConfig.includeObservations && (
          <section className="print-avoid-break space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              9. Observations &amp; Notes
            </h3>
            {effectiveExperiment.generalObservations && (
              <p className="text-[12px] text-[#111827] leading-relaxed">
                {effectiveExperiment.generalObservations}
              </p>
            )}
            {effectiveExperiment.observations.length === 0 ? (
              <p className="text-[12px] text-[#6B7280]">
                No timestamped observations recorded.
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E7EB] border-t border-b border-[#E5E7EB] text-[11.5px]">
                {effectiveExperiment.observations.map((obs) => (
                  <li key={obs.id} className="py-1.5">
                    <span className="font-mono text-[10.5px] text-[#6B7280]">
                      [{obs.timestamp.slice(0, 16).replace('T', ' ')}] (
                      {obs.category})
                    </span>{' '}
                    <span>{obs.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Researcher Conclusions */}
        {reportConfig.researcherConclusions?.trim() && (
          <section className="print-avoid-break space-y-1.5 pt-2 border-t border-[#D1D5DB]">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              10. Researcher Conclusions &amp; Summary
            </h3>
            <p className="text-[12px] text-[#111827] leading-relaxed whitespace-pre-line">
              {reportConfig.researcherConclusions}
            </p>
          </section>
        )}

        {/* Phase 6: Advanced Descriptive Statistics (Quartiles, IQR, MAD, Box-Plot Fences) */}
        {reportConfig.includeAdvancedStatistics && datasetReports.length > 0 && (
          <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              11. Advanced Descriptive Statistics (Quartiles, IQR, MAD &amp; 1.5×IQR Fences)
            </h3>
            <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
              <thead>
                <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                  <th className="py-1.5 px-2 font-medium">Dataset / Quantity</th>
                  <th className="py-1.5 px-2 font-medium text-right">Valid n</th>
                  <th className="py-1.5 px-2 font-medium text-right">Mean ± SD</th>
                  <th className="py-1.5 px-2 font-medium text-right">SEM</th>
                  <th className="py-1.5 px-2 font-medium text-right">Q1 (25%)</th>
                  <th className="py-1.5 px-2 font-medium text-right">Median (Q2)</th>
                  <th className="py-1.5 px-2 font-medium text-right">Q3 (75%)</th>
                  <th className="py-1.5 px-2 font-medium text-right">IQR</th>
                  <th className="py-1.5 px-2 font-medium text-right">MAD</th>
                  <th className="py-1.5 px-2 font-medium text-right">Outside 1.5×IQR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                {datasetReports.map(({ dataset }) => {
                  const advRes = computeAdvancedDescriptiveStatistics(
                    dataset.measurements.map((m) => ({
                      value:
                        dataset.mode === 'pzc'
                          ? m.measuredFinalPh !== null && m.measuredInitialPh !== null
                            ? m.measuredFinalPh - m.measuredInitialPh
                            : null
                          : m.recordedUptakeUmolM2,
                      qualityStatus: m.qualityStatus,
                    })),
                    { excludeFlagged: dataset.analysisConfig.excludeFlaggedInStats }
                  );
                  const adv = advRes.data;
                  return (
                    <tr key={dataset.id}>
                      <td className="py-1 px-2 font-sans">
                        <span className="font-mono font-semibold text-[#0F52BA]">
                          {dataset.datasetId}
                        </span>{' '}
                        ({dataset.mode === 'pzc' ? 'ΔpH (pH)' : 'Uptake (µmol/m²)'})
                      </td>
                      <td className="py-1 px-2 text-right">{adv?.validCount ?? 0}</td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.mean ?? null, 3)} ±{' '}
                        {formatScientificNumber(adv?.sampleStdDev ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.sem ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.q1 ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right font-semibold">
                        {formatScientificNumber(adv?.median ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.q3 ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.iqr ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {formatScientificNumber(adv?.mad ?? null, 3)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {adv?.boxPlotSummary.outsideFenceValues.length ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-[#6B7280]">
              Quartiles use Type 7 (R-7) linear interpolation. Sample SD (s) and SEM (s/√n) are reported distinctly and never conflated with expanded measurement uncertainty.
            </div>
          </section>
        )}

        {/* Phase 6: Recorded Measurement Uncertainty & Assumptions */}
        {reportConfig.includeMeasurementUncertainty &&
          (effectiveExperiment.uncertaintyRecords ?? []).length > 0 && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                12. Recorded Measurement Uncertainty &amp; Assumptions (
                {(effectiveExperiment.uncertaintyRecords ?? []).length} record(s))
              </h3>
              <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                    <th className="py-1.5 px-2 font-medium">Record / Quantity</th>
                    <th className="py-1.5 px-2 font-medium text-right">Value ± Uncertainty</th>
                    <th className="py-1.5 px-2 font-medium text-right">Rel. (%)</th>
                    <th className="py-1.5 px-2 font-medium">Uncertainty Type</th>
                    <th className="py-1.5 px-2 font-medium">Source &amp; Assumptions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {(effectiveExperiment.uncertaintyRecords ?? []).map((u) => {
                    const relPct =
                      u.value !== null && u.uncertaintyValue !== null
                        ? convertToRelativeUncertainty(u.value, u.uncertaintyValue)
                        : null;
                    return (
                      <tr key={u.id}>
                        <td className="py-1 px-2">
                          <div className="font-mono font-medium">{u.measurementLabel}</div>
                          <div className="text-[#4B5563]">{u.quantityName}</div>
                        </td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums">
                          {formatScientificNumber(u.value, 3)} ±{' '}
                          {formatScientificNumber(u.uncertaintyValue, 4)} {u.unit}
                        </td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums">
                          {relPct !== null
                            ? `${formatScientificNumber(relPct, 2)}%`
                            : '—'}
                        </td>
                        <td className="py-1 px-2 font-medium text-[#0F52BA]">
                          {formatUncertaintyTypeLabel(u.uncertaintyType, u.coverageFactor)}
                        </td>
                        <td className="py-1 px-2 text-[#4B5563]">
                          {u.source || '—'}
                          {u.conditions ? ` · ${u.conditions}` : ''}
                          {u.notes ? ` · ${u.notes}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[10px] text-[#6B7280]">
                Externally supplied and mathematically propagated uncertainty records preserve distinct uncertainty types (Sample SD, SEM, Standard Uncertainty u, Expanded Uncertainty U = k·u, Manufacturer Spec) and do not assert ISO/GUM laboratory accreditation.
              </div>
            </section>
          )}

        {/* Phase 6: Cross-Experiment & Research Matrix Summary */}
        {(reportConfig.includeCrossExperimentSummary ||
          reportConfig.includeResearchMatrix) &&
          crossExperimentPool.length > 0 && (
            <section className="print-avoid-break space-y-2 pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                13. Cross-Experiment Portfolio &amp; Research Comparison Matrix Summary
              </h3>
              {isViewingFinalized && (
                <div className="text-[10px] text-[#4B5563] bg-[#F8F9FA] border border-[#D1D5DB] px-2.5 py-1.5">
                  {hasFrozenComparisonSnapshots ? (
                    <>
                      <strong>Frozen Cross-Experiment Snapshots:</strong> This finalized report is locked to its bound experiment snapshot ({boundSnapshot ? `${boundSnapshot.snapshotId} · ${boundSnapshot.name}` : 'Frozen Snapshot'}) plus {Math.max(0, crossExperimentPool.length - 1)} frozen companion experiment snapshot(s) captured at finalization time. Subsequent edits or deletions in the live workspace will not alter this comparison.
                    </>
                  ) : (
                    <>
                      <strong>Historical Snapshot Isolation:</strong> This finalized report is locked to its bound experiment snapshot ({boundSnapshot ? `${boundSnapshot.snapshotId} · ${boundSnapshot.name}` : 'Frozen Snapshot'}). Unsnapshotted live workspace experiments are excluded from legacy finalized report views to guarantee historical reproducibility.
                    </>
                  )}
                </div>
              )}
              <table className="w-full text-left border-collapse text-[10px] border border-[#D1D5DB]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase text-[#4B5563]">
                    <th className="py-1.5 px-2 font-medium">Exp ID</th>
                    <th className="py-1.5 px-2 font-medium">Support / Precursor</th>
                    <th className="py-1.5 px-2 font-medium text-right">Target SL (m²/L)</th>
                    <th className="py-1.5 px-2 font-medium text-right">Survey Datasets</th>
                    <th className="py-1.5 px-2 font-medium text-right">Analytical Sessions</th>
                    <th className="py-1.5 px-2 font-medium">Provenance / Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {crossExperimentPool.map((exp) => (
                    <tr key={exp.uuid}>
                      <td className="py-1 px-2 font-mono font-semibold text-[#0F52BA]">
                        {exp.experimentId}
                      </td>
                      <td className="py-1 px-2 text-[#374151]">
                        {exp.batch.supportSnapshot?.supportData?.name ?? '—'} /{' '}
                        {exp.batch.precursorSnapshot?.precursorData?.name ?? '—'}
                      </td>
                      <td className="py-1 px-2 text-right font-mono tabular-nums">
                        {formatScientificNumber(exp.batch.plannedSurfaceLoadingM2L, 1)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono tabular-nums">
                        {exp.surveyDatasets.length}
                      </td>
                      <td className="py-1 px-2 text-right font-mono tabular-nums">
                        {(exp.analyticalSessions ?? []).length}
                      </td>
                      <td className="py-1 px-2 text-[#4B5563]">
                        {exp.isDemonstration ? 'Synthetic Demo' : 'Research Record'} ·{' '}
                        {exp.scientificReviewStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

        {/* Snapshot & Reproducibility Provenance Block */}
        {(reportConfig.includeSnapshotMetadata || activeFinalizedReport) && (
          <section className="print-avoid-break border border-[#D1D5DB] bg-[#F8F9FA] p-3 text-[10.5px] space-y-1">
            <div className="font-semibold uppercase tracking-[0.05em] text-[#4B5563]">
              Reproducibility &amp; Provenance Metadata
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[#374151]">
              <div>
                Software: SEA Workbench v{APP_VERSION} (Schema v
                {WORKSPACE_SCHEMA_VERSION})
              </div>
              <div>Engine: {CALC_ENGINE_VERSION}</div>
              <div>
                Report State:{' '}
                {activeFinalizedReport
                  ? `Finalized v${activeFinalizedReport.versionNumber} (${activeFinalizedReport.snapshotId})`
                  : 'Live Working Report'}
              </div>
              <div>
                Snapshot Captured:{' '}
                {boundSnapshot
                  ? `${boundSnapshot.capturedAt.slice(0, 16).replace('T', ' ')} by ${boundSnapshot.researcher}`
                  : 'Live state (unfrozen)'}
              </div>
            </div>
            <div className="text-[10px] text-[#6B7280]">
              Snapshots and finalized reports preserve point-in-time workspace
              state inside local browser storage or exported JSON/ZIP packages.
              They do not constitute regulated, tamper-proof electronic
              signatures or analytical method validation.
            </div>
          </section>
        )}

        {/* Footer */}
        {reportConfig.includePageNumbers !== false && (
          <footer className="pt-4 border-t border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#6B7280] print-avoid-break">
            <span>{reportConfig.reportFooterNote}</span>
            <span className="font-mono">
              SEA Workbench v{APP_VERSION} · {effectiveExperiment.experimentId}
              {activeFinalizedReport
                ? ` · Finalized v${activeFinalizedReport.versionNumber}`
                : ''}
            </span>
          </footer>
        )}
      </article>
    </div>
  );
}

'use client';

import React, { useMemo } from 'react';
import { Printer } from 'lucide-react';
import {
  APP_VERSION,
  Experiment,
  FigureConfiguration,
  ReportConfiguration,
  ReportMode,
  ResearchProject,
  SurveyDataset,
} from '../../domain/models/types';
import {
  analyzeSurveyDataset,
  buildDatasetComparison,
  evaluateAnalyticalBoundary,
  evaluateBatchSynthesisBoundary,
  evaluateSurveyCompleteness,
  formatScientificNumber,
  formatWithScientificNotation,
} from '../../domain/calculations/seaMath';
import { ScientificFigureCanvas } from '../../components/charts/ScientificFigureCanvas';
import { ANNOTATION_CATEGORY_LABELS } from '../uptake-survey/ResearchInterpretationTab';
import {
  Button,
  PROVENANCE_LABELS,
  VERIFICATION_LABELS,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

export function LabReportWorkspace({
  experiment,
  allExperiments = [],
  projects,
  onUpdateReportConfig,
}: {
  experiment: Experiment;
  allExperiments?: Experiment[];
  projects: ResearchProject[];
  onUpdateReportConfig: (patch: Partial<ReportConfiguration>) => void;
}) {
  const { reportConfig } = experiment;
  const project = experiment.projectId
    ? projects.find((p) => p.id === experiment.projectId) ?? null
    : null;
  const supportSnap = experiment.batch.supportSnapshot?.supportData ?? null;
  const precursorSnap = experiment.batch.precursorSnapshot?.precursorData ?? null;

  const calcBoundary = useMemo(
    () => evaluateBatchSynthesisBoundary(experiment.batch),
    [experiment.batch]
  );

  // Resolve selected survey datasets (default to active dataset if empty)
  const selectedDatasets: SurveyDataset[] = useMemo(() => {
    const allDs = experiment.surveyDatasets ?? [];
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
      allDs.find((d) => d.id === experiment.activeSurveyDatasetId) ?? allDs[0];
    return active ? [active] : [];
  }, [
    experiment.surveyDatasets,
    experiment.activeSurveyDatasetId,
    reportConfig.selectedSurveyDatasetIds,
  ]);

  // Precompute shared analysis & completeness for every selected dataset (single source of truth)
  const datasetReports = useMemo(() => {
    return selectedDatasets.map((ds) => ({
      dataset: ds,
      analysis: analyzeSurveyDataset(ds.measurements, {
        excludeFlagged: ds.analysisConfig.excludeFlaggedInStats,
      }),
      completeness: evaluateSurveyCompleteness(
        ds,
        experiment.instrumentMeasurements
      ),
    }));
  }, [selectedDatasets, experiment.instrumentMeasurements]);

  // All saved figures across selected datasets
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

  // Comparative summary using shared buildDatasetComparison
  const comparativeSummary = useMemo(() => {
    const refs = experiment.datasetComparison?.selectedRefs ?? [];
    const expPool = allExperiments.length > 0 ? allExperiments : [experiment];
    const items: Array<{ experiment: Experiment; dataset: SurveyDataset }> = [];
    for (const ref of refs) {
      const exp = expPool.find((e) => e.uuid === ref.experimentUuid);
      const ds = exp?.surveyDatasets.find((d) => d.id === ref.datasetId);
      if (exp && ds) items.push({ experiment: exp, dataset: ds });
    }
    if (items.length < 2 && selectedDatasets.length >= 2) {
      return buildDatasetComparison(
        selectedDatasets.map((ds) => ({ experiment, dataset: ds }))
      );
    }
    return buildDatasetComparison(items);
  }, [
    experiment,
    allExperiments,
    selectedDatasets,
  ]);

  const analyticalBoundary = useMemo(
    () =>
      evaluateAnalyticalBoundary(
        experiment.calibrationStandards,
        experiment.instrumentMeasurements,
        experiment.analyticalConfig
      ),
    [
      experiment.calibrationStandards,
      experiment.instrumentMeasurements,
      experiment.analyticalConfig,
    ]
  );

  // Deduplicated scientific references from material snapshots
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

  const handleModeChange = (mode: ReportMode) => {
    onUpdateReportConfig({ mode });
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const toggleReportDataset = (dsId: string) => {
    const current = selectedDatasets.map((d) => d.id);
    const exists = current.includes(dsId);
    const next = exists
      ? current.filter((id) => id !== dsId)
      : [...current, dsId];
    onUpdateReportConfig({ selectedSurveyDatasetIds: next });
  };

  const toggleReportFigure = (figId: string) => {
    const current = reportConfig.selectedFigureIds ?? [];
    const exists = current.includes(figId);
    const next = exists
      ? current.filter((id) => id !== figId)
      : [...current, figId];
    onUpdateReportConfig({ selectedFigureIds: next });
  };

  const calXUnit =
    experiment.calibrationStandards[0]?.unit ||
    experiment.analyticalConfig.calibrationUnits ||
    'ppm';
  const calYUnit = experiment.calibrationStandards[0]?.responseUnit || 'cps';

  return (
    <div className="space-y-5">
      {/* Screen-only toolbar */}
      <div className="no-print space-y-4">
        <WorkspaceHeader
          title="Lab Report (A4)"
          description="Publication-grade A4 planning sheet and post-experiment research report bound directly to selected survey datasets, shared statistical analyses, saved figures, and researcher interpretations."
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
                Selected Survey Series:{' '}
                <strong className="font-mono text-[#111827]">
                  {selectedDatasets.map((d) => d.datasetId).join(', ') || 'None'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Review Status:{' '}
                <strong className="text-[#111827]">
                  {experiment.scientificReviewStatus}
                </strong>
              </span>
            </>
          }
          actions={
            <>
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
                  className={`px-3 py-1 text-[12px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                    reportConfig.mode === 'pre-experiment'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  Pre-Experiment Planning Sheet
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportConfig.mode === 'post-experiment'}
                  onClick={() => handleModeChange('post-experiment')}
                  className={`px-3 py-1 text-[12px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                    reportConfig.mode === 'post-experiment'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  Post-Experiment Research Report
                </button>
              </div>
              <Button variant="primary" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                Print / Save as PDF
              </Button>
            </>
          }
        />

        {/* Report Section & Dataset / Figure Selection Controls */}
        <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#4B5563]">
              {[
                { key: 'includeMaterialSnapshots', label: 'Materials' },
                { key: 'includeBatchRecords', label: 'Batch Records' },
                { key: 'includeSurveyOverview', label: 'Survey Overview' },
                { key: 'includeSurveyTable', label: 'Survey Tables' },
                { key: 'includeStatisticalSummaries', label: 'Stats & Replicates' },
                { key: 'includeSurveyFigure', label: 'Figures' },
                { key: 'includeComparativeSummary', label: 'Comparative Summary' },
                { key: 'includeDataQualityLimitations', label: 'Data Quality & Limits' },
                { key: 'includeResearchInterpretations', label: 'Interpretations' },
                { key: 'includeAnalyticalRecords', label: 'Analytical' },
                { key: 'includeRegressionSummary', label: 'OLS Regression' },
                { key: 'includeScientificReferences', label: 'References' },
                { key: 'includeObservations', label: 'Lab Log Notes' },
                { key: 'includeBenchChecklist', label: 'Checklist' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="inline-flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(
                      reportConfig[opt.key as keyof ReportConfiguration]
                    )}
                    onChange={(e) =>
                      onUpdateReportConfig({ [opt.key]: e.target.checked })
                    }
                    className="accent-[#0F52BA]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            <div className="w-full sm:w-64">
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

          {/* Dataset & Saved Figure Selectors */}
          {experiment.surveyDatasets.length > 0 && (
            <div className="pt-3 border-t border-[#E5E7EB] grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] mb-1.5">
                  Included Survey Datasets ({selectedDatasets.length} of{' '}
                  {experiment.surveyDatasets.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {experiment.surveyDatasets.map((ds) => {
                    const checked = selectedDatasets.some((s) => s.id === ds.id);
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
        </div>
      </div>

      {/* A4 Document Sheet */}
      <article
        aria-label="A4 Laboratory Report Preview"
        className="print-sheet mx-auto bg-white border border-[#D1D5DB] rounded-[2px] w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-10 text-[#111827] space-y-6"
      >
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
              {reportConfig.mode === 'pre-experiment'
                ? 'Pre-Experiment Planning Sheet'
                : 'Post-Experiment Research Report'}
            </h2>
            <p className="text-[13.5px] font-medium text-[#111827] mt-1.5">
              {experiment.title}
            </p>
          </div>
          <div className="text-right font-mono tabular-nums text-[11.5px] text-[#4B5563] shrink-0 space-y-0.5">
            <div className="text-[13px] font-semibold text-[#0F52BA]">
              {experiment.experimentId}
            </div>
            <div>Type: {experiment.type}</div>
            <div>Status: {experiment.status}</div>
            <div>Generated: {generatedAt}</div>
          </div>
        </header>

        {/* Demonstration / Review Status Banner */}
        {(experiment.isDemonstration ||
          experiment.scientificReviewStatus !== 'Reviewed') && (
          <div className="p-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-[11.5px] text-[#92400E] print-avoid-break">
            <strong>Scientific Review &amp; Provenance Notice:</strong> Review Status:{' '}
            <span className="font-mono">{experiment.scientificReviewStatus}</span>.{' '}
            {experiment.isDemonstration
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
            <div className="font-medium mt-0.5">{experiment.researcher || '—'}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
              Experiment Date
            </div>
            <div className="font-mono tabular-nums mt-0.5">
              {experiment.experimentDate || '—'}
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
              v{experiment.dataVersion} · App {APP_VERSION}
            </div>
          </div>
        </section>

        {/* Research Objective */}
        <section className="print-avoid-break">
          <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563] mb-1.5">
            1. Research Objective
          </h3>
          <p className="text-[12.5px] text-[#111827] leading-relaxed">
            {experiment.objective || 'No research objective recorded.'}
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
                      BET: {formatScientificNumber(supportSnap.betSurfaceArea.value, 1)}{' '}
                      {supportSnap.betSurfaceArea.unit} · PZC:{' '}
                      {formatScientificNumber(supportSnap.pzc.value, 2)}{' '}
                      {supportSnap.pzc.unit}
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Verification: {VERIFICATION_LABELS[supportSnap.verificationStatus]} ·
                      Snapshot: {experiment.batch.supportSnapshot?.capturedAt.slice(0, 10)}
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
                      MW: {formatScientificNumber(precursorSnap.molarMass.value, 2)}{' '}
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
                      Snapshot: {experiment.batch.precursorSnapshot?.capturedAt.slice(0, 10)}
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
                    planned: experiment.batch.plannedSupportMassG,
                    actual: experiment.batch.actualSupportMassG,
                    unit: 'g',
                    d: 3,
                  },
                  {
                    name: 'Solution Volume',
                    planned: experiment.batch.plannedSolutionVolumeMl,
                    actual: experiment.batch.actualSolutionVolumeMl,
                    unit: 'mL',
                    d: 2,
                  },
                  {
                    name: 'Surface Loading (SL)',
                    planned: experiment.batch.plannedSurfaceLoadingM2L,
                    actual: experiment.batch.actualSurfaceLoadingM2L,
                    unit: 'm²/L',
                    d: 1,
                  },
                  {
                    name: 'Metal Loading',
                    planned: experiment.batch.plannedTargetMetalLoadingWtPct,
                    actual: experiment.batch.actualMeasuredMetalLoadingWtPct,
                    unit: 'wt%',
                    d: 2,
                  },
                  {
                    name: 'Initial pH',
                    planned: experiment.batch.plannedInitialPh,
                    actual: experiment.batch.actualInitialPh,
                    unit: 'pH',
                    d: 2,
                  },
                  {
                    name: 'Final pH',
                    planned: null,
                    actual: experiment.batch.actualFinalPh,
                    unit: 'pH',
                    d: 2,
                  },
                  {
                    name: 'Precursor Concentration',
                    planned: experiment.batch.plannedPrecursorConcPpm,
                    actual: experiment.batch.actualPrecursorConcPpm,
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
                        : PROVENANCE_LABELS[experiment.batch.dataProvenance]}
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
                    experimentId={experiment.experimentId}
                    referencePzcMarkers={dataset.referencePzcMarkers}
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
                          experimentId={experiment.experimentId}
                          referencePzcMarkers={dataset.referencePzcMarkers}
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

        {/* Analytical Summary */}
        {reportConfig.includeAnalyticalRecords &&
          reportConfig.mode === 'post-experiment' && (
            <section className="space-y-2 print-avoid-break pt-2 border-t border-[#D1D5DB]">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                6. Analytical Records ({experiment.analyticalConfig.instrumentType} ·{' '}
                {experiment.analyticalConfig.analyteElement || 'Analyte Unspecified'})
              </h3>
              {experiment.instrumentMeasurements.length === 0 ? (
                <p className="text-[12px] text-[#6B7280]">
                  No analytical instrument sample records logged.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-[10.5px] border border-[#D1D5DB]">
                  <thead>
                    <tr className="bg-[#F3F4F6] border-b border-[#D1D5DB] text-[9.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                      <th className="py-1.5 px-2 font-medium">Sample ID</th>
                      <th className="py-1.5 px-2 font-medium">Stage</th>
                      <th className="py-1.5 px-2 font-medium">Rep</th>
                      <th className="py-1.5 px-2 font-medium text-right">
                        Dilution (×)
                      </th>
                      <th className="py-1.5 px-2 font-medium text-right">
                        Raw Signal
                      </th>
                      <th className="py-1.5 px-2 font-medium text-right">
                        Reported Conc.
                      </th>
                      <th className="py-1.5 px-2 font-medium">Provenance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {experiment.instrumentMeasurements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-1 px-2 font-mono font-medium">
                          {m.sampleId}
                        </td>
                        <td className="py-1 px-2">{m.stage}</td>
                        <td className="py-1 px-2 font-mono">{m.replicateId}</td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums">
                          {formatScientificNumber(m.dilutionFactor, 1)}
                        </td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums">
                          {formatScientificNumber(m.rawSignal, 1)} {m.signalUnit}
                        </td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums">
                          {formatScientificNumber(m.reportedConc, 2)} {m.concUnit}
                        </td>
                        <td className="py-1 px-2 text-[#4B5563]">
                          {PROVENANCE_LABELS[m.provenance]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

        {/* Exploratory Calibration OLS Regression Summary */}
        {reportConfig.includeRegressionSummary &&
          reportConfig.mode === 'post-experiment' &&
          experiment.calibrationStandards.length > 0 && (
            <section className="space-y-2 print-avoid-break">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                6b. Exploratory Calibration OLS Linear Regression
              </h3>
              <div className="border border-[#D1D5DB] p-3 text-[11px] space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      Slope ({calYUnit}/{calXUnit})
                    </div>
                    <div className="font-semibold">
                      {formatWithScientificNotation(
                        analyticalBoundary.calibrationRegression.value.slope,
                        { fixedDecimals: 4 }
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      Intercept ({calYUnit})
                    </div>
                    <div>
                      {formatWithScientificNotation(
                        analyticalBoundary.calibrationRegression.value.intercept,
                        { fixedDecimals: 4 }
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      R²
                    </div>
                    <div className="font-semibold">
                      {analyticalBoundary.calibrationRegression.value.rSquared !==
                      null
                        ? analyticalBoundary.calibrationRegression.value.rSquared.toFixed(
                            6
                          )
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      RSS
                    </div>
                    <div>
                      {formatWithScientificNotation(
                        analyticalBoundary.calibrationRegression.value.rss,
                        { fixedDecimals: 4 }
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      SEE ({calYUnit})
                    </div>
                    <div>
                      {formatWithScientificNotation(
                        analyticalBoundary.calibrationRegression.value
                          .standardErrorOfEstimate,
                        { fixedDecimals: 4 }
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-[#6B7280]">
                      Included n
                    </div>
                    <div>
                      {analyticalBoundary.calibrationRegression.value.validCount}
                    </div>
                  </div>
                </div>
                <div className="text-[10.5px] text-[#92400E]">
                  Exploratory unweighted OLS regression (free intercept) for
                  general numerical inspection only; does not constitute
                  certified analytical method validation.
                </div>
              </div>
            </section>
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

        {/* Bench Checklist */}
        {reportConfig.includeBenchChecklist &&
          experiment.benchChecklist.length > 0 && (
            <section className="print-avoid-break space-y-2">
              <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
                8. Experiment Documentation Checklist
              </h3>
              <ul className="text-[11.5px] space-y-1 border border-[#E5E7EB] p-3">
                {experiment.benchChecklist.map((item) => (
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

        {/* Observations */}
        {reportConfig.includeObservations && (
          <section className="print-avoid-break space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-[#4B5563]">
              9. Observations &amp; Notes
            </h3>
            {experiment.generalObservations && (
              <p className="text-[12px] text-[#111827] leading-relaxed">
                {experiment.generalObservations}
              </p>
            )}
            {experiment.observations.length === 0 ? (
              <p className="text-[12px] text-[#6B7280]">
                No timestamped observations recorded.
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E7EB] border-t border-b border-[#E5E7EB] text-[11.5px]">
                {experiment.observations.map((obs) => (
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

        {/* Footer */}
        <footer className="pt-4 border-t border-[#D1D5DB] flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#6B7280] print-avoid-break">
          <span>{reportConfig.reportFooterNote}</span>
          <span className="font-mono">
            SEA Workbench v{APP_VERSION} · {experiment.experimentId}
          </span>
        </footer>
      </article>
    </div>
  );
}

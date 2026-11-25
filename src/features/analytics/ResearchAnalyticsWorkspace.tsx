'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Filter,
  GitCompare,
  Scale,
  Table2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  Bookmark,
  RefreshCw,
  ArrowRight,
  Layers,
  Activity,
  Calculator,
  FileSpreadsheet,
  Camera,
} from 'lucide-react';
import {
  CALC_ENGINE_VERSION,
  ComparisonQuantityKey,
  DataProvenance,
  ErrorBarMode,
  ExperimentStatus,
  ExperimentType,
  ResearchAnalyticsTab,
  ResearchMatrixColumnId,
  ResearchMatrixGranularity,
  ResearchScopeFilter,
  ResearchScopeMode,
  ScientificReviewStatus,
  UncertaintyCorrelationPair,
  UncertaintyPropagationTerm,
  UncertaintyRecordTargetKind,
  UncertaintyType,
} from '../../domain/models/types';
import {
  DEFAULT_RESEARCH_MATRIX_COLUMNS,
  RESEARCH_MATRIX_COLUMN_LABELS,
  buildResearchMatrixRows,
  computeAdvancedDescriptiveStatistics,
  computeExploratoryCorrelation,
  computePairedDifferences,
  computeResearchScopeContentHash,
  createDefaultResearchScopeFilter,
  evaluateCrossExperimentCompatibility,
  evaluateResearchAnalysisStaleness,
  exportResearchMatrixCsv,
  exportResearchMatrixJson,
  exportUncertaintyRecordsCsv,
  filterWorkspaceByResearchScope,
  formatMatrixCellValue,
  formatUncertaintyTypeLabel,
  getComparisonQuantityMeta,
  propagateLinearCombinationUncertainty,
  propagateMultiplicativeUncertainty,
} from '../../domain/calculations/seaMath';
import { triggerTextDownload } from '../../services/import-export/backup';
import { useWorkbenchStore } from '../../store/useWorkbenchStore';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  NoticeBanner,
  Select,
} from '../../components/ui/Primitives';

const QUANTITY_OPTIONS: Array<{
  key: ComparisonQuantityKey;
  label: string;
}> = [
  { key: 'uptake_umol_m2', label: 'Recorded Metal Uptake (Γ, µmol/m²)' },
  { key: 'final_ph', label: 'Measured Final pH (pH_f)' },
  { key: 'delta_ph', label: 'Measured pH Shift (ΔpH = pH_f − pH_i)' },
  { key: 'initial_conc_ppm', label: 'Initial Metal Concentration (C_i, ppm)' },
  { key: 'final_conc_ppm', label: 'Final Metal Concentration (C_f, ppm)' },
  { key: 'reported_conc', label: 'Analytical Reported Concentration (ppm)' },
  { key: 'surface_loading_m2_l', label: 'Batch Surface Loading (SL, m²/L)' },
  { key: 'metal_loading_wt_pct', label: 'Batch Measured Metal Loading (wt%)' },
];

const UNCERTAINTY_TYPES: Array<{ value: UncertaintyType; label: string }> = [
  { value: 'sample_sd', label: 'Sample Standard Deviation (SD)' },
  { value: 'sem', label: 'Standard Error of the Mean (SEM)' },
  {
    value: 'standard_uncertainty',
    label: 'Combined / Standard Uncertainty (u_c, 1σ)',
  },
  {
    value: 'expanded_uncertainty',
    label: 'Expanded Uncertainty (U = k·u_c)',
  },
  {
    value: 'researcher_reported',
    label: 'Researcher-Reported Uncertainty',
  },
  {
    value: 'manufacturer_reported',
    label: 'Manufacturer / Certificate Uncertainty',
  },
  { value: 'unknown', label: 'Unspecified / Unknown Uncertainty Type' },
];

export function ResearchAnalyticsWorkspace() {
  const experiments = useWorkbenchStore((s) => s.experiments);
  const projects = useWorkbenchStore((s) => s.projects);
  const supports = useWorkbenchStore((s) => s.supports);
  const precursors = useWorkbenchStore((s) => s.precursors);
  const activeExperimentUuid = useWorkbenchStore((s) => s.activeExperimentUuid);
  const navigationContext = useWorkbenchStore((s) => s.navigationContext);
  const setAnalyticsTab = useWorkbenchStore((s) => s.setAnalyticsTab);
  const navigateToContext = useWorkbenchStore((s) => s.navigateToContext);
  const getSerializableWorkspace = useWorkbenchStore(
    (s) => s.getSerializableWorkspace
  );

  const researchComparisonConfigs = useWorkbenchStore(
    (s) => s.researchComparisonConfigs
  );
  const researchMatrixConfigs = useWorkbenchStore(
    (s) => s.researchMatrixConfigs
  );
  const researchAnalysisSnapshots = useWorkbenchStore(
    (s) => s.researchAnalysisSnapshots
  );
  const addUncertaintyRecord = useWorkbenchStore((s) => s.addUncertaintyRecord);
  const deleteUncertaintyRecord = useWorkbenchStore(
    (s) => s.deleteUncertaintyRecord
  );
  const saveResearchComparisonConfig = useWorkbenchStore(
    (s) => s.saveResearchComparisonConfig
  );
  const deleteResearchComparisonConfig = useWorkbenchStore(
    (s) => s.deleteResearchComparisonConfig
  );
  const saveResearchMatrixConfig = useWorkbenchStore(
    (s) => s.saveResearchMatrixConfig
  );
  const deleteResearchMatrixConfig = useWorkbenchStore(
    (s) => s.deleteResearchMatrixConfig
  );
  const saveResearchAnalysisSnapshot = useWorkbenchStore(
    (s) => s.saveResearchAnalysisSnapshot
  );
  const deleteResearchAnalysisSnapshot = useWorkbenchStore(
    (s) => s.deleteResearchAnalysisSnapshot
  );

  const activeTab: ResearchAnalyticsTab =
    navigationContext.analyticsTab || 'overview';

  // Research Scope Filter State — defaults to includeSyntheticDemo: false per Phase 6 §5.2
  const [scope, setScope] = useState<ResearchScopeFilter>(() =>
    createDefaultResearchScopeFilter(false)
  );
  const [showAdvancedScopeFilters, setShowAdvancedScopeFilters] =
    useState(false);

  // Cross-Experiment Comparison State
  const [comparisonQuantity, setComparisonQuantity] =
    useState<ComparisonQuantityKey>('uptake_umol_m2');
  const [excludeFlaggedInComparison, setExcludeFlaggedInComparison] =
    useState(true);
  const [comparisonErrorBarMode, setComparisonErrorBarMode] =
    useState<ErrorBarMode>('sd');
  const [comparisonPresetName, setComparisonPresetName] = useState('');
  const [comparisonPresetDesc, setComparisonPresetDesc] = useState('');

  // Exploratory Correlation & Paired Difference Inspector State
  const [corrQuantityX, setCorrQuantityX] = useState<
    'initialPh' | 'finalPh' | 'initialConc' | 'finalConc'
  >('finalPh');
  const [corrQuantityY, setCorrQuantityY] = useState<
    'uptake' | 'deltaPh' | 'finalConc'
  >('uptake');

  // Measurement Uncertainty Recording Form State
  const [targetExpUuidForUnc, setTargetExpUuidForUnc] = useState<string>(
    () => activeExperimentUuid || experiments[0]?.uuid || ''
  );
  const [uncTargetKind, setUncTargetKind] =
    useState<UncertaintyRecordTargetKind>('survey_measurement');
  const [uncMeasurementId, setUncMeasurementId] = useState('');
  const [uncMeasurementLabel, setUncMeasurementLabel] = useState('');
  const [uncQuantityName, setUncQuantityName] = useState(
    'Recorded Metal Uptake (Γ)'
  );
  const [uncValue, setUncValue] = useState('1.52');
  const [uncUnit, setUncUnit] = useState('µmol/m²');
  const [uncAmount, setUncAmount] = useState('0.07');
  const [uncAmountUnit, setUncAmountUnit] = useState('µmol/m²');
  const [uncType, setUncType] = useState<UncertaintyType>(
    'standard_uncertainty'
  );
  const [uncCoverageK, setUncCoverageK] = useState('1');
  const [uncSource, setUncSource] = useState(
    'External calibration & gravimetric balance propagation'
  );
  const [uncReference, setUncReference] = useState('');
  const [uncConditions, setUncConditions] = useState('22 °C, 1000 m²/L');
  const [uncNotes, setUncNotes] = useState('');

  // Mathematical Uncertainty Propagation Calculator State
  const [propFormulaMode, setPropFormulaMode] = useState<
    'linear' | 'multiplicative'
  >('linear');
  const [propMultiplicativeFactor, setPropMultiplicativeFactor] =
    useState('1.0');
  const [propUnit, setPropUnit] = useState('ppm');
  const [propCoverageK, setPropCoverageK] = useState('2');
  const [propCorrelationR12, setPropCorrelationR12] = useState('0');
  const [propTerms, setPropTerms] = useState<UncertaintyPropagationTerm[]>([
    {
      id: 'term-1',
      label: 'Initial Metal Concentration (C_i)',
      symbol: 'x₁',
      value: 200.0,
      unit: 'ppm',
      standardUncertainty: 1.8,
      uncertaintyType: 'standard_uncertainty',
      coefficientOrExponent: 1.0,
      sourceNote: 'ICP-OES initial stock assay standard uncertainty',
    },
    {
      id: 'term-2',
      label: 'Final Supernatant Concentration (C_f)',
      symbol: 'x₂',
      value: 108.4,
      unit: 'ppm',
      standardUncertainty: 1.2,
      uncertaintyType: 'standard_uncertainty',
      coefficientOrExponent: -1.0,
      sourceNote: 'ICP-OES equilibrium filtrate standard uncertainty',
    },
  ]);

  // Research Comparison Matrix State
  const [matrixGranularity, setMatrixGranularity] =
    useState<ResearchMatrixGranularity>('survey_dataset');
  const [matrixQuantity, setMatrixQuantity] =
    useState<ComparisonQuantityKey>('uptake_umol_m2');
  const [matrixColumns, setMatrixColumns] = useState<ResearchMatrixColumnId[]>(
    () => [...DEFAULT_RESEARCH_MATRIX_COLUMNS]
  );
  const [matrixSortCol, setMatrixSortCol] =
    useState<ResearchMatrixColumnId>('recordId');
  const [matrixSortDir, setMatrixSortDir] = useState<'asc' | 'desc'>('asc');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixPresetName, setMatrixPresetName] = useState('');
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const workspace = useMemo(
    () => getSerializableWorkspace(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      experiments,
      projects,
      supports,
      precursors,
      researchComparisonConfigs,
      researchMatrixConfigs,
      researchAnalysisSnapshots,
      getSerializableWorkspace,
    ]
  );

  const scopeSummary = useMemo(
    () => filterWorkspaceByResearchScope(workspace, scope),
    [workspace, scope]
  );

  const compatibilityReport = useMemo(
    () =>
      evaluateCrossExperimentCompatibility(
        workspace,
        scope,
        comparisonQuantity,
        {
          excludeFlagged: excludeFlaggedInComparison,
        }
      ),
    [workspace, scope, comparisonQuantity, excludeFlaggedInComparison]
  );

  // Paired observations & exploratory correlation across active scope survey datasets
  const pairedAndCorrelationSummary = useMemo(() => {
    const surveyMeasurements = scopeSummary.filteredSurveyDatasets.flatMap(
      ({ dataset }) =>
        (dataset.measurements || []).filter(
          (m) => m.qualityStatus !== 'excluded_by_user'
        )
    );
    const containsSynthetic = scopeSummary.containsSynthetic;

    const phPairs = surveyMeasurements.map((m) => ({
      id: m.id,
      x: m.measuredInitialPh,
      y: m.measuredFinalPh,
    }));
    const concPairs = surveyMeasurements.map((m) => ({
      id: m.id,
      x: m.initialConcPpm,
      y: m.finalConcPpm,
    }));

    const phDiffs = computePairedDifferences(phPairs, {
      unit: 'pH',
      containsSynthetic,
    });
    const concDiffs = computePairedDifferences(concPairs, {
      unit: 'ppm',
      containsSynthetic,
    });

    const corrPairs = surveyMeasurements.map((m) => {
      const x =
        corrQuantityX === 'initialPh'
          ? m.measuredInitialPh
          : corrQuantityX === 'finalPh'
            ? m.measuredFinalPh
            : corrQuantityX === 'initialConc'
              ? m.initialConcPpm
              : m.finalConcPpm;
      const y =
        corrQuantityY === 'uptake'
          ? m.recordedUptakeUmolM2
          : corrQuantityY === 'deltaPh'
            ? m.measuredFinalPh !== null && m.measuredInitialPh !== null
              ? m.measuredFinalPh - m.measuredInitialPh
              : null
            : m.finalConcPpm;
      return { id: m.id, x, y };
    });

    const correlation = computeExploratoryCorrelation(corrPairs, {
      containsSynthetic,
    });

    return {
      totalSurveyRows: surveyMeasurements.length,
      phDiffs,
      concDiffs,
      correlation,
    };
  }, [scopeSummary, corrQuantityX, corrQuantityY]);

  // Propagation result
  const propagationResult = useMemo(() => {
    const kVal = Number(propCoverageK);
    const coverageFactor = Number.isFinite(kVal) && kVal > 0 ? kVal : null;
    const r12 = Number(propCorrelationR12);
    const correlations: UncertaintyCorrelationPair[] =
      propTerms.length >= 2 && Number.isFinite(r12) && r12 !== 0
        ? [
            {
              termIdA: propTerms[0].id,
              termIdB: propTerms[1].id,
              correlationCoefficient: Math.max(-1, Math.min(1, r12)),
            },
          ]
        : [];

    if (propFormulaMode === 'linear') {
      return propagateLinearCombinationUncertainty(propTerms, correlations, {
        coverageFactor,
        unit: propUnit,
        containsSynthetic: scopeSummary.containsSynthetic,
      });
    }
    const factor = Number(propMultiplicativeFactor);
    return propagateMultiplicativeUncertainty(
      Number.isFinite(factor) ? factor : 1,
      propTerms,
      correlations,
      {
        coverageFactor,
        unit: propUnit,
        containsSynthetic: scopeSummary.containsSynthetic,
      }
    );
  }, [
    propFormulaMode,
    propMultiplicativeFactor,
    propTerms,
    propCoverageK,
    propCorrelationR12,
    propUnit,
    scopeSummary.containsSynthetic,
  ]);

  // Matrix rows
  const matrixRows = useMemo(() => {
    const rawRows = buildResearchMatrixRows(
      workspace,
      scope,
      matrixGranularity,
      matrixQuantity
    );
    const q = matrixSearch.trim().toLowerCase();
    const filtered = q
      ? rawRows.filter(
          (r) =>
            r.recordId.toLowerCase().includes(q) ||
            r.title.toLowerCase().includes(q) ||
            r.supportName.toLowerCase().includes(q) ||
            r.precursorName.toLowerCase().includes(q) ||
            r.projectCode.toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q)
        )
      : rawRows;

    return [...filtered].sort((a, b) => {
      const va = formatMatrixCellValue(a, matrixSortCol);
      const vb = formatMatrixCellValue(b, matrixSortCol);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return matrixSortDir === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb));
      return matrixSortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    workspace,
    scope,
    matrixGranularity,
    matrixQuantity,
    matrixSearch,
    matrixSortCol,
    matrixSortDir,
  ]);

  // All uncertainty records in current scope
  const scopedUncertaintyRecords = useMemo(() => {
    return scopeSummary.filteredExperiments.flatMap((exp) =>
      (exp.uncertaintyRecords ?? []).map((u) => ({
        ...u,
        experimentIdLabel: exp.experimentId,
      }))
    );
  }, [scopeSummary.filteredExperiments]);

  // Candidate measurements for the selected experiment in the uncertainty form
  const targetExpForUnc = useMemo(
    () =>
      experiments.find((e) => e.uuid === targetExpUuidForUnc) ||
      experiments[0] ||
      null,
    [experiments, targetExpUuidForUnc]
  );

  const availableMeasurementsForTargetExp = useMemo(() => {
    if (!targetExpForUnc) return [];
    const items: Array<{
      id: string;
      label: string;
      kind: UncertaintyRecordTargetKind;
      value: number | null;
      unit: string;
      quantityName: string;
    }> = [];

    for (const ds of targetExpForUnc.surveyDatasets || []) {
      for (const m of ds.measurements || []) {
        items.push({
          id: m.id,
          label: `${ds.datasetId} · ${m.sampleId} (${m.replicateId})`,
          kind: 'survey_measurement',
          value: m.recordedUptakeUmolM2 ?? m.measuredFinalPh,
          unit:
            m.recordedUptakeUmolM2 !== null
              ? m.uptakeUnit || 'µmol/m²'
              : 'pH',
          quantityName:
            m.recordedUptakeUmolM2 !== null
              ? 'Recorded Metal Uptake (Γ)'
              : 'Measured Final pH',
        });
      }
    }

    for (const sess of targetExpForUnc.analyticalSessions || []) {
      for (const m of sess.sampleMeasurements || []) {
        items.push({
          id: m.id,
          label: `${sess.sessionId} · ${m.sampleId} (${m.analyte})`,
          kind: 'analytical_measurement',
          value: m.reportedConc,
          unit: m.concUnit || 'ppm',
          quantityName: `Analytical Concentration (${m.analyte})`,
        });
      }
    }

    return items;
  }, [targetExpForUnc]);

  const handleSaveComparisonPreset = () => {
    const name =
      comparisonPresetName.trim() ||
      `Comparison — ${getComparisonQuantityMeta(comparisonQuantity).label}`;
    const hash = computeResearchScopeContentHash(
      workspace,
      scope,
      comparisonQuantity
    );
    saveResearchComparisonConfig({
      name,
      description:
        comparisonPresetDesc.trim() ||
        `Cross-experiment comparison of ${getComparisonQuantityMeta(comparisonQuantity).label}`,
      quantityKey: comparisonQuantity,
      scope: structuredClone(scope),
      selectedExperimentUuids: scopeSummary.filteredExperiments.map(
        (e) => e.uuid
      ),
      selectedSurveyDatasetIds: scopeSummary.filteredSurveyDatasets.map(
        (d) => d.dataset.id
      ),
      selectedAnalyticalSessionIds: scopeSummary.filteredAnalyticalSessions.map(
        (s) => s.session.id
      ),
      excludeFlaggedMeasurements: excludeFlaggedInComparison,
      errorBarMode: comparisonErrorBarMode,
      sourceContentHash: hash,
      calcEngineVersion: CALC_ENGINE_VERSION,
    });
    setComparisonPresetName('');
    setComparisonPresetDesc('');
  };

  const handleCaptureAnalysisSnapshot = (
    kind:
      | 'cross_experiment_comparison'
      | 'research_matrix'
      | 'uncertainty_propagation'
      | 'descriptive_statistics',
    titleText: string,
    notesText: string
  ) => {
    const hash = computeResearchScopeContentHash(
      workspace,
      scope,
      comparisonQuantity
    );
    const measurementIds = [
      ...scopeSummary.filteredSurveyDatasets.flatMap((d) =>
        d.dataset.measurements.map((m) => m.id)
      ),
      ...scopeSummary.filteredAnalyticalSessions.flatMap((s) =>
        s.session.sampleMeasurements.map((m) => m.id)
      ),
    ];
    const provenances = Array.from(
      new Set<DataProvenance>([
        ...scopeSummary.filteredExperiments.map((e) => e.batch.dataProvenance),
        ...scopeSummary.filteredSurveyDatasets.map((d) => d.dataset.provenance),
      ])
    );

    saveResearchAnalysisSnapshot({
      title: titleText,
      analysisKind: kind,
      scope: structuredClone(scope),
      includedExperimentUuids: scopeSummary.filteredExperiments.map(
        (e) => e.uuid
      ),
      includedSurveyDatasetIds: scopeSummary.filteredSurveyDatasets.map(
        (d) => d.dataset.id
      ),
      includedAnalyticalSessionIds: scopeSummary.filteredAnalyticalSessions.map(
        (s) => s.session.id
      ),
      includedMeasurementIds: measurementIds,
      exclusionRulesSummary: excludeFlaggedInComparison
        ? 'User-excluded and flagged rows omitted from statistical aggregation.'
        : 'User-excluded rows omitted; flagged rows retained.',
      unitSummary:
        compatibilityReport.distinctUnits.join(', ') ||
        getComparisonQuantityMeta(comparisonQuantity).defaultUnit,
      provenanceSummary: provenances,
      scientificReviewStatus: scopeSummary.containsSynthetic
        ? 'Demonstration Fixture'
        : 'Unreviewed',
      containsSyntheticData: scopeSummary.containsSynthetic,
      sourceContentHash: hash,
      calcEngineVersion: CALC_ENGINE_VERSION,
      summaryNotes: notesText,
    });
  };

  const handleAddUncertaintyRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetExpForUnc) return;
    const valNum = uncValue.trim() !== '' ? Number(uncValue) : null;
    const uncNum = uncAmount.trim() !== '' ? Number(uncAmount) : null;
    const kNum = uncCoverageK.trim() !== '' ? Number(uncCoverageK) : null;

    addUncertaintyRecord(targetExpForUnc.uuid, {
      targetKind: uncTargetKind,
      measurementId:
        uncMeasurementId.trim() || `custom-${Date.now().toString(36)}`,
      measurementLabel:
        uncMeasurementLabel.trim() ||
        uncMeasurementId.trim() ||
        'Recorded Quantity',
      quantityName: uncQuantityName.trim() || 'Measured Quantity',
      value: valNum !== null && Number.isFinite(valNum) ? valNum : null,
      unit: uncUnit.trim() || 'µmol/m²',
      uncertaintyValue:
        uncNum !== null && Number.isFinite(uncNum) && uncNum >= 0
          ? uncNum
          : null,
      uncertaintyUnit: uncAmountUnit.trim() || uncUnit.trim() || 'µmol/m²',
      uncertaintyType: uncType,
      source: uncSource.trim() || 'Researcher-supplied uncertainty record',
      reference: uncReference.trim(),
      conditions: uncConditions.trim(),
      coverageFactor: kNum !== null && Number.isFinite(kNum) ? kNum : null,
      provenance: targetExpForUnc.isDemonstration
        ? 'synthetic_demo'
        : 'user_entered',
      reviewStatus: targetExpForUnc.isDemonstration
        ? 'Demonstration Fixture'
        : 'Unreviewed',
      notes: uncNotes.trim(),
    });
    setUncNotes('');
  };

  const handleSaveMatrixPreset = () => {
    const name =
      matrixPresetName.trim() ||
      `Matrix — ${matrixGranularity.replace('_', ' ')} (${matrixQuantity})`;
    const hash = computeResearchScopeContentHash(
      workspace,
      scope,
      matrixQuantity
    );
    saveResearchMatrixConfig({
      name,
      description: `Saved ${matrixGranularity} comparison matrix (${matrixColumns.length} columns)`,
      granularity: matrixGranularity,
      quantityKey: matrixQuantity,
      columns: [...matrixColumns],
      sortColumn: matrixSortCol,
      sortDirection: matrixSortDir,
      searchQuery: matrixSearch,
      scope: structuredClone(scope),
      sourceContentHash: hash,
      calcEngineVersion: CALC_ENGINE_VERSION,
    });
    setMatrixPresetName('');
  };

  const moveMatrixColumn = (col: ResearchMatrixColumnId, dir: -1 | 1) => {
    setMatrixColumns((prev) => {
      const idx = prev.indexOf(col);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const toggleMatrixColumn = (col: ResearchMatrixColumnId) => {
    setMatrixColumns((prev) =>
      prev.includes(col)
        ? prev.length > 2
          ? prev.filter((c) => c !== col)
          : prev
        : [...prev, col]
    );
  };

  const nonDemoExperimentCount = experiments.filter(
    (e) => !e.isDemonstration && e.batch.dataProvenance !== 'synthetic_demo'
  ).length;
  const demoExperimentCount = experiments.length - nonDemoExperimentCount;

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header & View Tabs */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[#E5E7EB] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#0F52BA] font-semibold">
              PHASE 6 · PORTFOLIO & CROSS-EXPERIMENT INFORMATICS
            </span>
            <Badge variant="info">Engine {CALC_ENGINE_VERSION}</Badge>
          </div>
          <h1 className="text-xl font-semibold text-[#111827] tracking-tight mt-0.5">
            Research Analytics & Measurement Uncertainty Workspace
          </h1>
          <p className="text-xs text-[#4B5563] mt-0.5">
            Factual research portfolio summaries, compatibility-checked
            cross-experiment comparison, externally supplied measurement
            uncertainty & propagation, and customizable comparison matrices.
          </p>
        </div>

        {/* 4 Coherent Sub-View Tabs */}
        <div
          className="inline-flex flex-wrap border border-[#E5E7EB] bg-[#F3F4F6] p-0.5 self-start xl:self-auto shrink-0"
          role="tablist"
          aria-label="Research Analytics Views"
        >
          {(
            [
              {
                id: 'overview',
                label: 'Research Overview',
                icon: BarChart3,
              },
              {
                id: 'comparison',
                label: 'Experiment Comparison',
                icon: GitCompare,
              },
              {
                id: 'uncertainty',
                label: 'Measurement Uncertainty',
                icon: Scale,
              },
              {
                id: 'matrix',
                label: 'Research Matrix',
                icon: Table2,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setAnalyticsTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-[#0F52BA] shadow-xs border border-[#E5E7EB]'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Research Scope Filter Bar (§5.2) */}
      <Card>
        <div className="px-4 py-3 bg-[#F8F9FA] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111827]">
              <Filter className="w-3.5 h-3.5 text-[#0F52BA]" />
              Research Scope:
            </span>
            <select
              value={scope.mode}
              onChange={(e) =>
                setScope((prev) => ({
                  ...prev,
                  mode: e.target.value as ResearchScopeMode,
                }))
              }
              aria-label="Research scope mode"
              className="px-2.5 py-1 text-xs border border-[#E5E7EB] bg-white text-[#111827]"
            >
              <option value="all_experiments">All Scoped Experiments</option>
              <option value="selected_project">Selected Research Project</option>
              <option value="selected_experiments">Selected Experiments</option>
              <option value="selected_survey_datasets">
                Selected Survey Datasets
              </option>
              <option value="selected_analytical_sessions">
                Selected Analytical Sessions
              </option>
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#111827] bg-white px-2.5 py-1 border border-[#E5E7EB] cursor-pointer">
              <input
                type="checkbox"
                checked={scope.includeSyntheticDemo}
                onChange={(e) =>
                  setScope((prev) => ({
                    ...prev,
                    includeSyntheticDemo: e.target.checked,
                  }))
                }
                className="accent-[#0F52BA]"
              />
              <span>
                Include Synthetic Demonstration Data ({demoExperimentCount}{' '}
                demo)
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowAdvancedScopeFilters((v) => !v)}
              className="text-xs text-[#0F52BA] hover:underline font-medium"
            >
              {showAdvancedScopeFilters
                ? 'Hide Detailed Filters'
                : 'Filter by Material, Date, Status & Provenance'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#4B5563]">
            <span>
              In Scope:{' '}
              <strong className="text-[#111827]">
                {scopeSummary.counts.experimentCount}
              </strong>{' '}
              Exp ·{' '}
              <strong className="text-[#111827]">
                {scopeSummary.counts.surveyDatasetCount}
              </strong>{' '}
              Survey DS ·{' '}
              <strong className="text-[#111827]">
                {scopeSummary.counts.analyticalSessionCount}
              </strong>{' '}
              Analytical Sess
            </span>
          </div>
        </div>

        {/* Advanced Scope Filter Drawer */}
        {showAdvancedScopeFilters && (
          <CardBody className="bg-white border-b border-[#E5E7EB] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label>Project Filter</Label>
                <Select
                  value={scope.projectIds[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      projectIds: e.target.value ? [e.target.value] : [],
                    }))
                  }
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Support Material Association</Label>
                <Select
                  value={scope.supportIds[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      supportIds: e.target.value ? [e.target.value] : [],
                    }))
                  }
                >
                  <option value="">All Catalyst Supports</option>
                  {supports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.composition})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Precursor Material Association</Label>
                <Select
                  value={scope.precursorIds[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      precursorIds: e.target.value ? [e.target.value] : [],
                    }))
                  }
                >
                  <option value="">All Metal Precursors</option>
                  {precursors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.metalIdentity})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Experiment Type</Label>
                <Select
                  value={scope.experimentTypes[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      experimentTypes: e.target.value
                        ? [e.target.value as ExperimentType]
                        : [],
                    }))
                  }
                >
                  <option value="">All Experiment Types</option>
                  <option value="Batch Synthesis">Batch Synthesis</option>
                  <option value="Uptake Survey">Uptake Survey</option>
                  <option value="PZC / pH Shift Survey">
                    PZC / pH Shift Survey
                  </option>
                </Select>
              </div>

              <div>
                <Label>Lifecycle Status</Label>
                <Select
                  value={scope.statuses[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      statuses: e.target.value
                        ? [e.target.value as ExperimentStatus]
                        : [],
                    }))
                  }
                >
                  <option value="">All Statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Planned">Planned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Measurements Pending">
                    Measurements Pending
                  </option>
                  <option value="Analysis in Progress">
                    Analysis in Progress
                  </option>
                  <option value="Under Review">Under Review</option>
                  <option value="Completed">Completed</option>
                  <option value="Archived">Archived</option>
                </Select>
              </div>

              <div>
                <Label>Scientific Review Status</Label>
                <Select
                  value={scope.reviewStatuses[0] || ''}
                  onChange={(e) =>
                    setScope((prev) => ({
                      ...prev,
                      reviewStatuses: e.target.value
                        ? [e.target.value as ScientificReviewStatus]
                        : [],
                    }))
                  }
                >
                  <option value="">All Review States</option>
                  <option value="Unreviewed">Unreviewed</option>
                  <option value="Pending Peer Review">
                    Pending Peer Review
                  </option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Demonstration Fixture">
                    Demonstration Fixture
                  </option>
                </Select>
              </div>

              <div>
                <Label>Experiment Date From</Label>
                <Input
                  type="date"
                  value={scope.dateFrom}
                  onChange={(e) =>
                    setScope((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                />
              </div>

              <div>
                <Label>Experiment Date To</Label>
                <Input
                  type="date"
                  value={scope.dateTo}
                  onChange={(e) =>
                    setScope((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Experiment / Dataset / Session Multi-Checkboxes when specific mode selected */}
            {scope.mode === 'selected_experiments' && (
              <div className="pt-2 border-t border-[#E5E7EB]">
                <Label>Select Specific Experiments</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {experiments.map((exp) => {
                    const checked = scope.experimentUuids.includes(exp.uuid);
                    return (
                      <label
                        key={exp.uuid}
                        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 border border-[#E5E7EB] bg-[#F8F9FA] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setScope((prev) => ({
                              ...prev,
                              experimentUuids: e.target.checked
                                ? [...prev.experimentUuids, exp.uuid]
                                : prev.experimentUuids.filter(
                                    (id) => id !== exp.uuid
                                  ),
                            }))
                          }
                        />
                        <span className="font-mono">{exp.experimentId}</span>
                        <span className="text-[#4B5563]">{exp.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setScope(
                    createDefaultResearchScopeFilter(scope.includeSyntheticDemo)
                  )
                }
              >
                Reset Scope Filters
              </Button>
            </div>
          </CardBody>
        )}

        {/* Provenance & Synthetic Exclusion Status Banner */}
        <div className="px-4 py-2 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
          {!scope.includeSyntheticDemo &&
          scopeSummary.counts.experimentCount === 0 &&
          demoExperimentCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2 text-[#B45309]">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Synthetic demonstration data is excluded by default. Currently 0
                user-entered experiments match this scope ({demoExperimentCount}{' '}
                synthetic demo experiment(s) hidden).
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setScope((prev) => ({ ...prev, includeSyntheticDemo: true }))
                }
              >
                Include Synthetic Demo Data for Inspection
              </Button>
            </div>
          ) : scopeSummary.containsMixedProvenance ? (
            <span className="inline-flex items-center gap-1.5 text-[#B45309] font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Mixed Provenance Active: Scope combines user/experimental records
              with synthetic demonstration fixtures.
            </span>
          ) : scopeSummary.containsSynthetic ? (
            <span className="inline-flex items-center gap-1.5 text-[#1E3A8A] font-medium">
              <Activity className="w-4 h-4 shrink-0" />
              Synthetic Demonstration Scope Active: Displaying clearly labeled
              synthetic demonstration fixtures.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              User / Experimental Research Scope Active (Synthetic demonstration
              fixtures excluded).
            </span>
          )}
        </div>
      </Card>

      {/* =====================================================================
       * VIEW 1: RESEARCH OVERVIEW (§6)
       * ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Factual Portfolio Metric Grid (12 Factual Cards — No Quality Score or Lab Rating) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: 'Scoped Projects',
                value: scopeSummary.counts.projectCount,
                sub: `${projects.length} total in workspace`,
                onClick: () => navigateToContext({ module: 'library' }),
              },
              {
                label: 'Experiments',
                value: scopeSummary.counts.experimentCount,
                sub: `${nonDemoExperimentCount} user · ${demoExperimentCount} demo`,
                onClick: () => navigateToContext({ module: 'library' }),
              },
              {
                label: 'Survey Datasets',
                value: scopeSummary.counts.surveyDatasetCount,
                sub: `${scopeSummary.counts.surveyMeasurementCount} survey points`,
                onClick: () => navigateToContext({ module: 'uptake-survey' }),
              },
              {
                label: 'Analytical Sessions',
                value: scopeSummary.counts.analyticalSessionCount,
                sub: `${scopeSummary.counts.analyticalMeasurementCount} sample assays`,
                onClick: () => navigateToContext({ module: 'analytical' }),
              },
              {
                label: 'Replicate Groups',
                value: scopeSummary.counts.replicateGroupCount,
                sub: 'Explicitly assigned groups',
                onClick: () => setAnalyticsTab('comparison'),
              },
              {
                label: 'Uncertainty Records',
                value: scopeSummary.counts.uncertaintyRecordCount,
                sub: 'Externally supplied records',
                onClick: () => setAnalyticsTab('uncertainty'),
              },
              {
                label: 'Associated Supports',
                value: scopeSummary.counts.associatedSupportCount,
                sub: `${supports.length} in material DB`,
                onClick: () => navigateToContext({ module: 'databases' }),
              },
              {
                label: 'Associated Precursors',
                value: scopeSummary.counts.associatedPrecursorCount,
                sub: `${precursors.length} in material DB`,
                onClick: () => navigateToContext({ module: 'databases' }),
              },
              {
                label: 'Observations Logged',
                value: scopeSummary.counts.observationCount,
                sub: 'Timestamped records',
                onClick: () =>
                  navigateToContext({
                    module: 'overview',
                    overviewTab: 'timeline',
                  }),
              },
              {
                label: 'Saved Figures',
                value: scopeSummary.counts.savedFigureCount,
                sub: 'Survey & analytical presets',
                onClick: () => navigateToContext({ module: 'uptake-survey' }),
              },
              {
                label: 'Open Review Flags',
                value: scopeSummary.counts.openQualityIssueCount,
                sub: 'Flagged rows & open issues',
                onClick: () =>
                  navigateToContext({
                    module: 'overview',
                    overviewTab: 'review',
                  }),
              },
              {
                label: 'Snapshots & Reports',
                value: `${scopeSummary.counts.snapshotCount} / ${scopeSummary.counts.finalizedReportCount}`,
                sub: 'Snapshots / Finalized Reports',
                onClick: () =>
                  navigateToContext({
                    module: 'overview',
                    overviewTab: 'snapshots',
                  }),
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="text-left p-3.5 bg-white border border-[#E5E7EB] hover:border-[#0F52BA] transition-colors flex flex-col justify-between"
              >
                <span className="text-[11px] font-medium text-[#4B5563] uppercase tracking-wider">
                  {item.label}
                </span>
                <span className="text-xl font-semibold font-mono tabular-nums text-[#111827] mt-1.5">
                  {item.value}
                </span>
                <span className="text-[11px] text-[#6B7280] mt-1 flex items-center justify-between">
                  <span className="truncate">{item.sub}</span>
                  <ArrowRight className="w-3 h-3 text-[#0F52BA] shrink-0" />
                </span>
              </button>
            ))}
          </div>

          {/* Descriptive Portfolio Distribution Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Lifecycle Status Distribution */}
            <Card>
              <CardHeader
                title="Experiment Status Distribution"
                subtitle="Factual count of scoped experiments by lifecycle stage"
              />
              <CardBody className="space-y-2.5">
                {scopeSummary.filteredExperiments.length === 0 ? (
                  <p className="text-xs text-[#6B7280]">
                    No experiments in current scope.
                  </p>
                ) : (
                  (
                    [
                      'Draft',
                      'Planned',
                      'In Progress',
                      'Measurements Pending',
                      'Analysis in Progress',
                      'Under Review',
                      'Completed',
                      'Archived',
                    ] as ExperimentStatus[]
                  ).map((st) => {
                    const count = scopeSummary.filteredExperiments.filter(
                      (e) => e.status === st
                    ).length;
                    if (count === 0) return null;
                    const pct = Math.round(
                      (count / scopeSummary.filteredExperiments.length) * 100
                    );
                    return (
                      <div key={st} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-[#111827]">
                            {st}
                          </span>
                          <span className="font-mono tabular-nums text-[#4B5563]">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#F3F4F6] overflow-hidden">
                          <div
                            className="h-full bg-[#0F52BA]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>

            {/* Measurement Completeness & Qualifier Distribution */}
            <Card>
              <CardHeader
                title="Measurement Completeness & Qualifiers"
                subtitle="Survey and analytical observation completeness in active scope"
              />
              <CardBody className="space-y-2.5">
                {(() => {
                  const surveyRows =
                    scopeSummary.filteredSurveyDatasets.flatMap(
                      (d) => d.dataset.measurements
                    );
                  const anaRows =
                    scopeSummary.filteredAnalyticalSessions.flatMap(
                      (s) => s.session.sampleMeasurements
                    );
                  const validSurvey = surveyRows.filter(
                    (m) =>
                      m.qualityStatus === 'valid' &&
                      (m.recordedUptakeUmolM2 !== null ||
                        m.measuredFinalPh !== null)
                  ).length;
                  const validAna = anaRows.filter(
                    (m) =>
                      m.qualityStatus === 'valid' &&
                      typeof m.reportedConc === 'number'
                  ).length;
                  const belowLimitAna = anaRows.filter(
                    (m) =>
                      m.valueQualifier === 'below_lod' ||
                      m.valueQualifier === 'below_loq' ||
                      m.valueQualifier === 'not_detected'
                  ).length;
                  const excludedTotal =
                    surveyRows.filter(
                      (m) => m.qualityStatus === 'excluded_by_user'
                    ).length +
                    anaRows.filter(
                      (m) => m.qualityStatus === 'excluded_by_user'
                    ).length;
                  const flaggedTotal =
                    surveyRows.filter((m) => m.qualityStatus === 'flagged')
                      .length +
                    anaRows.filter((m) => m.qualityStatus === 'flagged').length;

                  const items = [
                    {
                      label: 'Valid Survey Observations',
                      count: validSurvey,
                      color: 'bg-[#0F52BA]',
                    },
                    {
                      label: 'Valid Analytical Concentrations',
                      count: validAna,
                      color: 'bg-[#15803D]',
                    },
                    {
                      label: 'Below Limit / Qualified (<LOD, <LOQ, ND)',
                      count: belowLimitAna,
                      color: 'bg-[#B45309]',
                    },
                    {
                      label: 'Flagged for Quality Review',
                      count: flaggedTotal,
                      color: 'bg-[#D97706]',
                    },
                    {
                      label: 'Excluded by Researcher (Reason Logged)',
                      count: excludedTotal,
                      color: 'bg-[#6B7280]',
                    },
                  ];
                  const maxCount = Math.max(
                    1,
                    ...items.map((item) => item.count)
                  );

                  return items.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#111827]">{item.label}</span>
                        <span className="font-mono tabular-nums font-medium text-[#111827]">
                          {item.count}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#F3F4F6]">
                        <div
                          className={`h-full ${item.color}`}
                          style={{
                            width: `${Math.round((item.count / maxCount) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </CardBody>
            </Card>

            {/* Data Provenance & Review Status Breakdown */}
            <Card>
              <CardHeader
                title="Data Provenance & Review Breakdown"
                subtitle="Explicit separation of experimental, user-entered, and synthetic records"
              />
              <CardBody className="space-y-2.5 text-xs">
                {(() => {
                  const provCounts = new Map<DataProvenance, number>();
                  for (const { dataset } of scopeSummary.filteredSurveyDatasets) {
                    for (const m of dataset.measurements) {
                      provCounts.set(
                        m.provenance,
                        (provCounts.get(m.provenance) || 0) + 1
                      );
                    }
                  }
                  for (const {
                    session,
                  } of scopeSummary.filteredAnalyticalSessions) {
                    for (const m of session.sampleMeasurements) {
                      provCounts.set(
                        m.provenance,
                        (provCounts.get(m.provenance) || 0) + 1
                      );
                    }
                  }
                  const entries = Array.from(provCounts.entries());
                  if (entries.length === 0) {
                    return (
                      <p className="text-[#6B7280]">
                        No measurements in current scope.
                      </p>
                    );
                  }
                  const total = entries.reduce((a, b) => a + b[1], 0);
                  return entries.map(([prov, cnt]) => (
                    <div
                      key={prov}
                      className="flex items-center justify-between py-1.5 border-b border-[#E5E7EB] last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        {prov === 'synthetic_demo' ? (
                          <Badge variant="demo">synthetic_demo</Badge>
                        ) : (
                          <Badge variant="neutral">{prov}</Badge>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-[#111827]">
                        {cnt} pts ({Math.round((cnt / total) * 100)}%)
                      </span>
                    </div>
                  ));
                })()}
              </CardBody>
            </Card>
          </div>

          {/* Scoped Experiments Quick-Launch Table */}
          <Card>
            <CardHeader
              title="Scoped Experiments & Research Records"
              subtitle="Click any experiment, survey dataset, or analytical session to open its source record"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[#4B5563] uppercase font-mono text-[11px]">
                    <th className="py-2.5 px-3">Experiment ID</th>
                    <th className="py-2.5 px-3">Title & Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Support / Precursor</th>
                    <th className="py-2.5 px-3 text-right">Survey DS</th>
                    <th className="py-2.5 px-3 text-right">Analytical Sess</th>
                    <th className="py-2.5 px-3 text-right">Uncertainty Recs</th>
                    <th className="py-2.5 px-3">Provenance</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {scopeSummary.filteredExperiments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-[#6B7280]"
                      >
                        No experiments match the active Research Scope filter.
                      </td>
                    </tr>
                  ) : (
                    scopeSummary.filteredExperiments.map((exp) => (
                      <tr key={exp.uuid} className="hover:bg-[#F8F9FA]">
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#0F52BA]">
                          {exp.experimentId}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-[#111827]">
                            {exp.title}
                          </div>
                          <div className="text-[11px] text-[#6B7280]">
                            {exp.type} · {exp.experimentDate}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="neutral">{exp.status}</Badge>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          <div>
                            Support:{' '}
                            <span className="font-medium text-[#111827]">
                              {exp.batch.supportSnapshot?.supportData?.name ||
                                'Unassigned'}
                            </span>
                          </div>
                          <div>
                            Precursor:{' '}
                            <span className="font-medium text-[#111827]">
                              {exp.batch.precursorSnapshot?.precursorData
                                ?.name || 'Unassigned'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {(exp.surveyDatasets || []).length}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {(exp.analyticalSessions || []).length}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {(exp.uncertaintyRecords || []).length}
                        </td>
                        <td className="py-2.5 px-3">
                          {exp.isDemonstration ? (
                            <Badge variant="demo">Synthetic Demo</Badge>
                          ) : (
                            <Badge variant="info">
                              {exp.batch.dataProvenance}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              navigateToContext({
                                module: 'overview',
                                experimentUuid: exp.uuid,
                              })
                            }
                          >
                            Open Record
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Saved Reproducible Research Analysis Snapshots (§13) */}
          <Card>
            <CardHeader
              title="Reproducible Research Analysis Snapshots"
              subtitle="Saved cross-experiment analysis records with content-hash staleness detection"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handleCaptureAnalysisSnapshot(
                      'descriptive_statistics',
                      `Portfolio Scope Snapshot (${scopeSummary.counts.experimentCount} Exp, ${scopeSummary.counts.surveyDatasetCount} DS)`,
                      'Captured from Research Overview.'
                    )
                  }
                >
                  <Camera className="w-3.5 h-3.5 mr-1" />
                  Capture Analysis Snapshot
                </Button>
              }
            />
            <CardBody>
              {(researchAnalysisSnapshots ?? []).length === 0 ? (
                <p className="text-xs text-[#6B7280]">
                  No analysis snapshots saved yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(researchAnalysisSnapshots ?? []).map((snap) => {
                    const staleness = evaluateResearchAnalysisStaleness(
                      workspace,
                      snap
                    );
                    return (
                      <div
                        key={snap.id}
                        className="p-3 border border-[#E5E7EB] bg-[#F8F9FA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#111827]">
                              {snap.title}
                            </span>
                            <span className="font-mono text-[11px] text-[#6B7280]">
                              {snap.analysisKind}
                            </span>
                            {staleness.status === 'saved_current' && (
                              <Badge variant="valid">saved_current</Badge>
                            )}
                            {staleness.status === 'requires_regeneration' && (
                              <Badge variant="warning">
                                requires_regeneration
                              </Badge>
                            )}
                            {staleness.status === 'source_unavailable' && (
                              <Badge variant="error">source_unavailable</Badge>
                            )}
                            {snap.containsSyntheticData && (
                              <Badge variant="demo">Contains Synthetic</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-[#4B5563] mt-0.5">
                            {snap.exclusionRulesSummary} · Units:{' '}
                            {snap.unitSummary} · Engine:{' '}
                            {snap.calcEngineVersion}
                          </p>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">
                            Status note: {staleness.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setScope(structuredClone(snap.scope))}
                          >
                            Apply Scope
                          </Button>
                          <button
                            type="button"
                            onClick={() =>
                              deleteResearchAnalysisSnapshot(snap.id)
                            }
                            className="p-1.5 text-[#6B7280] hover:text-[#B91C1C]"
                            title="Delete analysis snapshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* =====================================================================
       * VIEW 2: CROSS-EXPERIMENT COMPARISON & ADVANCED STATISTICS (§7 & §9)
       * ===================================================================== */}
      {activeTab === 'comparison' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <Card>
            <CardBody className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-72">
                  <Label>Comparison Physical Quantity</Label>
                  <Select
                    value={comparisonQuantity}
                    onChange={(e) =>
                      setComparisonQuantity(
                        e.target.value as ComparisonQuantityKey
                      )
                    }
                  >
                    {QUANTITY_OPTIONS.map((q) => (
                      <option key={q.key} value={q.key}>
                        {q.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="w-56">
                  <Label>Interval / Error Bar Display</Label>
                  <Select
                    value={comparisonErrorBarMode}
                    onChange={(e) =>
                      setComparisonErrorBarMode(e.target.value as ErrorBarMode)
                    }
                  >
                    <option value="sd">Sample Standard Deviation (±1 SD)</option>
                    <option value="sem">
                      Standard Error of the Mean (±1 SEM)
                    </option>
                    <option value="recorded_uncertainty">
                      Recorded Measurement Uncertainty
                    </option>
                    <option value="none">No Interval Bars</option>
                  </Select>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-[#111827] pb-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeFlaggedInComparison}
                    onChange={(e) =>
                      setExcludeFlaggedInComparison(e.target.checked)
                    }
                    className="accent-[#0F52BA]"
                  />
                  Exclude flagged observations from statistics
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Preset name..."
                  value={comparisonPresetName}
                  onChange={(e) => setComparisonPresetName(e.target.value)}
                  className="w-48"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveComparisonPreset}
                >
                  <Bookmark className="w-3.5 h-3.5 mr-1" />
                  Save Comparison Config
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Compatibility Check Report Banner (§7.3) */}
          {compatibilityReport.incompatibilityReasons.length > 0 ? (
            <NoticeBanner
              variant="error"
              title="Incompatible Numerical Aggregation Blocked — Descriptive Side-by-Side Inspection Only"
            >
              <ul className="list-disc pl-4 space-y-0.5">
                {compatibilityReport.incompatibilityReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </NoticeBanner>
          ) : compatibilityReport.warnings.length > 0 ? (
            <NoticeBanner
              variant="warning"
              title="Cross-Experiment Condition & Provenance Differences Noted"
            >
              <ul className="list-disc pl-4 space-y-0.5">
                {compatibilityReport.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </NoticeBanner>
          ) : null}

          {/* Side-by-Side Box-Plot & Interval SVG Visualization */}
          <Card>
            <CardHeader
              title={`Cross-Series Distribution & Interval Comparison — ${compatibilityReport.quantityLabel}`}
              subtitle="Displays 5-number box-plot summary (Min, Q1, Median Q2, Q3, Max, 1.5×IQR fences) and Mean ± Interval bars per series"
            />
            <CardBody>
              {compatibilityReport.seriesSummaries.length === 0 ? (
                <p className="text-xs text-[#6B7280] py-6 text-center">
                  No matching records in the active Research Scope. Enable
                  &ldquo;Include Synthetic Demonstration Data&rdquo; or adjust
                  scope filters above.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-[#E5E7EB] bg-white p-4">
                    {(() => {
                      const validSeries =
                        compatibilityReport.seriesSummaries.filter(
                          (s) => s.stats.count > 0
                        );
                      if (validSeries.length === 0) {
                        return (
                          <p className="text-xs text-[#6B7280]">
                            Selected records contain 0 valid numeric
                            observations for {compatibilityReport.quantityLabel}.
                          </p>
                        );
                      }

                      const allMins = validSeries
                        .map((s) => s.stats.min)
                        .filter((v): v is number => v !== null);
                      const allMaxs = validSeries
                        .map((s) => s.stats.max)
                        .filter((v): v is number => v !== null);
                      const globalMin = Math.min(...allMins);
                      const globalMax = Math.max(...allMaxs);
                      const pad = Math.max(
                        0.1,
                        (globalMax - globalMin) * 0.15 || 1
                      );
                      const domainMin = globalMin - pad;
                      const domainMax = globalMax + pad;
                      const span = Math.max(1e-6, domainMax - domainMin);

                      const svgW = 860;
                      const rowH = 54;
                      const svgH = 60 + validSeries.length * rowH;
                      const leftPad = 240;
                      const rightPad = 40;
                      const plotW = svgW - leftPad - rightPad;
                      const toX = (val: number) =>
                        leftPad + ((val - domainMin) / span) * plotW;

                      return (
                        <svg
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          className="w-full h-auto max-h-[420px]"
                          role="img"
                          aria-label="Cross-experiment box plot and uncertainty interval comparison"
                        >
                          <rect
                            x={leftPad}
                            y={20}
                            width={plotW}
                            height={svgH - 50}
                            fill="#F8F9FA"
                            stroke="#E5E7EB"
                          />
                          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                            const v = domainMin + span * t;
                            const x = toX(v);
                            return (
                              <g key={t}>
                                <line
                                  x1={x}
                                  y1={20}
                                  x2={x}
                                  y2={svgH - 30}
                                  stroke="#E5E7EB"
                                  strokeDasharray="3 3"
                                />
                                <text
                                  x={x}
                                  y={svgH - 12}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fontFamily="IBM Plex Mono, monospace"
                                  fill="#4B5563"
                                >
                                  {v.toFixed(2)}
                                </text>
                              </g>
                            );
                          })}

                          {validSeries.map((ser, idx) => {
                            const cy = 46 + idx * rowH;
                            const bp = ser.stats.boxPlotSummary;
                            const q1X = bp.q1 !== null ? toX(bp.q1) : null;
                            const q3X = bp.q3 !== null ? toX(bp.q3) : null;
                            const medX =
                              bp.median !== null ? toX(bp.median) : null;
                            const lwX =
                              bp.lowerWhisker !== null
                                ? toX(bp.lowerWhisker)
                                : null;
                            const uwX =
                              bp.upperWhisker !== null
                                ? toX(bp.upperWhisker)
                                : null;
                            const meanX =
                              ser.stats.mean !== null
                                ? toX(ser.stats.mean)
                                : null;

                            const intervalHalf =
                              comparisonErrorBarMode === 'sd'
                                ? ser.stats.sampleStandardDeviation
                                : comparisonErrorBarMode === 'sem'
                                  ? ser.stats.standardErrorOfMean
                                  : comparisonErrorBarMode ===
                                      'recorded_uncertainty'
                                    ? ser.meanrecordedUncertainty
                                    : null;

                            return (
                              <g key={ser.seriesId}>
                                <text
                                  x={leftPad - 12}
                                  y={cy - 2}
                                  textAnchor="end"
                                  fontSize="11"
                                  fontWeight="600"
                                  fontFamily="IBM Plex Sans, sans-serif"
                                  fill="#111827"
                                >
                                  {ser.label.slice(0, 34)}
                                </text>
                                <text
                                  x={leftPad - 12}
                                  y={cy + 12}
                                  textAnchor="end"
                                  fontSize="9"
                                  fontFamily="IBM Plex Mono, monospace"
                                  fill="#6B7280"
                                >
                                  N={ser.stats.count} · {ser.unit} ·{' '}
                                  {ser.supportName.slice(0, 18)}
                                </text>

                                {/* Box plot whisker line */}
                                {lwX !== null && uwX !== null && (
                                  <line
                                    x1={lwX}
                                    y1={cy}
                                    x2={uwX}
                                    y2={cy}
                                    stroke="#4B5563"
                                    strokeWidth="1.25"
                                  />
                                )}
                                {/* IQR Box */}
                                {q1X !== null && q3X !== null && (
                                  <rect
                                    x={Math.min(q1X, q3X)}
                                    y={cy - 10}
                                    width={Math.max(2, Math.abs(q3X - q1X))}
                                    height={20}
                                    fill="#DBEAFE"
                                    stroke="#0F52BA"
                                    strokeWidth="1.25"
                                  />
                                )}
                                {/* Median vertical bar */}
                                {medX !== null && (
                                  <line
                                    x1={medX}
                                    y1={cy - 10}
                                    x2={medX}
                                    y2={cy + 10}
                                    stroke="#1E3A8A"
                                    strokeWidth="2.2"
                                  />
                                )}
                                {/* Mean diamond + selected interval bar */}
                                {meanX !== null && (
                                  <>
                                    {intervalHalf !== null &&
                                      intervalHalf > 0 &&
                                      ser.stats.mean !== null && (
                                        <line
                                          x1={toX(
                                            ser.stats.mean - intervalHalf
                                          )}
                                          y1={cy + 14}
                                          x2={toX(
                                            ser.stats.mean + intervalHalf
                                          )}
                                          y2={cy + 14}
                                          stroke="#B45309"
                                          strokeWidth="1.8"
                                        />
                                      )}
                                    <circle
                                      cx={meanX}
                                      cy={cy}
                                      r={3.5}
                                      fill="#B45309"
                                    />
                                  </>
                                )}
                                {/* Points outside 1.5xIQR fences (preserved, flagged visually) */}
                                {bp.outsideFenceValues.map((ov, oIdx) => (
                                  <circle
                                    key={oIdx}
                                    cx={toX(ov)}
                                    cy={cy}
                                    r={3}
                                    fill="none"
                                    stroke="#B91C1C"
                                    strokeWidth="1.5"
                                  />
                                ))}
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-[#4B5563]">
                    <span>
                      Legend: Blue Box = Interquartile Range (Q1 to Q3, R-7
                      linear interpolation) · Dark Vertical Line = Median (Q2) ·
                      Amber Dot & Lower Bar = Mean ±{' '}
                      {comparisonErrorBarMode.toUpperCase()} · Open Red Circles
                      = Points outside 1.5×IQR fences (never auto-removed).
                    </span>
                    <span className="font-mono">
                      Engine: {CALC_ENGINE_VERSION}
                    </span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Advanced Descriptive Statistics Table (Quartiles, IQR, MAD, Percentiles) (§9) */}
          <Card>
            <CardHeader
              title="Advanced Descriptive Statistics & Non-Parametric Dispersion Summary"
              subtitle="Reports sample size, missing/excluded counts, Mean, SD, SEM, Q1, Median (Q2), Q3, IQR, MAD, and P5–P95 percentiles"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[#4B5563] font-mono text-[11px]">
                    <th className="py-2 px-3">Series / Dataset</th>
                    <th className="py-2 px-2">Support (BET / PZC)</th>
                    <th className="py-2 px-2 text-right">Valid N</th>
                    <th className="py-2 px-2 text-right">Miss / Excl</th>
                    <th className="py-2 px-2 text-right">Mean</th>
                    <th className="py-2 px-2 text-right">Sample SD</th>
                    <th className="py-2 px-2 text-right">SEM</th>
                    <th className="py-2 px-2 text-right">Q1 (P25)</th>
                    <th className="py-2 px-2 text-right">Median (Q2)</th>
                    <th className="py-2 px-2 text-right">Q3 (P75)</th>
                    <th className="py-2 px-2 text-right">IQR</th>
                    <th className="py-2 px-2 text-right">MAD</th>
                    <th className="py-2 px-2 text-right">P10 – P90</th>
                    <th className="py-2 px-2">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                  {compatibilityReport.seriesSummaries.map((s) => (
                    <tr key={s.seriesId} className="hover:bg-[#F8F9FA]">
                      <td className="py-2 px-3 font-sans">
                        <div className="font-semibold text-[#111827]">
                          {s.label}
                        </div>
                        <div className="text-[11px] text-[#6B7280]">
                          SL: {s.surfaceLoadingM2L ?? '—'} m²/L · T:{' '}
                          {s.temperatureC ?? '—'} °C ·{' '}
                          {s.isSynthetic ? 'Synthetic Demo' : s.provenance}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-sans text-[11px]">
                        <div>{s.supportName}</div>
                        <div className="text-[#6B7280] font-mono">
                          {s.supportBetM2G ?? '—'} m²/g · PZC{' '}
                          {s.supportPzc ?? '—'}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">
                        {s.validNumericCount}
                      </td>
                      <td className="py-2 px-2 text-right text-[#6B7280]">
                        {s.missingCount + s.qualifiedOrBelowLimitCount} /{' '}
                        {s.excludedCount}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.mean !== null ? s.stats.mean.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.sampleStandardDeviation !== null
                          ? s.stats.sampleStandardDeviation.toFixed(3)
                          : 'N/A (n<2)'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.standardErrorOfMean !== null
                          ? s.stats.standardErrorOfMean.toFixed(3)
                          : 'N/A'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.q1 !== null ? s.stats.q1.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-[#0F52BA]">
                        {s.stats.q2 !== null ? s.stats.q2.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.q3 !== null ? s.stats.q3.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.iqr !== null ? s.stats.iqr.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s.stats.mad !== null ? s.stats.mad.toFixed(3) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-[11px]">
                        {s.stats.percentiles.p10 !== null &&
                        s.stats.percentiles.p90 !== null
                          ? `${s.stats.percentiles.p10.toFixed(2)} – ${s.stats.percentiles.p90.toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="py-2 px-2">{s.unit}</td>
                    </tr>
                  ))}

                  {/* Pooled Summary Row (only if compatible!) */}
                  {compatibilityReport.isNumericallyCompatibleForAggregation &&
                    compatibilityReport.pooledStats?.data && (
                      <tr className="bg-[#EFF6FF] font-semibold text-[#1E3A8A] border-t-2 border-[#BFDBFE]">
                        <td className="py-2.5 px-3 font-sans">
                          Pooled Compatible Scope Summary
                        </td>
                        <td className="py-2.5 px-2 font-sans text-[11px]">
                          {compatibilityReport.distinctSupports.join(', ')}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.count}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {
                            compatibilityReport.pooledStats.data
                              .missingOrNullCount
                          }{' '}
                          / —
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.mean?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.sampleStandardDeviation?.toFixed(
                            3
                          ) ?? 'N/A'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.standardErrorOfMean?.toFixed(
                            3
                          ) ?? 'N/A'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.q1?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.q2?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.q3?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.iqr?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {compatibilityReport.pooledStats.data.mad?.toFixed(
                            3
                          ) ?? '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[11px]">
                          {compatibilityReport.pooledStats.data.percentiles
                            .p10 !== null &&
                          compatibilityReport.pooledStats.data.percentiles
                            .p90 !== null
                            ? `${compatibilityReport.pooledStats.data.percentiles.p10.toFixed(2)} – ${compatibilityReport.pooledStats.data.percentiles.p90.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2">
                          {compatibilityReport.commonUnit || ''}
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Paired-Observation Differences & Exploratory Correlation Panel (§9.1) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Paired-Observation Differences Summary"
                subtitle="Descriptive paired differences d_i = y_i − x_i for matched initial/final survey pairs"
              />
              <CardBody className="space-y-3 text-xs">
                {[
                  {
                    title: 'Paired pH Shift (ΔpH = pH_final − pH_initial)',
                    res: pairedAndCorrelationSummary.phDiffs,
                  },
                  {
                    title:
                      'Paired Concentration Depletion (ΔC = C_final − C_initial)',
                    res: pairedAndCorrelationSummary.concDiffs,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="p-3 border border-[#E5E7EB] bg-[#F8F9FA] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#111827]">
                        {item.title}
                      </span>
                      <Badge variant="neutral">
                        Valid Pairs: {item.res.data?.validPairCount ?? 0} /{' '}
                        {item.res.data?.pairCount ?? 0}
                      </Badge>
                    </div>
                    {item.res.data ? (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 font-mono tabular-nums pt-1">
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            Mean Δ
                          </div>
                          <div className="font-semibold">
                            {item.res.data.meanDifference?.toFixed(3) ?? '—'}{' '}
                            {item.res.data.unit}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">SD Δ</div>
                          <div>
                            {item.res.data.sdDifference?.toFixed(3) ?? 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            Median Δ
                          </div>
                          <div>
                            {item.res.data.medianDifference?.toFixed(3) ?? '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            IQR Δ
                          </div>
                          <div>
                            {item.res.data.iqrDifference?.toFixed(3) ?? '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            MAD Δ
                          </div>
                          <div>
                            {item.res.data.madDifference?.toFixed(3) ?? '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[#6B7280]">
                        No complete numeric pairs in current scope.
                      </p>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Exploratory Correlation Inspector (Pearson r & Spearman ρ)"
                subtitle="Exploratory empirical association with tie-corrected average ranks; non-causal"
              />
              <CardBody className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Variable X</Label>
                    <Select
                      value={corrQuantityX}
                      onChange={(e) =>
                        setCorrQuantityX(
                          e.target.value as
                            | 'initialPh'
                            | 'finalPh'
                            | 'initialConc'
                            | 'finalConc'
                        )
                      }
                    >
                      <option value="finalPh">Measured Final pH (pH_f)</option>
                      <option value="initialPh">
                        Measured Initial pH (pH_i)
                      </option>
                      <option value="initialConc">
                        Initial Concentration (C_i)
                      </option>
                      <option value="finalConc">
                        Final Concentration (C_f)
                      </option>
                    </Select>
                  </div>
                  <div>
                    <Label>Variable Y</Label>
                    <Select
                      value={corrQuantityY}
                      onChange={(e) =>
                        setCorrQuantityY(
                          e.target.value as 'uptake' | 'deltaPh' | 'finalConc'
                        )
                      }
                    >
                      <option value="uptake">
                        Recorded Metal Uptake (Γ, µmol/m²)
                      </option>
                      <option value="deltaPh">Measured pH Shift (ΔpH)</option>
                      <option value="finalConc">
                        Final Concentration (C_f, ppm)
                      </option>
                    </Select>
                  </div>
                </div>

                {(() => {
                  const corr = pairedAndCorrelationSummary.correlation.data;
                  if (!corr) return null;
                  return (
                    <div className="p-3 border border-[#E5E7EB] bg-[#F8F9FA] space-y-2">
                      <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            Paired Sample Size (n)
                          </div>
                          <div className="text-sm font-semibold text-[#111827]">
                            n = {corr.sampleSize}{' '}
                            <span className="text-[10px] font-normal text-[#6B7280]">
                              ({corr.missingOrExcludedPairs} omitted)
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            Pearson Linear r
                          </div>
                          <div className="text-sm font-semibold text-[#0F52BA]">
                            {corr.pearsonR !== null
                              ? corr.pearsonR.toFixed(4)
                              : 'N/A (n<3 or const)'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6B7280]">
                            Spearman Rank ρ
                          </div>
                          <div className="text-sm font-semibold text-[#1E3A8A]">
                            {corr.spearmanRho !== null
                              ? corr.spearmanRho.toFixed(4)
                              : 'N/A (n<3 or const)'}
                          </div>
                        </div>
                      </div>
                      {(corr.hasTiedRanksX || corr.hasTiedRanksY) && (
                        <p className="text-[11px] text-[#B45309]">
                          Tied values detected; Spearman ρ computed with
                          tie-corrected average ranks.
                        </p>
                      )}
                      <p className="text-[11px] text-[#4B5563]">
                        {corr.interpretationNotice}
                      </p>
                    </div>
                  );
                })()}
              </CardBody>
            </Card>
          </div>

          {/* Saved Comparison Configurations List (§7.4) */}
          <Card>
            <CardHeader
              title="Saved Cross-Experiment Comparison Configurations"
              subtitle="Reload saved comparison presets or verify staleness against current source records"
            />
            <CardBody>
              {(researchComparisonConfigs ?? []).length === 0 ? (
                <p className="text-xs text-[#6B7280]">
                  No comparison configurations saved yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(researchComparisonConfigs ?? []).map((cfg) => {
                    const staleness = evaluateResearchAnalysisStaleness(
                      workspace,
                      cfg
                    );
                    return (
                      <div
                        key={cfg.id}
                        className="p-3 border border-[#E5E7EB] bg-[#F8F9FA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#111827]">
                              {cfg.name}
                            </span>
                            <Badge variant="info">{cfg.quantityKey}</Badge>
                            {staleness.status === 'saved_current' && (
                              <Badge variant="valid">saved_current</Badge>
                            )}
                            {staleness.status === 'requires_regeneration' && (
                              <Badge variant="warning">
                                requires_regeneration
                              </Badge>
                            )}
                            {staleness.status === 'source_unavailable' && (
                              <Badge variant="error">source_unavailable</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-[#4B5563] mt-0.5">
                            {cfg.description} · Error bars: {cfg.errorBarMode}
                          </p>
                          <p className="text-[11px] text-[#6B7280]">
                            {staleness.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setScope(structuredClone(cfg.scope));
                              setComparisonQuantity(cfg.quantityKey);
                              setExcludeFlaggedInComparison(
                                cfg.excludeFlaggedMeasurements
                              );
                              setComparisonErrorBarMode(cfg.errorBarMode);
                            }}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Load Preset
                          </Button>
                          <button
                            type="button"
                            onClick={() =>
                              deleteResearchComparisonConfig(cfg.id)
                            }
                            className="p-1.5 text-[#6B7280] hover:text-[#B91C1C]"
                            title="Delete saved comparison configuration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* =====================================================================
       * VIEW 3: MEASUREMENT UNCERTAINTY & PROPAGATION (§8)
       * ===================================================================== */}
      {activeTab === 'uncertainty' && (
        <div className="space-y-6">
          <NoticeBanner
            variant="info"
            title="Scientific Uncertainty Representation Boundary"
          >
            Sample Standard Deviation (SD), Standard Error of the Mean (SEM),
            combined standard uncertainty (u_c, 1σ), expanded uncertainty (U =
            k·u_c), and manufacturer datasheet tolerances represent distinct
            statistical and metrological quantities. SEA Workbench preserves
            each recorded uncertainty type explicitly and never treats them as
            interchangeable or fabricates instrument uncertainty budgets.
          </NoticeBanner>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Record Externally Supplied Measurement Uncertainty Form */}
            <div className="lg:col-span-5">
              <Card>
                <CardHeader
                  title="Record Externally Supplied Measurement Uncertainty"
                  subtitle="Attach traceable uncertainty metadata to any measurement or material property"
                />
                <CardBody>
                  <form
                    onSubmit={handleAddUncertaintyRecordSubmit}
                    className="space-y-3 text-xs"
                  >
                    <div>
                      <Label>Target Experiment</Label>
                      <Select
                        value={targetExpForUnc?.uuid || ''}
                        onChange={(e) => {
                          setTargetExpUuidForUnc(e.target.value);
                          setUncMeasurementId('');
                        }}
                      >
                        {experiments.map((exp) => (
                          <option key={exp.uuid} value={exp.uuid}>
                            {exp.experimentId} — {exp.title}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Target Record Domain</Label>
                        <Select
                          value={uncTargetKind}
                          onChange={(e) =>
                            setUncTargetKind(
                              e.target.value as UncertaintyRecordTargetKind
                            )
                          }
                        >
                          <option value="survey_measurement">
                            Survey Measurement
                          </option>
                          <option value="analytical_measurement">
                            Analytical Sample Measurement
                          </option>
                          <option value="batch_parameter">
                            Batch Synthesis Parameter
                          </option>
                          <option value="material_property">
                            Support / Precursor Property
                          </option>
                          <option value="general_quantity">
                            General Recorded Quantity
                          </option>
                        </Select>
                      </div>

                      <div>
                        <Label>Select Existing Measurement (Optional)</Label>
                        <Select
                          value={uncMeasurementId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setUncMeasurementId(id);
                            const found =
                              availableMeasurementsForTargetExp.find(
                                (item) => item.id === id
                              );
                            if (found) {
                              setUncTargetKind(found.kind);
                              setUncMeasurementLabel(found.label);
                              setUncQuantityName(found.quantityName);
                              if (found.value !== null) {
                                setUncValue(String(found.value));
                              }
                              setUncUnit(found.unit);
                              setUncAmountUnit(found.unit);
                            }
                          }}
                        >
                          <option value="">— Manual / Custom ID —</option>
                          {availableMeasurementsForTargetExp.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Measurement / Sample Label</Label>
                        <Input
                          value={uncMeasurementLabel}
                          onChange={(e) =>
                            setUncMeasurementLabel(e.target.value)
                          }
                          placeholder="e.g. UPT-05 (pH 10.5 R1)"
                          required
                        />
                      </div>
                      <div>
                        <Label>Quantity Name</Label>
                        <Input
                          value={uncQuantityName}
                          onChange={(e) => setUncQuantityName(e.target.value)}
                          placeholder="e.g. Recorded Metal Uptake (Γ)"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label>Recorded Value</Label>
                        <Input
                          type="number"
                          step="any"
                          value={uncValue}
                          onChange={(e) => setUncValue(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Value Unit</Label>
                        <Input
                          value={uncUnit}
                          onChange={(e) => setUncUnit(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Uncertainty (±)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={uncAmount}
                          onChange={(e) => setUncAmount(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label>Unc. Unit</Label>
                        <Input
                          value={uncAmountUnit}
                          onChange={(e) => setUncAmountUnit(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label>Explicit Uncertainty Type (Required)</Label>
                        <Select
                          value={uncType}
                          onChange={(e) =>
                            setUncType(e.target.value as UncertaintyType)
                          }
                        >
                          {UNCERTAINTY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Coverage Factor k</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={uncCoverageK}
                          onChange={(e) => setUncCoverageK(e.target.value)}
                          placeholder="e.g. 1 or 2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Uncertainty Source</Label>
                        <Input
                          value={uncSource}
                          onChange={(e) => setUncSource(e.target.value)}
                          placeholder="e.g. Balance COA + ICP replicate SD"
                        />
                      </div>
                      <div>
                        <Label>Conditions / Reference ID</Label>
                        <Input
                          value={uncConditions}
                          onChange={(e) => setUncConditions(e.target.value)}
                          placeholder="e.g. 22 °C, 1000 m²/L"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Method / Reviewer Notes</Label>
                      <Input
                        value={uncNotes}
                        onChange={(e) => setUncNotes(e.target.value)}
                        placeholder="Record explicit basis and assumptions..."
                      />
                    </div>

                    <Button type="submit" variant="primary" className="w-full">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Record Measurement Uncertainty
                    </Button>
                  </form>
                </CardBody>
              </Card>
            </div>

            {/* General Mathematical Uncertainty Propagation Calculator (§8.3) */}
            <div className="lg:col-span-7">
              <Card>
                <CardHeader
                  title="General Mathematical Uncertainty Propagation Calculator"
                  subtitle="First-order Taylor propagation for linear combinations y = Σ(c_i·x_i) and multiplicative power-law quantities y = k·Π(x_i^p_i)"
                />
                <CardBody className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <Label>Propagation Mathematical Form</Label>
                      <Select
                        value={propFormulaMode}
                        onChange={(e) =>
                          setPropFormulaMode(
                            e.target.value as 'linear' | 'multiplicative'
                          )
                        }
                      >
                        <option value="linear">
                          Linear Combination: y = Σ (c_i · x_i)
                        </option>
                        <option value="multiplicative">
                          Multiplicative Power-Law: y = factor · Π (x_i ^ p_i)
                        </option>
                      </Select>
                    </div>

                    {propFormulaMode === 'multiplicative' ? (
                      <div>
                        <Label>Prefactor (k)</Label>
                        <Input
                          type="number"
                          step="any"
                          value={propMultiplicativeFactor}
                          onChange={(e) =>
                            setPropMultiplicativeFactor(e.target.value)
                          }
                        />
                      </div>
                    ) : (
                      <div>
                        <Label>Output Unit</Label>
                        <Input
                          value={propUnit}
                          onChange={(e) => setPropUnit(e.target.value)}
                        />
                      </div>
                    )}

                    <div>
                      <Label>Coverage Factor k (U = k·u_c)</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={propCoverageK}
                        onChange={(e) => setPropCoverageK(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Terms Editor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#111827]">
                        Input Quantity Terms (x_i, u(x_i), and{' '}
                        {propFormulaMode === 'linear'
                          ? 'Linear Coefficient c_i'
                          : 'Exponent p_i'}
                        )
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setPropTerms((prev) => [
                            ...prev,
                            {
                              id: `term-${Date.now()}`,
                              label: `Quantity x_${prev.length + 1}`,
                              symbol: `x_${prev.length + 1}`,
                              value: 10.0,
                              unit: propUnit,
                              standardUncertainty: 0.2,
                              uncertaintyType: 'standard_uncertainty',
                              coefficientOrExponent: 1.0,
                              sourceNote: '',
                            },
                          ])
                        }
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Term
                      </Button>
                    </div>

                    <div className="overflow-x-auto border border-[#E5E7EB]">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] font-mono text-[#4B5563]">
                            <th className="py-1.5 px-2">Label</th>
                            <th className="py-1.5 px-2">Value (x_i)</th>
                            <th className="py-1.5 px-2">Std. Unc u(x_i)</th>
                            <th className="py-1.5 px-2">
                              {propFormulaMode === 'linear'
                                ? 'Coeff c_i'
                                : 'Exponent p_i'}
                            </th>
                            <th className="py-1.5 px-2">Type</th>
                            <th className="py-1.5 px-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {propTerms.map((term, idx) => (
                            <tr key={term.id}>
                              <td className="py-1.5 px-2">
                                <Input
                                  value={term.label}
                                  onChange={(e) =>
                                    setPropTerms((prev) =>
                                      prev.map((t, i) =>
                                        i === idx
                                          ? { ...t, label: e.target.value }
                                          : t
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="py-1.5 px-2 w-24">
                                <Input
                                  type="number"
                                  step="any"
                                  value={term.value}
                                  onChange={(e) =>
                                    setPropTerms((prev) =>
                                      prev.map((t, i) =>
                                        i === idx
                                          ? {
                                              ...t,
                                              value: Number(e.target.value),
                                            }
                                          : t
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="py-1.5 px-2 w-24">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={term.standardUncertainty}
                                  onChange={(e) =>
                                    setPropTerms((prev) =>
                                      prev.map((t, i) =>
                                        i === idx
                                          ? {
                                              ...t,
                                              standardUncertainty: Number(
                                                e.target.value
                                              ),
                                            }
                                          : t
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="py-1.5 px-2 w-20">
                                <Input
                                  type="number"
                                  step="any"
                                  value={term.coefficientOrExponent}
                                  onChange={(e) =>
                                    setPropTerms((prev) =>
                                      prev.map((t, i) =>
                                        i === idx
                                          ? {
                                              ...t,
                                              coefficientOrExponent: Number(
                                                e.target.value
                                              ),
                                            }
                                          : t
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="py-1.5 px-2">
                                <Select
                                  value={term.uncertaintyType}
                                  onChange={(e) =>
                                    setPropTerms((prev) =>
                                      prev.map((t, i) =>
                                        i === idx
                                          ? {
                                              ...t,
                                              uncertaintyType: e.target
                                                .value as UncertaintyType,
                                            }
                                          : t
                                      )
                                    )
                                  }
                                >
                                  {UNCERTAINTY_TYPES.map((ut) => (
                                    <option key={ut.value} value={ut.value}>
                                      {ut.value}
                                    </option>
                                  ))}
                                </Select>
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {propTerms.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPropTerms((prev) =>
                                        prev.filter((_, i) => i !== idx)
                                      )
                                    }
                                    className="text-[#6B7280] hover:text-[#B91C1C]"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Optional Pairwise Correlation Input */}
                  {propTerms.length >= 2 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#F8F9FA] border border-[#E5E7EB]">
                      <span className="text-[11px] text-[#4B5563]">
                        Optional Pairwise Correlation r₁₂ between Term 1 and
                        Term 2 (-1 to +1; 0 = independent errors):
                      </span>
                      <Input
                        type="number"
                        step="0.05"
                        min="-1"
                        max="1"
                        value={propCorrelationR12}
                        onChange={(e) => setPropCorrelationR12(e.target.value)}
                        className="w-24"
                      />
                    </div>
                  )}

                  {/* Propagation Output Summary */}
                  {propagationResult.data ? (
                    <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1E3A8A] flex items-center gap-1.5">
                          <Calculator className="w-4 h-4" />
                          Propagated Result ({propagationResult.data.formulaDescription})
                        </span>
                        <Badge variant="info">First-Order Taylor</Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
                        <div className="bg-white p-2 border border-[#DBEAFE]">
                          <div className="text-[10px] text-[#6B7280]">
                            Combined Value (y)
                          </div>
                          <div className="text-sm font-semibold text-[#111827]">
                            {propagationResult.data.combinedValue?.toFixed(4)}{' '}
                            {propagationResult.data.unit}
                          </div>
                        </div>
                        <div className="bg-white p-2 border border-[#DBEAFE]">
                          <div className="text-[10px] text-[#6B7280]">
                            Combined Std. Unc (u_c)
                          </div>
                          <div className="text-sm font-semibold text-[#0F52BA]">
                            ±
                            {propagationResult.data.combinedStandardUncertainty?.toFixed(
                              4
                            )}{' '}
                            {propagationResult.data.unit}
                          </div>
                        </div>
                        <div className="bg-white p-2 border border-[#DBEAFE]">
                          <div className="text-[10px] text-[#6B7280]">
                            Relative Std. Unc (u_c/|y|)
                          </div>
                          <div className="text-sm font-semibold text-[#111827]">
                            {propagationResult.data
                              .relativeStandardUncertainty !== null
                              ? `${(propagationResult.data.relativeStandardUncertainty * 100).toFixed(2)}%`
                              : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-white p-2 border border-[#DBEAFE]">
                          <div className="text-[10px] text-[#6B7280]">
                            Expanded Unc (U, k=
                            {propagationResult.data.coverageFactor ?? '—'})
                          </div>
                          <div className="text-sm font-semibold text-[#1E3A8A]">
                            {propagationResult.data.expandedUncertainty !== null
                              ? `±${propagationResult.data.expandedUncertainty.toFixed(4)}`
                              : 'Not applied'}
                          </div>
                        </div>
                      </div>

                      {/* Variance Contribution Breakdown */}
                      <div className="space-y-1 pt-1">
                        <div className="text-[11px] font-semibold text-[#1E3A8A]">
                          Term Variance Contributions ((∂y/∂x_i · u(x_i))²):
                        </div>
                        {propagationResult.data.termContributions.map((tc) => (
                          <div
                            key={tc.termId}
                            className="flex items-center justify-between text-[11px] font-mono"
                          >
                            <span>
                              {tc.label} (∂y/∂x ={' '}
                              {tc.sensitivityCoefficient.toFixed(3)}, u ={' '}
                              {tc.standardUncertainty})
                            </span>
                            <span>{tc.varianceSharePct}% of uncorrelated u_c²</span>
                          </div>
                        ))}
                      </div>

                      <div className="text-[11px] text-[#4B5563] border-t border-[#BFDBFE] pt-1.5 space-y-0.5">
                        <div>
                          <strong>Assumptions:</strong>{' '}
                          {propagationResult.data.correlationAssumptions}
                        </div>
                        {propagationResult.data.warnings.map((w) => (
                          <div key={w} className="text-[#B45309] font-medium">
                            Warning: {w}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <NoticeBanner
                      variant="warning"
                      title="Propagation Calculation Incomplete"
                    >
                      {(propagationResult.warnings || []).join(' ')}
                    </NoticeBanner>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          {/* Recorded Measurement Uncertainty Table */}
          <Card>
            <CardHeader
              title={`Recorded Measurement Uncertainty Registry (${scopedUncertaintyRecords.length} records in scope)`}
              subtitle="Each record preserves its explicit uncertainty type, coverage factor, source, and reference conditions"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    triggerTextDownload(
                      exportUncertaintyRecordsCsv(scopedUncertaintyRecords),
                      'sea-workbench-uncertainty-records.csv',
                      'text/csv;charset=utf-8'
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Export Uncertainty CSV
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[#4B5563] font-mono text-[11px]">
                    <th className="py-2 px-3">Experiment</th>
                    <th className="py-2 px-3">Measurement / Target</th>
                    <th className="py-2 px-3">Quantity</th>
                    <th className="py-2 px-3 text-right">Value ± Uncertainty</th>
                    <th className="py-2 px-3">Explicit Uncertainty Type</th>
                    <th className="py-2 px-3 text-right">k</th>
                    <th className="py-2 px-3">Source & Conditions</th>
                    <th className="py-2 px-3">Provenance</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {scopedUncertaintyRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-[#6B7280]"
                      >
                        No uncertainty records in active scope. Add an
                        uncertainty record using the form above or enable
                        synthetic demonstration fixtures.
                      </td>
                    </tr>
                  ) : (
                    scopedUncertaintyRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-[#F8F9FA]">
                        <td className="py-2 px-3 font-mono font-semibold text-[#0F52BA]">
                          {rec.experimentIdLabel}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-[#111827]">
                            {rec.measurementLabel}
                          </div>
                          <div className="text-[11px] font-mono text-[#6B7280]">
                            {rec.targetKind} · ID: {rec.measurementId}
                          </div>
                        </td>
                        <td className="py-2 px-3">{rec.quantityName}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                          {rec.value !== null ? rec.value : '—'} ±{' '}
                          {rec.uncertaintyValue !== null
                            ? rec.uncertaintyValue
                            : '—'}{' '}
                          {rec.uncertaintyUnit || rec.unit}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="info">
                            {formatUncertaintyTypeLabel(rec.uncertaintyType)}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {rec.coverageFactor ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-[11px]">
                          <div className="text-[#111827]">{rec.source}</div>
                          {rec.conditions && (
                            <div className="text-[#6B7280]">
                              Cond: {rec.conditions}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {rec.provenance === 'synthetic_demo' ? (
                            <Badge variant="demo">Synthetic Demo</Badge>
                          ) : (
                            <Badge variant="neutral">{rec.provenance}</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              deleteUncertaintyRecord(
                                rec.experimentUuid,
                                rec.id
                              )
                            }
                            className="p-1 text-[#6B7280] hover:text-[#B91C1C]"
                            title="Delete uncertainty record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
       * VIEW 4: RESEARCH COMPARISON MATRIX (§10)
       * ===================================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* Matrix Controls Bar */}
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Label>Row Granularity</Label>
                    <Select
                      value={matrixGranularity}
                      onChange={(e) =>
                        setMatrixGranularity(
                          e.target.value as ResearchMatrixGranularity
                        )
                      }
                    >
                      <option value="survey_dataset">
                        Survey Datasets (1 row/dataset)
                      </option>
                      <option value="analytical_session">
                        Analytical Sessions (1 row/session)
                      </option>
                      <option value="experiment">
                        Experiments (1 row/experiment)
                      </option>
                    </Select>
                  </div>

                  <div className="w-64">
                    <Label>Statistical Summary Quantity</Label>
                    <Select
                      value={matrixQuantity}
                      onChange={(e) =>
                        setMatrixQuantity(
                          e.target.value as ComparisonQuantityKey
                        )
                      }
                    >
                      {QUANTITY_OPTIONS.map((q) => (
                        <option key={q.key} value={q.key}>
                          {q.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label>Search Matrix Rows</Label>
                    <Input
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                      placeholder="Filter by ID, material, project..."
                    />
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowColumnSelector((v) => !v)}
                  >
                    <Layers className="w-3.5 h-3.5 mr-1" />
                    Columns ({matrixColumns.length})
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={matrixPresetName}
                    onChange={(e) => setMatrixPresetName(e.target.value)}
                    placeholder="Matrix config name..."
                    className="w-44"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveMatrixPreset}
                  >
                    <Bookmark className="w-3.5 h-3.5 mr-1" />
                    Save Matrix Config
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      triggerTextDownload(
                        exportResearchMatrixCsv(matrixRows, matrixColumns),
                        `sea-workbench-research-matrix-${matrixGranularity}.csv`,
                        'text/csv;charset=utf-8'
                      )
                    }
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                    Export CSV
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      triggerTextDownload(
                        exportResearchMatrixJson(matrixRows, matrixColumns, {
                          granularity: matrixGranularity,
                          quantityKey: matrixQuantity,
                        }),
                        `sea-workbench-research-matrix-${matrixGranularity}.json`,
                        'application/json;charset=utf-8'
                      )
                    }
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Export JSON
                  </Button>
                </div>
              </div>

              {/* Column Selection & Reordering Drawer */}
              {showColumnSelector && (
                <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#111827]">
                      Customize Visible Matrix Columns & Order
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setMatrixColumns([...DEFAULT_RESEARCH_MATRIX_COLUMNS])
                      }
                    >
                      Reset Default Columns
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      Object.keys(
                        RESEARCH_MATRIX_COLUMN_LABELS
                      ) as ResearchMatrixColumnId[]
                    ).map((colId) => {
                      const activeIdx = matrixColumns.indexOf(colId);
                      const isSelected = activeIdx !== -1;
                      return (
                        <div
                          key={colId}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] border ${
                            isSelected
                              ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A]'
                              : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#6B7280]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMatrixColumn(colId)}
                            className="accent-[#0F52BA]"
                          />
                          <span>{RESEARCH_MATRIX_COLUMN_LABELS[colId]}</span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 ml-1">
                              <button
                                type="button"
                                onClick={() => moveMatrixColumn(colId, -1)}
                                className="px-1 hover:bg-white"
                                title="Move column left"
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => moveMatrixColumn(colId, 1)}
                                className="px-1 hover:bg-white"
                                title="Move column right"
                              >
                                →
                              </button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Sticky-Header Horizontal-Scroll Comparison Matrix Table */}
          <Card>
            <CardHeader
              title={`Research Comparison Matrix (${matrixRows.length} rows)`}
              subtitle="Click any column header to sort; click any Record ID to open the source record"
            />
            <div className="overflow-x-auto max-h-[540px]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[#F3F4F6] border-b border-[#E5E7EB]">
                  <tr>
                    {matrixColumns.map((colId) => {
                      const isSorted = matrixSortCol === colId;
                      return (
                        <th
                          key={colId}
                          onClick={() => {
                            if (isSorted) {
                              setMatrixSortDir((d) =>
                                d === 'asc' ? 'desc' : 'asc'
                              );
                            } else {
                              setMatrixSortCol(colId);
                              setMatrixSortDir('asc');
                            }
                          }}
                          className="py-2.5 px-3 font-mono text-[11px] text-[#4B5563] uppercase whitespace-nowrap cursor-pointer hover:text-[#111827] select-none"
                        >
                          <span className="inline-flex items-center gap-1">
                            {RESEARCH_MATRIX_COLUMN_LABELS[colId]}
                            {isSorted && (
                              <span className="text-[#0F52BA]">
                                {matrixSortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {matrixRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={matrixColumns.length}
                        className="py-8 text-center text-[#6B7280]"
                      >
                        No matrix rows match the current scope and search filter.
                      </td>
                    </tr>
                  ) : (
                    matrixRows.map((row) => (
                      <tr key={row.rowId} className="hover:bg-[#F8F9FA]">
                        {matrixColumns.map((colId) => {
                          const cellVal = formatMatrixCellValue(row, colId);
                          const isNumeric = typeof cellVal === 'number';
                          if (colId === 'recordId') {
                            return (
                              <td
                                key={colId}
                                className="py-2 px-3 font-mono font-semibold whitespace-nowrap"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigateToContext({
                                      module:
                                        row.recordKind === 'Survey Dataset'
                                          ? 'uptake-survey'
                                          : row.recordKind ===
                                              'Analytical Session'
                                            ? 'analytical'
                                            : 'overview',
                                      experimentUuid: row.experimentUuid,
                                      surveyDatasetId:
                                        row.datasetId ?? undefined,
                                      analyticalSessionId:
                                        row.sessionId ?? undefined,
                                    })
                                  }
                                  className="text-[#0F52BA] hover:underline"
                                >
                                  {cellVal}
                                </button>
                              </td>
                            );
                          }
                          if (colId === 'provenance') {
                            return (
                              <td
                                key={colId}
                                className="py-2 px-3 whitespace-nowrap"
                              >
                                {row.isSynthetic ? (
                                  <Badge variant="demo">synthetic_demo</Badge>
                                ) : (
                                  <Badge variant="neutral">{cellVal}</Badge>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={colId}
                              className={`py-2 px-3 whitespace-nowrap ${
                                isNumeric
                                  ? 'font-mono tabular-nums text-right'
                                  : ''
                              }`}
                            >
                              {cellVal !== null && cellVal !== ''
                                ? cellVal
                                : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Saved Matrix Configurations */}
          <Card>
            <CardHeader
              title="Saved Research Matrix Configurations"
              subtitle="Reload saved column layouts, sorting, and scope settings"
            />
            <CardBody>
              {(researchMatrixConfigs ?? []).length === 0 ? (
                <p className="text-xs text-[#6B7280]">
                  No matrix configurations saved yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(researchMatrixConfigs ?? []).map((cfg) => {
                    const staleness = evaluateResearchAnalysisStaleness(
                      workspace,
                      cfg
                    );
                    return (
                      <div
                        key={cfg.id}
                        className="p-3 border border-[#E5E7EB] bg-[#F8F9FA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#111827]">
                              {cfg.name}
                            </span>
                            <Badge variant="neutral">{cfg.granularity}</Badge>
                            <Badge variant="info">{cfg.quantityKey}</Badge>
                            {staleness.status === 'saved_current' && (
                              <Badge variant="valid">saved_current</Badge>
                            )}
                            {staleness.status === 'requires_regeneration' && (
                              <Badge variant="warning">
                                requires_regeneration
                              </Badge>
                            )}
                            {staleness.status === 'source_unavailable' && (
                              <Badge variant="error">source_unavailable</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-[#4B5563] mt-0.5">
                            {cfg.description} · {cfg.columns.length} columns
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setMatrixGranularity(cfg.granularity);
                              setMatrixQuantity(cfg.quantityKey);
                              setMatrixColumns([...cfg.columns]);
                              setMatrixSortCol(cfg.sortColumn);
                              setMatrixSortDir(cfg.sortDirection);
                              setMatrixSearch(cfg.searchQuery);
                              setScope(structuredClone(cfg.scope));
                            }}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Load Matrix
                          </Button>
                          <button
                            type="button"
                            onClick={() => deleteResearchMatrixConfig(cfg.id)}
                            className="p-1.5 text-[#6B7280] hover:text-[#B91C1C]"
                            title="Delete matrix configuration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Columns3,
  Copy,
  Download,
  Link2,
  Plus,
  Search,
  Trash2,
  Unlink,
  Upload,
} from 'lucide-react';
import {
  AnalyticalAnalyte,
  AnalyticalSession,
  Experiment,
  ImportMappingTemplate,
  InstrumentImportRecord,
  InstrumentMeasurement,
  MeasurementQualityStatus,
  MeasurementValueQualifier,
  ReportedValueBasis,
  SampleStage,
} from '../../domain/models/types';
import {
  getAllExperimentInstrumentMeasurements,
  getAllExperimentSurveyMeasurements,
} from '../../domain/models/projections';
import {
  MEASUREMENT_QUALIFIER_LABELS,
  resolveEffectiveMeasurementQualifier,
  resolveSurveyAnalyticalLinks,
  suggestSurveyAnalyticalMatches,
} from '../../domain/calculations/seaMath';
import {
  exportAnalyticalSessionSamplesCsv,
  exportMeasurementLinkageCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { InstrumentImportModal } from './InstrumentImportModal';
import {
  Button,
  ConfirmDialog,
  NumericInput,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  compactCellInputClass,
  inputBaseClass,
} from '../../components/ui/Primitives';

const SAMPLE_STAGES: SampleStage[] = [
  'Initial',
  'Final',
  'Blank',
  'Control',
  'Reference Material',
  'Replicate',
  'User-Defined',
];

type SortField = 'sampleId' | 'analyte' | 'stage' | 'reportedConc' | 'rawSignal' | 'dilutionFactor';

export interface SampleMeasurementsTabProps {
  experiment: Experiment;
  session: AnalyticalSession;
  activeAnalyte: AnalyticalAnalyte | null;
  templates: ImportMappingTemplate[];
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
  onSaveTemplate: (
    template: Omit<ImportMappingTemplate, 'id' | 'createdAt'>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;
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
}

export function SampleMeasurementsTab({
  experiment,
  session,
  activeAnalyte,
  templates,
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
}: SampleMeasurementsTabProps) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [analyteFilter, setAnalyteFilter] = useState<string>('all');
  const [qualityFilter, setQualityFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('sampleId');
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    analyte: true,
    stage: true,
    replicate: true,
    conc: true,
    qualifier: true,
    signal: true,
    dilution: true,
    valueBasis: true,
    calibration: true,
    flag: true,
    quality: true,
    provenance: false,
  });

  // Bulk edit controls
  const [bulkStage, setBulkStage] = useState<SampleStage | ''>('');
  const [bulkQuality, setBulkQuality] = useState<MeasurementQualityStatus | ''>('');
  const [bulkCalId, setBulkCalId] = useState<string>('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<{
    surveyDatasetId: string;
    surveyMeasurementId: string;
    stage: 'Initial' | 'Final';
    label: string;
  } | null>(null);

  const allSurveyEntries = useMemo(
    () => getAllExperimentSurveyMeasurements(experiment),
    [experiment]
  );
  const allInstruments = useMemo(
    () => getAllExperimentInstrumentMeasurements(experiment),
    [experiment]
  );

  const knownSurveySampleIds = useMemo(
    () => allSurveyEntries.map((e) => e.measurement.sampleId),
    [allSurveyEntries]
  );

  const matchSuggestions = useMemo(
    () => suggestSurveyAnalyticalMatches(experiment, session),
    [experiment, session]
  );

  // Resolve links across ALL survey datasets in the experiment for inspection
  const surveyLinkRows = useMemo(() => {
    const rows: Array<{
      surveyDatasetId: string;
      surveyDatasetCode: string;
      surveyMeasurementId: string;
      surveySampleId: string;
      stage: 'Initial' | 'Final';
      surveyConcPpm: number | null;
      linkedId: string | null;
      linkedSampleId: string | null;
      linkedEffectiveConcPpm: number | null;
      hasDiscrepancy: boolean;
      discrepancyDeltaPpm: number | null;
      sourceUnavailable: boolean;
      conversionError: string | null;
    }> = [];

    for (const ds of experiment.surveyDatasets ?? []) {
      const resolved = resolveSurveyAnalyticalLinks(
        ds.measurements,
        allInstruments,
        ds.analysisConfig?.discrepancyTolerancePpm ?? 0.05
      );
      for (const m of ds.measurements) {
        const entry = resolved[m.id];
        if (!entry) continue;
        for (const pair of [entry.initial, entry.final]) {
          if (!pair.linkedMeasurementId) continue;
          rows.push({
            surveyDatasetId: ds.id,
            surveyDatasetCode: ds.datasetId,
            surveyMeasurementId: m.id,
            surveySampleId: m.sampleId,
            stage: pair.stage,
            surveyConcPpm: pair.surveyRecordedConcPpm,
            linkedId: pair.linkedMeasurementId,
            linkedSampleId: pair.linkedRecord?.sampleId ?? null,
            linkedEffectiveConcPpm: pair.linkedEffectiveConcPpm,
            hasDiscrepancy: pair.hasDiscrepancy,
            discrepancyDeltaPpm: pair.discrepancyDeltaPpm,
            sourceUnavailable: pair.sourceUnavailable,
            conversionError: pair.conversionError,
          });
        }
      }
    }
    return rows;
  }, [experiment.surveyDatasets, allInstruments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (session.sampleMeasurements ?? []).filter((m) => {
      if (stageFilter !== 'all' && m.stage !== stageFilter) return false;
      if (analyteFilter !== 'all' && m.analyte !== analyteFilter) return false;
      if (qualityFilter !== 'all' && m.qualityStatus !== qualityFilter) return false;
      if (q) {
        const hay = `${m.sampleId} ${m.analyte} ${m.linkedSurveySampleId} ${m.instrumentFlag ?? ''} ${m.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    session.sampleMeasurements,
    search,
    stageFilter,
    analyteFilter,
    qualityFilter,
    sortField,
    sortAsc,
  ]);

  const totalPages = Math.max(
    1,
    pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize)
  );
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    if (pageSize === 0) return filtered;
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const toggleSelectAllPage = () => {
    const pageIds = paginated.map((r) => r.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const applyBulkUpdate = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const patch: Partial<InstrumentMeasurement> = {};
    if (bulkStage) patch.stage = bulkStage;
    if (bulkQuality) patch.qualityStatus = bulkQuality;
    if (bulkCalId) patch.calibrationDatasetId = bulkCalId === '__none__' ? null : bulkCalId;
    if (Object.keys(patch).length > 0) {
      onBulkUpdateSamples(ids, patch);
    }
    setBulkStage('');
    setBulkQuality('');
    setBulkCalId('');
  };

  const distinctAnalytes = Array.from(
    new Set(
      (session.sampleMeasurements ?? []).map((m) => m.analyte).filter(Boolean)
    )
  );

  // Manual Link Builder State
  const [manualSampleId, setManualSampleId] = useState('');
  const [manualSurveyId, setManualSurveyId] = useState('');
  const [manualStage, setManualStage] = useState<'Initial' | 'Final'>('Final');

  const handleManualLink = () => {
    if (!manualSampleId || !manualSurveyId) return;
    const targetSurvey = allSurveyEntries.find(
      (e) => e.measurement.id === manualSurveyId
    );
    if (!targetSurvey) return;
    onLinkToSurvey({
      surveyDatasetId: targetSurvey.datasetId,
      surveyMeasurementId: targetSurvey.measurement.id,
      stage: manualStage,
      instrumentMeasurementId: manualSampleId,
    });
    setManualSampleId('');
    setManualSurveyId('');
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={`Instrument Sample Measurements (${filtered.length} of ${session.sampleMeasurements.length})`}
          subtitle="Record or import ICP-OES / AAS sample outputs with explicit value basis, calibration association, and exclusion tracking."
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onAddSample('Final')}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Sample
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                Import Instrument CSV
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  triggerFileDownload(
                    exportAnalyticalSessionSamplesCsv(
                      { experimentId: experiment.experimentId },
                      session
                    ),
                    `${experiment.experimentId}-${session.sessionId}-samples.csv`,
                    'text/csv;charset=utf-8'
                  )
                }
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            </div>
          }
        />

        {/* Filter & Column Toolbar */}
        <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#F8F9FA] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search sample, flag, notes..."
                className="h-7 pl-7 pr-2.5 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px] w-48"
              />
            </div>

            <select
              aria-label="Filter by sample stage"
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="all">All Stages</option>
              {SAMPLE_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by analyte"
              value={analyteFilter}
              onChange={(e) => {
                setAnalyteFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="all">All Analytes</option>
              {distinctAnalytes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by quality status"
              value={qualityFilter}
              onChange={(e) => {
                setQualityFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="all">All Quality</option>
              <option value="valid">Valid</option>
              <option value="flagged">Flagged</option>
              <option value="excluded_by_user">Excluded</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="flex items-center gap-2 relative">
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-7 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={0}>All rows</option>
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowColumnMenu((s) => !s)}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Columns
            </Button>
            {showColumnMenu && (
              <div className="absolute right-0 top-8 z-30 w-48 p-2.5 bg-white border border-[#E5E7EB] rounded-[6px] space-y-1.5 text-[12px]">
                {(Object.keys(visibleCols) as Array<keyof typeof visibleCols>).map(
                  (col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2 cursor-pointer capitalize"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCols[col]}
                        onChange={(e) =>
                          setVisibleCols((prev) => ({
                            ...prev,
                            [col]: e.target.checked,
                          }))
                        }
                      />
                      {col}
                    </label>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-[#EFF6FF] border-b border-[#BFDBFE] flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="font-medium text-[#0F52BA]">
              {selectedIds.size} row(s) selected
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as SampleStage | '')}
                className="h-7 px-2 text-[11.5px] bg-white border border-[#BFDBFE] rounded-[4px]"
              >
                <option value="">Set Stage...</option>
                {SAMPLE_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <select
                value={bulkQuality}
                onChange={(e) =>
                  setBulkQuality(
                    e.target.value as MeasurementQualityStatus | ''
                  )
                }
                className="h-7 px-2 text-[11.5px] bg-white border border-[#BFDBFE] rounded-[4px]"
              >
                <option value="">Set Quality...</option>
                <option value="valid">Valid</option>
                <option value="flagged">Flagged</option>
                <option value="excluded_by_user">Excluded</option>
                <option value="pending">Pending</option>
              </select>
              <select
                value={bulkCalId}
                onChange={(e) => setBulkCalId(e.target.value)}
                className="h-7 px-2 text-[11.5px] bg-white border border-[#BFDBFE] rounded-[4px]"
              >
                <option value="">Assign Calibration...</option>
                <option value="__none__">— Clear Calibration —</option>
                {session.calibrationDatasets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.calibrationId}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="primary" onClick={applyBulkUpdate}>
                Apply Bulk
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onDuplicateSamples(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirmBulkDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Main Scrollable Table with Sticky Header & Sticky Sample ID */}
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-[#F8F9FA] sticky top-0 z-20 border-b border-[#E5E7EB]">
              <tr className="text-left text-[10.5px] uppercase tracking-[0.04em] text-[#6B7280]">
                <th className="px-2.5 py-2 w-8 sticky left-0 bg-[#F8F9FA] z-30">
                  <input
                    type="checkbox"
                    aria-label="Select all visible sample rows"
                    checked={
                      paginated.length > 0 &&
                      paginated.every((r) => selectedIds.has(r.id))
                    }
                    onChange={toggleSelectAllPage}
                  />
                </th>
                <th className="px-2 py-2 sticky left-8 bg-[#F8F9FA] z-30 border-r border-[#E5E7EB] min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => toggleSort('sampleId')}
                    className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                  >
                    Sample ID <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                {visibleCols.analyte && (
                  <th className="px-2 py-2 min-w-[70px]">Analyte</th>
                )}
                {visibleCols.stage && (
                  <th className="px-2 py-2 min-w-[115px]">Stage</th>
                )}
                {visibleCols.replicate && (
                  <th className="px-2 py-2 w-16">Rep</th>
                )}
                {visibleCols.conc && (
                  <th className="px-2 py-2 text-right min-w-[115px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('reportedConc')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      Reported Conc <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                )}
                {visibleCols.qualifier && (
                  <th className="px-2 py-2 min-w-[145px]">Value Qualifier / Limit</th>
                )}
                {visibleCols.signal && (
                  <th className="px-2 py-2 text-right min-w-[95px]">Raw Signal</th>
                )}
                {visibleCols.dilution && (
                  <th className="px-2 py-2 text-right w-20">Dil. (×)</th>
                )}
                {visibleCols.valueBasis && (
                  <th className="px-2 py-2 min-w-[155px]">Value Basis</th>
                )}
                {visibleCols.calibration && (
                  <th className="px-2 py-2 min-w-[125px]">Calibration</th>
                )}
                {visibleCols.flag && (
                  <th className="px-2 py-2 min-w-[130px]">Instrument Flag</th>
                )}
                {visibleCols.quality && (
                  <th className="px-2 py-2 min-w-[110px]">Quality</th>
                )}
                <th className="px-2 py-2 min-w-[170px]">
                  Exclusion Reason / Notes
                </th>
                {visibleCols.provenance && (
                  <th className="px-2 py-2">Provenance</th>
                )}
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-[#6B7280]">
                    No sample measurements match the active filters.
                  </td>
                </tr>
              ) : (
                paginated.map((row) => {
                  const isExcluded = row.qualityStatus === 'excluded_by_user';
                  const isSelected = selectedIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={
                        isSelected
                          ? 'bg-[#EFF6FF]/60'
                          : isExcluded
                            ? 'bg-[#F9FAFB] opacity-75'
                            : 'hover:bg-[#F8F9FA]'
                      }
                    >
                      <td className="px-2.5 py-1.5 sticky left-0 bg-white z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 sticky left-8 bg-white z-10 border-r border-[#E5E7EB]">
                        <input
                          type="text"
                          value={row.sampleId}
                          onChange={(e) =>
                            onUpdateSample(row.id, { sampleId: e.target.value })
                          }
                          className={`${compactCellInputClass} font-mono font-medium`}
                        />
                      </td>
                      {visibleCols.analyte && (
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.analyte}
                            onChange={(e) =>
                              onUpdateSample(row.id, { analyte: e.target.value })
                            }
                            className={`${compactCellInputClass} font-mono`}
                          />
                        </td>
                      )}
                      {visibleCols.stage && (
                        <td className="px-2 py-1.5">
                          <select
                            value={row.stage}
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                stage: e.target.value as SampleStage,
                              })
                            }
                            className="h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                          >
                            {SAMPLE_STAGES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleCols.replicate && (
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.replicateId}
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                replicateId: e.target.value,
                              })
                            }
                            className={`${compactCellInputClass} font-mono`}
                          />
                        </td>
                      )}
                      {visibleCols.conc && (
                        <td className="px-2 py-1.5">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <NumericInput
                                compact
                                value={row.reportedConc}
                                onChange={(v) =>
                                  onUpdateSample(row.id, {
                                    reportedConc: v,
                                    valueQualifier:
                                      v === null
                                        ? row.valueQualifier === 'valid_numeric' ||
                                          row.valueQualifier === 'valid_zero'
                                          ? 'missing'
                                          : row.valueQualifier
                                        : v === 0
                                          ? 'valid_zero'
                                          : 'valid_numeric',
                                  })
                                }
                              />
                              <span className="font-mono text-[10.5px] text-[#6B7280] shrink-0">
                                {row.concUnit}
                              </span>
                            </div>
                            {row.reportedConc === null &&
                              row.originalValueToken && (
                                <div className="text-[10px] font-mono text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-1 rounded-[3px] inline-block">
                                  Token: {row.originalValueToken}
                                </div>
                              )}
                          </div>
                        </td>
                      )}
                      {visibleCols.qualifier && (
                        <td className="px-2 py-1.5">
                          <div className="space-y-1">
                            <select
                              aria-label={`Value qualifier for ${row.sampleId}`}
                              value={resolveEffectiveMeasurementQualifier(row)}
                              onChange={(e) => {
                                const q = e.target
                                  .value as MeasurementValueQualifier;
                                const isCensoredOrNull =
                                  q === 'missing' ||
                                  q === 'not_measured' ||
                                  q === 'not_detected' ||
                                  q === 'below_lod' ||
                                  q === 'below_loq' ||
                                  q === 'instrument_invalid';
                                onUpdateSample(row.id, {
                                  valueQualifier: q,
                                  reportedConc: isCensoredOrNull
                                    ? null
                                    : q === 'valid_zero'
                                      ? 0
                                      : row.reportedConc,
                                  suppliedLimitType:
                                    q === 'below_lod'
                                      ? row.suppliedLimitType ?? 'LOD'
                                      : q === 'below_loq'
                                        ? row.suppliedLimitType ?? 'LOQ'
                                        : row.suppliedLimitType ?? null,
                                });
                              }}
                              className="h-7 px-1.5 text-[11px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                            >
                              {(
                                Object.keys(
                                  MEASUREMENT_QUALIFIER_LABELS
                                ) as MeasurementValueQualifier[]
                              ).map((qKey) => (
                                <option key={qKey} value={qKey}>
                                  {MEASUREMENT_QUALIFIER_LABELS[qKey]}
                                </option>
                              ))}
                            </select>
                            {(resolveEffectiveMeasurementQualifier(row) ===
                              'below_lod' ||
                              resolveEffectiveMeasurementQualifier(row) ===
                                'below_loq') && (
                              <div className="flex items-center gap-1 text-[10px] font-mono text-[#6B7280]">
                                <span>
                                  {row.suppliedLimitType ||
                                    (resolveEffectiveMeasurementQualifier(
                                      row
                                    ) === 'below_loq'
                                      ? 'LOQ'
                                      : 'LOD')}
                                  :
                                </span>
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  aria-label={`Supplied limit for ${row.sampleId}`}
                                  value={row.suppliedLimitValue ?? ''}
                                  placeholder="limit"
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    const num = raw === '' ? null : Number(raw);
                                    onUpdateSample(row.id, {
                                      suppliedLimitValue:
                                        num !== null && Number.isFinite(num)
                                          ? num
                                          : null,
                                      suppliedLimitUnit:
                                        row.suppliedLimitUnit || row.concUnit,
                                      originalValueToken:
                                        num !== null && Number.isFinite(num)
                                          ? `<${num}`
                                          : row.originalValueToken,
                                    });
                                  }}
                                  className="w-16 h-5 px-1 text-[10.5px] bg-white border border-[#E5E7EB] rounded-[3px] text-right font-mono"
                                />
                                <span>{row.suppliedLimitUnit || row.concUnit}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.signal && (
                        <td className="px-2 py-1.5">
                          <NumericInput
                            compact
                            value={row.rawSignal}
                            onChange={(v) =>
                              onUpdateSample(row.id, { rawSignal: v })
                            }
                          />
                        </td>
                      )}
                      {visibleCols.dilution && (
                        <td className="px-2 py-1.5">
                          <NumericInput
                            compact
                            min={0}
                            value={row.dilutionFactor}
                            onChange={(v) =>
                              onUpdateSample(row.id, { dilutionFactor: v })
                            }
                          />
                        </td>
                      )}
                      {visibleCols.valueBasis && (
                        <td className="px-2 py-1.5">
                          <select
                            value={row.reportedValueBasis ?? 'unspecified'}
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                reportedValueBasis: e.target
                                  .value as ReportedValueBasis,
                              })
                            }
                            className="h-7 px-1.5 text-[11px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                          >
                            <option value="as_measured_diluted">As-Measured (Diluted)</option>
                            <option value="already_dilution_corrected">
                              Already Corrected
                            </option>
                            <option value="unspecified">Unspecified</option>
                          </select>
                        </td>
                      )}
                      {visibleCols.calibration && (
                        <td className="px-2 py-1.5">
                          <select
                            value={row.calibrationDatasetId ?? ''}
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                calibrationDatasetId: e.target.value || null,
                              })
                            }
                            className="h-7 px-1.5 text-[11px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                          >
                            <option value="">— None —</option>
                            {session.calibrationDatasets.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.calibrationId}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleCols.flag && (
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.instrumentFlag ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                instrumentFlag: e.target.value,
                              })
                            }
                            className={`${compactCellInputClass} font-mono text-[#92400E]`}
                          />
                        </td>
                      )}
                      {visibleCols.quality && (
                        <td className="px-2 py-1.5">
                          <select
                            value={row.qualityStatus}
                            onChange={(e) =>
                              onUpdateSample(row.id, {
                                qualityStatus: e.target
                                  .value as MeasurementQualityStatus,
                              })
                            }
                            className="h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                          >
                            <option value="valid">Valid</option>
                            <option value="flagged">Flagged</option>
                            <option value="excluded_by_user">Excluded</option>
                            <option value="pending">Pending</option>
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={
                            isExcluded ? row.exclusionReason ?? '' : row.notes
                          }
                          placeholder={
                            isExcluded
                              ? 'Document exclusion reason...'
                              : 'Sample notes...'
                          }
                          onChange={(e) =>
                            onUpdateSample(
                              row.id,
                              isExcluded
                                ? { exclusionReason: e.target.value }
                                : { notes: e.target.value }
                            )
                          }
                          className={compactCellInputClass}
                        />
                      </td>
                      {visibleCols.provenance && (
                        <td className="px-2 py-1.5">
                          <ProvenanceIndicator provenance={row.provenance} />
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label={`Delete sample ${row.sampleId}`}
                          onClick={() => onDeleteSample(row.id)}
                          className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pageSize > 0 && filtered.length > pageSize && (
          <div className="px-4 py-2 border-t border-[#E5E7EB] flex items-center justify-between text-[12px] text-[#4B5563]">
            <span>
              Page {safePage} of {totalPages} ({filtered.length} rows)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Survey <-> Analytical Traceable Linkage Workspace */}
      <Panel>
        <PanelHeader
          title="Survey & Analytical Measurement Linkage"
          subtitle="Explicit UUID-based traceability between Uptake/PZC survey rows and analytical aliquots. Discrepancies are surfaced for researcher review and never silently overwritten."
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                triggerFileDownload(
                  exportMeasurementLinkageCsv(experiment),
                  `${experiment.experimentId}-measurement-linkage.csv`,
                  'text/csv;charset=utf-8'
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
              Linkage CSV
            </Button>
          }
        />

        <div className="p-4 space-y-4">
          {/* Manual Association Controls */}
          <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div>
              <label className="block text-[10.5px] uppercase text-[#6B7280] mb-1">
                Analytical Sample ({session.sessionId})
              </label>
              <select
                value={manualSampleId}
                onChange={(e) => setManualSampleId(e.target.value)}
                className={`${inputBaseClass} bg-white`}
              >
                <option value="">— Select Analytical Sample —</option>
                {session.sampleMeasurements
                  .filter((m) => m.stage === 'Initial' || m.stage === 'Final')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.sampleId} ({m.stage}, {m.reportedConc ?? '—'} {m.concUnit})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] uppercase text-[#6B7280] mb-1">
                Target Survey Measurement
              </label>
              <select
                value={manualSurveyId}
                onChange={(e) => setManualSurveyId(e.target.value)}
                className={`${inputBaseClass} bg-white`}
              >
                <option value="">— Select Survey Row —</option>
                {allSurveyEntries.map((e) => (
                  <option key={e.measurement.id} value={e.measurement.id}>
                    {e.datasetCode} · {e.measurement.sampleId} ({e.measurement.replicateId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] uppercase text-[#6B7280] mb-1">
                Link Slot
              </label>
              <select
                value={manualStage}
                onChange={(e) =>
                  setManualStage(e.target.value as 'Initial' | 'Final')
                }
                className={`${inputBaseClass} bg-white`}
              >
                <option value="Initial">Initial Concentration (C₀)</option>
                <option value="Final">Final Concentration (Cf)</option>
              </select>
            </div>
            <Button
              size="md"
              variant="primary"
              disabled={!manualSampleId || !manualSurveyId}
              onClick={handleManualLink}
            >
              <Link2 className="w-3.5 h-3.5" />
              Confirm Link
            </Button>
          </div>

          {/* Exact-ID Match Suggestions */}
          {matchSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.04em] font-semibold text-[#4B5563]">
                Suggested Exact-ID Matches (Requires Explicit Confirmation)
              </div>
              <div className="space-y-1.5">
                {matchSuggestions.map((sug) => (
                  <div
                    key={sug.instrumentMeasurementId}
                    className="px-3 py-2 bg-[#EFF6FF]/50 border border-[#BFDBFE] rounded-[6px] flex flex-wrap items-center justify-between gap-2 text-[12px]"
                  >
                    <div>
                      <span className="font-mono font-semibold text-[#111827]">
                        {sug.instrumentSampleId}
                      </span>{' '}
                      ({sug.instrumentStage}) matches{' '}
                      {sug.candidateMatches.length} survey record(s)
                      {sug.isAmbiguous && (
                        <span className="ml-1.5 text-[#92400E] font-medium">
                          (Ambiguous — select exact target)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sug.candidateMatches.map((cand) => (
                        <Button
                          key={`${cand.surveyDatasetId}-${cand.surveyMeasurementId}`}
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            onLinkToSurvey({
                              surveyDatasetId: cand.surveyDatasetId,
                              surveyMeasurementId: cand.surveyMeasurementId,
                              stage: cand.targetStage,
                              instrumentMeasurementId: sug.instrumentMeasurementId,
                            })
                          }
                        >
                          <Link2 className="w-3 h-3" />
                          Link → {cand.surveyDatasetCode} / {cand.surveySampleId}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Linked Records & Discrepancy Inspection Table */}
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                <tr className="text-left text-[10.5px] uppercase text-[#6B7280]">
                  <th className="px-3 py-2">Survey Record</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Linked Analytical Sample</th>
                  <th className="px-3 py-2 text-right">Survey Conc (ppm)</th>
                  <th className="px-3 py-2 text-right">Analytical Eff. (ppm)</th>
                  <th className="px-3 py-2">Status / Discrepancy</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {surveyLinkRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-5 text-center text-[#6B7280]">
                      No confirmed survey-to-analytical links exist yet.
                    </td>
                  </tr>
                ) : (
                  surveyLinkRows.map((lr) => (
                    <tr
                      key={`${lr.surveyDatasetId}-${lr.surveyMeasurementId}-${lr.stage}`}
                    >
                      <td className="px-3 py-1.5 font-mono">
                        {lr.surveyDatasetCode} / {lr.surveySampleId}
                      </td>
                      <td className="px-3 py-1.5">{lr.stage}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {lr.sourceUnavailable ? (
                          <span className="text-[#991B1B]">
                            Source unavailable ({lr.linkedId})
                          </span>
                        ) : (
                          lr.linkedSampleId
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-right tabular-nums">
                        {lr.surveyConcPpm !== null ? lr.surveyConcPpm.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-right tabular-nums">
                        {lr.linkedEffectiveConcPpm !== null
                          ? lr.linkedEffectiveConcPpm.toFixed(2)
                          : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {lr.sourceUnavailable ? (
                          <span className="text-[#991B1B] font-medium">
                            Broken source link
                          </span>
                        ) : lr.conversionError ? (
                          <span className="text-[#991B1B]">{lr.conversionError}</span>
                        ) : lr.hasDiscrepancy ? (
                          <span className="inline-flex items-center gap-1 text-[#92400E] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Δ = {lr.discrepancyDeltaPpm?.toFixed(2)} ppm
                          </span>
                        ) : (
                          <span className="text-[#065F46]">Aligned</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right space-x-1.5">
                        {lr.hasDiscrepancy &&
                          lr.linkedEffectiveConcPpm !== null && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                onApplyAnalyticalToSurvey({
                                  surveyDatasetId: lr.surveyDatasetId,
                                  surveyMeasurementId: lr.surveyMeasurementId,
                                  stage: lr.stage,
                                  effectiveConcPpm:
                                    lr.linkedEffectiveConcPpm as number,
                                })
                              }
                            >
                              Apply Analytical Value
                            </Button>
                          )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPendingUnlink({
                              surveyDatasetId: lr.surveyDatasetId,
                              surveyMeasurementId: lr.surveyMeasurementId,
                              stage: lr.stage,
                              label: `${lr.surveySampleId} (${lr.stage})`,
                            })
                          }
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <InstrumentImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        session={session}
        activeAnalyte={activeAnalyte}
        knownSurveySampleIds={knownSurveySampleIds}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onCommitImport={onAddSamplesBulk}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete Selected Sample Measurements"
        message={`Delete ${selectedIds.size} selected analytical measurement row(s)? Any linked survey rows will explicitly flag those links as source unavailable.`}
        confirmLabel="Delete Selected"
        onConfirm={() => {
          onDeleteSamplesBulk(Array.from(selectedIds));
          setSelectedIds(new Set());
          setConfirmBulkDelete(false);
        }}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingUnlink)}
        title="Remove Survey–Analytical Link"
        message={`Remove the analytical link on ${pendingUnlink?.label ?? 'this record'}? Existing recorded concentration numbers in both tables remain untouched.`}
        confirmLabel="Unlink Record"
        onConfirm={() => {
          if (pendingUnlink) {
            onUnlinkFromSurvey({
              surveyDatasetId: pendingUnlink.surveyDatasetId,
              surveyMeasurementId: pendingUnlink.surveyMeasurementId,
              stage: pendingUnlink.stage,
            });
          }
          setPendingUnlink(null);
        }}
        onCancel={() => setPendingUnlink(null)}
      />
    </div>
  );
}

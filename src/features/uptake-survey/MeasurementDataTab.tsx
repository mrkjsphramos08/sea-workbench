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
  Upload,
} from 'lucide-react';
import {
  DataProvenance,
  Experiment,
  MeasurementQualityStatus,
  SurveyDataset,
  SurveyMeasurement,
} from '../../domain/models/types';
import {
  formatScientificNumber,
  resolveSurveyAnalyticalLinks,
} from '../../domain/calculations/seaMath';
import {
  exportSurveyMeasurementsCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  Modal,
  NumericInput,
  PROVENANCE_LABELS,
  Panel,
  PanelHeader,
  compactCellInputClass,
  inputBaseClass,
} from '../../components/ui/Primitives';
import { CsvImportModal } from './CsvImportModal';

type SortKey =
  | 'none'
  | 'sampleId'
  | 'sampleGroupId'
  | 'measuredInitialPh'
  | 'measuredFinalPh'
  | 'deltaPh'
  | 'recordedUptakeUmolM2'
  | 'qualityStatus';

type ColumnKey =
  | 'group'
  | 'replicate'
  | 'targetPh'
  | 'initialPh'
  | 'finalPh'
  | 'deltaPh'
  | 'initialConc'
  | 'finalConc'
  | 'mass'
  | 'volume'
  | 'uptake'
  | 'analyticalLink'
  | 'quality'
  | 'provenance'
  | 'notes';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  group: 'Group ID',
  replicate: 'Replicate',
  targetPh: 'Target pHi',
  initialPh: 'Meas. pHi',
  finalPh: 'Meas. pHf',
  deltaPh: 'ΔpH',
  initialConc: 'C₀ (ppm)',
  finalConc: 'Cf (ppm)',
  mass: 'Mass (mg)',
  volume: 'Vol. (mL)',
  uptake: 'Uptake (µmol/m²)',
  analyticalLink: 'Analytical Link',
  quality: 'Quality / Exclusion',
  provenance: 'Provenance',
  notes: 'Notes',
};

const ROW_PROVENANCE_OPTIONS: DataProvenance[] = [
  'measured_experimental',
  'user_entered',
  'literature_reference',
  'theoretical_estimate',
  'synthetic_demo',
  'unavailable',
];

const QUALITY_OPTIONS: { value: MeasurementQualityStatus; label: string }[] = [
  { value: 'valid', label: 'Valid' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'excluded_by_user', label: 'Excluded' },
  { value: 'pending', label: 'Pending' },
];

export function MeasurementDataTab({
  experiment,
  dataset,
  onAddRow,
  onAddRowsBulk,
  onDuplicateRows,
  onUpdateRow,
  onDeleteRow,
  onDeleteRowsBulk,
}: {
  experiment: Experiment;
  dataset: SurveyDataset;
  onAddRow: () => void;
  onAddRowsBulk: (rows: SurveyMeasurement[]) => void;
  onDuplicateRows: (rowIds: string[]) => void;
  onUpdateRow: (rowId: string, patch: Partial<SurveyMeasurement>) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteRowsBulk: (rowIds: string[]) => void;
}) {
  const rows = dataset.measurements;
  const instrumentMeasurements = experiment.instrumentMeasurements;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [qualityFilter, setQualityFilter] = useState<string>('ALL');
  const [provenanceFilter, setProvenanceFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [linkModalRowId, setLinkModalRowId] = useState<string | null>(null);
  const [exclusionModalRowId, setExclusionModalRowId] = useState<string | null>(
    null
  );
  const [exclusionReasonDraft, setExclusionReasonDraft] = useState('');

  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>({
    group: true,
    replicate: true,
    targetPh: true,
    initialPh: true,
    finalPh: true,
    deltaPh: true,
    initialConc: true,
    finalConc: true,
    mass: true,
    volume: true,
    uptake: true,
    analyticalLink: true,
    quality: true,
    provenance: true,
    notes: true,
  });

  const analyticalLinks = useMemo(
    () =>
      resolveSurveyAnalyticalLinks(
        rows,
        instrumentMeasurements,
        dataset.analysisConfig.discrepancyTolerancePpm
      ),
    [
      rows,
      instrumentMeasurements,
      dataset.analysisConfig.discrepancyTolerancePpm,
    ]
  );

  const linkAlerts = useMemo(() => {
    let discrepancies = 0;
    let unavailable = 0;
    for (const r of rows) {
      const entry = analyticalLinks[r.id];
      if (!entry) continue;
      if (entry.initial.hasDiscrepancy) discrepancies += 1;
      if (entry.final.hasDiscrepancy) discrepancies += 1;
      if (entry.initial.sourceUnavailable) unavailable += 1;
      if (entry.final.sourceUnavailable) unavailable += 1;
    }
    return { discrepancies, unavailable };
  }, [rows, analyticalLinks]);

  const distinctGroups = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.sampleGroupId.trim()) s.add(r.sampleGroupId.trim());
    }
    return Array.from(s).sort();
  }, [rows]);

  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (groupFilter !== 'ALL' && r.sampleGroupId !== groupFilter) return false;
      if (qualityFilter !== 'ALL' && r.qualityStatus !== qualityFilter)
        return false;
      if (provenanceFilter !== 'ALL' && r.provenance !== provenanceFilter)
        return false;
      if (q) {
        const hay = `${r.sampleId} ${r.sampleGroupId} ${r.replicateId} ${r.notes} ${r.exclusionReason ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortKey === 'none') return filtered;

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const cmpNum = (va: number | null, vb: number | null) => {
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * dir;
      };

      switch (sortKey) {
        case 'sampleId':
          return a.sampleId.localeCompare(b.sampleId) * dir;
        case 'sampleGroupId':
          return a.sampleGroupId.localeCompare(b.sampleGroupId) * dir;
        case 'measuredInitialPh':
          return cmpNum(a.measuredInitialPh, b.measuredInitialPh);
        case 'measuredFinalPh':
          return cmpNum(a.measuredFinalPh, b.measuredFinalPh);
        case 'deltaPh': {
          const da =
            a.measuredInitialPh !== null && a.measuredFinalPh !== null
              ? a.measuredFinalPh - a.measuredInitialPh
              : null;
          const db =
            b.measuredInitialPh !== null && b.measuredFinalPh !== null
              ? b.measuredFinalPh - b.measuredInitialPh
              : null;
          return cmpNum(da, db);
        }
        case 'recordedUptakeUmolM2':
          return cmpNum(a.recordedUptakeUmolM2, b.recordedUptakeUmolM2);
        case 'qualityStatus':
          return a.qualityStatus.localeCompare(b.qualityStatus) * dir;
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    rows,
    searchQuery,
    groupFilter,
    qualityFilter,
    provenanceFilter,
    sortKey,
    sortDir,
  ]);

  const totalPages =
    pageSize === 0
      ? 1
      : Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    if (pageSize === 0) return filteredAndSortedRows;
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, pageSize, safePage]);

  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => rows.some((r) => r.id === id)),
    [selectedIds, rows]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else setSortKey('none');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = pagedRows.map((r) => r.id);
    const allSelected =
      pageIds.length > 0 && pageIds.every((id) => validSelectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleRowSelect = (rowId: string) => {
    setSelectedIds((prev) =>
      prev.includes(rowId)
        ? prev.filter((id) => id !== rowId)
        : [...prev, rowId]
    );
  };

  const handleExportCsv = () => {
    const csv = exportSurveyMeasurementsCsv(experiment, rows, {
      datasetId: dataset.datasetId,
      title: dataset.title,
      mode: dataset.mode,
    });
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-${dataset.datasetId}-measurements.csv`,
      'text/csv;charset=utf-8'
    );
  };

  // Keyboard navigation: Enter moves down one row in the same cell column
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'SELECT'))
      return;
    const td = target.closest('td');
    const tr = target.closest('tr');
    if (!td || !tr) return;
    const colIndex = Array.from(tr.children).indexOf(td);
    const nextRow = tr.nextElementSibling as HTMLTableRowElement | null;
    if (!nextRow) return;
    const nextCell = nextRow.children[colIndex];
    const nextInput = nextCell?.querySelector('input, select') as
      | HTMLElement
      | null;
    if (nextInput) {
      e.preventDefault();
      nextInput.focus();
    }
  };

  const activeLinkRow = linkModalRowId
    ? rows.find((r) => r.id === linkModalRowId) ?? null
    : null;
  const activeLinkInfo = activeLinkRow ? analyticalLinks[activeLinkRow.id] : null;

  const initialAnalyticalOptions = useMemo(
    () =>
      instrumentMeasurements.filter(
        (m) => m.stage === 'Initial' || m.stage === 'Control'
      ),
    [instrumentMeasurements]
  );

  const finalAnalyticalOptions = useMemo(
    () =>
      instrumentMeasurements.filter(
        (m) => m.stage === 'Final' || m.stage === 'Control'
      ),
    [instrumentMeasurements]
  );

  const activeExclusionRow = exclusionModalRowId
    ? rows.find((r) => r.id === exclusionModalRowId) ?? null
    : null;

  const isPzc = dataset.mode === 'pzc';

  return (
    <div className="space-y-4">
      {/* Analytical Discrepancy Banner */}
      {(linkAlerts.discrepancies > 0 || linkAlerts.unavailable > 0) && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[12px] text-[#92400E] flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <div>
            <strong>Analytical Linkage Review:</strong>{' '}
            {linkAlerts.discrepancies > 0 &&
              `${linkAlerts.discrepancies} linked concentration record(s) differ by more than ±${dataset.analysisConfig.discrepancyTolerancePpm} ppm. `}
            {linkAlerts.unavailable > 0 &&
              `${linkAlerts.unavailable} linked analytical record(s) are unavailable. `}
            Click <strong>Review</strong> in the Analytical Link column to
            inspect or explicitly copy values without silent overwriting.
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader
          title={`Measurement Data Table — ${dataset.datasetId}`}
          subtitle="Structured laboratory data entry with sticky Sample ID, keyboard navigation, CSV/spreadsheet import, and explicit analytical linkage."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportModalOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                Import CSV / Paste
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCsv}
                disabled={rows.length === 0}
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Export CSV
              </Button>
              <Button variant="primary" size="sm" onClick={onAddRow}>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Add Row
              </Button>
            </div>
          }
        />

        {/* Filter, Search, Column Visibility & Bulk Actions Toolbar */}
        <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#F8F9FA] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="text"
                aria-label="Search measurement rows"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search sample, group, notes..."
                className="h-8 pl-8 pr-2.5 w-52 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px] focus:border-[#0F52BA]"
              />
            </div>

            <select
              aria-label="Filter by replicate group"
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="ALL">All Groups ({distinctGroups.length})</option>
              {distinctGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by quality status"
              value={qualityFilter}
              onChange={(e) => {
                setQualityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="ALL">All Statuses</option>
              {QUALITY_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by provenance"
              value={provenanceFilter}
              onChange={(e) => {
                setProvenanceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px]"
            >
              <option value="ALL">All Provenance</option>
              {ROW_PROVENANCE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PROVENANCE_LABELS[p]}
                </option>
              ))}
            </select>

            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowColumnMenu((v) => !v)}
              >
                <Columns3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Columns
              </Button>
              {showColumnMenu && (
                <div className="absolute left-0 mt-1 w-52 bg-white border border-[#D1D5DB] rounded-[6px] p-2.5 z-30 space-y-1">
                  <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280] font-semibold pb-1 border-b border-[#E5E7EB]">
                    Visible Columns
                  </div>
                  {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2 text-[12px] text-[#374151] py-0.5 cursor-pointer"
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
                        className="accent-[#0F52BA]"
                      />
                      <span>{COLUMN_LABELS[col]}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {validSelectedIds.length > 0 && (
              <>
                <span className="text-[11.5px] font-mono text-[#0F52BA]">
                  {validSelectedIds.length} selected
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onDuplicateRows(validSelectedIds);
                    setSelectedIds([]);
                  }}
                >
                  <Copy className="w-3 h-3" strokeWidth={1.75} />
                  Duplicate Selected
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                  Delete Selected
                </Button>
              </>
            )}

            <div className="flex items-center gap-1.5 text-[11.5px] text-[#4B5563]">
              <span>Rows/page:</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 px-1.5 text-[11.5px] font-mono bg-white border border-[#E5E7EB] rounded-[5px]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={0}>All ({rows.length})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Scientific Table with Sticky Header and Sticky Sample ID */}
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead className="sticky top-0 z-20 bg-[#F8F9FA] border-b border-[#E5E7EB]">
              <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                <th className="py-2 px-2 w-8 sticky left-0 z-30 bg-[#F8F9FA]">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on page"
                    checked={
                      pagedRows.length > 0 &&
                      pagedRows.every((r) => validSelectedIds.includes(r.id))
                    }
                    onChange={toggleSelectAllOnPage}
                    className="accent-[#0F52BA]"
                  />
                </th>
                <th className="py-2 px-2 font-medium min-w-[105px] sticky left-8 z-30 bg-[#F8F9FA] border-r border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => toggleSort('sampleId')}
                    className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                  >
                    <span>Sample ID</span>
                    <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                </th>
                {visibleCols.group && (
                  <th className="py-2 px-2 font-medium min-w-[96px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('sampleGroupId')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>Group ID</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {visibleCols.replicate && (
                  <th className="py-2 px-2 font-medium min-w-[58px]">Rep</th>
                )}
                {visibleCols.targetPh && (
                  <th className="py-2 px-2 font-medium text-right min-w-[78px]">
                    Target pHi
                  </th>
                )}
                {visibleCols.initialPh && (
                  <th className="py-2 px-2 font-medium text-right min-w-[82px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('measuredInitialPh')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>pHi</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {visibleCols.finalPh && (
                  <th className="py-2 px-2 font-medium text-right min-w-[82px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('measuredFinalPh')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>pHf</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {visibleCols.deltaPh && (
                  <th className="py-2 px-2 font-medium text-right min-w-[68px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('deltaPh')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>ΔpH</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {!isPzc && visibleCols.initialConc && (
                  <th className="py-2 px-2 font-medium text-right min-w-[84px]">
                    C₀ (ppm)
                  </th>
                )}
                {!isPzc && visibleCols.finalConc && (
                  <th className="py-2 px-2 font-medium text-right min-w-[84px]">
                    Cf (ppm)
                  </th>
                )}
                {visibleCols.mass && (
                  <th className="py-2 px-2 font-medium text-right min-w-[78px]">
                    Mass (mg)
                  </th>
                )}
                {visibleCols.volume && (
                  <th className="py-2 px-2 font-medium text-right min-w-[74px]">
                    Vol (mL)
                  </th>
                )}
                {!isPzc && visibleCols.uptake && (
                  <th className="py-2 px-2 font-medium text-right min-w-[96px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('recordedUptakeUmolM2')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>Uptake</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {!isPzc && visibleCols.analyticalLink && (
                  <th className="py-2 px-2 font-medium min-w-[98px]">
                    Analytical Link
                  </th>
                )}
                {visibleCols.quality && (
                  <th className="py-2 px-2 font-medium min-w-[116px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('qualityStatus')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] cursor-pointer"
                    >
                      <span>Status</span>
                      <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </th>
                )}
                {visibleCols.provenance && (
                  <th className="py-2 px-2 font-medium min-w-[126px]">
                    Provenance
                  </th>
                )}
                {visibleCols.notes && (
                  <th className="py-2 px-2 font-medium min-w-[160px]">Notes</th>
                )}
                <th className="py-2 px-2 w-9" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody
              className="divide-y divide-[#E5E7EB]"
              onKeyDown={handleTableKeyDown}
            >
              {pagedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={18}
                    className="py-10 px-4 text-center text-[13px] text-[#6B7280]"
                  >
                    {rows.length === 0
                      ? 'No measurement rows in this dataset yet. Click "Add Row" or "Import CSV / Paste" to begin.'
                      : 'No rows match the current search or filter criteria.'}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const link = analyticalLinks[row.id];
                  const hasAnyLink = Boolean(
                    row.linkedInitialMeasurementId ||
                      row.linkedFinalMeasurementId
                  );
                  const hasIssue = Boolean(
                    link?.initial.hasDiscrepancy ||
                      link?.final.hasDiscrepancy ||
                      link?.initial.sourceUnavailable ||
                      link?.final.sourceUnavailable
                  );
                  const deltaPh =
                    row.measuredInitialPh !== null &&
                    row.measuredFinalPh !== null
                      ? row.measuredFinalPh - row.measuredInitialPh
                      : null;
                  const isExcluded = row.qualityStatus === 'excluded_by_user';
                  const isFlagged = row.qualityStatus === 'flagged';
                  const rowBg = isExcluded
                    ? 'bg-[#F9FAFB] opacity-65'
                    : isFlagged
                      ? 'bg-[#FFFBEB]/55'
                      : 'bg-white';
                  const stickyBg = isExcluded
                    ? 'bg-[#F9FAFB]'
                    : isFlagged
                      ? 'bg-[#FFFDF5]'
                      : 'bg-white';

                  return (
                    <tr key={row.id} className={rowBg}>
                      <td
                        className={`py-1 px-2 sticky left-0 z-10 ${stickyBg}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.sampleId}`}
                          checked={validSelectedIds.includes(row.id)}
                          onChange={() => toggleRowSelect(row.id)}
                          className="accent-[#0F52BA]"
                        />
                      </td>
                      <td
                        className={`py-1 px-2 sticky left-8 z-10 border-r border-[#E5E7EB] ${stickyBg}`}
                      >
                        <input
                          type="text"
                          aria-label={`Sample ID for ${row.sampleId}`}
                          value={row.sampleId}
                          onChange={(e) =>
                            onUpdateRow(row.id, { sampleId: e.target.value })
                          }
                          className={`${compactCellInputClass} font-mono font-medium`}
                        />
                      </td>
                      {visibleCols.group && (
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            aria-label={`Group ID for ${row.sampleId}`}
                            value={row.sampleGroupId}
                            onChange={(e) =>
                              onUpdateRow(row.id, {
                                sampleGroupId: e.target.value,
                              })
                            }
                            className={`${compactCellInputClass} font-mono`}
                          />
                        </td>
                      )}
                      {visibleCols.replicate && (
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            aria-label={`Replicate for ${row.sampleId}`}
                            value={row.replicateId}
                            onChange={(e) =>
                              onUpdateRow(row.id, {
                                replicateId: e.target.value,
                              })
                            }
                            className={`${compactCellInputClass} font-mono`}
                          />
                        </td>
                      )}
                      {visibleCols.targetPh && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Target initial pH for ${row.sampleId}`}
                            value={row.targetInitialPh}
                            onChange={(v) =>
                              onUpdateRow(row.id, { targetInitialPh: v })
                            }
                            min={-1}
                            max={15}
                          />
                        </td>
                      )}
                      {visibleCols.initialPh && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Measured initial pH for ${row.sampleId}`}
                            value={row.measuredInitialPh}
                            onChange={(v) =>
                              onUpdateRow(row.id, { measuredInitialPh: v })
                            }
                            min={-1}
                            max={15}
                          />
                        </td>
                      )}
                      {visibleCols.finalPh && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Measured final pH for ${row.sampleId}`}
                            value={row.measuredFinalPh}
                            onChange={(v) =>
                              onUpdateRow(row.id, { measuredFinalPh: v })
                            }
                            min={-1}
                            max={15}
                          />
                        </td>
                      )}
                      {visibleCols.deltaPh && (
                        <td className="py-1 px-2 text-right font-mono tabular-nums text-[#4B5563]">
                          {deltaPh !== null
                            ? `${deltaPh >= 0 ? '+' : ''}${deltaPh.toFixed(2)}`
                            : '—'}
                        </td>
                      )}
                      {!isPzc && visibleCols.initialConc && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Initial concentration for ${row.sampleId}`}
                            value={row.initialConcPpm}
                            onChange={(v) =>
                              onUpdateRow(row.id, { initialConcPpm: v })
                            }
                            min={0}
                          />
                        </td>
                      )}
                      {!isPzc && visibleCols.finalConc && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Final concentration for ${row.sampleId}`}
                            value={row.finalConcPpm}
                            onChange={(v) =>
                              onUpdateRow(row.id, { finalConcPpm: v })
                            }
                            min={0}
                          />
                        </td>
                      )}
                      {visibleCols.mass && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Support mass for ${row.sampleId}`}
                            value={row.supportMassMg}
                            onChange={(v) =>
                              onUpdateRow(row.id, { supportMassMg: v })
                            }
                            min={0}
                          />
                        </td>
                      )}
                      {visibleCols.volume && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Solution volume for ${row.sampleId}`}
                            value={row.solutionVolumeMl}
                            onChange={(v) =>
                              onUpdateRow(row.id, { solutionVolumeMl: v })
                            }
                            min={0}
                          />
                        </td>
                      )}
                      {!isPzc && visibleCols.uptake && (
                        <td className="py-1 px-2">
                          <NumericInput
                            compact
                            ariaLabel={`Recorded uptake for ${row.sampleId}`}
                            value={row.recordedUptakeUmolM2}
                            onChange={(v) =>
                              onUpdateRow(row.id, { recordedUptakeUmolM2: v })
                            }
                          />
                        </td>
                      )}
                      {!isPzc && visibleCols.analyticalLink && (
                        <td className="py-1 px-2">
                          <button
                            type="button"
                            onClick={() => setLinkModalRowId(row.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[4px] border cursor-pointer ${
                              hasIssue
                                ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                                : hasAnyLink
                                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                                  : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
                            }`}
                          >
                            <Link2 className="w-3 h-3" strokeWidth={1.75} />
                            <span>
                              {hasIssue
                                ? 'Review'
                                : hasAnyLink
                                  ? 'Linked'
                                  : 'Link'}
                            </span>
                          </button>
                        </td>
                      )}
                      {visibleCols.quality && (
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              aria-label={`Quality status for ${row.sampleId}`}
                              value={row.qualityStatus}
                              onChange={(e) => {
                                const next = e.target
                                  .value as MeasurementQualityStatus;
                                onUpdateRow(row.id, { qualityStatus: next });
                                if (
                                  (next === 'excluded_by_user' ||
                                    next === 'flagged') &&
                                  !row.exclusionReason
                                ) {
                                  setExclusionModalRowId(row.id);
                                  setExclusionReasonDraft(
                                    row.exclusionReason ?? ''
                                  );
                                }
                              }}
                              className={`${compactCellInputClass} text-[11.5px]`}
                            >
                              {QUALITY_OPTIONS.map((q) => (
                                <option key={q.value} value={q.value}>
                                  {q.label}
                                </option>
                              ))}
                            </select>
                            {(isExcluded || isFlagged) && (
                              <button
                                type="button"
                                title={
                                  row.exclusionReason ||
                                  'Document exclusion/flag reason'
                                }
                                onClick={() => {
                                  setExclusionModalRowId(row.id);
                                  setExclusionReasonDraft(
                                    row.exclusionReason ?? ''
                                  );
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-mono border border-[#E5E7EB] rounded-[4px] bg-white text-[#4B5563] hover:text-[#111827] cursor-pointer shrink-0"
                              >
                                {row.exclusionReason ? 'Note' : '+Why'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.provenance && (
                        <td className="py-1 px-2">
                          <select
                            aria-label={`Provenance for ${row.sampleId}`}
                            value={row.provenance}
                            onChange={(e) =>
                              onUpdateRow(row.id, {
                                provenance: e.target.value as DataProvenance,
                              })
                            }
                            className={`${compactCellInputClass} text-[11.5px]`}
                          >
                            {ROW_PROVENANCE_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {PROVENANCE_LABELS[p]}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleCols.notes && (
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            aria-label={`Notes for ${row.sampleId}`}
                            value={row.notes}
                            onChange={(e) =>
                              onUpdateRow(row.id, { notes: e.target.value })
                            }
                            placeholder="—"
                            className={compactCellInputClass}
                          />
                        </td>
                      )}
                      <td className="py-1 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteRow(row.id)}
                          aria-label={`Delete row ${row.sampleId}`}
                          className="p-1 text-[#9CA3AF] hover:text-[#991B1B] rounded-[4px] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
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
        <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F8F9FA] flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-[#4B5563]">
          <span className="font-mono tabular-nums">
            Showing {pagedRows.length} of {filteredAndSortedRows.length}{' '}
            filtered row{filteredAndSortedRows.length === 1 ? '' : 's'} (
            {rows.length} total in {dataset.datasetId})
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="font-mono px-2">
                Page {safePage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </Panel>

      {/* CSV / Spreadsheet Paste Import Modal */}
      <CsvImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        surveyMode={dataset.mode}
        existingRowCount={rows.length}
        defaultDate={experiment.experimentDate}
        onConfirmImport={onAddRowsBulk}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Delete Selected Measurement Rows"
        message={`Permanently delete ${validSelectedIds.length} selected measurement row(s) from dataset "${dataset.datasetId}"? This action cannot be undone.`}
        confirmLabel={`Delete ${validSelectedIds.length} Row(s)`}
        variant="danger"
        onConfirm={() => {
          onDeleteRowsBulk(validSelectedIds);
          setSelectedIds([]);
          setBulkDeleteConfirmOpen(false);
        }}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />

      {/* Exclusion / Flag Reason Modal */}
      <Modal
        open={Boolean(activeExclusionRow)}
        onClose={() => setExclusionModalRowId(null)}
        title={`Document Status Reason — ${activeExclusionRow?.sampleId ?? ''}`}
        description="Record an explicit scientific or procedural rationale for flagging or excluding this observation."
        maxWidthClass="max-w-md"
      >
        {activeExclusionRow && (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="exclusion-reason-input">
                Reason ({activeExclusionRow.qualityStatus})
              </FieldLabel>
              <textarea
                id="exclusion-reason-input"
                rows={3}
                value={exclusionReasonDraft}
                onChange={(e) => setExclusionReasonDraft(e.target.value)}
                placeholder="e.g., Filtration breach during sampling; pH probe drift suspected..."
                className="w-full p-2.5 text-[12.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setExclusionModalRowId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onUpdateRow(activeExclusionRow.id, {
                    exclusionReason: exclusionReasonDraft.trim(),
                  });
                  setExclusionModalRowId(null);
                }}
              >
                Save Reason
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Analytical Linkage & Discrepancy Modal */}
      <Modal
        open={Boolean(activeLinkRow)}
        onClose={() => setLinkModalRowId(null)}
        title={`Analytical Record Linkage — ${activeLinkRow?.sampleId ?? ''}`}
        description="Link this survey row to ICP-OES/AAS records via stable internal IDs. Discrepancies are surfaced for explicit researcher decision."
        maxWidthClass="max-w-xl"
      >
        {activeLinkRow && activeLinkInfo && (
          <div className="space-y-4 text-[12.5px]">
            {(
              [
                {
                  stage: 'Initial' as const,
                  status: activeLinkInfo.initial,
                  options: initialAnalyticalOptions,
                  field: 'linkedInitialMeasurementId' as const,
                  concField: 'initialConcPpm' as const,
                },
                {
                  stage: 'Final' as const,
                  status: activeLinkInfo.final,
                  options: finalAnalyticalOptions,
                  field: 'linkedFinalMeasurementId' as const,
                  concField: 'finalConcPpm' as const,
                },
              ] as const
            ).map(({ stage, status, options, field, concField }) => (
              <div
                key={stage}
                className="p-3.5 border border-[#E5E7EB] rounded-[6px] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#111827]">
                    {stage} Concentration ({stage === 'Initial' ? 'C₀' : 'Cf'})
                  </span>
                  <span className="font-mono text-[11.5px] text-[#4B5563]">
                    Survey Recorded:{' '}
                    {formatScientificNumber(status.surveyRecordedConcPpm, 2)} ppm
                  </span>
                </div>

                <div>
                  <FieldLabel htmlFor={`link-select-${stage}`}>
                    Linked Analytical Record ({stage})
                  </FieldLabel>
                  <select
                    id={`link-select-${stage}`}
                    value={activeLinkRow[field] ?? ''}
                    onChange={(e) =>
                      onUpdateRow(activeLinkRow.id, {
                        [field]: e.target.value || null,
                      })
                    }
                    className={inputBaseClass}
                  >
                    <option value="">— Unlinked —</option>
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.sampleId} ({m.stage} · {m.replicateId}) —{' '}
                        {formatScientificNumber(m.reportedConc, 2)} {m.concUnit}{' '}
                        ×{formatScientificNumber(m.dilutionFactor, 1)}
                      </option>
                    ))}
                  </select>
                </div>

                {status.sourceUnavailable && (
                  <div className="p-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[4px] text-[11.5px] text-[#991B1B]">
                    Linked analytical record (
                    <span className="font-mono">{status.linkedMeasurementId}</span>
                    ) is no longer present in the Analytical workspace.
                  </div>
                )}

                {status.linkedRecord && (
                  <div className="text-[11.5px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[4px] p-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-[#374151]">
                      Dilution-adjusted analytical value:{' '}
                      <strong>
                        {formatScientificNumber(
                          status.linkedEffectiveConcPpm,
                          2
                        )}{' '}
                        ppm
                      </strong>
                    </div>
                    {status.linkedEffectiveConcPpm !== null && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          onUpdateRow(activeLinkRow.id, {
                            [concField]: Number(
                              (status.linkedEffectiveConcPpm as number).toFixed(
                                3
                              )
                            ),
                          })
                        }
                      >
                        Explicitly Copy Value to Survey
                      </Button>
                    )}
                  </div>
                )}

                {status.hasDiscrepancy && (
                  <div className="p-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[4px] text-[11.5px] text-[#92400E]">
                    Discrepancy detected: survey value differs from linked
                    analytical record by{' '}
                    <span className="font-mono font-semibold">
                      {status.discrepancyDeltaPpm !== null
                        ? `${status.discrepancyDeltaPpm >= 0 ? '+' : ''}${status.discrepancyDeltaPpm.toFixed(2)} ppm`
                        : '—'}
                    </span>
                    . Survey data is preserved until you explicitly copy or edit.
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setLinkModalRowId(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

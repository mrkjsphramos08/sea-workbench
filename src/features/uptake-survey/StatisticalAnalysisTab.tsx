'use client';

import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  Info,
  Plus,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  Experiment,
  MeasurementQualityStatus,
  ReferencePzcMarker,
  ReplicateGroupMeta,
  SurveyAnalysisConfiguration,
  SurveyDataset,
  SurveyMeasurement,
} from '../../domain/models/types';
import {
  analyzeSurveyDataset,
  formatScientificNumber,
} from '../../domain/calculations/seaMath';
import {
  exportReplicateSummaryCsv,
  exportStatisticalAnalysisCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { ScientificFigureCanvas } from '../../components/charts/ScientificFigureCanvas';
import {
  Button,
  FieldLabel,
  Modal,
  NumericInput,
  Panel,
  PanelHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

export function StatisticalAnalysisTab({
  experiment,
  dataset,
  onUpdateAnalysisConfig,
  onCreateReplicateGroup,
  onRenameReplicateGroup,
  onUpdateReplicateGroupMeta,
  onAssignRowsToGroup,
  onRemoveRowFromGroup,
  onUpdateRow,
  onAddReferencePzcMarker,
  onDeleteReferencePzcMarker,
}: {
  experiment: Experiment;
  dataset: SurveyDataset;
  onUpdateAnalysisConfig: (patch: Partial<SurveyAnalysisConfiguration>) => void;
  onCreateReplicateGroup: (group: ReplicateGroupMeta) => void;
  onRenameReplicateGroup: (oldGroupId: string, newGroupId: string) => void;
  onUpdateReplicateGroupMeta: (
    groupId: string,
    patch: Partial<ReplicateGroupMeta>
  ) => void;
  onAssignRowsToGroup: (rowIds: string[], targetGroupId: string) => void;
  onRemoveRowFromGroup: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<SurveyMeasurement>) => void;
  onAddReferencePzcMarker: (marker: Omit<ReferencePzcMarker, 'id'>) => void;
  onDeleteReferencePzcMarker: (markerId: string) => void;
}) {
  const { analysisConfig } = dataset;

  const analysis = useMemo(
    () =>
      analyzeSurveyDataset(dataset.measurements, {
        excludeFlagged: analysisConfig.excludeFlaggedInStats,
      }),
    [dataset.measurements, analysisConfig.excludeFlaggedInStats]
  );

  // Explicit Replicate Group UI states
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    analysis.replicateGroups[0]?.sampleGroupId ?? null
  );
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupNotes, setNewGroupNotes] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [assignSampleId, setAssignSampleId] = useState('');

  // Reference PZC Marker form state
  const [markerLabel, setMarkerLabel] = useState('');
  const [markerValue, setMarkerValue] = useState<number | null>(null);
  const [markerSource, setMarkerSource] = useState<
    ReferencePzcMarker['sourceType']
  >('user_entered');
  const [markerConditions, setMarkerConditions] = useState('');

  const allGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of analysis.replicateGroups) ids.add(g.sampleGroupId);
    for (const m of dataset.replicateGroupMeta) ids.add(m.groupId);
    return Array.from(ids);
  }, [analysis.replicateGroups, dataset.replicateGroupMeta]);

  const activeGroupId =
    selectedGroupId && allGroupIds.includes(selectedGroupId)
      ? selectedGroupId
      : allGroupIds[0] ?? null;

  const activeGroupSummary = activeGroupId
    ? analysis.replicateGroups.find((g) => g.sampleGroupId === activeGroupId) ??
      null
    : null;
  const activeGroupMeta = activeGroupId
    ? dataset.replicateGroupMeta.find((m) => m.groupId === activeGroupId) ??
      null
    : null;

  const activeGroupMembers = useMemo(() => {
    if (!activeGroupId) return [];
    return dataset.measurements.filter(
      (r) =>
        (r.sampleGroupId.trim() || `UNG-${r.sampleId || r.id}`) === activeGroupId
    );
  }, [dataset.measurements, activeGroupId]);

  const unassignedCandidates = useMemo(() => {
    if (!activeGroupId) return [];
    return dataset.measurements.filter(
      (r) =>
        (r.sampleGroupId.trim() || `UNG-${r.sampleId || r.id}`) !== activeGroupId
    );
  }, [dataset.measurements, activeGroupId]);

  const supportSnapshotPzc =
    dataset.supportSnapshot?.supportData?.pzc.value ??
    experiment.batch.supportSnapshot?.supportData?.pzc.value ??
    null;

  const handleExportReplicateCsv = () => {
    const csv = exportReplicateSummaryCsv(
      experiment.experimentId,
      dataset,
      analysis
    );
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-${dataset.datasetId}-replicate-summary.csv`,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportStatsCsv = () => {
    const csv = exportStatisticalAnalysisCsv(
      experiment.experimentId,
      dataset,
      analysis
    );
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-${dataset.datasetId}-statistical-analysis.csv`,
      'text/csv;charset=utf-8'
    );
  };

  const pzcPreviewFigureConfig = useMemo(() => {
    const isDelta = analysisConfig.pzcPlotView === 'delta_vs_initial';
    return {
      ...dataset.figureConfig,
      plotType: isDelta
        ? ('pzc_delta_vs_initial' as const)
        : ('pzc_final_vs_initial' as const),
      title: isDelta
        ? `${dataset.title} — ΔpH vs. Initial pH`
        : `${dataset.title} — Final pH vs. Initial pH (1:1 Reference)`,
      xAxisTitle: 'Measured Initial pH',
      xAxisUnit: 'pH',
      yAxisTitle: isDelta ? 'Recorded ΔpH (pHf − pHi)' : 'Measured Final pH',
      yAxisUnit: 'pH',
      yMin: isDelta ? null : 0,
      yMax: isDelta ? null : 14,
      showIdentityLine: !isDelta,
      showReferenceLine: true,
    };
  }, [dataset.figureConfig, dataset.title, analysisConfig.pzcPlotView]);

  const statRows = [
    {
      label: 'Measured Initial pH',
      stat: analysis.initialPhStats,
      decimals: 2,
    },
    {
      label: 'Measured Final pH',
      stat: analysis.finalPhStats,
      decimals: 2,
    },
    {
      label: 'Recorded ΔpH (pHf − pHi)',
      stat: analysis.deltaPhStats,
      decimals: 3,
    },
    ...(dataset.mode === 'uptake'
      ? [
          {
            label: 'Recorded Metal Uptake',
            stat: analysis.uptakeStats,
            decimals: 3,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Analysis Controls Bar */}
      <div className="bg-white border border-[#E5E7EB] rounded-[8px] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={analysisConfig.excludeFlaggedInStats}
              onChange={(e) =>
                onUpdateAnalysisConfig({
                  excludeFlaggedInStats: e.target.checked,
                })
              }
              className="accent-[#0F52BA]"
            />
            <span className="font-medium text-[#111827]">
              Exclude flagged observations from statistics &amp; plots
            </span>
          </label>
          <span className="text-[11.5px] font-mono text-[#6B7280]">
            Included: {analysis.includedRows}/{analysis.totalRows} · Flagged:{' '}
            {analysis.flaggedCount} · Excluded: {analysis.excludedByUserCount}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[12px] text-[#4B5563]">
            <label htmlFor="analysis-tol-ppm" className="whitespace-nowrap">
              Link Tolerance:
            </label>
            <div className="w-32">
              <NumericInput
                id="analysis-tol-ppm"
                value={analysisConfig.discrepancyTolerancePpm}
                onChange={(v) =>
                  onUpdateAnalysisConfig({
                    discrepancyTolerancePpm: v !== null && v >= 0 ? v : 0.05,
                  })
                }
                unit="ppm"
                min={0}
              />
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportReplicateCsv}
            disabled={analysis.replicateGroups.length === 0}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Replicate CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportStatsCsv}
            disabled={dataset.measurements.length === 0}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Statistics CSV
          </Button>
        </div>
      </div>

      {/* Dataset-Level Descriptive Statistics */}
      <Panel>
        <PanelHeader
          title={
            dataset.mode === 'pzc'
              ? 'PZC / pH-Shift Descriptive Statistics'
              : 'Recorded Uptake & pH Descriptive Statistics'
          }
          subtitle={`Computed directly from active dataset (${analysis.engineVersion}). Sample SD uses n − 1 denominator and requires n ≥ 2.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                <th className="py-2 px-4 font-medium">Measured Quantity</th>
                <th className="py-2 px-3 font-medium">Unit</th>
                <th className="py-2 px-3 font-medium text-right">Valid n</th>
                <th className="py-2 px-3 font-medium text-right">Missing</th>
                <th className="py-2 px-3 font-medium text-right">Mean</th>
                <th className="py-2 px-3 font-medium text-right">Median</th>
                <th className="py-2 px-3 font-medium text-right">Sample SD</th>
                <th className="py-2 px-3 font-medium text-right">SEM</th>
                <th className="py-2 px-3 font-medium text-right">%RSD</th>
                <th className="py-2 px-3 font-medium text-right">Min</th>
                <th className="py-2 px-4 font-medium text-right">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
              {statRows.map(({ label, stat, decimals }) => (
                <tr key={label}>
                  <td className="py-2 px-4 font-sans font-medium text-[#111827]">
                    {label}
                  </td>
                  <td className="py-2 px-3 text-[#6B7280]">{stat.unit}</td>
                  <td className="py-2 px-3 text-right">
                    {stat.value.validCount}
                  </td>
                  <td className="py-2 px-3 text-right text-[#6B7280]">
                    {stat.value.missingCount}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-[#111827]">
                    {formatScientificNumber(stat.value.mean, decimals)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatScientificNumber(stat.value.median, decimals)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatScientificNumber(stat.value.sampleStdDev, decimals)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatScientificNumber(stat.value.sem, decimals)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {stat.value.rsdPercent !== null
                      ? `${stat.value.rsdPercent.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatScientificNumber(stat.value.min, decimals)}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {formatScientificNumber(stat.value.max, decimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F8F9FA] text-[11.5px] text-[#4B5563]">
          {dataset.mode === 'pzc'
            ? 'Scientific Boundary: ΔpH = pHf − pHi is computed descriptively from recorded pH pairs. SEA Workbench does not automatically declare an experimental PZC or fit unreviewed titration models.'
            : 'Scientific Boundary: Descriptive statistics summarize recorded uptake values only. SEA Workbench does not declare optimal pH operating windows or fit unreviewed adsorption isotherms.'}
        </div>
      </Panel>

      {/* Dedicated PZC / pH-Shift Analysis Panel + Reference PZC Markers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {dataset.mode === 'pzc' && (
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold text-[#111827]">
                pH-Shift Exploratory View
              </div>
              <div
                role="tablist"
                aria-label="PZC plot mode"
                className="inline-flex items-center p-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={
                    analysisConfig.pzcPlotView === 'final_vs_initial'
                  }
                  onClick={() =>
                    onUpdateAnalysisConfig({ pzcPlotView: 'final_vs_initial' })
                  }
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[5px] cursor-pointer ${
                    analysisConfig.pzcPlotView === 'final_vs_initial'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] border border-transparent'
                  }`}
                >
                  Final pH vs. Initial pH (1:1)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={
                    analysisConfig.pzcPlotView === 'delta_vs_initial'
                  }
                  onClick={() =>
                    onUpdateAnalysisConfig({ pzcPlotView: 'delta_vs_initial' })
                  }
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[5px] cursor-pointer ${
                    analysisConfig.pzcPlotView === 'delta_vs_initial'
                      ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                      : 'text-[#4B5563] border border-transparent'
                  }`}
                >
                  ΔpH vs. Initial pH (ΔpH = 0)
                </button>
              </div>
            </div>
            <ScientificFigureCanvas
              dataset={dataset}
              figureConfig={pzcPreviewFigureConfig}
              experimentId={experiment.experimentId}
              referencePzcMarkers={dataset.referencePzcMarkers}
              height={300}
            />
          </div>
        )}

        {/* Reference PZC Markers Panel (available in both PZC and Uptake modes) */}
        <Panel className={dataset.mode === 'pzc' ? 'lg:col-span-5' : 'lg:col-span-12'}>
          <PanelHeader
            title="Reference PZC Markers"
            subtitle="Researcher-entered, literature, or support-snapshot PZC lines overlaid for visual context only."
            actions={
              supportSnapshotPzc !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onAddReferencePzcMarker({
                      label: `Support Snapshot PZC (${dataset.supportSnapshot?.supportData?.name ?? experiment.batch.supportSnapshot?.supportData?.name ?? 'Support'})`,
                      valuePh: supportSnapshotPzc,
                      sourceType: 'support_snapshot',
                      conditions:
                        dataset.supportSnapshot?.supportData
                          ?.measurementConditions ||
                        experiment.batch.supportSnapshot?.supportData
                          ?.measurementConditions ||
                        'From attached support snapshot',
                      notes: 'Imported from attached immutable support snapshot.',
                    })
                  }
                >
                  <Plus className="w-3 h-3" strokeWidth={1.75} />
                  Add Support PZC ({supportSnapshotPzc.toFixed(2)})
                </Button>
              )
            }
          />
          <div className="p-4 space-y-3">
            {dataset.referencePzcMarkers.length === 0 ? (
              <p className="text-[12px] text-[#6B7280]">
                No reference PZC markers configured for this dataset.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[6px]">
                {dataset.referencePzcMarkers.map((m) => (
                  <div
                    key={m.id}
                    className="px-3 py-2 flex items-start justify-between gap-3 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#111827] flex flex-wrap items-center gap-2">
                        <span>{m.label}</span>
                        <span className="font-mono text-[#0F52BA] font-semibold">
                          pH {m.valuePh.toFixed(2)}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] border border-[#E5E7EB] bg-[#F8F9FA] rounded-[4px] text-[#4B5563]">
                          {m.sourceType === 'literature_reference'
                            ? 'Literature Ref'
                            : m.sourceType === 'support_snapshot'
                              ? 'Support Snapshot'
                              : 'User Entered'}
                        </span>
                      </div>
                      {m.conditions && (
                        <div className="text-[11px] text-[#6B7280] mt-0.5">
                          Conditions: {m.conditions}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove marker ${m.label}`}
                      onClick={() => onDeleteReferencePzcMarker(m.id)}
                      className="p-1 text-[#9CA3AF] hover:text-[#991B1B] cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-4">
                <FieldLabel htmlFor="ref-pzc-label">Marker Label</FieldLabel>
                <input
                  id="ref-pzc-label"
                  type="text"
                  value={markerLabel}
                  onChange={(e) => setMarkerLabel(e.target.value)}
                  placeholder="e.g., Literature Silica PZC"
                  className={inputBaseClass}
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="ref-pzc-val">Value (pH)</FieldLabel>
                <NumericInput
                  id="ref-pzc-val"
                  value={markerValue}
                  onChange={setMarkerValue}
                  min={0}
                  max={14}
                />
              </div>
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="ref-pzc-src">Source Type</FieldLabel>
                <select
                  id="ref-pzc-src"
                  value={markerSource}
                  onChange={(e) =>
                    setMarkerSource(
                      e.target.value as ReferencePzcMarker['sourceType']
                    )
                  }
                  className={inputBaseClass}
                >
                  <option value="user_entered">User Entered</option>
                  <option value="literature_reference">Literature Ref</option>
                  <option value="support_snapshot">Support Snapshot</option>
                </select>
              </div>
              <div className="sm:col-span-3 flex items-end gap-1.5">
                <div className="flex-1 min-w-0">
                  <FieldLabel htmlFor="ref-pzc-cond">Conditions</FieldLabel>
                  <input
                    id="ref-pzc-cond"
                    type="text"
                    value={markerConditions}
                    onChange={(e) => setMarkerConditions(e.target.value)}
                    placeholder="Electrolyte / T"
                    className={inputBaseClass}
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!markerLabel.trim() || markerValue === null}
                  onClick={() => {
                    if (!markerLabel.trim() || markerValue === null) return;
                    onAddReferencePzcMarker({
                      label: markerLabel.trim(),
                      valuePh: markerValue,
                      sourceType: markerSource,
                      conditions: markerConditions.trim(),
                      notes: '',
                    });
                    setMarkerLabel('');
                    setMarkerValue(null);
                    setMarkerConditions('');
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Explicit Replicate Group Manager */}
      <Panel>
        <PanelHeader
          title="Explicit Replicate Group Manager"
          subtitle="Replicate statistics are grouped strictly by explicit Sample Group ID — never inferred automatically from similar pH values."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewGroupId(`GRP-${String(allGroupIds.length + 1).padStart(2, '0')}`);
                setNewGroupLabel('');
                setNewGroupNotes('');
                setNewGroupModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New Replicate Group
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E7EB]">
          {/* Left: Group Summary List */}
          <div className="lg:col-span-7 overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                  <th className="py-2 px-3 font-medium">Group ID</th>
                  <th className="py-2 px-2 font-medium text-right">Valid n</th>
                  <th className="py-2 px-2 font-medium text-right">Mean pHf</th>
                  <th className="py-2 px-2 font-medium text-right">
                    {dataset.mode === 'pzc' ? 'Mean ΔpH' : 'Mean Uptake'}
                  </th>
                  <th className="py-2 px-2 font-medium text-right">SD</th>
                  <th className="py-2 px-2 font-medium text-right">SEM</th>
                  <th className="py-2 px-3 font-medium text-right">Flags/Excl</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono tabular-nums">
                {allGroupIds.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 px-4 text-center font-sans text-[#6B7280]"
                    >
                      No replicate groups yet. Add measurements or create a named
                      group.
                    </td>
                  </tr>
                ) : (
                  allGroupIds.map((gid) => {
                    const summary = analysis.replicateGroups.find(
                      (g) => g.sampleGroupId === gid
                    );
                    const primaryStat =
                      dataset.mode === 'pzc'
                        ? summary?.deltaPhStats.value
                        : summary?.uptakeStats.value;
                    const isActive = gid === activeGroupId;
                    return (
                      <tr
                        key={gid}
                        onClick={() => setSelectedGroupId(gid)}
                        className={`cursor-pointer transition-colors ${
                          isActive ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8F9FA]'
                        }`}
                      >
                        <td className="py-2 px-3 font-medium text-[#111827]">
                          <span
                            className={isActive ? 'text-[#0F52BA] font-semibold' : ''}
                          >
                            {gid}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {primaryStat ? primaryStat.validCount : 0}/
                          {summary?.totalRowCount ?? 0}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {formatScientificNumber(
                            summary?.finalPhStats.value.mean ?? null,
                            2
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-[#111827]">
                          {formatScientificNumber(
                            primaryStat?.mean ?? null,
                            3
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {formatScientificNumber(
                            primaryStat?.sampleStdDev ?? null,
                            3
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {formatScientificNumber(primaryStat?.sem ?? null, 3)}
                        </td>
                        <td className="py-2 px-3 text-right text-[11px] text-[#6B7280]">
                          {summary
                            ? `${summary.flaggedCount}F / ${summary.excludedCount}E`
                            : '0F / 0E'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Right: Active Group Inspector & Membership Controls */}
          <div className="lg:col-span-5 p-4 space-y-4">
            {activeGroupId ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                      Selected Replicate Group
                    </div>
                    <h4 className="font-mono text-[14px] font-semibold text-[#0F52BA] flex items-center gap-1.5">
                      <Users className="w-4 h-4" strokeWidth={1.75} />
                      {activeGroupId}
                    </h4>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRenameTarget(activeGroupId);
                      setRenameDraft(activeGroupId);
                    }}
                  >
                    <Edit3 className="w-3 h-3" strokeWidth={1.75} />
                    Rename Group
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <FieldLabel htmlFor="grp-label-input">
                      Group Description / Condition Label
                    </FieldLabel>
                    <input
                      id="grp-label-input"
                      type="text"
                      value={activeGroupMeta?.label ?? ''}
                      onChange={(e) =>
                        onUpdateReplicateGroupMeta(activeGroupId, {
                          label: e.target.value,
                        })
                      }
                      placeholder="e.g., Target pH 8.5 duplicate pair"
                      className={inputBaseClass}
                    />
                  </div>
                </div>

                {/* Member Rows List */}
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563]">
                    Member Observations ({activeGroupMembers.length})
                  </div>
                  {activeGroupMembers.length === 0 ? (
                    <p className="text-[12px] text-[#6B7280]">
                      No samples currently assigned to this group.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[6px] max-h-56 overflow-y-auto">
                      {activeGroupMembers.map((m) => (
                        <div
                          key={m.id}
                          className="px-2.5 py-2 text-[11.5px] space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium text-[#111827]">
                              {m.sampleId} ({m.replicateId})
                            </span>
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Status for ${m.sampleId}`}
                                value={m.qualityStatus}
                                onChange={(e) =>
                                  onUpdateRow(m.id, {
                                    qualityStatus: e.target
                                      .value as MeasurementQualityStatus,
                                  })
                                }
                                className="h-6 px-1.5 text-[11px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[4px]"
                              >
                                <option value="valid">Valid</option>
                                <option value="flagged">Flagged</option>
                                <option value="excluded_by_user">
                                  Excluded
                                </option>
                                <option value="pending">Pending</option>
                              </select>
                              <button
                                type="button"
                                title="Remove from replicate group"
                                onClick={() => onRemoveRowFromGroup(m.id)}
                                className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                              >
                                <UserMinus
                                  className="w-3.5 h-3.5"
                                  strokeWidth={1.75}
                                />
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[11px] text-[#4B5563]">
                            pHi {formatScientificNumber(m.measuredInitialPh, 2)} ·
                            pHf {formatScientificNumber(m.measuredFinalPh, 2)}
                            {dataset.mode === 'uptake' &&
                              ` · Uptake ${formatScientificNumber(m.recordedUptakeUmolM2, 3)} µmol/m²`}
                          </div>
                          {(m.qualityStatus === 'excluded_by_user' ||
                            m.qualityStatus === 'flagged') && (
                            <input
                              type="text"
                              value={m.exclusionReason ?? ''}
                              onChange={(e) =>
                                onUpdateRow(m.id, {
                                  exclusionReason: e.target.value,
                                })
                              }
                              placeholder="Document reason for flag/exclusion..."
                              className="w-full h-6 px-2 text-[11px] bg-[#FFFBEB] border border-[#FDE68A] rounded-[4px] text-[#92400E]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assign Another Row to this Group */}
                {unassignedCandidates.length > 0 && (
                  <div className="pt-2 border-t border-[#E5E7EB] flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <FieldLabel htmlFor="assign-sample-select">
                        Assign Sample to {activeGroupId}
                      </FieldLabel>
                      <select
                        id="assign-sample-select"
                        value={assignSampleId}
                        onChange={(e) => setAssignSampleId(e.target.value)}
                        className={inputBaseClass}
                      >
                        <option value="">Select a sample row...</option>
                        {unassignedCandidates.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.sampleId} (current: {r.sampleGroupId || 'none'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!assignSampleId}
                      onClick={() => {
                        if (!assignSampleId) return;
                        onAssignRowsToGroup([assignSampleId], activeGroupId);
                        setAssignSampleId('');
                      }}
                    >
                      Assign
                    </Button>
                  </div>
                )}

                {activeGroupSummary &&
                  activeGroupSummary.uptakeStats.value.validCount < 2 &&
                  dataset.mode === 'uptake' && (
                    <div className="p-2.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[11.5px] text-[#4B5563] flex items-start gap-2">
                      <Info
                        className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#6B7280]"
                        strokeWidth={1.75}
                      />
                      <span>
                        Fewer than 2 valid replicate values in this group; sample
                        SD, SEM, and error bars are withheld until n ≥ 2.
                      </span>
                    </div>
                  )}
              </>
            ) : (
              <p className="text-[12.5px] text-[#6B7280]">
                Select a replicate group from the table to inspect membership
                and manage exclusions.
              </p>
            )}
          </div>
        </div>
      </Panel>

      {/* New Replicate Group Modal */}
      <Modal
        open={newGroupModalOpen}
        onClose={() => setNewGroupModalOpen(false)}
        title="Create Named Replicate Group"
        description="Define an explicit replicate group identifier for grouping replicate measurements."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="new-grp-id" required>
              Group Identifier
            </FieldLabel>
            <input
              id="new-grp-id"
              type="text"
              value={newGroupId}
              onChange={(e) => setNewGroupId(e.target.value)}
              placeholder="e.g., GRP-PH9"
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-grp-label">Description Label</FieldLabel>
            <input
              id="new-grp-label"
              type="text"
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
              placeholder="e.g., Target pH 9.0 triplicate"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-grp-notes">Group Notes</FieldLabel>
            <textarea
              id="new-grp-notes"
              rows={2}
              value={newGroupNotes}
              onChange={(e) => setNewGroupNotes(e.target.value)}
              className="w-full p-2 text-[12.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setNewGroupModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newGroupId.trim()}
              onClick={() => {
                const gid = newGroupId.trim();
                onCreateReplicateGroup({
                  groupId: gid,
                  label: newGroupLabel.trim(),
                  notes: newGroupNotes.trim(),
                });
                setSelectedGroupId(gid);
                setNewGroupModalOpen(false);
              }}
            >
              Create Group
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rename Replicate Group Modal */}
      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={`Rename Replicate Group (${renameTarget ?? ''})`}
        description="Updates the explicit Sample Group ID across all current member rows."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="rename-grp-input" required>
              New Group Identifier
            </FieldLabel>
            <input
              id="rename-grp-input"
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!renameDraft.trim() || renameDraft.trim() === renameTarget}
              onClick={() => {
                if (!renameTarget || !renameDraft.trim()) return;
                const nextId = renameDraft.trim();
                onRenameReplicateGroup(renameTarget, nextId);
                setSelectedGroupId(nextId);
                setRenameTarget(null);
              }}
            >
              Save Group Name
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

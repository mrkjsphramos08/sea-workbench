'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FlaskConical,
  Search,
  TestTubes,
} from 'lucide-react';
import {
  ActiveModule,
  Experiment,
  SampleRegistryNote,
} from '../../domain/models/types';
import {
  UnifiedSampleRegistryEntry,
  buildUnifiedSampleRegistry,
  formatQualifiedMeasurementValue,
} from '../../domain/calculations/workflowEngine';
import { formatScientificNumber } from '../../domain/calculations/seaMath';
import { Panel, StatusText } from '../../components/ui/Primitives';

interface SampleRegistryTabProps {
  experiment: Experiment;
  onUpdateSampleNote: (note: SampleRegistryNote) => void;
  onNavigate: (target: {
    module: ActiveModule;
    surveyDatasetId?: string;
    analyticalSessionId?: string;
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

export function SampleRegistryTab({
  experiment,
  onUpdateSampleNote,
  onNavigate,
}: SampleRegistryTabProps) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<
    'all' | 'survey' | 'analytical_unlinked' | 'planned_only' | 'flagged'
  >('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [classDraft, setClassDraft] = useState('');

  const registry = useMemo(
    () => buildUnifiedSampleRegistry(experiment),
    [experiment]
  );

  const duplicateKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const w of registry.duplicateLabelWarnings) {
      for (const k of w.sampleKeys) s.add(k);
    }
    return s;
  }, [registry.duplicateLabelWarnings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registry.entries.filter((entry) => {
      const hasFlag =
        entry.qualityFlags.length > 0 ||
        duplicateKeySet.has(entry.sampleKey) ||
        entry.unavailableLinkedIds.length > 0;
      if (kindFilter === 'flagged') {
        if (!hasFlag) return false;
      } else if (kindFilter !== 'all' && entry.origin !== kindFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        entry.sampleId,
        entry.replicateGroupId,
        entry.classification,
        entry.surveyDatasetCode ?? '',
        ...entry.analytes,
        ...entry.analyticalLinks.map(
          (a) =>
            `${a.measurement.sampleId} ${a.sessionCode} ${a.measurement.analyte}`
        ),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [registry.entries, duplicateKeySet, search, kindFilter]);

  const activeEntry: UnifiedSampleRegistryEntry | null = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.find((e) => e.sampleKey === selectedKey) ?? filtered[0];
  }, [filtered, selectedKey]);

  const selectEntry = (entry: UnifiedSampleRegistryEntry) => {
    setSelectedKey(entry.sampleKey);
    setNoteDraft(entry.notes);
    setClassDraft(entry.classification);
  };

  const surveyCount = registry.entries.filter(
    (e) => e.origin === 'survey'
  ).length;
  const analyticalOnlyCount = registry.entries.filter(
    (e) => e.origin === 'analytical_unlinked'
  ).length;
  const plannedOnlyCount = registry.entries.filter(
    (e) => e.origin === 'planned_only'
  ).length;
  const flaggedCount = registry.entries.filter(
    (e) =>
      e.qualityFlags.length > 0 ||
      duplicateKeySet.has(e.sampleKey) ||
      e.unavailableLinkedIds.length > 0
  ).length;

  return (
    <div className="space-y-4">
      {registry.duplicateLabelWarnings.length > 0 && (
        <div className="border border-[#B45309]/40 bg-[#FFFBEB] px-3.5 py-2.5 text-[12px] text-[#92400E] flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">
              Duplicate Sample Labels Detected (
              {registry.duplicateLabelWarnings
                .map((w) => w.sampleIds[0] || w.normalizedLabel)
                .join(', ')}
              ):
            </span>{' '}
            Records sharing a human-readable sample label are intentionally kept
            separate by stable internal ID and never silently merged. Review
            each row below or assign unique sample IDs in the authoritative
            dataset.
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280]">
            Registry Records
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827]">
            {registry.entries.length}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280]">
            Survey Anchored
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#0F52BA]">
            {surveyCount}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280]">
            Standalone Analytical
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827]">
            {analyticalOnlyCount}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280]">
            Planned Only
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#4B5563]">
            {plannedOnlyCount}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280]">
            Flagged / Incomplete
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#B45309]">
            {flaggedCount}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E5E7EB] p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-3.5 w-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Filter unified sample registry"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by sample ID, group, dataset, session, analyte..."
            className="w-full h-8 pl-8 pr-2.5 text-[12px] border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827] focus:outline-none focus:border-[#0F52BA] focus:bg-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', 'All Records'],
              ['survey', 'Survey'],
              ['analytical_unlinked', 'Analytical Only'],
              ['planned_only', 'Planned Only'],
              ['flagged', 'Flagged / Dup'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKindFilter(id)}
              className={`h-7 px-2.5 text-[11px] font-medium border transition-colors ${
                kindFilter === id
                  ? 'border-[#0F52BA] bg-[#0F52BA] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 bg-white border border-[#E5E7EB] overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA] text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                <th className="py-2 px-3">Sample ID</th>
                <th className="py-2 px-2">Source</th>
                <th className="py-2 px-2">Group</th>
                <th className="py-2 px-2 text-right">pH (i → f)</th>
                <th className="py-2 px-2 text-right">Assays</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-[#6B7280] text-[12px]"
                  >
                    No samples match the active filter.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const isSelected = activeEntry?.sampleKey === entry.sampleKey;
                  const isDup = duplicateKeySet.has(entry.sampleKey);
                  const sm = entry.surveyMeasurement;
                  const statusTone =
                    entry.documentationStatus === 'Analytically Linked' ||
                    entry.documentationStatus === 'Recorded'
                      ? 'success'
                      : entry.documentationStatus === 'Flagged / Review Needed' ||
                          entry.documentationStatus === 'Excluded'
                        ? 'warning'
                        : 'neutral';
                  return (
                    <tr
                      key={entry.sampleKey}
                      className={`transition-colors ${
                        isSelected ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono font-semibold text-[#111827] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => selectEntry(entry)}
                          className="text-left inline-flex items-center gap-1.5 hover:text-[#0F52BA]"
                        >
                          <span>{entry.sampleId}</span>
                          {isDup && (
                            <span
                              title="Duplicate human-readable label (distinct internal ID)"
                              className="px-1 py-0.5 text-[9px] bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/40"
                            >
                              DUP
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-[11px] text-[#4B5563] whitespace-nowrap">
                        {entry.origin === 'survey'
                          ? entry.surveyDatasetCode || 'Survey'
                          : entry.origin === 'analytical_unlinked'
                            ? 'Analytical'
                            : 'Planned'}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] text-[#4B5563] whitespace-nowrap">
                        {entry.replicateGroupId || '—'}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums text-right text-[#111827] whitespace-nowrap">
                        {sm &&
                        (sm.measuredInitialPh !== null ||
                          sm.measuredFinalPh !== null)
                          ? `${formatScientificNumber(sm.measuredInitialPh, 2)} → ${formatScientificNumber(sm.measuredFinalPh, 2)}`
                          : '—'}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums text-right text-[#111827] whitespace-nowrap">
                        {entry.analyticalLinks.length}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <StatusText
                          label={entry.documentationStatus}
                          tone={statusTone}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Sample Traceability Detail */}
        <div className="xl:col-span-5">
          {activeEntry ? (
            <Panel
              title={`Sample Traceability: ${activeEntry.sampleId}`}
              subtitle={`Internal Key: ${activeEntry.sampleKey}`}
            >
              <div className="space-y-3 text-[12px]">
                <div className="flex flex-wrap gap-2">
                  {activeEntry.surveyDatasetId && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          module: 'uptake-survey',
                          surveyDatasetId:
                            activeEntry.surveyDatasetId ?? undefined,
                          surveyTab: 'data',
                          highlightRecordId:
                            activeEntry.surveyMeasurement?.id ?? undefined,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#0F52BA] text-[#0F52BA] hover:bg-[#0F52BA] hover:text-white transition-colors"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      Open Survey Dataset ({activeEntry.surveyDatasetCode})
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                  {activeEntry.analyticalLinks[0] && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          module: 'analytical',
                          analyticalSessionId:
                            activeEntry.analyticalLinks[0].sessionId,
                          analyticalTab: 'samples',
                          highlightRecordId:
                            activeEntry.analyticalLinks[0].measurement.id,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#E5E7EB] text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] transition-colors"
                    >
                      <TestTubes className="h-3.5 w-3.5" />
                      Open Analytical Session (
                      {activeEntry.analyticalLinks[0].sessionCode})
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Survey Record Block */}
                <div className="border border-[#E5E7EB] bg-[#F8F9FA] p-2.5 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                    Authoritative Survey Context
                  </div>
                  {activeEntry.surveyMeasurement ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <div>
                        <span className="text-[#6B7280]">Dataset:</span>{' '}
                        <span className="font-mono text-[#111827]">
                          {activeEntry.surveyDatasetCode}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B7280]">Group:</span>{' '}
                        <span className="font-mono text-[#111827]">
                          {activeEntry.replicateGroupId || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B7280]">pH (i → f):</span>{' '}
                        <span className="font-mono tabular-nums text-[#111827]">
                          {formatScientificNumber(
                            activeEntry.surveyMeasurement.measuredInitialPh,
                            2
                          )}{' '}
                          →{' '}
                          {formatScientificNumber(
                            activeEntry.surveyMeasurement.measuredFinalPh,
                            2
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B7280]">Recorded Uptake:</span>{' '}
                        <span className="font-mono tabular-nums text-[#111827]">
                          {activeEntry.surveyMeasurement
                            .recordedUptakeUmolM2 !== null
                            ? `${formatScientificNumber(activeEntry.surveyMeasurement.recordedUptakeUmolM2, 2)} µmol/m²`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#6B7280]">
                      No survey row linked (
                      {activeEntry.origin === 'planned_only'
                        ? 'planned sample ID awaiting measurement'
                        : 'standalone analytical measurement'}
                      ).
                    </p>
                  )}
                </div>

                {/* Quality Flags */}
                {activeEntry.qualityFlags.length > 0 && (
                  <div className="border border-[#F59E0B]/40 bg-[#FFFBEB] p-2 space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#92400E]">
                      Quality & Review Flags
                    </div>
                    <ul className="list-disc pl-4 text-[11px] text-[#92400E] space-y-0.5">
                      {activeEntry.qualityFlags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Linked Analytical Records */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
                    Linked Analytical Records ({activeEntry.analyticalLinks.length})
                  </div>
                  {activeEntry.analyticalLinks.length === 0 ? (
                    <p className="text-[11px] text-[#6B7280] border border-[#E5E7EB] p-2">
                      No analytical instrument measurements linked to this
                      sample.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {activeEntry.analyticalLinks.map((a) => (
                        <div
                          key={`${a.sessionId}_${a.measurement.id}_${a.stage}`}
                          className="border border-[#E5E7EB] p-2 bg-white flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-[#111827] flex items-center gap-1.5 flex-wrap">
                              <span>{a.measurement.sampleId}</span>
                              <span className="text-[#6B7280] font-normal">
                                ({a.sessionCode} · {a.measurement.analyte} ·{' '}
                                {a.stage})
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-[#111827] mt-0.5">
                              {formatQualifiedMeasurementValue(a.measurement)}{' '}
                              <span className="text-[#6B7280]">
                                · DF {a.measurement.dilutionFactor ?? '—'}×
                                {a.hasDiscrepancy ? ' · Discrepancy' : ''}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                module: 'analytical',
                                analyticalSessionId: a.sessionId,
                                analyticalTab: 'samples',
                                highlightRecordId: a.measurement.id,
                              })
                            }
                            className="text-[11px] text-[#0F52BA] hover:underline shrink-0"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dilutions, Observations & Figures */}
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="border border-[#E5E7EB] p-2">
                    <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                      Dilutions
                    </div>
                    <div className="font-mono font-semibold text-[#111827] mt-0.5">
                      {activeEntry.dilutions.length}
                    </div>
                  </div>
                  <div className="border border-[#E5E7EB] p-2">
                    <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                      Observations
                    </div>
                    <div className="font-mono font-semibold text-[#111827] mt-0.5">
                      {activeEntry.observations.length}
                    </div>
                  </div>
                  <div className="border border-[#E5E7EB] p-2">
                    <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                      Figures
                    </div>
                    <div className="font-mono font-semibold text-[#111827] mt-0.5">
                      {activeEntry.relatedFigures.length}
                    </div>
                  </div>
                </div>

                {/* Registry Annotation */}
                <div className="space-y-1.5 pt-1 border-t border-[#E5E7EB]">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] block">
                    Sample Classification & Registry Notes
                  </label>
                  <input
                    type="text"
                    aria-label="Sample classification"
                    value={
                      selectedKey === activeEntry.sampleKey
                        ? classDraft
                        : activeEntry.classification
                    }
                    onFocus={() => {
                      if (selectedKey !== activeEntry.sampleKey) {
                        setSelectedKey(activeEntry.sampleKey);
                        setNoteDraft(activeEntry.notes);
                        setClassDraft(activeEntry.classification);
                      }
                    }}
                    onChange={(e) => {
                      setSelectedKey(activeEntry.sampleKey);
                      setClassDraft(e.target.value);
                    }}
                    placeholder="Classification (e.g., SEA pH Survey, Blank Control, Standard)"
                    className="w-full h-8 px-2 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
                  />
                  <textarea
                    rows={3}
                    aria-label="Sample registry notes"
                    value={
                      selectedKey === activeEntry.sampleKey
                        ? noteDraft
                        : activeEntry.notes
                    }
                    onFocus={() => {
                      if (selectedKey !== activeEntry.sampleKey) {
                        setSelectedKey(activeEntry.sampleKey);
                        setNoteDraft(activeEntry.notes);
                        setClassDraft(activeEntry.classification);
                      }
                    }}
                    onChange={(e) => {
                      setSelectedKey(activeEntry.sampleKey);
                      setNoteDraft(e.target.value);
                    }}
                    placeholder="Add traceability or cross-session sample notes without duplicating source data..."
                    className="w-full p-2 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSampleNote({
                          sampleKey: activeEntry.sampleKey,
                          classification:
                            selectedKey === activeEntry.sampleKey
                              ? classDraft
                              : activeEntry.classification,
                          notes:
                            selectedKey === activeEntry.sampleKey
                              ? noteDraft
                              : activeEntry.notes,
                        })
                      }
                      className="inline-flex items-center gap-1 h-7 px-3 text-[11px] font-medium bg-[#0F52BA] text-white hover:bg-[#0D47A1]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Save Sample Note
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Sample Traceability">
              <p className="text-[12px] text-[#6B7280]">
                Select a sample record to inspect its cross-module provenance.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

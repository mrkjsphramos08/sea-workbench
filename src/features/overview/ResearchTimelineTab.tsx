'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Filter, Info } from 'lucide-react';
import {
  ActiveModule,
  Experiment,
  OverviewWorkspaceTab,
} from '../../domain/models/types';
import {
  ResolvedTimelineEvent,
  buildExperimentTimeline,
} from '../../domain/calculations/workflowEngine';
import { StatusText } from '../../components/ui/Primitives';

interface ResearchTimelineTabProps {
  experiment: Experiment;
  onNavigate: (target: {
    module: ActiveModule;
    surveyDatasetId?: string;
    analyticalSessionId?: string;
    overviewTab?: OverviewWorkspaceTab;
    highlightRecordId?: string;
  }) => void;
}

const MODULE_LABELS: Record<ActiveModule, string> = {
  library: 'Library',
  overview: 'Overview',
  'batch-synthesis': 'Batch & Planning',
  'uptake-survey': 'Uptake Survey',
  analytical: 'Analytical',
  'bench-runner': 'Bench Runner',
  'lab-report': 'Reports',
  databases: 'Materials DB',
};

export function ResearchTimelineTab({
  experiment,
  onNavigate,
}: ResearchTimelineTabProps) {
  const [moduleFilter, setModuleFilter] = useState<'all' | ActiveModule>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const timeline = useMemo(
    () => buildExperimentTimeline(experiment),
    [experiment]
  );

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of timeline) set.add(item.eventType);
    return Array.from(set).sort();
  }, [timeline]);

  const filtered = useMemo(() => {
    return timeline.filter((entry) => {
      if (moduleFilter !== 'all' && entry.module !== moduleFilter) return false;
      if (typeFilter !== 'all' && entry.eventType !== typeFilter) return false;
      const day = entry.timestamp.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [timeline, moduleFilter, typeFilter, dateFrom, dateTo]);

  const handleJump = (entry: ResolvedTimelineEvent) => {
    if (!entry.sourceAvailable) return;
    if (entry.eventType === 'snapshot_created' || entry.sourceKind === 'snapshot') {
      onNavigate({ module: 'overview', overviewTab: 'snapshots' });
      return;
    }
    if (
      entry.eventType === 'report_finalized' ||
      entry.sourceKind === 'finalized_report'
    ) {
      onNavigate({ module: 'lab-report' });
      return;
    }
    if (entry.module === 'uptake-survey') {
      const ds = experiment.surveyDatasets.find((d) => d.id === entry.sourceId);
      onNavigate({
        module: 'uptake-survey',
        surveyDatasetId: ds?.id,
        highlightRecordId: entry.sourceId ?? undefined,
      });
      return;
    }
    if (entry.module === 'analytical') {
      const sess = experiment.analyticalSessions.find(
        (s) => s.id === entry.sourceId
      );
      onNavigate({
        module: 'analytical',
        analyticalSessionId: sess?.id,
        highlightRecordId: entry.sourceId ?? undefined,
      });
      return;
    }
    onNavigate({
      module: entry.module,
      highlightRecordId: entry.sourceId ?? undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="border border-[#E5E7EB] bg-[#F8F9FA] px-3.5 py-2.5 text-[11px] text-[#4B5563] flex items-start gap-2">
        <Info className="h-4 w-4 text-[#0F52BA] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-[#111827]">
            Local Research Activity Log:
          </span>{' '}
          This chronological record aggregates local browser-recorded lifecycle
          transitions, milestones, dataset/session additions, observations,
          snapshots, and report finalizations. It is a local documentation aid
          and not a tamper-proof or regulatory audit trail.
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E7EB] p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4B5563]">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters:</span>
        </div>
        <select
          aria-label="Filter timeline by module"
          value={moduleFilter}
          onChange={(e) =>
            setModuleFilter(e.target.value as 'all' | ActiveModule)
          }
          className="h-7 px-2 text-[11px] border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827]"
        >
          <option value="all">All Modules</option>
          {(Object.keys(MODULE_LABELS) as ActiveModule[]).map((mod) => (
            <option key={mod} value={mod}>
              {MODULE_LABELS[mod]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter timeline by event type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-7 px-2 text-[11px] border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827]"
        >
          <option value="all">All Event Types</option>
          {eventTypes.map((et) => (
            <option key={et} value={et}>
              {et.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
          <span>From</span>
          <input
            type="date"
            aria-label="Timeline start date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 px-2 text-[11px] font-mono border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827]"
          />
          <span>To</span>
          <input
            type="date"
            aria-label="Timeline end date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 px-2 text-[11px] font-mono border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827]"
          />
        </div>

        <span className="ml-auto text-[11px] font-mono text-[#6B7280]">
          {filtered.length} / {timeline.length} events
        </span>
      </div>

      {/* Timeline List */}
      <div className="bg-white border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-[#6B7280]">
            No timeline events match the current filter.
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="px-4 py-3 flex flex-wrap items-start justify-between gap-3 hover:bg-[#F8F9FA]"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 font-mono text-[#6B7280]">
                    <Clock className="h-3 w-3" />
                    {entry.timestamp.slice(0, 19).replace('T', ' ')}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                    {MODULE_LABELS[entry.module] ?? entry.module}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono text-[#0F52BA] bg-[#EFF6FF] border border-[#BFDBFE]">
                    {entry.eventType.replace(/_/g, ' ')}
                  </span>
                  {entry.sourceLabel && (
                    <span className="font-mono text-[10.5px] text-[#374151]">
                      {entry.sourceLabel}
                    </span>
                  )}
                  {entry.author && (
                    <span className="text-[#6B7280]">· {entry.author}</span>
                  )}
                  {!entry.sourceAvailable && (
                    <StatusText label="Source Deleted" tone="warning" />
                  )}
                </div>
                <p className="text-[12.5px] text-[#111827] leading-snug">
                  {entry.description}
                </p>
              </div>
              {entry.sourceAvailable && entry.module !== 'overview' && (
                <button
                  type="button"
                  onClick={() => handleJump(entry)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F52BA] hover:underline shrink-0 mt-1"
                >
                  Open {MODULE_LABELS[entry.module]}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
              {entry.sourceAvailable &&
                (entry.eventType === 'snapshot_created' ||
                  entry.sourceKind === 'snapshot') && (
                  <button
                    type="button"
                    onClick={() => handleJump(entry)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F52BA] hover:underline shrink-0 mt-1"
                  >
                    Inspect Snapshots
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

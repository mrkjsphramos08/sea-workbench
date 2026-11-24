'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  ActiveModule,
  AnalyticalQualityIssueCategory,
  AnalyticalReviewStatus,
  Experiment,
  OverviewWorkspaceTab,
  Precursor,
  Support,
} from '../../domain/models/types';
import {
  CONSOLIDATED_REVIEW_GROUP_LABELS,
  ConsolidatedReviewGroup,
  ConsolidatedReviewItem,
  buildConsolidatedReviewItems,
} from '../../domain/calculations/workflowEngine';
import { Panel, StatusText } from '../../components/ui/Primitives';

interface ResearchReviewCenterTabProps {
  experiment: Experiment;
  supports: Support[];
  precursors: Precursor[];
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

const ANALYTICAL_REVIEW_STATUSES: AnalyticalReviewStatus[] = [
  'Open',
  'Under Review',
  'Resolved',
  'Acknowledged',
  'Excluded by Researcher',
];

function isResolvedStatus(status: AnalyticalReviewStatus): boolean {
  return (
    status === 'Resolved' ||
    status === 'Acknowledged' ||
    status === 'Excluded by Researcher'
  );
}

export function ResearchReviewCenterTab({
  experiment,
  supports,
  precursors,
  onUpdateAnalyticalReview,
  onNavigate,
}: ResearchReviewCenterTabProps) {
  const [groupFilter, setGroupFilter] = useState<
    'all' | ConsolidatedReviewGroup
  >('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'resolved'>(
    'open'
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editStatus, setEditStatus] =
    useState<AnalyticalReviewStatus>('Under Review');
  const [editNote, setEditNote] = useState('');

  const items = useMemo(
    () => buildConsolidatedReviewItems(experiment, supports, precursors),
    [experiment, supports, precursors]
  );

  const countsByGroup = useMemo(() => {
    const counts = {} as Record<ConsolidatedReviewGroup, number>;
    for (const key of Object.keys(
      CONSOLIDATED_REVIEW_GROUP_LABELS
    ) as ConsolidatedReviewGroup[]) {
      counts[key] = 0;
    }
    for (const item of items) {
      counts[item.group] = (counts[item.group] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const openCount = useMemo(
    () => items.filter((i) => !isResolvedStatus(i.status)).length,
    [items]
  );
  const resolvedCount = items.length - openCount;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (groupFilter !== 'all' && item.group !== groupFilter) return false;
      if (statusFilter === 'open' && isResolvedStatus(item.status)) {
        return false;
      }
      if (statusFilter === 'resolved' && !isResolvedStatus(item.status)) {
        return false;
      }
      return true;
    });
  }, [items, groupFilter, statusFilter]);

  const startEdit = (item: ConsolidatedReviewItem) => {
    setEditingKey(item.issueKey);
    setEditStatus(
      ANALYTICAL_REVIEW_STATUSES.includes(item.status)
        ? item.status
        : 'Under Review'
    );
    setEditNote(item.researcherNotes);
  };

  const handleSaveAnalyticalStatus = (item: ConsolidatedReviewItem) => {
    if (!item.analyticalReviewRef) return;
    onUpdateAnalyticalReview(item.analyticalReviewRef.sessionId, {
      issueKey: item.analyticalReviewRef.issueKey,
      category: item.analyticalReviewRef.category,
      recordId: item.analyticalReviewRef.recordId,
      recordLabel: item.analyticalReviewRef.recordLabel,
      description: item.description,
      status: editStatus,
      researcherNotes: editNote,
      author: experiment.researcher || 'Research Scientist',
    });
    setEditingKey(null);
  };

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
            Total Review Items
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#111827]">
            {items.length}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
            Open / Under Review
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#B45309]">
            {openCount}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
            Resolved / Documented
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#047857]">
            {resolvedCount}
          </div>
        </div>
        <div className="bg-white border border-[#E5E7EB] px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
            Figure Source Checks
          </div>
          <div className="text-[18px] font-semibold font-mono tabular-nums text-[#0F52BA]">
            {countsByGroup.figure_source_availability}
          </div>
        </div>
      </div>

      {/* Category & Status Filters */}
      <div className="bg-white border border-[#E5E7EB] p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['open', `Open (${openCount})`],
              ['all', `All (${items.length})`],
              ['resolved', `Resolved / Accepted (${resolvedCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={`h-7 px-2.5 text-[11px] font-medium border ${
                statusFilter === id
                  ? 'border-[#0F52BA] bg-[#0F52BA] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter review items by category"
          value={groupFilter}
          onChange={(e) =>
            setGroupFilter(e.target.value as 'all' | ConsolidatedReviewGroup)
          }
          className="h-7 px-2.5 text-[11px] border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827]"
        >
          <option value="all">All 11 Review Categories</option>
          {(
            Object.keys(
              CONSOLIDATED_REVIEW_GROUP_LABELS
            ) as ConsolidatedReviewGroup[]
          ).map((g) => (
            <option key={g} value={g}>
              {CONSOLIDATED_REVIEW_GROUP_LABELS[g]} ({countsByGroup[g]})
            </option>
          ))}
        </select>
      </div>

      {/* Consolidated Issue List */}
      <Panel
        title="Consolidated Research Review Center"
        subtitle="Aggregated directly from authoritative survey, analytical, linkage, and reproducibility services with synchronized review statuses."
      >
        {filtered.length === 0 ? (
          <div className="py-8 text-center space-y-1">
            <CheckCircle2 className="h-5 w-5 text-[#047857] mx-auto" />
            <p className="text-[12.5px] font-medium text-[#111827]">
              No review items in this view.
            </p>
            <p className="text-[11px] text-[#6B7280]">
              All checks in the selected category/status filter are clear.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filtered.map((item) => {
              const isEditing = editingKey === item.issueKey;
              const canInlineReview = Boolean(item.analyticalReviewRef);
              const isCriticalGroup =
                item.group === 'incompatible_units' ||
                item.group === 'conflicting_values' ||
                item.group === 'analytical_discrepancies';
              return (
                <div key={item.issueKey} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isCriticalGroup ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-[#B45309] shrink-0" />
                        )}
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                          {CONSOLIDATED_REVIEW_GROUP_LABELS[item.group]}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-[#111827]">
                          {item.recordLabel}
                        </span>
                        <StatusText
                          label={item.status}
                          tone={
                            isResolvedStatus(item.status)
                              ? 'success'
                              : item.status === 'Under Review'
                                ? 'info'
                                : 'warning'
                          }
                        />
                      </div>
                      <p className="text-[12.5px] text-[#111827]">
                        {item.description}
                      </p>
                      {item.researcherNotes && (
                        <p className="text-[11.5px] text-[#374151] bg-[#F8F9FA] border-l-2 border-[#0F52BA] pl-2 py-1">
                          Note: {item.researcherNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canInlineReview && !isEditing && (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="h-7 px-2.5 text-[11px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA]"
                        >
                          Update Status
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate(item.navContext)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium border border-[#0F52BA] text-[#0F52BA] hover:bg-[#0F52BA] hover:text-white transition-colors"
                      >
                        Inspect Source
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="bg-[#F8F9FA] border border-[#E5E7EB] p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] font-medium text-[#374151]">
                          Authoritative Review Status:
                        </label>
                        <select
                          aria-label="Authoritative review status"
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(
                              e.target.value as AnalyticalReviewStatus
                            )
                          }
                          className="h-7 px-2 text-[11px] border border-[#E5E7EB] bg-white text-[#111827]"
                        >
                          {ANALYTICAL_REVIEW_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        aria-label="Researcher review rationale"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Document researcher review rationale..."
                        className="w-full p-2 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingKey(null)}
                          className="h-7 px-2.5 text-[11px] border border-[#E5E7EB] bg-white text-[#4B5563]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveAnalyticalStatus(item)}
                          className="h-7 px-3 text-[11px] font-medium bg-[#0F52BA] text-white"
                        >
                          Save Authoritative Review
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

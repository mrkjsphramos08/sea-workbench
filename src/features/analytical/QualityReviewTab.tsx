'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  History,
  ShieldAlert,
} from 'lucide-react';
import {
  AnalyticalQualityIssueCategory,
  AnalyticalReviewStatus,
  AnalyticalSession,
  AnalyticalWorkspaceTab,
  DataProvenance,
} from '../../domain/models/types';
import { DetectedAnalyticalIssue } from '../../domain/calculations/seaMath';
import {
  exportQualityReviewCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import {
  Button,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  inputBaseClass,
} from '../../components/ui/Primitives';

const CATEGORY_LABELS: Record<AnalyticalQualityIssueCategory, string> = {
  missing_measurement: 'Missing Measurement',
  incomplete_metadata: 'Incomplete Metadata',
  unresolved_survey_association: 'Unresolved Survey Link',
  incompatible_units: 'Incompatible Units',
  duplicate_measurement: 'Duplicate Measurement',
  conflicting_dilution_metadata: 'Conflicting Dilution Metadata',
  missing_calibration_association: 'Calibration Association',
  instrument_warning: 'Instrument Warning',
  flagged_observation: 'Flagged Observation',
  user_excluded_record: 'Excluded by Researcher',
  pending_review: 'Pending Review',
};

const REVIEW_STATUSES: AnalyticalReviewStatus[] = [
  'Open',
  'Under Review',
  'Resolved',
  'Acknowledged',
  'Excluded by Researcher',
];

export interface QualityReviewTabProps {
  experimentId: string;
  session: AnalyticalSession;
  issues: DetectedAnalyticalIssue[];
  analystName: string;
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
  onNavigateTab: (tab: AnalyticalWorkspaceTab) => void;
}

export function QualityReviewTab({
  experimentId,
  session,
  issues,
  analystName,
  onUpdateReviewStatus,
  onNavigateTab,
}: QualityReviewTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && i.effectiveStatus !== statusFilter)
        return false;
      return true;
    });
  }, [issues, categoryFilter, statusFilter]);

  const countsByStatus = useMemo(() => {
    const map: Record<AnalyticalReviewStatus, number> = {
      Open: 0,
      'Under Review': 0,
      Resolved: 0,
      Acknowledged: 0,
      'Excluded by Researcher': 0,
    };
    for (const i of issues) {
      map[i.effectiveStatus] = (map[i.effectiveStatus] ?? 0) + 1;
    }
    return map;
  }, [issues]);

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {REVIEW_STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === st ? 'all' : st))
            }
            className={`p-2.5 text-left rounded-[8px] border transition-colors cursor-pointer ${
              statusFilter === st
                ? 'border-[#0F52BA] bg-[#EFF6FF]/40'
                : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
            }`}
          >
            <div className="text-[10.5px] uppercase text-[#6B7280]">{st}</div>
            <div className="font-mono text-[17px] font-semibold text-[#111827] tabular-nums mt-0.5">
              {countsByStatus[st]}
            </div>
          </button>
        ))}
      </div>

      {/* Scientific Boundary Note */}
      <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] flex items-start gap-2 text-[12px] text-[#92400E]">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Quality review transitions record researcher decisions and append-only audit history without silently mutating recorded instrument values. Analytical method validation (LOD/LOQ, spike recovery, acceptance criteria) remains pending specialist review.
        </div>
      </div>

      {/* Review Queue */}
      <Panel>
        <PanelHeader
          title={`Analytical Quality Review Queue (${filtered.length} of ${issues.length})`}
          subtitle="Structured review of missing records, dilution conflicts, unit mismatches, instrument flags, and researcher exclusions."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter quality queue by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-7 px-2 text-[12px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
              >
                <option value="all">All Categories</option>
                {(
                  Object.keys(CATEGORY_LABELS) as AnalyticalQualityIssueCategory[]
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  triggerFileDownload(
                    exportQualityReviewCsv(experimentId, session, issues),
                    `${experimentId}-${session.sessionId}-quality-review.csv`,
                    'text/csv;charset=utf-8'
                  )
                }
              >
                <Download className="w-3.5 h-3.5" />
                Export Review CSV
              </Button>
            </div>
          }
        />

        <div className="divide-y divide-[#E5E7EB]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#6B7280] flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#065F46]" />
              No analytical quality issues match the selected filters.
            </div>
          ) : (
            filtered.map((issue) => {
              const noteVal =
                draftNotes[issue.issueKey] ??
                issue.persistedReview?.researcherNotes ??
                '';
              const history = issue.persistedReview?.history ?? [];

              return (
                <div key={issue.issueKey} className="p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] text-[#374151]">
                          {CATEGORY_LABELS[issue.category]}
                        </span>
                        <span className="font-mono text-[12.5px] font-semibold text-[#111827]">
                          {issue.recordLabel}
                        </span>
                        <ProvenanceIndicator provenance={issue.provenance} />
                      </div>
                      <p className="text-[12.5px] text-[#374151]">
                        {issue.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label={`Review status for ${issue.recordLabel}`}
                        value={issue.effectiveStatus}
                        onChange={(e) =>
                          onUpdateReviewStatus({
                            issueKey: issue.issueKey,
                            category: issue.category,
                            recordId: issue.recordId,
                            recordLabel: issue.recordLabel,
                            description: issue.description,
                            provenance: issue.provenance,
                            status: e.target.value as AnalyticalReviewStatus,
                            researcherNotes: noteVal,
                            author: analystName,
                          })
                        }
                        className="h-7 px-2 text-[12px] font-medium bg-white border border-[#D1D5DB] rounded-[6px]"
                      >
                        {REVIEW_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onNavigateTab(issue.targetTab)}
                      >
                        Source
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={noteVal}
                      onChange={(e) =>
                        setDraftNotes((prev) => ({
                          ...prev,
                          [issue.issueKey]: e.target.value,
                        }))
                      }
                      placeholder="Add researcher review note or justification..."
                      className={`${inputBaseClass} flex-1 min-w-[220px]`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        onUpdateReviewStatus({
                          issueKey: issue.issueKey,
                          category: issue.category,
                          recordId: issue.recordId,
                          recordLabel: issue.recordLabel,
                          description: issue.description,
                          provenance: issue.provenance,
                          status: issue.effectiveStatus,
                          researcherNotes: noteVal,
                          author: analystName,
                        })
                      }
                    >
                      Save Note
                    </Button>
                    {history.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpandedHistory((prev) =>
                            prev === issue.issueKey ? null : issue.issueKey
                          )
                        }
                      >
                        <History className="w-3.5 h-3.5" />
                        History ({history.length})
                      </Button>
                    )}
                  </div>

                  {expandedHistory === issue.issueKey && history.length > 0 && (
                    <div className="p-2.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] space-y-1 text-[11.5px]">
                      {history.map((h, idx) => (
                        <div
                          key={`${h.timestamp}-${idx}`}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-[#4B5563]"
                        >
                          <span>
                            <span className="font-semibold text-[#111827]">
                              {h.status}
                            </span>{' '}
                            by {h.author}
                            {h.note ? ` — "${h.note}"` : ''}
                          </span>
                          <span className="font-mono text-[10.5px] text-[#6B7280]">
                            {h.timestamp.slice(0, 19).replace('T', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}

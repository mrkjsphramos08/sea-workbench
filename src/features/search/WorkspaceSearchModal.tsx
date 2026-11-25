'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  ArrowRight,
  FolderKanban,
  FlaskConical,
  Database,
  LineChart,
  Microscope,
  FileText,
  Camera,
  BookOpen,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  WorkspaceSearchCategory,
  WorkspaceSearchResult,
} from '../../domain/models/types';
import { searchWorkspaceRecords } from '../../domain/calculations/seaMath';
import { useWorkbenchStore } from '../../store/useWorkbenchStore';
import { Badge } from '../../components/ui/Primitives';

interface WorkspaceSearchModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_FILTERS: Array<{
  id: WorkspaceSearchCategory | 'all';
  label: string;
}> = [
  { id: 'all', label: 'All Records' },
  { id: 'experiment', label: 'Experiments' },
  { id: 'survey_dataset', label: 'Survey Datasets' },
  { id: 'analytical_session', label: 'Analytical Sessions' },
  { id: 'sample', label: 'Samples' },
  { id: 'measurement', label: 'Measurements' },
  { id: 'support', label: 'Supports' },
  { id: 'precursor', label: 'Precursors' },
  { id: 'reference', label: 'References' },
  { id: 'observation', label: 'Observations' },
  { id: 'interpretation', label: 'Interpretations' },
  { id: 'figure', label: 'Saved Figures' },
  { id: 'snapshot', label: 'Snapshots' },
  { id: 'report', label: 'Finalized Reports' },
  { id: 'project', label: 'Projects' },
];

export function WorkspaceSearchModal({
  open,
  onClose,
}: WorkspaceSearchModalProps) {
  const getSerializableWorkspace = useWorkbenchStore(
    (s) => s.getSerializableWorkspace
  );
  const navigateToContext = useWorkbenchStore((s) => s.navigateToContext);
  const experiments = useWorkbenchStore((s) => s.experiments);
  const projects = useWorkbenchStore((s) => s.projects);
  const supports = useWorkbenchStore((s) => s.supports);
  const precursors = useWorkbenchStore((s) => s.precursors);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    WorkspaceSearchCategory | 'all'
  >('all');
  const [includeSyntheticDemo, setIncludeSyntheticDemo] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [open]);

  const workspace = useMemo(
    () => getSerializableWorkspace(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [experiments, projects, supports, precursors, getSerializableWorkspace]
  );

  const results = useMemo(() => {
    if (!query.trim()) {
      // Show quick recent records when query is empty
      return searchWorkspaceRecords(workspace, 'SEA', {
        categoryFilter,
        includeSyntheticDemo,
        limit: 25,
      });
    }
    return searchWorkspaceRecords(workspace, query, {
      categoryFilter,
      includeSyntheticDemo,
      limit: 100,
    });
  }, [workspace, query, categoryFilter, includeSyntheticDemo]);

  if (!open) return null;

  const handleSelectResult = (res: WorkspaceSearchResult) => {
    if (!res.isAvailable) return;
    navigateToContext({
      module: res.targetModule,
      experimentUuid: res.experimentUuid ?? undefined,
      surveyDatasetId: res.targetDatasetId ?? undefined,
      analyticalSessionId: res.targetSessionId ?? undefined,
      overviewTab:
        res.category === 'snapshot'
          ? 'snapshots'
          : res.category === 'observation'
            ? 'timeline'
            : undefined,
      surveyTab:
        res.category === 'figure' && res.targetModule === 'uptake-survey'
          ? 'figures'
          : res.category === 'interpretation'
            ? 'interpretation'
            : res.category === 'sample' || res.category === 'measurement'
              ? 'data'
              : undefined,
      analyticalTab:
        res.category === 'figure' && res.targetModule === 'analytical'
          ? 'figures'
          : res.category === 'measurement' && res.targetModule === 'analytical'
            ? 'samples'
            : undefined,
      highlightRecordId: res.targetRecordId ?? undefined,
    });
    onClose();
  };

  const renderCategoryIcon = (cat: WorkspaceSearchCategory) => {
    switch (cat) {
      case 'project':
        return <FolderKanban className="w-4 h-4 text-[#0F52BA]" />;
      case 'experiment':
        return <FlaskConical className="w-4 h-4 text-[#0F52BA]" />;
      case 'support':
      case 'precursor':
        return <Database className="w-4 h-4 text-[#4B5563]" />;
      case 'survey_dataset':
      case 'figure':
        return <LineChart className="w-4 h-4 text-[#0F52BA]" />;
      case 'analytical_session':
      case 'sample':
      case 'measurement':
        return <Microscope className="w-4 h-4 text-[#1E3A8A]" />;
      case 'reference':
        return <BookOpen className="w-4 h-4 text-[#4B5563]" />;
      case 'observation':
      case 'interpretation':
        return <MessageSquare className="w-4 h-4 text-[#4B5563]" />;
      case 'snapshot':
        return <Camera className="w-4 h-4 text-[#15803D]" />;
      case 'report':
        return <FileText className="w-4 h-4 text-[#0F52BA]" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-14 px-4 print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Research Search"
    >
      <div
        className="w-full max-w-3xl bg-white border border-[#E5E7EB] shadow-xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Header */}
        <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center gap-3 bg-[#F8F9FA]">
          <Search className="w-4 h-4 text-[#0F52BA] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, experiments, samples (UPT-05, ICP-BLK-02), supports, precursors, references, observations, snapshots..."
            className="w-full bg-transparent text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none"
            aria-label="Workspace search query"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-[#6B7280] hover:text-[#111827] px-1.5 py-0.5 border border-[#E5E7EB] bg-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6B7280] hover:text-[#111827]"
            title="Close search (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {CATEGORY_FILTERS.slice(0, 8).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2 py-1 text-[11px] font-medium border transition-colors ${
                  categoryFilter === cat.id
                    ? 'bg-[#0F52BA] text-white border-[#0F52BA]'
                    : 'bg-[#F8F9FA] text-[#4B5563] border-[#E5E7EB] hover:text-[#111827]'
                }`}
              >
                {cat.label}
              </button>
            ))}
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(
                  e.target.value as WorkspaceSearchCategory | 'all'
                )
              }
              aria-label="Filter search category"
              className="px-2 py-1 text-[11px] border border-[#E5E7EB] bg-white text-[#111827]"
            >
              {CATEGORY_FILTERS.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  Filter: {cat.label}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-[#4B5563] cursor-pointer">
            <input
              type="checkbox"
              checked={includeSyntheticDemo}
              onChange={(e) => setIncludeSyntheticDemo(e.target.checked)}
              className="accent-[#0F52BA]"
            />
            Include synthetic demo records
          </label>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">
          {results.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-[#111827]">
                No matching research records found
              </p>
              <p className="text-xs text-[#6B7280] mt-1">
                Try searching by sample ID (e.g., UPT-05), material formula
                (SiO2, Pt), dataset code (DS-UPT-01), or observation text.
              </p>
            </div>
          ) : (
            results.map((res) => (
              <button
                key={res.id}
                type="button"
                onClick={() => handleSelectResult(res)}
                disabled={!res.isAvailable}
                className="w-full text-left px-4 py-3 hover:bg-[#F8F9FA] transition-colors flex items-start justify-between gap-3 disabled:opacity-60"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {renderCategoryIcon(res.category)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
                        {res.categoryLabel}
                      </span>
                      {res.experimentIdLabel && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE]">
                          {res.experimentIdLabel}
                        </span>
                      )}
                      {res.projectLabel && (
                        <span className="text-[10px] font-mono text-[#6B7280]">
                          {res.projectLabel}
                        </span>
                      )}
                      {res.provenance === 'synthetic_demo' ? (
                        <Badge variant="demo">Synthetic Demo</Badge>
                      ) : (
                        <Badge variant="neutral">{res.provenance}</Badge>
                      )}
                      {!res.isAvailable && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#B91C1C] font-medium">
                          <AlertTriangle className="w-3 h-3" /> Source Unavailable
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-[#111827] mt-1 truncate">
                      {res.title}
                    </p>
                    <p className="text-[11px] text-[#4B5563] truncate">
                      {res.subtitle}
                    </p>
                    <p className="text-[11px] font-mono text-[#6B7280] mt-0.5 truncate">
                      Match: &ldquo;{res.matchingSnippet}&rdquo;
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#0F52BA] mt-1">
                  {res.isAvailable ? (
                    <>
                      <span>Open</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <span className="text-[#9CA3AF]">Deleted</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#E5E7EB] bg-[#F8F9FA] flex items-center justify-between text-[11px] text-[#6B7280]">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
            Showing {results.length} live workspace match
            {results.length === 1 ? '' : 'es'} across 14 entity categories
          </span>
          <span className="font-mono">Shortcut: Ctrl+K / Cmd+K · Esc to close</span>
        </div>
      </div>
    </div>
  );
}

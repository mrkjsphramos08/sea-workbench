'use client';

import React, { useState } from 'react';
import {
  Check,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Save,
  AlertCircle,
} from 'lucide-react';
import { Experiment, ExperimentStatus } from '../../domain/models/types';
import { SaveStatus } from '../../store/useWorkbenchStore';
import { Button } from '../ui/Primitives';

const STATUS_OPTIONS: ExperimentStatus[] = [
  'Draft',
  'Planned',
  'In Progress',
  'Measurements Pending',
  'Analysis in Progress',
  'Under Review',
  'Completed',
  'Archived',
];

function formatSavedTime(iso: string | null): string {
  if (!iso) return 'Not saved';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Saved';
  }
}

export function TopBar({
  activeExperiment,
  sidebarCollapsed,
  saveStatus,
  lastSavedAt,
  onToggleSidebar,
  onUpdateTitle,
  onUpdateStatus,
  onOpenNewExperiment,
  onSaveRun,
  onOpenLoadRun,
  onPrintReport,
  onOpenOverview,
}: {
  activeExperiment: Experiment | null;
  sidebarCollapsed: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  onToggleSidebar: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateStatus: (status: ExperimentStatus) => void;
  onOpenNewExperiment: () => void;
  onSaveRun: () => void;
  onOpenLoadRun: () => void;
  onPrintReport: () => void;
  onOpenOverview?: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const displayedTitle =
    editingTitle !== null ? editingTitle : activeExperiment?.title ?? '';

  const commitTitle = () => {
    if (!activeExperiment) {
      setEditingTitle(null);
      return;
    }
    const trimmed = (editingTitle ?? activeExperiment.title).trim();
    if (trimmed && trimmed !== activeExperiment.title) {
      onUpdateTitle(trimmed);
    }
    setEditingTitle(null);
  };

  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b border-[#E5E7EB] px-3 lg:px-4 flex items-center justify-between gap-3 no-print">
      {/* Left: Wordmark + Sidebar Collapse */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="h-8 w-8 inline-flex items-center justify-center rounded-[6px] text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>
        <div className="flex items-center gap-2 select-none">
          <span className="inline-block w-2 h-2 bg-[#0F52BA] rounded-[2px]" aria-hidden="true" />
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#111827] whitespace-nowrap">
            SEA Workbench
          </span>
        </div>
      </div>

      {/* Center: Active Experiment ID + Editable Title + Status */}
      <div className="flex-1 min-w-0 max-w-2xl flex items-center justify-center gap-2">
        {activeExperiment ? (
          <>
            <button
              type="button"
              onClick={() => onOpenOverview?.()}
              className="font-mono tabular-nums text-[12px] font-medium text-[#0F52BA] bg-[#F3F4F6] border border-[#E5E7EB] hover:border-[#0F52BA] rounded-[6px] px-2 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              title={`Open Experiment Overview (${activeExperiment.experimentId} · UUID ${activeExperiment.uuid})`}
            >
              {activeExperiment.experimentId}
            </button>
            <input
              type="text"
              aria-label="Active experiment title"
              value={displayedTitle}
              onFocus={() => setEditingTitle(activeExperiment.title)}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setEditingTitle(null);
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 min-w-[140px] h-8 px-2 text-[13px] font-medium text-[#111827] bg-transparent border border-transparent hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] rounded-[6px] truncate transition-colors"
            />
            <select
              aria-label="Active experiment status"
              value={activeExperiment.status}
              onChange={(e) =>
                onUpdateStatus(e.target.value as ExperimentStatus)
              }
              className="h-8 px-2 text-[12px] font-medium text-[#4B5563] bg-[#F3F4F6] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] rounded-[6px] shrink-0 cursor-pointer"
            >
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-[12.5px] text-[#6B7280] whitespace-nowrap">
            No active experiment selected
          </span>
        )}
      </div>

      {/* Right: Functional Actions + Save State */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="hidden xl:inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#6B7280] mr-1 whitespace-nowrap"
          aria-live="polite"
        >
          {saveStatus === 'error' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-[#991B1B]" strokeWidth={1.75} />
              <span className="text-[#991B1B]">Save error</span>
            </>
          ) : saveStatus === 'saving' ? (
            <span>Saving...</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[#065F46]" strokeWidth={1.75} />
              <span>Saved {formatSavedTime(lastSavedAt)}</span>
            </>
          )}
        </span>

        <Button
          variant="primary"
          size="sm"
          onClick={onOpenNewExperiment}
          title="Create a new blank experiment"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="hidden sm:inline">New Experiment</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onSaveRun}
          title="Save workspace immediately to local storage"
        >
          <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="hidden md:inline">Save Run</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenLoadRun}
          title="Import or export JSON workspace backup"
        >
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="hidden md:inline">Load Run</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onPrintReport}
          disabled={!activeExperiment}
          title="Open A4 Lab Report and print"
        >
          <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="hidden lg:inline">Print Report</span>
        </Button>
      </div>
    </header>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import {
  BenchChecklistItem,
  BenchTimerState,
  Experiment,
} from '../../domain/models/types';

type BenchTimerStatus = BenchTimerState['countdownStatus'];
import {
  Button,
  FieldLabel,
  Panel,
  PanelHeader,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatDurationMinutes(sec: number): string {
  const mins = sec / 60;
  return Number.isInteger(mins) ? `${mins} min` : `${mins.toFixed(1)} min`;
}

function formatIsoShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function recoverElapsedInitial(timer: BenchTimerState): {
  ms: number;
  status: BenchTimerStatus;
} {
  if (timer.elapsedStatus === 'running' && timer.elapsedLastTickAt) {
    const parsed = Date.parse(timer.elapsedLastTickAt);
    const delta = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : 0;
    return { ms: timer.elapsedMs + delta, status: 'running' };
  }
  const status: BenchTimerStatus =
    timer.elapsedStatus === 'paused' || timer.elapsedMs > 0 ? 'paused' : 'ready';
  return { ms: timer.elapsedMs, status };
}

function recoverCountdownInitial(timer: BenchTimerState): {
  ms: number;
  status: BenchTimerStatus;
} {
  if (timer.countdownStatus === 'running' && timer.countdownLastTickAt) {
    const parsed = Date.parse(timer.countdownLastTickAt);
    const delta = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : 0;
    const remaining = Math.max(0, timer.countdownRemainingMs - delta);
    return {
      ms: remaining,
      status: remaining === 0 ? 'completed' : 'running',
    };
  }
  if (timer.countdownStatus === 'completed' || timer.countdownRemainingMs <= 0) {
    return { ms: 0, status: 'completed' };
  }
  if (timer.countdownStatus === 'paused') {
    return { ms: timer.countdownRemainingMs, status: 'paused' };
  }
  return { ms: timer.countdownRemainingMs, status: 'ready' };
}

const STATUS_BADGE_STYLES: Record<BenchTimerStatus, string> = {
  ready: 'text-[#4B5563] bg-[#F3F4F6] border-[#E5E7EB]',
  running: 'text-[#0F52BA] bg-[#EFF6FF] border-[#BFDBFE]',
  paused: 'text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]',
  completed: 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]',
};

const STATUS_LABELS: Record<BenchTimerStatus, string> = {
  ready: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
};

export function BenchRunnerWorkspace({
  experiment,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onUpdateTimer,
  onAddObservation,
  onDeleteObservation,
}: {
  experiment: Experiment;
  onAddChecklistItem: (label: string, plannedTime: string) => void;
  onUpdateChecklistItem: (
    itemId: string,
    patch: Partial<BenchChecklistItem>
  ) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onUpdateTimer: (patch: Partial<BenchTimerState>, logMessage?: string) => void;
  onAddObservation: (text: string) => void;
  onDeleteObservation: (obsId: string) => void;
}) {
  const [elapsedInitial] = useState(() =>
    recoverElapsedInitial(experiment.benchTimer)
  );
  const [countdownInitial] = useState(() =>
    recoverCountdownInitial(experiment.benchTimer)
  );

  const [elapsedStatus, setElapsedStatus] = useState<BenchTimerStatus>(
    elapsedInitial.status
  );
  const [countdownStatus, setCountdownStatus] = useState<BenchTimerStatus>(
    countdownInitial.status
  );

  const [elapsedMs, setElapsedMs] = useState(elapsedInitial.ms);
  const [countdownMs, setCountdownMs] = useState(countdownInitial.ms);
  const [countdownMinutesInput, setCountdownMinutesInput] = useState(
    String(
      Math.max(1, Math.round(experiment.benchTimer.countdownDurationSec / 60))
    )
  );

  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskPlannedTime, setNewTaskPlannedTime] = useState('');
  const [obsDraft, setObsDraft] = useState('');

  const elapsedRef = useRef(elapsedMs);
  const countdownRef = useRef(countdownMs);
  const onUpdateTimerRef = useRef(onUpdateTimer);

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    countdownRef.current = countdownMs;
  }, [countdownMs]);

  useEffect(() => {
    onUpdateTimerRef.current = onUpdateTimer;
  }, [onUpdateTimer]);

  // If recovered countdown already finished while away, sync completed state once
  useEffect(() => {
    if (
      experiment.benchTimer.countdownStatus === 'running' &&
      countdownInitial.status === 'completed'
    ) {
      onUpdateTimerRef.current(
        {
          countdownRemainingMs: 0,
          countdownStatus: 'completed',
          countdownLastTickAt: null,
          completedAt: new Date().toISOString(),
        },
        'Countdown timer reached 00:00:00 while away.'
      );
    }
  }, [experiment.benchTimer.countdownStatus, countdownInitial.status]);

  // Elapsed timer interval
  useEffect(() => {
    if (elapsedStatus !== 'running') return;
    let lastTick = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      setElapsedMs((prev) => prev + delta);
    }, 250);
    return () => window.clearInterval(id);
  }, [elapsedStatus]);

  // Countdown timer interval
  useEffect(() => {
    if (countdownStatus !== 'running') return;
    let lastTick = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      setCountdownMs((prev) => {
        const next = Math.max(0, prev - delta);
        if (next === 0) {
          setCountdownStatus('completed');
          onUpdateTimerRef.current(
            {
              countdownRemainingMs: 0,
              countdownStatus: 'completed',
              countdownLastTickAt: null,
              completedAt: new Date().toISOString(),
            },
            'Countdown timer reached 00:00:00.'
          );
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [countdownStatus]);

  const handleStartElapsed = () => {
    const nowIso = new Date().toISOString();
    const isResume = elapsedRef.current > 0;
    setElapsedStatus('running');
    onUpdateTimer(
      {
        elapsedMs: elapsedRef.current,
        elapsedStatus: 'running',
        elapsedLastTickAt: nowIso,
        startedAt: experiment.benchTimer.startedAt ?? nowIso,
      },
      isResume ? 'Elapsed timer resumed.' : 'Elapsed timer started.'
    );
  };

  const handlePauseElapsed = () => {
    setElapsedStatus('paused');
    onUpdateTimer(
      {
        elapsedMs: elapsedRef.current,
        elapsedStatus: 'paused',
        elapsedLastTickAt: null,
      },
      `Elapsed timer paused at ${formatClock(elapsedRef.current)}.`
    );
  };

  const handleResetElapsed = () => {
    setElapsedStatus('ready');
    setElapsedMs(0);
    onUpdateTimer(
      {
        elapsedMs: 0,
        elapsedStatus: 'ready',
        elapsedLastTickAt: null,
        startedAt: null,
        completedAt: null,
      },
      'Elapsed timer reset to 00:00:00.'
    );
  };

  const parsedDraftMinutes = Number(countdownMinutesInput);
  const isDraftMinutesValid =
    Number.isFinite(parsedDraftMinutes) &&
    parsedDraftMinutes > 0 &&
    parsedDraftMinutes <= 1440;
  const draftDurationSec = isDraftMinutesValid
    ? Math.round(parsedDraftMinutes * 60)
    : null;
  const hasUnappliedDurationChange =
    draftDurationSec !== null &&
    (draftDurationSec !== experiment.benchTimer.countdownDurationSec ||
      draftDurationSec !== experiment.benchTimer.activeCountdownDurationSec);

  const handleApplyCountdownDuration = () => {
    if (!isDraftMinutesValid || draftDurationSec === null) return;
    const ms = draftDurationSec * 1000;
    setCountdownStatus('ready');
    setCountdownMs(ms);
    onUpdateTimer(
      {
        countdownDurationSec: draftDurationSec,
        activeCountdownDurationSec: draftDurationSec,
        countdownRemainingMs: ms,
        countdownStatus: 'ready',
        countdownLastTickAt: null,
        completedAt: null,
      },
      `Countdown duration configured and applied (${formatDurationMinutes(draftDurationSec)}).`
    );
  };

  const handleStartCountdown = () => {
    const nowIso = new Date().toISOString();
    if (countdownRef.current <= 0 || countdownStatus === 'completed') {
      const targetSec = experiment.benchTimer.countdownDurationSec;
      const resetMs = targetSec * 1000;
      setCountdownMs(resetMs);
      setCountdownStatus('running');
      onUpdateTimer(
        {
          activeCountdownDurationSec: targetSec,
          countdownRemainingMs: resetMs,
          countdownStatus: 'running',
          countdownLastTickAt: nowIso,
          completedAt: null,
        },
        `Countdown timer started (${formatDurationMinutes(targetSec)}).`
      );
      return;
    }

    const isResume = countdownStatus === 'paused';
    setCountdownStatus('running');
    onUpdateTimer(
      {
        countdownRemainingMs: countdownRef.current,
        countdownStatus: 'running',
        countdownLastTickAt: nowIso,
      },
      isResume
        ? `Countdown timer resumed at ${formatClock(countdownRef.current)}.`
        : `Countdown timer started (${formatDurationMinutes(experiment.benchTimer.activeCountdownDurationSec)}).`
    );
  };

  const handlePauseCountdown = () => {
    setCountdownStatus('paused');
    onUpdateTimer(
      {
        countdownRemainingMs: countdownRef.current,
        countdownStatus: 'paused',
        countdownLastTickAt: null,
      },
      `Countdown timer paused at ${formatClock(countdownRef.current)}.`
    );
  };

  const handleResetCountdown = () => {
    const configuredSec = experiment.benchTimer.countdownDurationSec;
    const fullMs = configuredSec * 1000;
    setCountdownStatus('ready');
    setCountdownMs(fullMs);
    onUpdateTimer(
      {
        activeCountdownDurationSec: configuredSec,
        countdownRemainingMs: fullMs,
        countdownStatus: 'ready',
        countdownLastTickAt: null,
        completedAt: null,
      },
      `Countdown timer reset to configured duration (${formatClock(fullMs)}).`
    );
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskLabel.trim()) return;
    onAddChecklistItem(newTaskLabel.trim(), newTaskPlannedTime.trim());
    setNewTaskLabel('');
    setNewTaskPlannedTime('');
  };

  const handleAddObs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsDraft.trim()) return;
    onAddObservation(obsDraft.trim());
    setObsDraft('');
  };

  const completedCount = experiment.benchChecklist.filter((c) => c.completed).length;
  const totalCount = experiment.benchChecklist.length;
  const progressPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Bench Runner"
        description="Experiment progress tracking, persistent elapsed and countdown timers, user-defined task checklists, and timestamped observations."
        metadata={
          <>
            <span>
              Record:{' '}
              <strong className="font-mono text-[#0F52BA]">
                {experiment.experimentId}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Checklist Progress:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {completedCount}/{totalCount} ({progressPct}%)
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Started:{' '}
              <span className="font-mono tabular-nums">
                {formatIsoShort(experiment.benchTimer.startedAt)}
              </span>
            </span>
          </>
        }
      />

      {/* Timers Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Elapsed Timer */}
        <Panel>
          <PanelHeader
            title="Elapsed Experiment Timer"
            subtitle="Tracks cumulative experiment session time and persists running/paused state across navigation and browser reload."
            actions={
              <span
                data-testid="elapsed-timer-status"
                className={`px-2 py-0.5 text-[11px] font-medium border rounded-[4px] ${STATUS_BADGE_STYLES[elapsedStatus]}`}
              >
                {STATUS_LABELS[elapsedStatus]}
              </span>
            }
          />
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280] mb-1">
                  Elapsed Time
                </div>
                <div
                  data-testid="elapsed-timer-display"
                  className="text-[32px] font-mono tabular-nums font-semibold tracking-tight text-[#111827] leading-none"
                >
                  {formatClock(elapsedMs)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {elapsedStatus !== 'running' ? (
                  <Button variant="primary" onClick={handleStartElapsed}>
                    <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {elapsedStatus === 'paused' && elapsedMs > 0
                      ? 'Resume'
                      : 'Start'}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={handlePauseElapsed}>
                    <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Pause
                  </Button>
                )}
                <Button variant="secondary" onClick={handleResetElapsed}>
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Reset
                </Button>
              </div>
            </div>
            <div className="pt-2.5 border-t border-[#E5E7EB] text-[11.5px] font-mono tabular-nums text-[#6B7280] flex flex-wrap gap-x-5 gap-y-1">
              <span>
                Session Started: {formatIsoShort(experiment.benchTimer.startedAt)}
              </span>
            </div>
          </div>
        </Panel>

        {/* Configurable Countdown Timer */}
        <Panel>
          <PanelHeader
            title="Configurable Countdown Timer"
            subtitle="Explicitly separates configured duration, active session duration, and remaining time."
            actions={
              <span
                data-testid="countdown-timer-status"
                className={`px-2 py-0.5 text-[11px] font-medium border rounded-[4px] ${STATUS_BADGE_STYLES[countdownStatus]}`}
              >
                {STATUS_LABELS[countdownStatus]}
              </span>
            }
          />
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280] mb-1">
                  Remaining Time
                </div>
                <div
                  data-testid="countdown-timer-display"
                  className={`text-[32px] font-mono tabular-nums font-semibold tracking-tight leading-none ${
                    countdownStatus === 'completed'
                      ? 'text-[#065F46]'
                      : 'text-[#0F52BA]'
                  }`}
                >
                  {formatClock(countdownMs)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {countdownStatus !== 'running' ? (
                  <Button variant="primary" onClick={handleStartCountdown}>
                    <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {countdownStatus === 'paused' && countdownMs > 0
                      ? 'Resume'
                      : 'Start'}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={handlePauseCountdown}>
                    <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Pause
                  </Button>
                )}
                <Button variant="secondary" onClick={handleResetCountdown}>
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Reset
                </Button>
              </div>
            </div>

            {/* Configured vs Active Duration Distinction */}
            <div className="grid grid-cols-2 gap-2.5 p-2.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[11.5px] font-mono tabular-nums">
              <div>
                <div className="font-sans text-[10.5px] uppercase tracking-[0.04em] text-[#6B7280]">
                  Configured Duration
                </div>
                <div
                  data-testid="countdown-configured-duration"
                  className="text-[#111827] font-medium mt-0.5"
                >
                  {formatDurationMinutes(
                    experiment.benchTimer.countdownDurationSec
                  )}{' '}
                  ({formatClock(experiment.benchTimer.countdownDurationSec * 1000)})
                </div>
              </div>
              <div>
                <div className="font-sans text-[10.5px] uppercase tracking-[0.04em] text-[#6B7280]">
                  Active Session Duration
                </div>
                <div
                  data-testid="countdown-active-duration"
                  className="text-[#0F52BA] font-medium mt-0.5"
                >
                  {formatDurationMinutes(
                    experiment.benchTimer.activeCountdownDurationSec
                  )}{' '}
                  (
                  {formatClock(
                    experiment.benchTimer.activeCountdownDurationSec * 1000
                  )}
                  )
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-36">
                  <FieldLabel htmlFor="countdown-minutes" unit="min">
                    New Duration
                  </FieldLabel>
                  <input
                    id="countdown-minutes"
                    type="number"
                    min={1}
                    max={1440}
                    value={countdownMinutesInput}
                    onChange={(e) => setCountdownMinutesInput(e.target.value)}
                    className={`${inputBaseClass} font-mono tabular-nums text-right`}
                  />
                </div>
                <Button
                  variant={hasUnappliedDurationChange ? 'primary' : 'secondary'}
                  onClick={handleApplyCountdownDuration}
                  disabled={!isDraftMinutesValid}
                >
                  Apply Interval
                </Button>
              </div>
              {hasUnappliedDurationChange && (
                <div
                  data-testid="countdown-unapplied-notice"
                  className="px-2.5 py-1.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[4px] text-[11.5px] text-[#92400E]"
                >
                  Unapplied duration change ({parsedDraftMinutes} min). Active countdown remains{' '}
                  {formatDurationMinutes(
                    experiment.benchTimer.activeCountdownDurationSec
                  )}{' '}
                  until &ldquo;Apply Interval&rdquo; is clicked.
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* Checklist & Observations Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Task Checklist (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Panel>
            <PanelHeader
              title="Experiment Documentation Checklist"
              subtitle="User-editable steps with planned and actual completion timestamps. Does not generate operational lab handling instructions."
            />
            <div className="p-4 space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-[11.5px] text-[#4B5563] mb-1">
                  <span>Completion Progress</span>
                  <span className="font-mono tabular-nums">
                    {completedCount} of {totalCount} completed ({progressPct}%)
                  </span>
                </div>
                <div className="h-2 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] overflow-hidden">
                  <div
                    className="h-full bg-[#0F52BA] transition-all duration-150"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Add Checklist Item */}
              <form
                onSubmit={handleAddTask}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <input
                  type="text"
                  aria-label="New checklist task description"
                  value={newTaskLabel}
                  onChange={(e) => setNewTaskLabel(e.target.value)}
                  placeholder="Add documentation step or milestone..."
                  className={`${inputBaseClass} sm:col-span-7`}
                />
                <input
                  type="text"
                  aria-label="Planned timestamp for task"
                  value={newTaskPlannedTime}
                  onChange={(e) => setNewTaskPlannedTime(e.target.value)}
                  placeholder="Planned (e.g. 10:30)"
                  className={`${inputBaseClass} font-mono sm:col-span-3`}
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!newTaskLabel.trim()}
                  className="sm:col-span-2"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Add
                </Button>
              </form>

              {/* Checklist Table */}
              {experiment.benchChecklist.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No checklist items defined for this experiment.
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[6px]">
                  {experiment.benchChecklist.map((item) => (
                    <li
                      key={item.id}
                      className="p-3 flex items-start justify-between gap-3 bg-white hover:bg-[#F8F9FA]"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleChecklistItem(item.id)}
                          aria-label={
                            item.completed
                              ? `Mark "${item.label}" incomplete`
                              : `Mark "${item.label}" complete`
                          }
                          className={`mt-0.5 cursor-pointer ${
                            item.completed ? 'text-[#0F52BA]' : 'text-[#6B7280]'
                          }`}
                        >
                          {item.completed ? (
                            <CheckSquare className="w-4 h-4" strokeWidth={1.75} />
                          ) : (
                            <Square className="w-4 h-4" strokeWidth={1.75} />
                          )}
                        </button>
                        <div className="flex-1 min-w-0 space-y-1">
                          <input
                            type="text"
                            aria-label={`Edit task ${item.label}`}
                            value={item.label}
                            onChange={(e) =>
                              onUpdateChecklistItem(item.id, {
                                label: e.target.value,
                              })
                            }
                            className={`w-full text-[13px] bg-transparent border border-transparent hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] rounded-[4px] px-1 -ml-1 ${
                              item.completed
                                ? 'line-through text-[#6B7280]'
                                : 'text-[#111827] font-medium'
                            }`}
                          />
                          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-[#6B7280]">
                            <span>Planned: {item.plannedTime || '—'}</span>
                            <span>
                              Actual:{' '}
                              {item.actualCompletedAt
                                ? formatIsoShort(item.actualCompletedAt)
                                : 'Pending'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteChecklistItem(item.id)}
                        aria-label={`Delete task ${item.label}`}
                        className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>

        {/* Observations & Activity Log (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <Panel>
            <PanelHeader
              title="Timestamped Bench Observations"
              subtitle="Recorded notes automatically receive ISO timestamps and appear in the A4 report."
            />
            <div className="p-4 space-y-3">
              <form onSubmit={handleAddObs} className="space-y-2">
                <textarea
                  rows={2}
                  aria-label="New bench observation"
                  value={obsDraft}
                  onChange={(e) => setObsDraft(e.target.value)}
                  placeholder="Enter timestamped observation..."
                  className="w-full p-2.5 text-[13px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!obsDraft.trim()}
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Log Observation
                  </Button>
                </div>
              </form>

              {experiment.observations.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No observations logged yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E7EB] max-h-[260px] overflow-y-auto">
                  {experiment.observations.map((obs) => (
                    <li
                      key={obs.id}
                      className="py-2.5 flex items-start justify-between gap-2 text-[12.5px]"
                    >
                      <div className="min-w-0">
                        <p className="text-[#111827] leading-snug">{obs.text}</p>
                        <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                          {formatIsoShort(obs.timestamp)} · {obs.category}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteObservation(obs.id)}
                        aria-label="Delete observation"
                        className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Activity Log"
              subtitle="Chronological audit trail of timer, checklist, and observation events."
            />
            <div className="p-4">
              {experiment.benchLogs.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No activity logged for this experiment yet.
                </p>
              ) : (
                <ul className="space-y-2 max-h-[240px] overflow-y-auto">
                  {experiment.benchLogs.map((log) => (
                    <li
                      key={log.id}
                      className="text-[12px] pb-2 border-b border-[#F3F4F6] last:border-b-0"
                    >
                      <div className="font-mono tabular-nums text-[10.5px] text-[#6B7280] uppercase">
                        {formatIsoShort(log.timestamp)} · {log.eventType}
                      </div>
                      <div className="text-[#4B5563] mt-0.5">{log.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

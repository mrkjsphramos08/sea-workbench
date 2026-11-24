'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Copy,
  Link2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  ActiveModule,
  BenchChecklistItem,
  BenchTimerState,
  Experiment,
  MilestoneStatus,
  ObservationCategory,
  ObservationReference,
  ResearchMilestone,
  ResearchTimer,
} from '../../domain/models/types';
import { recoverResearchTimer } from '../../domain/calculations/workflowEngine';
import {
  Button,
  FieldLabel,
  Panel,
  PanelHeader,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

type BenchTimerStatus = BenchTimerState['countdownStatus'];

const OBSERVATION_CATEGORIES: ObservationCategory[] = [
  'General observation',
  'Measurement record',
  'Research deviation',
  'Equipment note',
  'Analytical observation',
  'Data-quality concern',
  'Follow-up question',
  'Research interpretation',
];

const MILESTONE_MODULES: Array<{ value: ActiveModule | ''; label: string }> = [
  { value: '', label: 'Unlinked' },
  { value: 'batch-synthesis', label: 'Batch & Planning' },
  { value: 'uptake-survey', label: 'Uptake Survey' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'bench-runner', label: 'Bench Runner' },
  { value: 'lab-report', label: 'Lab Report' },
];

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
  onAddMilestone,
  onUpdateMilestone,
  onReorderMilestone,
  onDuplicateMilestone,
  onSetMilestoneStatus,
  onDeleteMilestone,
  onAddResearchTimer,
  onUpdateResearchTimer,
  onDeleteResearchTimer,
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
  onAddObservation: (
    text: string,
    options?: {
      category?: ObservationCategory;
      references?: ObservationReference[];
    }
  ) => void;
  onDeleteObservation: (obsId: string) => void;
  onAddMilestone?: (input: {
    title: string;
    description?: string;
    plannedDateTime?: string;
    linkedModule?: ActiveModule | null;
  }) => void;
  onUpdateMilestone?: (
    milestoneId: string,
    patch: Partial<ResearchMilestone>
  ) => void;
  onReorderMilestone?: (milestoneId: string, direction: 'up' | 'down') => void;
  onDuplicateMilestone?: (milestoneId: string) => void;
  onSetMilestoneStatus?: (
    milestoneId: string,
    status: MilestoneStatus
  ) => void;
  onDeleteMilestone?: (milestoneId: string) => void;
  onAddResearchTimer?: (input: {
    name: string;
    mode: 'elapsed' | 'countdown';
    configuredDurationSec?: number;
    linkedMilestoneId?: string | null;
  }) => void;
  onUpdateResearchTimer?: (
    timerId: string,
    patch: Partial<ResearchTimer>,
    historyAction?: ResearchTimer['history'][number]['action'],
    detail?: string
  ) => void;
  onDeleteResearchTimer?: (timerId: string) => void;
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

  // Wall-clock tick counter for named ResearchTimers
  const [namedNowMs, setNamedNowMs] = useState<number>(() => Date.now());
  const [newTimerName, setNewTimerName] = useState('');
  const [newTimerMode, setNewTimerMode] = useState<'elapsed' | 'countdown'>(
    'countdown'
  );
  const [newTimerMinutes, setNewTimerMinutes] = useState('30');

  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskPlannedTime, setNewTaskPlannedTime] = useState('');
  const [newTaskModule, setNewTaskModule] = useState<ActiveModule | ''>('');
  const [obsDraft, setObsDraft] = useState('');
  const [obsCategory, setObsCategory] =
    useState<ObservationCategory>('General observation');
  const [obsRefValue, setObsRefValue] = useState('');

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

  // Tick named ResearchTimers whenever at least one is running
  const hasRunningNamedTimer = (experiment.timers ?? []).some(
    (t) => t.status === 'running'
  );
  useEffect(() => {
    if (!hasRunningNamedTimer) return;
    const id = window.setInterval(() => {
      setNamedNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [hasRunningNamedTimer]);

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

  // Named research timer handlers
  const handleCreateNamedTimer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddResearchTimer || !newTimerName.trim()) return;
    const mins = Math.max(1, Number(newTimerMinutes) || 30);
    onAddResearchTimer({
      name: newTimerName.trim(),
      mode: newTimerMode,
      configuredDurationSec: Math.round(mins * 60),
    });
    setNewTimerName('');
  };

  const handleNamedTimerAction = (
    timer: ResearchTimer,
    action: 'start' | 'pause' | 'reset'
  ) => {
    if (!onUpdateResearchTimer) return;
    const nowDate = new Date();
    const nowMs = nowDate.getTime();
    const nowIso = nowDate.toISOString();
    const recovered = recoverResearchTimer(timer, nowMs);

    if (action === 'start') {
      if (timer.mode === 'countdown' && recovered.remainingMs <= 0) {
        const fullMs = timer.configuredDurationSec * 1000;
        onUpdateResearchTimer(
          timer.id,
          {
            activeDurationSec: timer.configuredDurationSec,
            remainingMs: fullMs,
            status: 'running',
            lastTickAt: nowIso,
            startedAt: timer.startedAt ?? nowIso,
            completedAt: null,
          },
          'started',
          `Restarted countdown (${formatDurationMinutes(timer.configuredDurationSec)})`
        );
      } else {
        onUpdateResearchTimer(
          timer.id,
          {
            elapsedMs: recovered.elapsedMs,
            remainingMs: recovered.remainingMs,
            status: 'running',
            lastTickAt: nowIso,
            startedAt: timer.startedAt ?? nowIso,
            completedAt: null,
          },
          timer.status === 'paused' ? 'resumed' : 'started',
          timer.status === 'paused' ? 'Resumed timer' : 'Started timer'
        );
      }
      setNamedNowMs(nowMs);
    } else if (action === 'pause') {
      onUpdateResearchTimer(
        timer.id,
        {
          elapsedMs: recovered.elapsedMs,
          remainingMs: recovered.remainingMs,
          status: 'paused',
          lastTickAt: null,
        },
        'paused',
        `Paused at ${formatClock(
          timer.mode === 'countdown'
            ? recovered.remainingMs
            : recovered.elapsedMs
        )}`
      );
    } else if (action === 'reset') {
      const fullMs = timer.configuredDurationSec * 1000;
      onUpdateResearchTimer(
        timer.id,
        {
          elapsedMs: 0,
          activeDurationSec: timer.configuredDurationSec,
          remainingMs: fullMs,
          status: 'ready',
          lastTickAt: null,
          startedAt: null,
          completedAt: null,
        },
        'reset',
        'Reset timer'
      );
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskLabel.trim()) return;
    if (onAddMilestone) {
      onAddMilestone({
        title: newTaskLabel.trim(),
        plannedDateTime: newTaskPlannedTime.trim(),
        linkedModule: newTaskModule || null,
      });
    } else {
      onAddChecklistItem(newTaskLabel.trim(), newTaskPlannedTime.trim());
    }
    setNewTaskLabel('');
    setNewTaskPlannedTime('');
    setNewTaskModule('');
  };

  // Build available observation link targets
  const referenceOptions: Array<{ value: string; ref: ObservationReference }> =
    [
      ...experiment.surveyDatasets.map((d) => ({
        value: `survey_dataset:${d.id}`,
        ref: {
          kind: 'survey_dataset' as const,
          id: d.id,
          label: `Survey ${d.datasetId}`,
        },
      })),
      ...experiment.analyticalSessions.map((s) => ({
        value: `analytical_session:${s.id}`,
        ref: {
          kind: 'analytical_session' as const,
          id: s.id,
          label: `Analytical ${s.sessionId}`,
        },
      })),
      ...(experiment.milestones ?? []).map((m) => ({
        value: `milestone:${m.id}`,
        ref: {
          kind: 'milestone' as const,
          id: m.id,
          label: `Milestone: ${m.title}`,
        },
      })),
    ];

  const handleAddObs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsDraft.trim()) return;
    const chosenRef = referenceOptions.find((o) => o.value === obsRefValue)?.ref;
    onAddObservation(obsDraft.trim(), {
      category: obsCategory,
      references: chosenRef ? [chosenRef] : [],
    });
    setObsDraft('');
    setObsRefValue('');
  };

  const milestones = experiment.milestones ?? [];
  const useMilestones = Boolean(onAddMilestone && milestones.length >= 0);
  const completedCount = useMilestones
    ? milestones.filter((m) => m.status === 'completed').length
    : experiment.benchChecklist.filter((c) => c.completed).length;
  const totalCount = useMilestones
    ? milestones.filter((m) => m.status !== 'archived').length
    : experiment.benchChecklist.length;
  const progressPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Bench Runner"
        description="Experiment progress tracking, persistent primary and named timers, researcher-defined milestones, and categorized timestamped observations."
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
              Milestones:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {completedCount}/{totalCount} ({progressPct}%)
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Named Timers:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {(experiment.timers ?? []).length}
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

      {/* Primary Timers Row */}
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

      {/* Independent Named Research Timers */}
      {onAddResearchTimer && onUpdateResearchTimer && onDeleteResearchTimer && (
        <Panel>
          <PanelHeader
            title={`Independent Named Timers (${(experiment.timers ?? []).length})`}
            subtitle="Create multiple independent elapsed or countdown timers (e.g., equilibration, settling, drying) with wall-clock persistence across reload."
          />
          <div className="p-4 space-y-3">
            <form
              onSubmit={handleCreateNamedTimer}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-5">
                <FieldLabel htmlFor="named-timer-name">Timer Label</FieldLabel>
                <input
                  id="named-timer-name"
                  type="text"
                  value={newTimerName}
                  onChange={(e) => setNewTimerName(e.target.value)}
                  placeholder="e.g., Slurry Equilibration (pH 2.5)"
                  className={inputBaseClass}
                />
              </div>
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="named-timer-mode">Mode</FieldLabel>
                <select
                  id="named-timer-mode"
                  value={newTimerMode}
                  onChange={(e) =>
                    setNewTimerMode(e.target.value as 'elapsed' | 'countdown')
                  }
                  className={inputBaseClass}
                >
                  <option value="countdown">Countdown</option>
                  <option value="elapsed">Elapsed</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="named-timer-mins" unit="min">
                  Duration
                </FieldLabel>
                <input
                  id="named-timer-mins"
                  type="number"
                  min={1}
                  max={1440}
                  disabled={newTimerMode === 'elapsed'}
                  value={newTimerMinutes}
                  onChange={(e) => setNewTimerMinutes(e.target.value)}
                  className={`${inputBaseClass} font-mono tabular-nums text-right`}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!newTimerName.trim()}
                  className="w-full"
                >
                  <Timer className="w-3.5 h-3.5" />
                  Add Timer
                </Button>
              </div>
            </form>

            {(experiment.timers ?? []).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(experiment.timers ?? []).map((t) => {
                  const rec = recoverResearchTimer(t, namedNowMs);
                  const displayMs =
                    t.mode === 'countdown' ? rec.remainingMs : rec.elapsedMs;
                  return (
                    <div
                      key={t.id}
                      className="border border-[#E5E7EB] bg-[#F8F9FA] rounded-[6px] p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-[#111827] truncate">
                            {t.name}
                          </div>
                          <div className="text-[10.5px] font-mono text-[#6B7280] uppercase">
                            {t.mode}
                            {t.mode === 'countdown'
                              ? ` · ${formatDurationMinutes(t.configuredDurationSec)}`
                              : ''}
                          </div>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-[4px] shrink-0 ${STATUS_BADGE_STYLES[rec.status]}`}
                        >
                          {STATUS_LABELS[rec.status]}
                        </span>
                      </div>
                      <div className="text-[22px] font-mono tabular-nums font-semibold text-[#111827]">
                        {formatClock(displayMs)}
                      </div>
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#E5E7EB]">
                        <div className="flex items-center gap-1.5">
                          {rec.status !== 'running' ? (
                            <Button
                              size="sm"
                              variant="primary"
                              ariaLabel={`Start timer ${t.name}`}
                              onClick={() => handleNamedTimerAction(t, 'start')}
                            >
                              <Play className="w-3 h-3" />
                              {rec.status === 'paused' ? 'Resume' : 'Start'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              ariaLabel={`Pause timer ${t.name}`}
                              onClick={() => handleNamedTimerAction(t, 'pause')}
                            >
                              <Pause className="w-3 h-3" />
                              Pause
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            ariaLabel={`Reset timer ${t.name}`}
                            onClick={() => handleNamedTimerAction(t, 'reset')}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete timer ${t.name}`}
                          onClick={() => onDeleteResearchTimer(t.id)}
                          className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Milestones & Observations Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Researcher-Defined Milestones (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Panel>
            <PanelHeader
              title="Researcher-Defined Milestones & Documentation Checklist"
              subtitle="Add, reorder, duplicate, complete, or archive milestones with planned vs. actual timestamps and deviation notes. Does not generate operational lab handling instructions."
            />
            <div className="p-4 space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-[11.5px] text-[#4B5563] mb-1">
                  <span>Active Milestone Progress</span>
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

              {/* Add Milestone Form */}
              <form
                onSubmit={handleAddTask}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <input
                  type="text"
                  aria-label="New milestone description"
                  value={newTaskLabel}
                  onChange={(e) => setNewTaskLabel(e.target.value)}
                  placeholder="Add researcher-defined milestone..."
                  className={`${inputBaseClass} sm:col-span-5`}
                />
                <input
                  type="text"
                  aria-label="Planned timestamp for milestone"
                  value={newTaskPlannedTime}
                  onChange={(e) => setNewTaskPlannedTime(e.target.value)}
                  placeholder="Planned (e.g. 10:30)"
                  className={`${inputBaseClass} font-mono sm:col-span-3`}
                />
                {onAddMilestone && (
                  <select
                    aria-label="Link milestone to module"
                    value={newTaskModule}
                    onChange={(e) =>
                      setNewTaskModule(e.target.value as ActiveModule | '')
                    }
                    className={`${inputBaseClass} sm:col-span-2`}
                  >
                    {MILESTONE_MODULES.map((m) => (
                      <option key={m.value || 'none'} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!newTaskLabel.trim()}
                  className={onAddMilestone ? 'sm:col-span-2' : 'sm:col-span-4'}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Add
                </Button>
              </form>

              {/* Milestones List */}
              {useMilestones ? (
                milestones.length === 0 ? (
                  <p className="text-[12.5px] text-[#6B7280]">
                    No milestones defined for this experiment yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[6px]">
                    {milestones.map((m, idx) => {
                      const isDone = m.status === 'completed';
                      const isArchived = m.status === 'archived';
                      return (
                        <li
                          key={m.id}
                          className={`p-3 flex items-start justify-between gap-3 ${
                            isArchived
                              ? 'bg-[#F9FAFB] opacity-70'
                              : 'bg-white hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                onSetMilestoneStatus?.(
                                  m.id,
                                  isDone ? 'pending' : 'completed'
                                )
                              }
                              aria-label={
                                isDone
                                  ? `Reopen milestone "${m.title}"`
                                  : `Complete milestone "${m.title}"`
                              }
                              className={`mt-0.5 cursor-pointer ${
                                isDone ? 'text-[#0F52BA]' : 'text-[#6B7280]'
                              }`}
                            >
                              {isDone ? (
                                <CheckSquare
                                  className="w-4 h-4"
                                  strokeWidth={1.75}
                                />
                              ) : (
                                <Square
                                  className="w-4 h-4"
                                  strokeWidth={1.75}
                                />
                              )}
                            </button>
                            <div className="flex-1 min-w-0 space-y-1">
                              <input
                                type="text"
                                aria-label={`Edit milestone ${m.title}`}
                                value={m.title}
                                onChange={(e) =>
                                  onUpdateMilestone?.(m.id, {
                                    title: e.target.value,
                                  })
                                }
                                className={`w-full text-[13px] bg-transparent border border-transparent hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] rounded-[4px] px-1 -ml-1 ${
                                  isDone
                                    ? 'line-through text-[#6B7280]'
                                    : 'text-[#111827] font-medium'
                                }`}
                              />
                              <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono tabular-nums text-[#6B7280]">
                                <span>Planned: {m.plannedDateTime || '—'}</span>
                                <span>
                                  Actual:{' '}
                                  {m.actualCompletedAt
                                    ? formatIsoShort(m.actualCompletedAt)
                                    : isArchived
                                      ? 'Archived'
                                      : 'Pending'}
                                </span>
                                {m.linkedModule && (
                                  <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#0F52BA] border border-[#BFDBFE] text-[10px]">
                                    {m.linkedModule}
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                aria-label={`Deviation note for ${m.title}`}
                                value={m.deviations}
                                onChange={(e) =>
                                  onUpdateMilestone?.(m.id, {
                                    deviations: e.target.value,
                                  })
                                }
                                placeholder="Optional deviation or completion note..."
                                className="w-full text-[11.5px] text-[#4B5563] bg-transparent border-b border-transparent hover:border-[#E5E7EB] focus:border-[#0F52BA] focus:outline-none py-0.5"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              aria-label={`Move milestone ${m.title} up`}
                              disabled={idx === 0}
                              onClick={() => onReorderMilestone?.(m.id, 'up')}
                              className="p-1 text-[#6B7280] hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move milestone ${m.title} down`}
                              disabled={idx === milestones.length - 1}
                              onClick={() => onReorderMilestone?.(m.id, 'down')}
                              className="p-1 text-[#6B7280] hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Duplicate milestone ${m.title}`}
                              onClick={() => onDuplicateMilestone?.(m.id)}
                              className="p-1 text-[#6B7280] hover:text-[#0F52BA] cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={
                                isArchived
                                  ? `Restore milestone ${m.title}`
                                  : `Archive milestone ${m.title}`
                              }
                              onClick={() =>
                                onSetMilestoneStatus?.(
                                  m.id,
                                  isArchived ? 'pending' : 'archived'
                                )
                              }
                              className="p-1 text-[#6B7280] hover:text-[#92400E] cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete milestone ${m.title}`}
                              onClick={() => onDeleteMilestone?.(m.id)}
                              className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
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

        {/* Categorized Observations & Activity Log (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <Panel>
            <PanelHeader
              title="Categorized Timestamped Observations"
              subtitle="Log structured research observations linked to datasets, sessions, or milestones."
            />
            <div className="p-4 space-y-3">
              <form onSubmit={handleAddObs} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    aria-label="Observation category"
                    value={obsCategory}
                    onChange={(e) =>
                      setObsCategory(e.target.value as ObservationCategory)
                    }
                    className={inputBaseClass}
                  >
                    {OBSERVATION_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Link observation to record"
                    value={obsRefValue}
                    onChange={(e) => setObsRefValue(e.target.value)}
                    className={inputBaseClass}
                  >
                    <option value="">— Optional Linked Record —</option>
                    {referenceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.ref.label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={2}
                  aria-label="New bench observation"
                  value={obsDraft}
                  onChange={(e) => setObsDraft(e.target.value)}
                  placeholder="Enter timestamped observation, deviation, or data-quality note..."
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
                <ul className="divide-y divide-[#E5E7EB] max-h-[280px] overflow-y-auto">
                  {experiment.observations.map((obs) => (
                    <li
                      key={obs.id}
                      className="py-2.5 flex items-start justify-between gap-2 text-[12.5px]"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-[#111827] leading-snug">{obs.text}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#6B7280]">
                          <span>{formatIsoShort(obs.timestamp)}</span>
                          <span>· {obs.category}</span>
                          {(obs.references ?? []).map((ref) => (
                            <span
                              key={`${ref.kind}_${ref.id}`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#EFF6FF] text-[#0F52BA] border border-[#BFDBFE] text-[10px]"
                            >
                              <Link2 className="w-2.5 h-2.5" />
                              {ref.label}
                            </span>
                          ))}
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
              title="Bench Activity Log"
              subtitle="Local chronological record of timer, milestone, and observation events."
            />
            <div className="p-4">
              {experiment.benchLogs.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No activity logged for this experiment yet.
                </p>
              ) : (
                <ul className="space-y-2 max-h-[220px] overflow-y-auto">
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

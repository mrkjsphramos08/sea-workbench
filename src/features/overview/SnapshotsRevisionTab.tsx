'use client';

import React, { useMemo, useState } from 'react';
import {
  Archive,
  Camera,
  CopyPlus,
  Download,
  Eye,
  GitCompare,
  Lock,
  Package,
  Trash2,
  X,
} from 'lucide-react';
import { Experiment, ExperimentSnapshot } from '../../domain/models/types';
import {
  compareExperimentSnapshots,
  hasExperimentChangedSinceSnapshot,
} from '../../domain/calculations/workflowEngine';
import {
  serializeExperimentSnapshotJson,
  triggerFileDownload,
} from '../../services/import-export/backup';
import {
  buildResearchExportPackage,
  triggerBinaryDownload,
} from '../../services/import-export/researchPackage';
import { Panel, StatusText } from '../../components/ui/Primitives';

interface SnapshotsRevisionTabProps {
  experiment: Experiment;
  onCreateSnapshot: (input: { name: string; description: string }) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
}

export function SnapshotsRevisionTab({
  experiment,
  onCreateSnapshot,
  onDeleteSnapshot,
  onRestoreSnapshot,
}: SnapshotsRevisionTabProps) {
  const snapshots = useMemo(
    () => experiment.snapshots ?? [],
    [experiment.snapshots]
  );
  const [snapName, setSnapName] = useState('');
  const [snapDesc, setSnapDesc] = useState('');
  const [inspectSnap, setInspectSnap] = useState<ExperimentSnapshot | null>(
    null
  );
  const [compareLeftId, setCompareLeftId] = useState<string>(
    snapshots[0]?.snapshotId ?? ''
  );
  const [compareRightId, setCompareRightId] = useState<string>(
    snapshots[1]?.snapshotId ?? snapshots[0]?.snapshotId ?? ''
  );

  const boundSnapshotIds = useMemo(
    () => new Set((experiment.finalizedReports ?? []).map((r) => r.snapshotId)),
    [experiment.finalizedReports]
  );

  const comparison = useMemo(() => {
    const left = snapshots.find((s) => s.snapshotId === compareLeftId);
    const right = snapshots.find((s) => s.snapshotId === compareRightId);
    if (!left || !right || left.snapshotId === right.snapshotId) return null;
    return {
      leftName: left.name,
      rightName: right.name,
      ...compareExperimentSnapshots(left.payload, right.payload),
    };
  }, [snapshots, compareLeftId, compareRightId]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateSnapshot({
      name:
        snapName.trim() ||
        `Snapshot ${snapshots.length + 1} (${new Date().toISOString().slice(0, 10)})`,
      description: snapDesc.trim(),
    });
    setSnapName('');
    setSnapDesc('');
  };

  const handleExportSnapshotJson = (snap: ExperimentSnapshot) => {
    const json = serializeExperimentSnapshotJson(snap);
    const safeName = snap.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    triggerFileDownload(
      json,
      `${experiment.experimentId}_${safeName}.snapshot.json`,
      'application/json'
    );
  };

  const handleExportSnapshotZip = (snap: ExperimentSnapshot) => {
    const pkg = buildResearchExportPackage(experiment, { snapshot: snap });
    triggerBinaryDownload(pkg.zipBytes, pkg.filename);
  };

  return (
    <div className="space-y-4">
      {/* Create Snapshot Form */}
      <Panel
        title="Capture Immutable Experiment Snapshot"
        subtitle="Snapshots freeze metadata, material snapshots, survey datasets, analytical sessions, figures, milestones, observations, and report configuration. Original snapshots are never mutated by subsequent edits."
      >
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-4 space-y-1">
            <label
              htmlFor="snapshot-name-input"
              className="text-[11px] font-medium text-[#374151] block"
            >
              Snapshot Name
            </label>
            <input
              id="snapshot-name-input"
              type="text"
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
              placeholder="e.g., Pre-Manuscript Submission v2"
              className="w-full h-8 px-2.5 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
            />
          </div>
          <div className="md:col-span-6 space-y-1">
            <label
              htmlFor="snapshot-desc-input"
              className="text-[11px] font-medium text-[#374151] block"
            >
              Revision Purpose / Description
            </label>
            <input
              id="snapshot-desc-input"
              type="text"
              value={snapDesc}
              onChange={(e) => setSnapDesc(e.target.value)}
              placeholder="Document what changed or why this milestone snapshot is captured..."
              className="w-full h-8 px-2.5 text-[12px] border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#0F52BA]"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full h-8 px-3 inline-flex items-center justify-center gap-1.5 text-[12px] font-medium bg-[#0F52BA] text-white hover:bg-[#0D47A1]"
            >
              <Camera className="h-3.5 w-3.5" />
              Capture
            </button>
          </div>
        </form>
      </Panel>

      {/* Snapshots Table */}
      <Panel
        title={`Recorded Snapshots (${snapshots.length})`}
        subtitle="Inspect read-only snapshots, export snapshot archives, or restore any snapshot as a new independent experiment."
      >
        {snapshots.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[#6B7280]">
            No immutable snapshots captured yet for {experiment.experimentId}.
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {[...snapshots].reverse().map((snap) => {
              const isBound = boundSnapshotIds.has(snap.snapshotId);
              const changedSince = hasExperimentChangedSinceSnapshot(
                experiment,
                snap
              );
              const surveyRows = (snap.payload.surveyDatasets ?? []).reduce(
                (acc, d) => acc + d.measurements.length,
                0
              );
              const analyticalRows = (
                snap.payload.analyticalSessions ?? []
              ).reduce((acc, s) => acc + s.sampleMeasurements.length, 0);
              const savedFigs =
                (snap.payload.surveyDatasets ?? []).reduce(
                  (acc, d) => acc + d.savedFigures.length,
                  0
                ) +
                (snap.payload.analyticalSessions ?? []).reduce(
                  (acc, s) => acc + s.savedFigures.length,
                  0
                );

              return (
                <div
                  key={snap.snapshotId}
                  className="py-3 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-[#0F52BA]" />
                      <span className="font-semibold text-[13px] text-[#111827]">
                        {snap.name}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
                        {snap.snapshotId}
                      </span>
                      <StatusText label={snap.payload.status} tone="neutral" />
                      {isBound && (
                        <StatusText label="Bound to Report" tone="info" />
                      )}
                      {changedSince ? (
                        <StatusText
                          label="Live Data Changed Since Capture"
                          tone="warning"
                        />
                      ) : (
                        <StatusText label="Matches Live State" tone="success" />
                      )}
                    </div>
                    {snap.description && (
                      <p className="text-[12px] text-[#4B5563]">
                        {snap.description}
                      </p>
                    )}
                    <div className="text-[11px] font-mono text-[#6B7280] flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        Captured:{' '}
                        {snap.capturedAt.slice(0, 19).replace('T', ' ')}
                      </span>
                      <span>By: {snap.researcher}</span>
                      <span>
                        Survey: {snap.payload.surveyDatasets.length} ds /{' '}
                        {surveyRows} rows
                      </span>
                      <span>
                        Analytical: {snap.payload.analyticalSessions.length}{' '}
                        sess / {analyticalRows} rows
                      </span>
                      <span>Figures: {savedFigs}</span>
                      <span>{(snap.byteSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setInspectSnap(snap)}
                      className="h-7 px-2 text-[11px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] inline-flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSnapshotJson(snap)}
                      className="h-7 px-2 text-[11px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] inline-flex items-center gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSnapshotZip(snap)}
                      className="h-7 px-2 text-[11px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#0F52BA] hover:text-[#0F52BA] inline-flex items-center gap-1"
                    >
                      <Package className="h-3.5 w-3.5" />
                      ZIP
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestoreSnapshot(snap.snapshotId)}
                      className="h-7 px-2 text-[11px] font-medium border border-[#0F52BA] text-[#0F52BA] hover:bg-[#0F52BA] hover:text-white inline-flex items-center gap-1"
                    >
                      <CopyPlus className="h-3.5 w-3.5" />
                      Restore Copy
                    </button>
                    {!isBound && (
                      <button
                        type="button"
                        aria-label={`Delete snapshot ${snap.name}`}
                        onClick={() => onDeleteSnapshot(snap.snapshotId)}
                        title="Delete snapshot (unbound snapshots only)"
                        className="h-7 px-2 text-[11px] border border-[#E5E7EB] text-[#6B7280] hover:text-[#DC2626] hover:border-[#DC2626]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Snapshot Comparison */}
      {snapshots.length >= 2 && (
        <Panel
          title="Compare Two Immutable Snapshots"
          subtitle="Structured revision delta across metadata, lifecycle status, materials, datasets, analytical sessions, figures, and milestones."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="compare-snap-a"
                  className="text-[11px] font-medium text-[#374151] block mb-1"
                >
                  Baseline Snapshot (A)
                </label>
                <select
                  id="compare-snap-a"
                  value={compareLeftId}
                  onChange={(e) => setCompareLeftId(e.target.value)}
                  className="w-full h-8 px-2 text-[12px] border border-[#E5E7EB] bg-white text-[#111827]"
                >
                  {snapshots.map((s) => (
                    <option key={s.snapshotId} value={s.snapshotId}>
                      {s.name} ({s.capturedAt.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="compare-snap-b"
                  className="text-[11px] font-medium text-[#374151] block mb-1"
                >
                  Comparison Snapshot (B)
                </label>
                <select
                  id="compare-snap-b"
                  value={compareRightId}
                  onChange={(e) => setCompareRightId(e.target.value)}
                  className="w-full h-8 px-2 text-[12px] border border-[#E5E7EB] bg-white text-[#111827]"
                >
                  {snapshots.map((s) => (
                    <option key={s.snapshotId} value={s.snapshotId}>
                      {s.name} ({s.capturedAt.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {comparison ? (
              <div className="border border-[#E5E7EB] bg-white overflow-x-auto">
                <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[#E5E7EB] flex items-center justify-between text-[11px] font-mono text-[#374151]">
                  <span className="inline-flex items-center gap-1.5">
                    <GitCompare className="h-3.5 w-3.5 text-[#0F52BA]" />
                    {comparison.leftName} → {comparison.rightName}
                  </span>
                  <span>{comparison.changedCount} changed fields</span>
                </div>
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-[10px] font-mono uppercase text-[#6B7280] bg-[#F8F9FA]">
                      <th className="py-1.5 px-3">Area</th>
                      <th className="py-1.5 px-2">Field</th>
                      <th className="py-1.5 px-2">Baseline (A)</th>
                      <th className="py-1.5 px-3">Comparison (B)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {comparison.fields.map((f) => (
                      <tr
                        key={`${f.area}_${f.label}`}
                        className={f.changed ? 'bg-[#FFFBEB]' : ''}
                      >
                        <td className="py-1.5 px-3 font-mono text-[10.5px] text-[#6B7280]">
                          {f.area}
                        </td>
                        <td className="py-1.5 px-2 font-medium text-[#111827]">
                          {f.label}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[#4B5563]">
                          {f.before}
                        </td>
                        <td
                          className={`py-1.5 px-3 font-mono ${
                            f.changed
                              ? 'text-[#0F52BA] font-semibold'
                              : 'text-[#4B5563]'
                          }`}
                        >
                          {f.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11.5px] text-[#6B7280]">
                Select two distinct snapshots to compare revisions.
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* Read-only Snapshot Inspector Modal */}
      {inspectSnap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Read-only snapshot ${inspectSnap.name}`}
          className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E5E7EB] w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-[#0F52BA]" />
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#111827]">
                    Read-Only Snapshot: {inspectSnap.name}
                  </h3>
                  <p className="text-[11px] font-mono text-[#6B7280]">
                    {inspectSnap.snapshotId} · Captured{' '}
                    {inspectSnap.capturedAt.slice(0, 19).replace('T', ' ')} by{' '}
                    {inspectSnap.researcher}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close snapshot inspector"
                onClick={() => setInspectSnap(null)}
                className="p-1 text-[#6B7280] hover:text-[#111827]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-[12px]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="border border-[#E5E7EB] p-2 bg-[#F8F9FA]">
                  <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                    Status at Capture
                  </div>
                  <div className="font-semibold text-[#111827]">
                    {inspectSnap.payload.status}
                  </div>
                </div>
                <div className="border border-[#E5E7EB] p-2 bg-[#F8F9FA]">
                  <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                    Review Label
                  </div>
                  <div className="font-semibold text-[#111827]">
                    {inspectSnap.scientificReviewStatus}
                  </div>
                </div>
                <div className="border border-[#E5E7EB] p-2 bg-[#F8F9FA]">
                  <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                    Schema / Engine
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-[#111827]">
                    v{inspectSnap.schemaVersion}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase text-[#6B7280]">
                  Frozen Survey Datasets (
                  {inspectSnap.payload.surveyDatasets.length})
                </div>
                <div className="border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                  {inspectSnap.payload.surveyDatasets.map((ds) => (
                    <div
                      key={ds.id}
                      className="px-2.5 py-1.5 flex items-center justify-between"
                    >
                      <span className="font-mono text-[11px] text-[#111827]">
                        {ds.datasetId} — {ds.title}
                      </span>
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        {ds.measurements.length} rows · {ds.savedFigures.length}{' '}
                        figs
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase text-[#6B7280]">
                  Frozen Analytical Sessions (
                  {inspectSnap.payload.analyticalSessions.length})
                </div>
                <div className="border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                  {inspectSnap.payload.analyticalSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="px-2.5 py-1.5 flex items-center justify-between"
                    >
                      <span className="font-mono text-[11px] text-[#111827]">
                        {sess.sessionId} ({sess.technique}) — {sess.title}
                      </span>
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        {sess.sampleMeasurements.length} rows ·{' '}
                        {sess.calibrationDatasets.length} cal
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#E5E7EB] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleExportSnapshotZip(inspectSnap)}
                className="h-8 px-3 text-[12px] font-medium border border-[#E5E7EB] text-[#111827] hover:border-[#0F52BA]"
              >
                Export ZIP Package
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestoreSnapshot(inspectSnap.snapshotId);
                  setInspectSnap(null);
                }}
                className="h-8 px-3 text-[12px] font-medium bg-[#0F52BA] text-white hover:bg-[#0D47A1]"
              >
                Restore as Independent Experiment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

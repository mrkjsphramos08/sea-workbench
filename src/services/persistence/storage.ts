import {
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import { validateWorkspaceState } from '../../domain/validation/validators';

export const WORKSPACE_STORAGE_KEY = 'sea_workbench_workspace_v1';
export const WORKSPACE_BACKUP_RECOVERY_KEY = 'sea_workbench_workspace_last_good_meta_v1';

/** Conservative cross-browser localStorage budget (~5 MB UTF-8) */
export const LOCAL_STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;
export const STORAGE_ELEVATED_RATIO = 0.6;
export const STORAGE_CRITICAL_RATIO = 0.85;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageBreakdown {
  totalBytes: number;
  budgetBytes: number;
  usageRatio: number;
  experimentsBytes: number;
  snapshotsBytes: number;
  analyticalBytes: number;
  surveyBytes: number;
  databasesBytes: number;
  level: 'normal' | 'elevated' | 'critical';
  backupRecommended: boolean;
  recommendationReason: string | null;
}

export type StorageDiagnostics = StorageBreakdown;

export interface LoadWorkspaceResult {
  status: 'loaded' | 'empty' | 'corrupted';
  data: WorkspaceStateData | null;
  error: string | null;
  warnings: string[];
  byteSize: number;
  recoveredFromFallback?: boolean;
}

export interface SaveWorkspaceResult {
  ok: boolean;
  savedAt: string | null;
  byteSize: number;
  error: string | null;
  preservedPreviousSave: boolean;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function calculateUtf8ByteSize(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

function safeJsonBytes(value: unknown): number {
  try {
    return calculateUtf8ByteSize(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/**
 * Computes accurate UTF-8 storage footprint and breakdown across experiments,
 * snapshots, analytical sessions, survey datasets, and material databases.
 */
export function computeStorageDiagnostics(
  state: WorkspaceStateData,
  measuredTotalBytes?: number
): StorageBreakdown {
  const totalBytes =
    measuredTotalBytes && measuredTotalBytes > 0
      ? measuredTotalBytes
      : safeJsonBytes(state);

  const snapshotsBytes = (state.experiments ?? []).reduce(
    (sum, exp) => sum + safeJsonBytes(exp.snapshots ?? []),
    0
  );
  const analyticalBytes = (state.experiments ?? []).reduce(
    (sum, exp) => sum + safeJsonBytes(exp.analyticalSessions ?? []),
    0
  );
  const surveyBytes = (state.experiments ?? []).reduce(
    (sum, exp) => sum + safeJsonBytes(exp.surveyDatasets ?? []),
    0
  );
  const databasesBytes =
    safeJsonBytes(state.precursors ?? []) + safeJsonBytes(state.supports ?? []);
  const experimentsBytes = Math.max(
    0,
    totalBytes - databasesBytes
  );

  const usageRatio = Math.min(1, totalBytes / LOCAL_STORAGE_BUDGET_BYTES);
  const level: StorageBreakdown['level'] =
    usageRatio >= STORAGE_CRITICAL_RATIO
      ? 'critical'
      : usageRatio >= STORAGE_ELEVATED_RATIO
        ? 'elevated'
        : 'normal';

  let backupRecommended = false;
  let recommendationReason: string | null = null;

  if (level === 'critical') {
    backupRecommended = true;
    recommendationReason = `Local browser storage is at ${(usageRatio * 100).toFixed(0)}% of the ~5 MB budget. Export a JSON backup or Research Package (.zip) and archive old snapshots.`;
  } else if (level === 'elevated') {
    backupRecommended = true;
    recommendationReason = `Local browser storage is at ${(usageRatio * 100).toFixed(0)}% of the ~5 MB budget. Exporting a periodic JSON backup is recommended.`;
  } else {
    const lastExport = state.preferences?.lastBackupExportedAt;
    const nonDemoCount = (state.experiments ?? []).filter(
      (e) => !e.isDemonstration
    ).length;
    if (nonDemoCount > 0 && !lastExport) {
      backupRecommended = true;
      recommendationReason =
        'You have user-created experiments stored locally with no exported JSON backup recorded yet.';
    } else if (lastExport) {
      const ageDays = (Date.now() - Date.parse(lastExport)) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(ageDays) && ageDays >= 7) {
        backupRecommended = true;
        recommendationReason = `Last JSON backup was exported ${Math.floor(ageDays)} days ago.`;
      }
    }
  }

  return {
    totalBytes,
    budgetBytes: LOCAL_STORAGE_BUDGET_BYTES,
    usageRatio,
    experimentsBytes,
    snapshotsBytes,
    analyticalBytes,
    surveyBytes,
    databasesBytes,
    level,
    backupRecommended,
    recommendationReason,
  };
}

export function loadWorkspaceFromStorage(
  storageOverride?: StorageLike | null
): LoadWorkspaceResult {
  const storage =
    storageOverride !== undefined ? storageOverride : getBrowserStorage();
  if (!storage) {
    return {
      status: 'empty',
      data: null,
      error: null,
      warnings: [],
      byteSize: 0,
    };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  } catch (err) {
    return {
      status: 'corrupted',
      data: null,
      error: `Unable to read local browser storage: ${
        err instanceof Error ? err.message : 'Storage access denied.'
      }`,
      warnings: [],
      byteSize: 0,
    };
  }

  if (raw === null) {
    return {
      status: 'empty',
      data: null,
      error: null,
      warnings: [],
      byteSize: 0,
    };
  }

  const byteSize = calculateUtf8ByteSize(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'corrupted',
      data: null,
      error:
        'Stored workspace data is malformed JSON and could not be parsed. A clean fallback workspace has been initialized without overwriting your ability to import a backup.',
      warnings: [],
      byteSize,
    };
  }

  const validation = validateWorkspaceState(parsed);
  if (!validation.valid || !validation.data) {
    return {
      status: 'corrupted',
      data: null,
      error: `Stored workspace failed schema validation: ${validation.errors.join(' ')}`,
      warnings: validation.warnings,
      byteSize,
    };
  }

  return {
    status: 'loaded',
    data: validation.data,
    error: null,
    warnings: validation.warnings,
    byteSize,
  };
}

/**
 * Persists the workspace to localStorage safely.
 * On quota or serialization error, never clears or overwrites the previously
 * saved workspace key so the last known-good snapshot remains intact.
 */
export function saveWorkspaceToStorage(
  state: WorkspaceStateData,
  storageOverride?: StorageLike | null
): SaveWorkspaceResult {
  const storage =
    storageOverride !== undefined ? storageOverride : getBrowserStorage();
  const savedAt = new Date().toISOString();
  const payload: WorkspaceStateData = {
    ...state,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    lastSavedAt: savedAt,
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    return {
      ok: false,
      savedAt: null,
      byteSize: 0,
      preservedPreviousSave: true,
      error: `Failed to serialize workspace: ${
        err instanceof Error ? err.message : 'Serialization error'
      }. Your previous saved workspace was not overwritten.`,
    };
  }

  const byteSize = calculateUtf8ByteSize(serialized);

  if (!storage) {
    return {
      ok: false,
      savedAt: null,
      byteSize,
      preservedPreviousSave: true,
      error:
        'Browser localStorage is unavailable in this environment. Export a JSON backup to preserve your work.',
    };
  }

  let hadExisting = false;
  try {
    hadExisting = storage.getItem(WORKSPACE_STORAGE_KEY) !== null;
  } catch {
    hadExisting = false;
  }

  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    try {
      storage.setItem(
        WORKSPACE_BACKUP_RECOVERY_KEY,
        JSON.stringify({
          savedAt,
          byteSize,
          schemaVersion: WORKSPACE_SCHEMA_VERSION,
          experimentCount: payload.experiments.length,
        })
      );
    } catch {
      // Non-critical metadata key; primary save succeeded.
    }
    return {
      ok: true,
      savedAt,
      byteSize,
      preservedPreviousSave: false,
      error: null,
    };
  } catch (err) {
    const rawMsg =
      err instanceof Error ? err.message : 'Quota exceeded or storage disabled.';
    return {
      ok: false,
      savedAt: null,
      byteSize,
      preservedPreviousSave: hadExisting,
      error: `Unable to save workspace (${formatStorageBytes(byteSize)}): ${rawMsg}. ${
        hadExisting
          ? 'Your last successfully saved workspace remains preserved in browser storage. Export a JSON backup now to avoid losing unsaved in-memory edits.'
          : 'Export a JSON backup now to preserve your workspace.'
      }`,
    };
  }
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

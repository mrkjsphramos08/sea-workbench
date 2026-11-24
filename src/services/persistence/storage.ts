import {
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceStateData,
} from '../../domain/models/types';
import { validateWorkspaceState } from '../../domain/validation/validators';

export const WORKSPACE_STORAGE_KEY = 'sea_workbench_workspace_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadWorkspaceResult {
  status: 'loaded' | 'empty' | 'corrupted';
  data: WorkspaceStateData | null;
  error: string | null;
  warnings: string[];
  byteSize: number;
}

export interface SaveWorkspaceResult {
  ok: boolean;
  savedAt: string | null;
  byteSize: number;
  error: string | null;
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
      error: `Failed to serialize workspace: ${
        err instanceof Error ? err.message : 'Serialization error'
      }`,
    };
  }

  const byteSize = calculateUtf8ByteSize(serialized);

  if (!storage) {
    return {
      ok: false,
      savedAt: null,
      byteSize,
      error: 'Browser localStorage is unavailable in this environment.',
    };
  }

  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    return {
      ok: true,
      savedAt,
      byteSize,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      savedAt: null,
      byteSize,
      error: `Failed to persist workspace to localStorage: ${
        err instanceof Error ? err.message : 'Quota exceeded or storage disabled.'
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

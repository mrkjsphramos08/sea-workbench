import {
  Experiment,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceBackupEnvelope,
  WorkspaceStateData,
} from '../models/types';
import { migrateWorkspaceToCurrentSchema } from '../../services/persistence/migration';

export interface ValidationResult<T = void> {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: T;
}

export function validateExperimentId(
  experimentId: string,
  existingExperiments: Experiment[],
  ignoreUuid?: string
): ValidationResult {
  const errors: string[] = [];
  const trimmed = experimentId.trim();

  if (!trimmed) {
    errors.push('Experiment ID is required.');
  } else if (trimmed.length > 40) {
    errors.push('Experiment ID must be 40 characters or fewer.');
  } else if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    errors.push(
      'Experiment ID may only contain letters, numbers, hyphens, underscores, or periods.'
    );
  }

  const duplicate = existingExperiments.find(
    (exp) =>
      exp.uuid !== ignoreUuid &&
      exp.experimentId.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    errors.push(`Experiment ID "${trimmed}" is already assigned to another record.`);
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateNewExperimentInput(input: {
  experimentId: string;
  title: string;
  researcher: string;
  existingExperiments: Experiment[];
}): ValidationResult {
  const errors: string[] = [];
  const idCheck = validateExperimentId(
    input.experimentId,
    input.existingExperiments
  );
  errors.push(...idCheck.errors);

  if (!input.title.trim()) {
    errors.push('Experiment title is required.');
  }

  if (!input.researcher.trim()) {
    errors.push('Researcher name is required for laboratory attribution.');
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateWorkspaceState(
  candidate: unknown
): ValidationResult<WorkspaceStateData> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(candidate)) {
    return {
      valid: false,
      errors: ['Workspace payload must be a JSON object.'],
      warnings: [],
    };
  }

  if (typeof candidate.schemaVersion !== 'string') {
    errors.push('Missing or invalid schemaVersion field.');
  } else {
    const majorCandidate = candidate.schemaVersion.split('.')[0];
    if (
      majorCandidate !== '1' &&
      majorCandidate !== '2' &&
      majorCandidate !== '3' &&
      majorCandidate !== '4' &&
      majorCandidate !== '5'
    ) {
      errors.push(
        `Incompatible major schema version "${candidate.schemaVersion}" (expected 1.x–4.x or "${WORKSPACE_SCHEMA_VERSION}").`
      );
    } else if (candidate.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
      warnings.push(
        `Compatible schema version ${candidate.schemaVersion} will be migrated to ${WORKSPACE_SCHEMA_VERSION}.`
      );
    }
  }

  if (!Array.isArray(candidate.projects)) {
    errors.push('Missing or malformed projects array.');
  }
  if (!Array.isArray(candidate.experiments)) {
    errors.push('Missing or malformed experiments array.');
  }
  if (!Array.isArray(candidate.precursors)) {
    errors.push('Missing or malformed precursors database array.');
  }
  if (!Array.isArray(candidate.supports)) {
    errors.push('Missing or malformed supports database array.');
  }

  if (Array.isArray(candidate.experiments)) {
    const seenIds = new Set<string>();
    const seenUuids = new Set<string>();
    for (let i = 0; i < candidate.experiments.length; i += 1) {
      const exp = candidate.experiments[i];
      if (!isPlainObject(exp)) {
        errors.push(`Experiment entry at index ${i} is not a valid object.`);
        continue;
      }
      if (typeof exp.uuid !== 'string' || !exp.uuid.trim()) {
        errors.push(`Experiment at index ${i} is missing a valid uuid.`);
      } else if (seenUuids.has(exp.uuid)) {
        errors.push(`Duplicate experiment uuid "${exp.uuid}" found in import.`);
      } else {
        seenUuids.add(exp.uuid);
      }

      if (typeof exp.experimentId !== 'string' || !exp.experimentId.trim()) {
        errors.push(`Experiment at index ${i} is missing a valid experimentId.`);
      } else {
        const key = exp.experimentId.trim().toLowerCase();
        if (seenIds.has(key)) {
          errors.push(`Duplicate experimentId "${exp.experimentId}" found in import.`);
        } else {
          seenIds.add(key);
        }
      }

      if (typeof exp.title !== 'string') {
        errors.push(`Experiment "${String(exp.experimentId ?? i)}" is missing a title.`);
      }
      if (
        !isPlainObject(exp.batch) ||
        !isPlainObject(exp.surveyConfig) ||
        !Array.isArray(exp.surveyMeasurements)
      ) {
        errors.push(
          `Experiment "${String(exp.experimentId ?? i)}" is missing required module records (batch/survey).`
        );
      }
      if (!isPlainObject(exp.analyticalConfig) || !isPlainObject(exp.reportConfig)) {
        errors.push(
          `Experiment "${String(exp.experimentId ?? i)}" is missing analytical or report configuration.`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const migrated = migrateWorkspaceToCurrentSchema(candidate);
  if (!migrated.ok || !migrated.data) {
    return {
      valid: false,
      errors: migrated.errors,
      warnings,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: [...warnings, ...migrated.notes],
    data: migrated.data,
  };
}

export function validateBackupEnvelope(
  rawJson: string
): ValidationResult<WorkspaceBackupEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      errors: ['Selected file is not valid JSON.'],
      warnings: [],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      errors: ['Backup file root must be a JSON object.'],
      warnings: [],
    };
  }

  if (parsed.format !== 'sea-workbench-backup') {
    return {
      valid: false,
      errors: [
        'Unrecognized backup format. Expected format "sea-workbench-backup".',
      ],
      warnings: [],
    };
  }

  const workspaceValidation = validateWorkspaceState(parsed.workspace);
  if (!workspaceValidation.valid || !workspaceValidation.data) {
    return {
      valid: false,
      errors: workspaceValidation.errors,
      warnings: workspaceValidation.warnings,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: workspaceValidation.warnings,
    data: {
      format: 'sea-workbench-backup',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: String(parsed.appVersion ?? '0.2.0'),
      exportedAt: String(parsed.exportedAt ?? new Date().toISOString()),
      workspace: workspaceValidation.data,
    },
  };
}

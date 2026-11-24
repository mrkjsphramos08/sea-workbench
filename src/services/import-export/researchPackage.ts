/**
 * SEA Workbench — Phase 5 Consolidated Research Export Package Builder
 *
 * Bundles an active Experiment or immutable ExperimentSnapshot into a
 * reproducible, self-documenting ZIP archive containing:
 * - manifest.json (exact versions, provenance, included files, unavailable records)
 * - README.md (human-readable scientific provenance & review-boundary summary)
 * - experiment_metadata.json
 * - survey/* CSVs (measurements, replicate summaries, statistical summaries)
 * - analytical/* CSVs (samples with preserved value qualifiers & limits, calibrations, dilutions, quality reviews)
 * - observations.json, references.json, sample_registry.json, timeline.json
 * - figures/* saved figure configurations JSON + clean SVG figure representations
 * - report_configuration.json
 *
 * Explicitly never fabricates missing files or claims a PDF is bundled when browser print-to-PDF is used separately.
 */

import {
  APP_VERSION,
  CALC_ENGINE_VERSION,
  DataProvenance,
  Experiment,
  ExperimentSnapshot,
  ResearchExportManifest,
  ResearchExportManifestFile,
  WORKSPACE_SCHEMA_VERSION,
} from '../../domain/models/types';
import {
  analyzeCalibrationDataset,
  analyzeSurveyDataset,
  buildConsolidatedReviewItems,
  buildExperimentTimeline,
  buildUnifiedSampleRegistry,
  detectAnalyticalQualityIssues,
} from '../../domain/calculations/seaMath';
import {
  exportAnalyticalSessionSamplesCsv,
  exportCalibrationDatasetCsv,
  exportDilutionRecordsCsv,
  exportExploratoryRegressionSummaryCsv,
  exportQualityReviewCsv,
  exportReplicateSummaryCsv,
  exportStatisticalAnalysisCsv,
  exportSurveyMeasurementsCsv,
} from './backup';
import { ZipInputEntry, buildZipArchive } from './zipArchive';

function sanitizeFileSegment(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'record'
  );
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function buildMinimalSummarySvg(params: {
  title: string;
  subtitle: string;
  footer: string;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="220" viewBox="0 0 840 220">`,
    `  <rect width="840" height="220" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1"/>`,
    `  <rect x="0" y="0" width="840" height="4" fill="#0F52BA"/>`,
    `  <text x="28" y="48" font-family="IBM Plex Sans, sans-serif" font-size="18" font-weight="600" fill="#111827">${esc(params.title)}</text>`,
    `  <text x="28" y="78" font-family="IBM Plex Mono, monospace" font-size="12" fill="#4B5563">${esc(params.subtitle)}</text>`,
    `  <text x="28" y="132" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="#6B7280">Figure configuration and source dataset identifiers are stored in the adjacent JSON file for exact re-rendering in SEA Workbench.</text>`,
    `  <text x="28" y="188" font-family="IBM Plex Mono, monospace" font-size="11" fill="#6B7280">${esc(params.footer)}</text>`,
    `</svg>`,
  ].join('\n');
}

export interface BuiltResearchPackage {
  filename: string;
  manifest: ResearchExportManifest;
  zipBytes: Uint8Array;
  entries: Array<{ path: string; mimeType: string; bytes: number }>;
}

export function buildResearchExportPackage(
  sourceExperiment: Experiment,
  options?: {
    snapshot?: ExperimentSnapshot | null;
    capturedSvgFigures?: Array<{ filename: string; svgContent: string; description: string }>;
  }
): BuiltResearchPackage {
  const snapshot = options?.snapshot ?? null;
  const exp: Experiment = snapshot
    ? {
        ...snapshot.payload,
        snapshots: [],
        finalizedReports: [],
      }
    : sourceExperiment;

  const exportedAt = new Date().toISOString();
  const zipEntries: ZipInputEntry[] = [];
  const manifestFiles: ResearchExportManifestFile[] = [];
  const unavailableRecords: string[] = [];

  const addTextFile = (
    path: string,
    content: string,
    mimeType: string,
    description: string
  ) => {
    const bytes = utf8ByteLength(content);
    zipEntries.push({ path, content });
    manifestFiles.push({ path, mimeType, bytes, description });
  };

  // Collect provenance across all records
  const provenanceSet = new Set<DataProvenance>();
  provenanceSet.add(exp.batch.dataProvenance);
  for (const ds of exp.surveyDatasets ?? []) {
    provenanceSet.add(ds.provenance);
    for (const m of ds.measurements) provenanceSet.add(m.provenance);
  }
  for (const s of exp.analyticalSessions ?? []) {
    provenanceSet.add(s.provenance);
    for (const m of s.sampleMeasurements) provenanceSet.add(m.provenance);
  }

  const containsSynthetic =
    exp.isDemonstration ||
    provenanceSet.has('synthetic_demo') ||
    (exp.surveyDatasets ?? []).some((d) => d.isDemonstration) ||
    (exp.analyticalSessions ?? []).some((s) => s.isDemonstration);

  // 1. Experiment Metadata JSON
  const metadataPayload = {
    uuid: exp.uuid,
    experimentId: exp.experimentId,
    title: exp.title,
    projectId: exp.projectId,
    researcher: exp.researcher,
    type: exp.type,
    objective: exp.objective,
    status: exp.status,
    scientificReviewStatus: exp.scientificReviewStatus,
    isDemonstration: exp.isDemonstration,
    experimentDate: exp.experimentDate,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
    tags: exp.tags,
    batch: exp.batch,
    researchPlan: exp.researchPlan ?? null,
    lifecycleHistory: exp.lifecycleHistory ?? [],
    milestones: exp.milestones ?? [],
    timers: exp.timers ?? [],
    snapshotOrigin: snapshot
      ? {
          snapshotId: snapshot.snapshotId,
          name: snapshot.name,
          capturedAt: snapshot.capturedAt,
          researcher: snapshot.researcher,
        }
      : null,
  };
  addTextFile(
    'experiment_metadata.json',
    JSON.stringify(metadataPayload, null, 2),
    'application/json',
    'Core experiment metadata, material snapshots, planning record, lifecycle history, and milestones.'
  );

  // 2. Survey Datasets (CSV measurements, replicate summaries, statistical summaries, saved figure configs)
  for (const ds of exp.surveyDatasets ?? []) {
    const slug = sanitizeFileSegment(ds.datasetId || ds.id);
    const analysis = analyzeSurveyDataset(ds.measurements, {
      excludeFlagged: ds.analysisConfig.excludeFlaggedInStats,
    });

    addTextFile(
      `survey/${slug}_measurements.csv`,
      exportSurveyMeasurementsCsv(exp, ds.measurements, ds),
      'text/csv',
      `Survey measurements for ${ds.datasetId} (${ds.title}).`
    );
    addTextFile(
      `survey/${slug}_replicates.csv`,
      exportReplicateSummaryCsv(exp.experimentId, ds, analysis),
      'text/csv',
      `Explicit replicate group statistics for ${ds.datasetId}.`
    );
    addTextFile(
      `survey/${slug}_statistics.csv`,
      exportStatisticalAnalysisCsv(exp.experimentId, ds, analysis),
      'text/csv',
      `Descriptive statistical summary for ${ds.datasetId}.`
    );

    for (const fig of ds.savedFigures ?? []) {
      const figSlug = sanitizeFileSegment(`${slug}_${fig.name}`);
      addTextFile(
        `figures/survey_${figSlug}.config.json`,
        JSON.stringify(fig, null, 2),
        'application/json',
        `Saved survey figure configuration "${fig.name}" with reproducibility provenance.`
      );
      addTextFile(
        `figures/survey_${figSlug}.svg`,
        buildMinimalSummarySvg({
          title: fig.title || fig.name,
          subtitle: `Survey Dataset: ${ds.datasetId} · Plot: ${fig.plotType} · Units: ${fig.xAxisUnit} / ${fig.yAxisUnit}`,
          footer: `SEA Workbench v${APP_VERSION} · ${exp.experimentId} · Saved ${fig.savedAt}`,
        }),
        'image/svg+xml',
        `Vector provenance card for saved survey figure "${fig.name}".`
      );
    }
  }

  // 3. Analytical Sessions (samples with qualifiers, calibrations, dilutions, quality reviews, figure configs)
  for (const sess of exp.analyticalSessions ?? []) {
    const slug = sanitizeFileSegment(sess.sessionId || sess.id);

    addTextFile(
      `analytical/${slug}_samples.csv`,
      exportAnalyticalSessionSamplesCsv(exp, sess),
      'text/csv',
      `Analytical sample measurements for ${sess.sessionId} preserving original tokens, qualifiers, limits, and units.`
    );

    for (const cal of sess.calibrationDatasets ?? []) {
      const calSlug = sanitizeFileSegment(cal.calibrationId || cal.id);
      const calAnalysis = analyzeCalibrationDataset(cal);
      addTextFile(
        `analytical/${slug}_${calSlug}_calibration_standards.csv`,
        exportCalibrationDatasetCsv(exp, sess, cal),
        'text/csv',
        `Calibration standards table for ${sess.sessionId} / ${cal.calibrationId}.`
      );
      if (calAnalysis) {
        addTextFile(
          `analytical/${slug}_${calSlug}_regression_summary.csv`,
          exportExploratoryRegressionSummaryCsv(
            exp.experimentId,
            sess,
            cal,
            calAnalysis
          ),
          'text/csv',
          `Exploratory OLS regression summary (not analytical method validation) for ${sess.sessionId} / ${cal.calibrationId}.`
        );
      }
    }

    if ((sess.dilutionRecords ?? []).length > 0) {
      addTextFile(
        `analytical/${slug}_dilutions.csv`,
        exportDilutionRecordsCsv(exp.experimentId, sess),
        'text/csv',
        `Recorded dilution logs for ${sess.sessionId}.`
      );
    }

    const qIssues = detectAnalyticalQualityIssues(exp, sess);
    addTextFile(
      `analytical/${slug}_quality_review.csv`,
      exportQualityReviewCsv(exp.experimentId, sess, qIssues),
      'text/csv',
      `Quality review diagnostics and researcher decisions for ${sess.sessionId}.`
    );

    for (const fig of sess.savedFigures ?? []) {
      const figSlug = sanitizeFileSegment(`${slug}_${fig.name}`);
      addTextFile(
        `figures/analytical_${figSlug}.config.json`,
        JSON.stringify(fig, null, 2),
        'application/json',
        `Saved analytical figure configuration "${fig.name}" with reproducibility provenance.`
      );
      addTextFile(
        `figures/analytical_${figSlug}.svg`,
        buildMinimalSummarySvg({
          title: fig.title || fig.name,
          subtitle: `Analytical Session: ${sess.sessionId} (${sess.technique}) · Plot: ${fig.plotType}`,
          footer: `SEA Workbench v${APP_VERSION} · ${exp.experimentId} · Exploratory Numerical Analysis`,
        }),
        'image/svg+xml',
        `Vector provenance card for saved analytical figure "${fig.name}".`
      );
    }
  }

  // Optional live DOM-captured SVGs passed by caller
  for (const cap of options?.capturedSvgFigures ?? []) {
    const clean = sanitizeFileSegment(cap.filename);
    addTextFile(
      `figures/rendered_${clean}.svg`,
      cap.svgContent,
      'image/svg+xml',
      cap.description
    );
  }

  // 4. Unified Sample Registry, Consolidated Review, Observations, References, Timeline, Report Config
  const registry = buildUnifiedSampleRegistry(exp);
  for (const entry of registry.entries) {
    for (const unavail of entry.unavailableLinkedIds) {
      unavailableRecords.push(
        `Sample ${entry.sampleId} (${unavail.stage} link) references unavailable analytical measurement ${unavail.missingId}.`
      );
    }
  }

  addTextFile(
    'sample_registry.json',
    JSON.stringify(
      {
        entryCount: registry.entries.length,
        duplicateLabelWarnings: registry.duplicateLabelWarnings,
        entries: registry.entries.map((e) => ({
          sampleKey: e.sampleKey,
          sampleId: e.sampleId,
          origin: e.origin,
          surveyDatasetCode: e.surveyDatasetCode,
          replicateGroupId: e.replicateGroupId,
          classification: e.classification,
          analytes: e.analytes,
          documentationStatus: e.documentationStatus,
          provenance: e.provenance,
          qualityFlags: e.qualityFlags,
          linkedAnalyticalIds: e.analyticalLinks.map((a) => ({
            stage: a.stage,
            sessionCode: a.sessionCode,
            measurementId: a.measurement.id,
            qualifier: a.qualifier,
            originalValueToken: a.measurement.originalValueToken ?? null,
          })),
          unavailableLinkedIds: e.unavailableLinkedIds,
          notes: e.notes,
        })),
      },
      null,
      2
    ),
    'application/json',
    'Unified sample registry linking survey and analytical records by stable internal IDs.'
  );

  const reviewItems = buildConsolidatedReviewItems(exp);
  addTextFile(
    'quality_review_summary.json',
    JSON.stringify(reviewItems, null, 2),
    'application/json',
    'Consolidated cross-module data-quality review records.'
  );

  addTextFile(
    'observations.json',
    JSON.stringify(
      {
        generalObservations: exp.generalObservations,
        timestampedObservations: exp.observations ?? [],
        surveyAnnotations: (exp.surveyDatasets ?? []).flatMap((d) =>
          d.annotations.map((a) => ({ datasetId: d.datasetId, ...a }))
        ),
      },
      null,
      2
    ),
    'application/json',
    'Timestamped observations, source references, and structured researcher interpretations.'
  );

  const refs = [
    ...(exp.batch.supportSnapshot?.supportData?.references ?? []).map((r) => ({
      material: exp.batch.supportSnapshot?.supportData?.name ?? 'Support',
      ...r,
    })),
    ...(exp.batch.precursorSnapshot?.precursorData?.references ?? []).map((r) => ({
      material: exp.batch.precursorSnapshot?.precursorData?.name ?? 'Precursor',
      ...r,
    })),
  ];
  addTextFile(
    'references.json',
    JSON.stringify(refs, null, 2),
    'application/json',
    'Scientific references captured in immutable experiment material snapshots.'
  );

  const timeline = buildExperimentTimeline(exp);
  addTextFile(
    'timeline.json',
    JSON.stringify(
      {
        notice:
          'Local browser event log for research documentation traceability. Not a tamper-proof or regulator-certified 21 CFR Part 11 audit trail.',
        events: timeline,
      },
      null,
      2
    ),
    'application/json',
    'Chronological local research activity timeline.'
  );

  addTextFile(
    'report_configuration.json',
    JSON.stringify(exp.reportConfig, null, 2),
    'application/json',
    'Saved A4 Research Report Builder configuration.'
  );

  // 5. Human-readable README.md
  const readmeLines = [
    `# SEA Workbench Research Export Package — ${exp.experimentId}`,
    '',
    `- **Experiment Title**: ${exp.title}`,
    `- **Experiment UUID**: ${exp.uuid}`,
    `- **Researcher**: ${exp.researcher}`,
    `- **Lifecycle Status**: ${exp.status}`,
    `- **Scientific Review Status**: ${exp.scientificReviewStatus}`,
    snapshot
      ? `- **Exported Snapshot**: ${snapshot.name} (\`${snapshot.snapshotId}\`, captured ${snapshot.capturedAt})`
      : `- **Export Source**: Live Experiment Record (updated ${exp.updatedAt})`,
    `- **SEA Workbench Version**: v${APP_VERSION} (Schema ${WORKSPACE_SCHEMA_VERSION}, Engine ${CALC_ENGINE_VERSION})`,
    `- **Exported At**: ${exportedAt}`,
    containsSynthetic
      ? `- **SYNTHETIC DATA NOTICE**: This package contains synthetic demonstration records and must not be cited as validated laboratory measurements.`
      : `- **Data Provenance**: ${Array.from(provenanceSet).join(', ')}`,
    '',
    '## Scientific Integrity & Scope Notices',
    '- Calibration regressions included in this package are exploratory numerical analyses and do not constitute analytical method validation (LOD/LOQ certification or spike recovery acceptance).',
    '- Below-limit and non-numeric analytical tokens (`<LOD`, `<LOQ`, `ND`, `BDL`, `Invalid`, `Missing`) are preserved with explicit qualifiers and `null` numeric concentrations rather than zero-coerced values.',
    '- A printable A4 PDF report is generated directly from the SEA Workbench Lab Report (A4) browser print workflow and is NOT bundled inside this ZIP archive.',
    '- Browser-local timeline logs support research documentation and are not independently verified or tamper-proof regulatory audit trails.',
    '',
    '## Contents',
    ...manifestFiles.map((f) => `- \`${f.path}\` (${f.bytes} bytes) — ${f.description}`),
    '- `manifest.json` — Machine-readable export manifest.',
  ];
  addTextFile(
    'README.md',
    readmeLines.join('\n'),
    'text/markdown',
    'Human-readable package summary, provenance, and scientific review boundaries.'
  );

  // 6. Manifest JSON (added last so it inventories all preceding files cleanly)
  const manifest: ResearchExportManifest = {
    format: 'sea-workbench-research-package',
    experimentUuid: exp.uuid,
    experimentId: exp.experimentId,
    experimentTitle: exp.title,
    snapshotId: snapshot?.snapshotId ?? null,
    snapshotName: snapshot?.name ?? null,
    appVersion: APP_VERSION,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    calcEngineVersion: CALC_ENGINE_VERSION,
    exportedAt,
    dataProvenance: Array.from(provenanceSet),
    scientificReviewStatus: exp.scientificReviewStatus,
    containsSyntheticData: containsSynthetic,
    includedFiles: [...manifestFiles],
    unavailableRecords,
    notices: [
      'A4 PDF report is generated via browser Print/Save-as-PDF in Lab Report (A4) and is not bundled inside this ZIP archive.',
      'Calibration regression records are exploratory numerical analyses and not analytical method validation.',
      'Below-limit analytical tokens remain null with original tokens and qualifiers preserved.',
    ],
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  manifest.includedFiles.push({
    path: 'manifest.json',
    mimeType: 'application/json',
    bytes: utf8ByteLength(manifestJson),
    description: 'Machine-readable research package manifest.',
  });
  const finalManifestJson = JSON.stringify(manifest, null, 2);
  zipEntries.push({ path: 'manifest.json', content: finalManifestJson });

  const zipBytes = buildZipArchive(zipEntries);
  const datePart = exportedAt.slice(0, 10);
  const snapPart = snapshot
    ? `_${sanitizeFileSegment(snapshot.name)}`
    : '';
  const filename = `${sanitizeFileSegment(exp.experimentId)}${snapPart}_research-package_${datePart}.zip`;

  return {
    filename,
    manifest,
    zipBytes,
    entries: manifest.includedFiles.map((f) => ({
      path: f.path,
      mimeType: f.mimeType,
      bytes: f.bytes,
    })),
  };
}

export function triggerBinaryDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/zip'
): void {
  if (typeof window === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

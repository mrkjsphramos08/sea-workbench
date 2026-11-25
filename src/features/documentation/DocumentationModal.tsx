'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FileArchive,
  Layers,
  Lock,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  APP_VERSION,
  CALC_ENGINE_VERSION,
  WORKSPACE_SCHEMA_VERSION,
} from '../../domain/models/types';
import { Badge, Button } from '../../components/ui/Primitives';

type DocTabId =
  | 'getting-started'
  | 'data-management'
  | 'reproducibility'
  | 'statistical-scope'
  | 'release-scope';

const DOC_TABS: Array<{ id: DocTabId; label: string }> = [
  { id: 'getting-started', label: '1. Getting Started & Demo Notice' },
  { id: 'data-management', label: '2. Research Data & Qualifiers' },
  { id: 'reproducibility', label: '3. Snapshots, Reports & Exports' },
  { id: 'statistical-scope', label: '4. Statistical & Uncertainty Scope' },
  { id: 'release-scope', label: '5. Release Notes & Deferred Scope' },
];

export function DocumentationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DocTabId>('getting-started');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sea-doc-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#D1D5DB] rounded-[8px] shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between gap-4 bg-[#F8F9FA]">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-[#0F52BA]" strokeWidth={1.75} />
            <div>
              <h2
                id="sea-doc-modal-title"
                className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]"
              >
                SEA Workbench — Researcher User Guide &amp; Release Scope
              </h2>
              <p className="text-[11px] font-mono text-[#6B7280]">
                Release Candidate v{APP_VERSION} · Schema {WORKSPACE_SCHEMA_VERSION} · Calc Engine {CALC_ENGINE_VERSION}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Local-First Research Platform</Badge>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close documentation modal"
              className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-[#4B5563] hover:text-[#111827] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div
          className="px-5 pt-2.5 border-b border-[#E5E7EB] bg-white flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Documentation sections"
        >
          {DOC_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-t-[6px] border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-[#0F52BA] text-[#0F52BA] bg-[#EFF6FF]/60'
                    : 'border-transparent text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-[12.5px] leading-relaxed text-[#374151]">
          {activeTab === 'getting-started' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="space-y-1">
                  <div className="font-semibold text-[12.5px]">
                    Synthetic Demonstration Data Notice
                  </div>
                  <p className="text-[12px]">
                    Experiments, survey datasets, and analytical sessions labeled{' '}
                    <span className="font-mono font-semibold">Synthetic Demo</span> are pre-loaded demonstration records for workflow verification and software evaluation. They must never be cited or interpreted as empirical literature catalyst data. Create a <strong>New Blank Experiment</strong> to record real laboratory research.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] space-y-1.5">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#0F52BA]" />
                    Creating Projects &amp; Blank Experiments
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Use <strong>Experiment Library</strong> to organize studies into Research Projects, or click <strong>New Experiment</strong> in the top bar to initialize a clean, zero-fabricated-value experiment record with a permanent UUID and human-readable Experiment ID (e.g. <span className="font-mono">EXP-2026-004</span>).
                  </p>
                </div>

                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] space-y-1.5">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#0F52BA]" />
                    Material Databases &amp; Immutable Snapshots
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Assign supports (oxide surface area, PZC, site density) and metal precursors in <strong>Batch Synthesis</strong>. SEA Workbench captures an immutable material snapshot at assignment time so later edits to the global <strong>Material Databases</strong> never silently alter historical experiments.
                  </p>
                </div>
              </div>

              <div className="border border-[#E5E7EB] rounded-[6px] p-4 space-y-2">
                <div className="font-semibold text-[#111827]">
                  End-to-End Research Workflow
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-[12px] text-[#4B5563]">
                  <li>
                    <strong>Experiment Overview &amp; Planning:</strong> Define synthesis objectives, hypotheses, sample naming conventions, and planned milestones.
                  </li>
                  <li>
                    <strong>Batch Synthesis:</strong> Bind support and precursor snapshots, verify surface loading (<span className="font-mono">m²/L</span>), and evaluate theoretical monolayer boundaries when user-supplied parameters exist.
                  </li>
                  <li>
                    <strong>Uptake &amp; PZC Survey:</strong> Create or import pH and concentration survey datasets, assign replicate groups, inspect descriptive statistics, and configure publication-grade SVG figures.
                  </li>
                  <li>
                    <strong>Analytical &amp; Standards:</strong> Manage ICP-OES / AAS sessions, linear calibration curves, gravimetric/volumetric dilutions, and link analytical measurements to survey rows with explicit confirmation.
                  </li>
                  <li>
                    <strong>Research Analytics:</strong> Compare datasets across experiments, evaluate Type 7 quartiles/IQR/MAD, inspect ID-paired differences, and propagate measurement uncertainty.
                  </li>
                  <li>
                    <strong>Snapshots, A4 Lab Reports &amp; ZIP Packages:</strong> Capture immutable experiment snapshots, lock finalized A4 reports, and export self-documenting ZIP research archives.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'data-management' && (
            <div className="space-y-4">
              <div className="border border-[#E5E7EB] rounded-[6px] p-4 space-y-2">
                <div className="font-semibold text-[#111827]">
                  Explicit Measurement Provenance &amp; Qualifiers
                </div>
                <p className="text-[12px] text-[#4B5563]">
                  SEA Workbench never converts missing, unmeasured, or censored analytical values into numeric zero (<span className="font-mono">0</span>). Every measurement preserves its explicit provenance (<span className="font-mono">user_entered</span>, <span className="font-mono">imported</span>, <span className="font-mono">calculated</span>, <span className="font-mono">synthetic_demo</span>) and value qualifier across calculations, charts, reports, and exports:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11.5px] font-mono">
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#065F46]">valid_numeric</span> · Finite measured value
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#065F46]">valid_zero</span> · True measured 0.0
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#6B7280]">missing</span> · Blank / unrecorded
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#6B7280]">not_measured</span> · Pending assay
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#92400E]">not_detected</span> · ND (Excluded from mean)
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#92400E]">below_lod</span> · &lt;LOD (Limit preserved)
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#92400E]">below_loq</span> · &lt;LOQ (Limit preserved)
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#991B1B]">instrument_invalid</span> · Hardware/QC fault
                  </div>
                  <div className="p-2 border border-[#E5E7EB] rounded bg-[#F8F9FA]">
                    <span className="font-semibold text-[#991B1B]">excluded_by_user</span> · User-flagged outlier
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] space-y-1.5">
                  <div className="font-semibold text-[#111827]">
                    CSV / TSV Import &amp; Formula Sanitization
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Survey and analytical importers validate every row before insertion, surface line-by-line diagnostics, and preserve raw tokens (<span className="font-mono">ND</span>, <span className="font-mono">&lt;LOD</span>, <span className="font-mono">&lt;0.05</span>, <span className="font-mono">N/A</span>). All CSV exports neutralize spreadsheet formula injection (<span className="font-mono">=</span>, <span className="font-mono">+</span>, <span className="font-mono">-</span>, <span className="font-mono">@</span> on text cells) while keeping signed numeric values lossless.
                  </p>
                </div>

                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] space-y-1.5">
                  <div className="font-semibold text-[#111827]">
                    Explicit Survey–Analytical Linking
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Linking an ICP-OES or AAS sample measurement to an Uptake Survey row compares the recorded survey concentration against the dilution-corrected analytical concentration. Discrepancies are flagged for review, and survey values are never overwritten without explicit researcher confirmation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reproducibility' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] space-y-1.5">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#0F52BA]" />
                    Experiment Snapshots
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Capture immutable point-in-time snapshots in <strong>Experiment Overview → Snapshots &amp; Revisions</strong> or before finalizing reports. Snapshots deep-clone all batch, survey, analytical, and observation payloads.
                  </p>
                </div>

                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] space-y-1.5">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0F52BA]" />
                    Finalized A4 Lab Reports
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Finalized reports bind permanently to a specific immutable snapshot ID and calculation engine version. Subsequent edits to live workspace experiments never alter a finalized historical report.
                  </p>
                </div>

                <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] space-y-1.5">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <FileArchive className="w-3.5 h-3.5 text-[#0F52BA]" />
                    ZIP Research Packages &amp; Backups
                  </div>
                  <p className="text-[12px] text-[#4B5563]">
                    Export complete JSON workspace backups via <strong>Load Run</strong>, or export a self-documenting PKZIP archive containing <span className="font-mono">manifest.json</span>, <span className="font-mono">README.md</span>, CSV datasets, JSON metadata, and vector SVG figures.
                  </p>
                </div>
              </div>

              <div className="p-3.5 border border-[#E5E7EB] rounded-[6px] space-y-1.5">
                <div className="font-semibold text-[#111827]">
                  Browser Storage Diagnostics &amp; Quota Safety
                </div>
                <p className="text-[12px] text-[#4B5563]">
                  SEA Workbench stores workspace state locally in your browser under key <span className="font-mono">sea_workbench_workspace_v1</span> with atomic rollback protection. If browser storage approaches quota limits, the active in-memory workspace and previous valid persisted state are preserved without corruption, and a warning prompts you to export a JSON backup.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'statistical-scope' && (
            <div className="space-y-4">
              <div className="border border-[#E5E7EB] rounded-[6px] p-4 space-y-2.5">
                <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-[#0F52BA]" />
                  Mathematical &amp; Statistical Conventions
                </div>
                <ul className="list-disc list-inside space-y-1.5 text-[12px] text-[#4B5563]">
                  <li>
                    <strong>Sample vs. Population Spread:</strong> Sample standard deviation (<span className="font-mono">s</span>, denominator <span className="font-mono">n - 1</span>, requires <span className="font-mono">n ≥ 2</span>) and standard error of the mean (<span className="font-mono">SEM = s / √n</span>) are always labeled distinctly from population SD (<span className="font-mono">σ</span>, denominator <span className="font-mono">n</span>).
                  </li>
                  <li>
                    <strong>Quartiles &amp; Non-Parametric Summaries:</strong> Quartiles (<span className="font-mono">Q1, Median Q2, Q3</span>), interquartile range (<span className="font-mono">IQR = Q3 - Q1</span>), median absolute deviation (<span className="font-mono">MAD</span>, unscaled and normal-consistent <span className="font-mono">1.4826 × MAD</span>), and percentiles use the explicit <strong>Type 7 (R-7 / NumPy / Excel PERCENTILE.INC)</strong> linear interpolation convention: <span className="font-mono">h = p(n - 1) + 1</span>.
                  </li>
                  <li>
                    <strong>Exploratory Correlation &amp; Paired Differences:</strong> Paired analyses align observations by explicit measurement IDs (<span className="font-mono">alignPairedObservationsById</span>) and exclude incomplete pairs transparently. Pearson <span className="font-mono">r</span> and Spearman rank <span className="font-mono">ρ</span> are provided as exploratory descriptive indicators without automated p-value significance claims.
                  </li>
                  <li>
                    <strong>First-Order Uncertainty Propagation:</strong> Linear (<span className="font-mono">Y = a₀ + Σ aᵢXᵢ</span>) and multiplicative (<span className="font-mono">Y = k · Π Xᵢ^pᵢ</span>) uncertainty calculators propagate first-order Taylor series standard uncertainties with user-specified correlation coefficients <span className="font-mono">rᵢⱼ ∈ [-1, 1]</span>. Propagated values are clearly distinguished from formal ISO/IEC 17025 or GUM laboratory accreditation.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'release-scope' && (
            <div className="space-y-4">
              <div className="p-3.5 border border-[#A7F3D0] bg-[#ECFDF5] rounded-[6px] text-[#065F46] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="space-y-1 text-[12px]">
                  <div className="font-semibold">
                    Release Classification: Release Candidate v{APP_VERSION} (Schema {WORKSPACE_SCHEMA_VERSION})
                  </div>
                  <p>
                    Verified across 70+ automated unit, numerical reference, edge-case, migration, security sanitization, ZIP integrity, and 22-step synthetic researcher journey checks. Ready for external domain specialist and laboratory researcher evaluation.
                  </p>
                </div>
              </div>

              <div className="border border-[#E5E7EB] rounded-[6px] p-4 space-y-2">
                <div className="font-semibold text-[#111827]">
                  Known Limitations &amp; Deferred Scientific Scope Register
                </div>
                <p className="text-[12px] text-[#4B5563]">
                  To maintain strict scientific honesty and avoid unverified physicochemical extrapolation, the following capabilities are intentionally bounded or deferred for independent domain specialist review:
                </p>
                <table className="w-full text-left border-collapse text-[11.5px] border border-[#E5E7EB] mt-2">
                  <thead>
                    <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[#4B5563] uppercase text-[10px]">
                      <th className="py-1.5 px-2.5 font-semibold">Domain Area</th>
                      <th className="py-1.5 px-2.5 font-semibold">Current v{APP_VERSION} Boundary</th>
                      <th className="py-1.5 px-2.5 font-semibold">Specialist Review / Deferred Scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    <tr>
                      <td className="py-1.5 px-2.5 font-medium text-[#111827]">
                        Electrostatic Adsorption Modeling
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Empirical uptake (<span className="font-mono">µmol/m²</span>), ΔpH survey curves, and user-parameterized monolayer capacity checks.
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Full Gouy-Chapman-Stern / triple-layer speciation solvers require external thermodynamic equilibrium validation.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2.5 font-medium text-[#111827]">
                        Censored Data (&lt;LOD / &lt;LOQ)
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Preserves exact qualifiers and externally supplied detection limits; excludes censored tokens from parametric means.
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Kaplan-Meier / Tobit maximum-likelihood imputation for left-censored environmental/analytical data is deferred.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2.5 font-medium text-[#111827]">
                        Hypothesis Testing &amp; P-Values
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Descriptive statistics, Type 7 quartiles, OLS linear fits, and exploratory Pearson/Spearman correlation.
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Automated NHST p-values, ANOVA, and non-linear isotherm solvers (Langmuir/Freundlich iterative fits) are deferred.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2.5 font-medium text-[#111827]">
                        Storage &amp; Deployment Architecture
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        100% local-first browser storage (<span className="font-mono">localStorage</span>) with JSON backup and ZIP research package export.
                      </td>
                      <td className="py-1.5 px-2.5 text-[#4B5563]">
                        Multi-user cloud sync, LIMS database connectors, and 21 CFR Part 11 electronic signature trails are out of scope.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#E5E7EB] bg-[#F8F9FA] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#6B7280] font-mono">
            Full reference docs: /docs/USER_GUIDE.md · /docs/RELEASE_READINESS_v1.0.0-rc.1.md
          </span>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close Guide
          </Button>
        </div>
      </div>
    </div>
  );
}

# SEA Workbench — Release Readiness, Feature Inventory & Deferred Scope Register

**Release Classification:** `Release Candidate (v1.0.0-rc.1)`  
**Workspace Schema Version:** `6.0.0` (Backward-compatible migrations verified from `1.0.0` through `6.0.0`)  
**Calculation Engine Version:** `1.0.0-rc.1-release-candidate`  
**Verification Date:** November 2026

---

## 1. Release Summary & Classification Rationale

SEA Workbench `v1.0.0-rc.1` is classified as a **Release Candidate** ready for domain specialist and laboratory researcher evaluation.

- All **Engineering**, **Numerical Integrity**, **Data Integrity**, **Usability & Accessibility**, and **Documentation** acceptance gates have been verified through automated tests, static analysis (`tsc --noEmit`, `eslint`), production build compilation (`next build`), and real headless Chromium browser inspection (`playwright-cli`) including actual A4 PDF output verification.
- Per disciplined scientific software governance, promotion from `1.0.0-rc.1` to general `1.0.0` production status is reserved for formal sign-off by the laboratory principal investigator / catalysis domain specialist.

---

## 2. Verified Feature Inventory (Phases 1–7)

| Module / Capability | Status | Verification Scope |
| :--- | :--- | :--- |
| **Experiment Library & Project Management** | Verified | Project containers, experiment CRUD, duplication, status transitions, provenance badges, global Cmd/Ctrl+K search |
| **Material Databases & Immutable Snapshots** | Verified | Oxide support & metal precursor libraries, immutable experiment-bound snapshots, snapshot drift detection & explicit refresh |
| **Experiment Overview & Lifecycle** | Verified | Research planning, hypotheses, deviations, unified sample registry, chronological timeline, review center, immutable experiment snapshots |
| **Batch Synthesis & Stoichiometry** | Verified | Surface loading ($\text{m}^2/\text{L}$), theoretical monolayer boundary checks, precursor mass & metal concentration calculations |
| **Uptake & PZC Survey Workspace** | Verified | Multi-dataset surveys, CSV/TSV import with preview, replicate grouping, OLS regression, PZC zero-crossing interpolation, SVG Figure Studio |
| **Analytical Chemistry & Instrument Workspace** | Verified | Multi-session ICP-OES/AAS management, linear calibration ($R^2$, recovery, residuals), dilution calculations, 9 measurement qualifiers, survey linking |
| **Bench Runner & Execution Tracking** | Verified | Protocol checklist, synthesis milestones, multi-stage persistent countdown/elapsed timers with event audit logs, timestamped observations |
| **Research Analytics & Uncertainty Workspace** | Verified | Cross-experiment portfolio filters, Type 7 quartiles/IQR/MAD/percentiles, ID-paired differences, Pearson/Spearman correlation, first-order uncertainty propagation |
| **Lab Report (A4) & ZIP Research Package** | Verified | Customizable 13-section A4 print/PDF report, finalized snapshot-bound reports, PKZIP research package with `manifest.json` & CRC-32 verification |
| **Local Persistence & Schema Migration** | Verified | `localStorage` persistence with quota-failure rollback safety, JSON backup/restore, automatic migration from schema `1.0.0` → `6.0.0` |

---

## 3. Phase 7 Defect Resolution & Hardening Changelog

1. **Resolved High Defect (`D-01`) — A4 Lab Report Advanced Statistics & Uncertainty Rendering (`src/features/reports/LabReportWorkspace.tsx`):**
   - Imported `computeAdvancedDescriptiveStatistics`, `convertToRelativeUncertainty`, and `formatUncertaintyTypeLabel` in `LabReportWorkspace.tsx`.
   - Unwrapped `CalculationResult<AdvancedDescriptiveStatsData>` (`.data`) in Section 11 (*Advanced Non-Parametric & Quartile Statistics*).
   - Aligned Section 12 (*Recorded Measurement Uncertainty*) property references with `MeasurementUncertaintyRecord` (`measurementLabel`, `value`, `uncertaintyValue`, `coverageFactor`, `source`, `conditions`, and computed relative uncertainty `%`).
2. **Resolved High Defect (`D-02`) — Historical Reproducibility Isolation in Finalized Reports (`src/features/reports/LabReportWorkspace.tsx`):**
   - Locked Section 13 (*Cross-Experiment Portfolio & Research Comparison Matrix Summary*) to `[effectiveExperiment]` from the bound immutable snapshot whenever `isViewingFinalized` is active, preventing live mutations on unrelated workspace experiments from leaking into finalized historical reports.
3. **Resolved Medium Defect (`D-03`) — Spreadsheet Formula-Injection Neutralization Across All CSV Exporters (`researchAnalytics.ts`, `backup.ts`, `researchPackage.ts`):**
   - Implemented `sanitizeSpreadsheetCell` and applied it across all survey, analytical, calibration, replicate, quality review, research matrix, advanced statistics, and uncertainty CSV exports. Dangerous leading formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r` on non-numeric strings) are prefixed with `'` while signed numbers (`-0.42`, `+1.5e-3`) and analytical qualifiers (`<LOD`) remain untouched.
4. **Resolved Medium Defect (`D-04`) — Explicit Observation ID Pairing in Paired Differences & Correlation (`researchAnalytics.ts`, `ResearchAnalyticsWorkspace.tsx`):**
   - Added `alignPairedObservationsById` and passed explicit measurement IDs (`id: m.id`) in `ResearchAnalyticsWorkspace.tsx` so paired differences and exploratory correlations track exact `inputRefs` and `excludedInputRefs`.
5. **Resolved Medium Defect (`D-05`) — PKZIP Entry Extraction & Checksum Verification (`zipArchive.ts`):**
   - Added `extractZipEntryBytes` and `extractZipEntryText` with IEEE 802.3 CRC-32 verification on extraction so automated tests verify every `manifest.json` file entry against the actual archived bytes.
6. **Added In-App & Repository Documentation (`DocumentationModal.tsx`, `/docs/USER_GUIDE.md`, `/docs/RELEASE_READINESS_v1.0.0-rc.1.md`):**
   - Added the **Guide & Scope** top-bar button and keyboard-accessible modal so researchers can inspect workflow instructions, statistical conventions, and deferred scope directly inside the application.

---

## 4. Known Limitations & Deferred Scientific Functionality Register

| ID | Category | Current `v1.0.0-rc.1` Behavior | Deferred / Specialist Review Requirement |
| :--- | :--- | :--- | :--- |
| **LIM-01** | Electrostatic Speciation & Surface Complexation | Calculates empirical uptake ($\mu\text{mol/m}^2$), $\Delta\text{pH}$ zero-crossing, and user-parameterized monolayer capacity checks. | Full Gouy-Chapman-Stern or Triple-Layer electrostatic surface complexation solvers require external thermodynamic equilibrium validation. |
| **LIM-02** | Left-Censored Analytical Data (`<LOD`, `<LOQ`, `ND`) | Preserves exact qualifiers and externally supplied limit metadata; excludes censored values from parametric means without fabricating zeros. | Non-parametric survival/censored estimators (Kaplan-Meier, ROS, or Tobit maximum-likelihood imputation) are deferred for specialist biostatistics/chemometrics review. |
| **LIM-03** | Hypothesis Testing & Non-Linear Isotherm Fitting | Provides descriptive statistics, Type 7 quartiles/IQR/MAD, ordinary least-squares linear regression, and exploratory Pearson/Spearman correlation. | Automated null-hypothesis significance testing ($p$-values, ANOVA) and iterative non-linear Langmuir/Freundlich solvers are intentionally excluded to avoid black-box over-interpretation. |
| **LIM-04** | Uncertainty Accreditation Boundary | Provides first-order Taylor series linear and multiplicative uncertainty propagation with user-supplied correlation coefficients $r_{ij}$. | Propagated values are decision-support estimates and do not constitute formal ISO/IEC 17025 or JCGM 100:2008 (GUM) accredited laboratory certification. |
| **LIM-05** | Browser Local Storage Capacity | Persists workspace data in browser `localStorage` (~5 MB typical browser quota) with atomic rollback safety and storage usage diagnostics. | Very large multi-year archives (>10,000 measurements) should be periodically exported to portable `.json` workspace backups or `.zip` research packages. |

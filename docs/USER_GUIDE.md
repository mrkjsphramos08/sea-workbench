# SEA Workbench — Researcher User Guide (v1.0.0-rc.1)

**Application Version:** `1.0.0-rc.1`  
**Workspace Schema Version:** `6.0.0`  
**Calculation Engine Version:** `1.0.0-rc.1-release-candidate`  
**Architecture:** Local-First Scientific Research Platform (Zero Cloud Lock-In)

---

## 1. Getting Started & Synthetic Demonstration Data Notice

### 1.1 Synthetic Demonstration Records vs. Empirical Research Records
When SEA Workbench initializes for the first time in a clean browser profile, it loads clearly labeled **Synthetic Demonstration** records (`provenance: 'synthetic_demo'`, `isDemonstration: true`) so researchers can inspect a populated Strong Electrostatic Adsorption (SEA) workflow immediately.

- **Important:** Demonstration experiments (`EXP-2026-001` through `EXP-2026-003`), synthetic survey curves, and synthetic ICP-OES/AAS sessions are **illustrative software verification fixtures**. They must never be cited or interpreted as empirical literature catalyst data.
- Every workspace, figure studio, research matrix, report, and ZIP export package displays explicit provenance badges (`Synthetic Demo`, `User Entered`, `Imported`, `Calculated`) so synthetic and user-entered research records are never conflated.

### 1.2 Creating a Research Project and a New Blank Experiment
1. Open **Experiment Library** from the left navigation sidebar.
2. Under **Research Projects**, create or select a project container (defining the research objective, catalyst system, and lead investigator).
3. Click **New Experiment** in the top bar.
4. Enter an **Experiment ID** (e.g., `EXP-2026-004`), title, researcher name, project assignment, and synthesis mode (`Batch Synthesis`, `Uptake Survey`, `PZC Determination`, or `Combined Study`).
5. New blank experiments initialize with zero fabricated numerical measurements and `user_entered` provenance.

---

## 2. Material Databases & Immutable Material Snapshots

### 2.1 Managing Oxide Supports & Metal Precursors
Navigate to **Material Databases** to maintain reference records for:
- **Oxide Supports:** Support name, phase/polymorph, specific surface area ($S_{BET}$ in $\text{m}^2/\text{g}$), nominal Point of Zero Charge ($\text{PZC}$), surface hydroxyl site density ($\text{sites/nm}^2$), and provenance notes.
- **Metal Precursors:** Compound formula, metal element, molecular weight ($\text{g/mol}$), metal mass fraction, coordination complex charge/type (anionic vs. cationic), and optimal pH window.

### 2.2 Immutable Material Snapshots
When you assign a support or precursor to an experiment in **Batch Synthesis**, SEA Workbench captures an **immutable material snapshot** (`SupportSnapshot` / `PrecursorSnapshot`) bound to that experiment.
- Subsequent edits to the global **Material Databases** will **never** retroactively alter historical experiments or invalidate their surface-loading calculations.
- If a global material record is updated later, **Batch Synthesis** notifies you and allows you to keep the historical snapshot or explicitly refresh to the updated material definition.

---

## 3. Research Data Management, Imports & Analytical Qualifiers

### 3.1 Uptake & PZC Survey Datasets
In **Uptake & PZC Survey**:
- Create multiple independent survey datasets per experiment (`Metal Uptake Survey` or `PZC / ΔpH Survey`).
- Import CSV, TSV, or clipboard tabular datasets using the **Import Survey CSV** modal with column mapping, unit validation, and row-by-row diagnostic preview.
- Group replicate vials into explicit **Replicate Groups** to compute group size ($n$), sample mean, sample standard deviation ($s$), standard error of the mean ($\text{SEM}$), and percent relative standard deviation ($\text{\%RSD}$).

### 3.2 Analytical Chemistry & Instrument Sessions (ICP-OES / AAS)
In **Analytical & Standards**:
- Create independent analytical sessions for **ICP-OES**, **Flame AAS**, **Graphite Furnace AAS**, or **UV-Vis**.
- Configure multi-point linear calibration standards ($y = mx + b$), inspect calibration $R^2$, residual standard error, and back-calculated standard recovery.
- Record gravimetric or volumetric dilution factors and link analytical sample measurements directly to Uptake Survey rows.
- **Explicit Linking Rule:** Linking an analytical sample to a survey row flags any concentration discrepancy for review and **never overwrites** the survey measurement without explicit researcher confirmation.

### 3.3 Explicit Measurement Qualifiers
SEA Workbench preserves nine distinct measurement qualifiers across imports, edits, statistics, figures, reports, and exports:

| Qualifier | Meaning | Statistical Treatment |
| :--- | :--- | :--- |
| `valid_numeric` | Finite measured numeric value | Included in parametric & non-parametric statistics |
| `valid_zero` | True measured zero (`0` or `0.0`) | Included as numeric `0` (never treated as missing) |
| `missing` | Blank or unrecorded value | Excluded; counted in excluded/missing tally |
| `not_measured` | Scheduled assay not yet performed | Excluded; preserved as `Not Measured` |
| `not_detected` | Analyte not detected (`ND`) | Excluded from numeric mean; never converted to `0` |
| `below_lod` | Below limit of detection (`<LOD`) | Excluded from numeric mean; preserves external `limitValue` & `limitUnit` |
| `below_loq` | Below limit of quantification (`<LOQ`) | Excluded from numeric mean; preserves external `limitValue` & `limitUnit` |
| `instrument_invalid` | Hardware fault or failed QC check | Excluded from statistics; flagged for quality review |
| `excluded_by_user` | Researcher-flagged outlier | Excluded when `excludeFlagged` is enabled (with audit note) |

---

## 4. Scientific Figures, Research Analytics & Uncertainty Propagation

### 4.1 Publication-Grade Figure Studios
Both **Uptake & PZC Survey** and **Analytical & Standards** include dedicated vector SVG Figure Studios:
- Customize figure title, subtitle, axis labels, axis bounds, gridlines, replicate error bars ($s$ vs. $\text{SEM}$), reference PZC markers, and caption metadata.
- Save named figure presets and export standalone, publication-ready vector **SVG** files containing metadata headers and captions.

### 4.2 Research Analytics & Cross-Experiment Comparison
Open **Research Analytics** to:
- Filter across projects, experiments, supports, precursors, techniques, and provenance (`Exclude Synthetic Demo Records` toggle).
- Compute advanced descriptive statistics including **Type 7 (R-7)** quartiles ($Q_1$, Median $Q_2$, $Q_3$), $\text{IQR}$, Median Absolute Deviation ($\text{MAD}$ and normal-consistent $1.4826 \times \text{MAD}$), 5th/10th/90th/95th percentiles, and box-plot Tukey fences ($1.5 \times \text{IQR}$).
- Run ID-paired difference analysis (`alignPairedObservationsById`) and exploratory Pearson $r$ / Spearman rank $\rho$ correlations.
- Record and propagate measurement uncertainty using first-order Taylor series linear ($Y = a_0 + \sum a_i X_i$) and multiplicative ($Y = k \prod X_i^{p_i}$) propagation with explicit correlation coefficients $r_{ij} \in [-1, 1]$.

---

## 5. Snapshots, Finalized A4 Reports & Reproducible Exports

### 5.1 Experiment Snapshots & Finalized Reports
1. In **Experiment Overview → Snapshots & Revisions** (or **Lab Report (A4)**), create an immutable **Experiment Snapshot** (`v1`, `v2`, ...) with a researcher summary and change notes.
2. In **Lab Report (A4)**, configure sections and click **Finalize & Lock Report** to bind a permanent report record to a specific immutable snapshot.
3. Viewing a finalized report renders exclusively from the bound snapshot payload and isolates the report from subsequent live workspace edits.

### 5.2 Backups, CSV Exports & ZIP Research Packages
- **JSON Workspace Backup (`Load Run` / `Save Run`):** Exports the complete workspace state (`schemaVersion: '6.0.0'`) to a portable `.json` file that can be validated and restored on any machine.
- **CSV Table Exports:** All CSV exports automatically neutralize spreadsheet formula-injection payloads (`=`, `+`, `-`, `@` on non-numeric strings) while preserving signed numeric values (`-0.42`, `+1.25e-3`) and analytical qualifiers (`<LOD`).
- **Consolidated ZIP Research Package:** Bundles `manifest.json`, `README.md`, `experiment_metadata.json`, survey and analytical CSVs, advanced statistics and uncertainty CSVs, sample registry, timeline, and vector SVG figures into a standards-compliant PKZIP archive with verified IEEE 802.3 CRC-32 checksums.

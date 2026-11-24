export const APP_VERSION = '0.3.0';
export const WORKSPACE_SCHEMA_VERSION = '3.0.0';
export const EXPERIMENT_DATA_VERSION = '3.0.0';
export const CALC_ENGINE_VERSION = '0.3.0-phase3-survey-analysis';

export type ActiveModule =
  | 'library'
  | 'batch-synthesis'
  | 'uptake-survey'
  | 'analytical'
  | 'bench-runner'
  | 'lab-report'
  | 'databases';

export type ExperimentType =
  | 'Batch Synthesis'
  | 'Uptake Survey'
  | 'PZC / pH Shift Survey';

export type ExperimentStatus =
  | 'Draft'
  | 'Planned'
  | 'In Progress'
  | 'Completed'
  | 'Archived';

export type ScientificReviewStatus =
  | 'Unreviewed'
  | 'Pending Peer Review'
  | 'Reviewed'
  | 'Demonstration Fixture';

export type DataProvenance =
  | 'user_entered'
  | 'literature_reference'
  | 'manufacturer_spec'
  | 'measured_experimental'
  | 'theoretical_estimate'
  | 'derived_calculated'
  | 'synthetic_demo'
  | 'unavailable';

export type VerificationStatus =
  | 'unverified'
  | 'synthetic_fixture'
  | 'internal_check'
  | 'literature_verified';

export type MeasurementQualityStatus =
  | 'valid'
  | 'flagged'
  | 'excluded_by_user'
  | 'pending';

export type ReferenceSourceType =
  | 'peer_reviewed_publication'
  | 'manufacturer_datasheet'
  | 'certificate_of_analysis'
  | 'internal_measurement'
  | 'user_provided'
  | 'synthetic_demo_fixture';

export type PhysicalQuantityType =
  | 'mass'
  | 'volume'
  | 'concentration'
  | 'surface_area'
  | 'surface_loading'
  | 'temperature'
  | 'ph'
  | 'uptake'
  | 'molar_mass'
  | 'pore_volume'
  | 'wavelength'
  | 'time'
  | 'fraction'
  | 'signal'
  | 'dimensionless';

export interface ScientificQuantity<T = number | null> {
  value: T;
  unit: string;
  quantityType: PhysicalQuantityType;
  provenance: DataProvenance;
  sourceRecordId: string | null;
  measurementDate: string | null;
  uncertainty: number | null;
  verificationStatus: VerificationStatus;
  notes: string;
}

export interface ReferenceProperty<T = number | null> {
  value: T;
  unit: string;
  source: string;
  conditions: string;
  verificationStatus: VerificationStatus;
  provenance: DataProvenance;
  notes: string;
  uncertainty?: number | null;
  measurementDate?: string | null;
  referenceIds?: string[];
}

export interface ScientificReference {
  id: string;
  title: string;
  authorOrOrganization: string;
  year: number | null;
  doiOrUrl: string;
  sourceType: ReferenceSourceType;
  relevantProperty: string;
  measurementConditions: string;
  dateAccessed: string;
  verificationStatus: VerificationStatus;
  reviewerNotes: string;
  /** @deprecated Legacy Phase 1 field retained for migration display compatibility */
  citation?: string;
  /** @deprecated Legacy Phase 1 field retained for migration display compatibility */
  notes?: string;
}

export type PrecursorChargeClass =
  | 'Cationic'
  | 'Anionic'
  | 'Neutral'
  | 'Amphoteric'
  | 'Unspecified';

export interface Precursor {
  id: string;
  name: string;
  formula: string;
  metalIdentity: string;
  chargeClassification: PrecursorChargeClass;
  casNumber: string;
  molarMass: ReferenceProperty<number | null>;
  metalWeightFraction: ReferenceProperty<number | null>;
  purity: ReferenceProperty<number | null>;
  solubilityNotes: string;
  verificationStatus: VerificationStatus;
  provenance: DataProvenance;
  references: ScientificReference[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Support {
  id: string;
  name: string;
  composition: string;
  supplierOrGrade: string;
  betSurfaceArea: ReferenceProperty<number | null>;
  pzc: ReferenceProperty<number | null>;
  poreVolume: ReferenceProperty<number | null>;
  particleSizeRange: string;
  measurementConditions: string;
  verificationStatus: VerificationStatus;
  provenance: DataProvenance;
  references: ScientificReference[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialSnapshot {
  snapshotId: string;
  capturedAt: string;
  sourceMaterialId: string;
  materialKind: 'precursor' | 'support';
  sourceUpdatedAt: string;
  precursorData?: Precursor;
  supportData?: Support;
}

export interface ResearchProject {
  id: string;
  code: string;
  name: string;
  description: string;
  principalInvestigator: string;
  isDemonstration: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BatchConfiguration {
  supportId: string | null;
  precursorId: string | null;
  supportSnapshot: MaterialSnapshot | null;
  precursorSnapshot: MaterialSnapshot | null;
  plannedSupportMassG: number | null;
  actualSupportMassG: number | null;
  plannedSolutionVolumeMl: number | null;
  actualSolutionVolumeMl: number | null;
  plannedSurfaceLoadingM2L: number | null;
  actualSurfaceLoadingM2L: number | null;
  plannedTargetMetalLoadingWtPct: number | null;
  actualMeasuredMetalLoadingWtPct: number | null;
  plannedInitialPh: number | null;
  actualInitialPh: number | null;
  actualFinalPh: number | null;
  plannedPrecursorConcPpm: number | null;
  actualPrecursorConcPpm: number | null;
  contactTimeMin: number | null;
  temperatureC: number | null;
  agitationMode: string;
  filtrationNotes: string;
  dryingNotes: string;
  dataProvenance: DataProvenance;
}

export type SurveyMode = 'uptake' | 'pzc';
export type ChartDisplayMode = 'individual' | 'means' | 'both';
export type ErrorBarMode = 'none' | 'sd' | 'sem';
export type SurveyDatasetStatus = 'Active' | 'Archived';
export type SurveyWorkspaceTab =
  | 'overview'
  | 'data'
  | 'analysis'
  | 'figures'
  | 'interpretation';

export interface SurveyConfiguration {
  mode: SurveyMode;
  targetSurfaceLoadingM2L: number | null;
  equilibrationTimeMin: number | null;
  temperatureC: number | null;
  backgroundElectrolyte: string;
  phAdjustmentReagentsNote: string;
  dataProvenance: DataProvenance;
  chartTitle: string;
  showSyntheticNotice: boolean;
  chartDisplayMode: ChartDisplayMode;
  errorBarMode: ErrorBarMode;
}

export interface SurveyMeasurement {
  /** Stable internal identifier independent of editable display label */
  id: string;
  sampleId: string;
  /** Explicit replicate group identifier (never inferred from similar pH) */
  sampleGroupId: string;
  replicateId: string;
  targetInitialPh: number | null;
  measuredInitialPh: number | null;
  measuredFinalPh: number | null;
  initialConcPpm: number | null;
  finalConcPpm: number | null;
  supportMassMg: number | null;
  solutionVolumeMl: number | null;
  recordedUptakeUmolM2: number | null;
  /** Explicit unit labels preserved for traceability and comparison checks */
  uptakeUnit?: string;
  concUnit?: string;
  provenance: DataProvenance;
  qualityStatus: MeasurementQualityStatus;
  /** Recorded reason when a measurement is excluded or flagged */
  exclusionReason?: string;
  /** Stable internal reference to an Initial InstrumentMeasurement.id */
  linkedInitialMeasurementId: string | null;
  /** Stable internal reference to a Final InstrumentMeasurement.id */
  linkedFinalMeasurementId: string | null;
  measurementDate: string;
  notes: string;
}

export interface SurveyAnalysisConfiguration {
  excludeFlaggedInStats: boolean;
  discrepancyTolerancePpm: number;
  pzcPlotView: 'final_vs_initial' | 'delta_vs_initial';
}

export interface ReplicateGroupMeta {
  groupId: string;
  label: string;
  notes: string;
}

export interface ReferencePzcMarker {
  id: string;
  label: string;
  valuePh: number;
  sourceType: 'literature_reference' | 'user_entered' | 'support_snapshot';
  conditions: string;
  notes: string;
}

export type FigurePlotType =
  | 'scatter'
  | 'scatter_line'
  | 'replicate_means'
  | 'error_bar'
  | 'comparative'
  | 'pzc_final_vs_initial'
  | 'pzc_delta_vs_initial'
  | 'distribution';

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type LegendPosition = 'top' | 'bottom' | 'none';
export type TickDensity = 'compact' | 'standard' | 'dense';

export interface FigureConfiguration {
  id: string;
  name: string;
  plotType: FigurePlotType;
  title: string;
  xAxisTitle: string;
  xAxisUnit: string;
  yAxisTitle: string;
  yAxisUnit: string;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  tickDensity: TickDensity;
  numericPrecision: number;
  markerShape: MarkerShape;
  markerSize: number;
  showLines: boolean;
  lineStyle: LineStyle;
  primaryColor: string;
  grayscaleMode: boolean;
  legendPosition: LegendPosition;
  showGridlines: boolean;
  showReferenceLine: boolean;
  showIdentityLine: boolean;
  displayMode: ChartDisplayMode;
  errorBarMode: ErrorBarMode;
  exportWidthPx: number;
  exportHeightPx: number;
  exportScale: 1 | 2 | 3;
  savedAt: string;
}

export interface DatasetComparisonRef {
  experimentUuid: string;
  datasetId: string;
}

export interface DatasetComparisonConfig {
  selectedRefs: DatasetComparisonRef[];
  comparePlotMode: 'uptake_vs_phf' | 'phf_vs_phi' | 'delta_ph_vs_phi';
  showGroupMeans: boolean;
  errorBarMode: ErrorBarMode;
}

export type ResearchAnnotationCategory =
  | 'research_question'
  | 'observed_trend'
  | 'anomalous_observation'
  | 'potential_explanation'
  | 'measurement_limitation'
  | 'literature_reference'
  | 'data_quality_concern'
  | 'research_conclusion'
  | 'unresolved_question';

export interface ResearchAnnotation {
  id: string;
  category: ResearchAnnotationCategory;
  title: string;
  body: string;
  author: string;
  linkedDatasetId: string | null;
  linkedMeasurementIds: string[];
  linkedGroupIds: string[];
  linkedFigureId: string | null;
  linkedReferenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SurveyDataset {
  id: string;
  datasetId: string;
  title: string;
  mode: SurveyMode;
  status: SurveyDatasetStatus;
  objective: string;
  researcher: string;
  provenance: DataProvenance;
  scientificReviewStatus: ScientificReviewStatus;
  isDemonstration: boolean;
  supportSnapshot: MaterialSnapshot | null;
  precursorSnapshot: MaterialSnapshot | null;
  config: SurveyConfiguration;
  analysisConfig: SurveyAnalysisConfiguration;
  referencePzcMarkers: ReferencePzcMarker[];
  replicateGroupMeta: ReplicateGroupMeta[];
  measurements: SurveyMeasurement[];
  figureConfig: FigureConfiguration;
  savedFigures: FigureConfiguration[];
  annotations: ResearchAnnotation[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type InstrumentType = 'ICP-OES' | 'AAS' | 'ICP-MS' | 'UV-Vis' | 'Other';

export interface AnalyticalConfiguration {
  instrumentType: InstrumentType;
  instrumentModel: string;
  analyteElement: string;
  wavelengthNm: number | null;
  matrixDescription: string;
  calibrationUnits: string;
  analystName: string;
  analysisDate: string;
  notes: string;
  dataProvenance: DataProvenance;
}

export interface CalibrationStandard {
  id: string;
  standardId: string;
  nominalConc: number | null;
  unit: string;
  instrumentResponse: number | null;
  responseUnit: string;
  replicateNumber: number;
  provenance: DataProvenance;
  qualityStatus: MeasurementQualityStatus;
  notes: string;
}

export type SampleStage = 'Initial' | 'Final' | 'Blank' | 'Control';

export interface InstrumentMeasurement {
  /** Stable internal identifier independent of editable display label */
  id: string;
  sampleId: string;
  linkedSurveySampleId: string;
  analyte: string;
  stage: SampleStage;
  replicateId: string;
  dilutionFactor: number | null;
  rawSignal: number | null;
  signalUnit: string;
  reportedConc: number | null;
  concUnit: string;
  provenance: DataProvenance;
  qualityStatus: MeasurementQualityStatus;
  measurementDate: string;
  notes: string;
}

export interface ExperimentalObservation {
  id: string;
  timestamp: string;
  module: ActiveModule;
  category: 'General' | 'Synthesis' | 'Survey' | 'Analytical' | 'Bench';
  author: string;
  text: string;
  provenance: DataProvenance;
}

export interface BenchChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  plannedTime: string;
  actualCompletedAt: string | null;
  notes: string;
}

export type ElapsedTimerStatus = 'ready' | 'running' | 'paused';
export type CountdownTimerStatus = 'ready' | 'running' | 'paused' | 'completed';

export interface BenchTimerState {
  elapsedMs: number;
  elapsedStatus: ElapsedTimerStatus;
  elapsedLastTickAt: string | null;
  /** User-configured target countdown duration in seconds */
  countdownDurationSec: number;
  /** Duration in seconds that was active when the current countdown session started/applied */
  activeCountdownDurationSec: number;
  countdownRemainingMs: number;
  countdownStatus: CountdownTimerStatus;
  countdownLastTickAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface BenchLog {
  id: string;
  timestamp: string;
  eventType: 'timer' | 'checklist' | 'observation' | 'status';
  message: string;
}

export type ReportMode = 'pre-experiment' | 'post-experiment';

export interface ReportConfiguration {
  mode: ReportMode;
  includeMaterialSnapshots: boolean;
  includeBatchRecords: boolean;
  includeSurveyOverview: boolean;
  includeSurveyTable: boolean;
  includeSurveyFigure: boolean;
  includeStatisticalSummaries: boolean;
  includeComparativeSummary: boolean;
  includeAnalyticalRecords: boolean;
  includeRegressionSummary: boolean;
  includeDataQualityLimitations: boolean;
  includeResearchInterpretations: boolean;
  includeScientificReferences: boolean;
  includeObservations: boolean;
  includeBenchChecklist: boolean;
  /** Selected survey dataset IDs to include in report; empty array means active dataset */
  selectedSurveyDatasetIds: string[];
  /** Selected saved figure IDs to include in report */
  selectedFigureIds: string[];
  institutionHeader: string;
  reportFooterNote: string;
}

export interface Experiment {
  uuid: string;
  experimentId: string;
  title: string;
  projectId: string | null;
  researcher: string;
  type: ExperimentType;
  objective: string;
  createdAt: string;
  updatedAt: string;
  experimentDate: string;
  status: ExperimentStatus;
  tags: string[];
  generalObservations: string;
  scientificReviewStatus: ScientificReviewStatus;
  isDemonstration: boolean;
  dataVersion: string;
  calcEngineVersion: string;
  batch: BatchConfiguration;
  /** Mirrors active survey dataset config for backward compatibility */
  surveyConfig: SurveyConfiguration;
  /** Mirrors active survey dataset measurements for backward compatibility */
  surveyMeasurements: SurveyMeasurement[];
  /** Phase 3 multi-dataset research series collection */
  surveyDatasets: SurveyDataset[];
  activeSurveyDatasetId: string | null;
  datasetComparison: DatasetComparisonConfig;
  analyticalConfig: AnalyticalConfiguration;
  calibrationStandards: CalibrationStandard[];
  instrumentMeasurements: InstrumentMeasurement[];
  observations: ExperimentalObservation[];
  benchChecklist: BenchChecklistItem[];
  benchTimer: BenchTimerState;
  benchLogs: BenchLog[];
  reportConfig: ReportConfiguration;
}

export interface ExperimentSnapshot {
  snapshotId: string;
  capturedAt: string;
  experimentUuid: string;
  experimentDataVersion: string;
  payload: Experiment;
}

export interface UserPreferences {
  sidebarCollapsed: boolean;
  defaultResearcher: string;
}

export interface WorkspaceStateData {
  schemaVersion: string;
  appVersion: string;
  projects: ResearchProject[];
  experiments: Experiment[];
  activeExperimentUuid: string | null;
  precursors: Precursor[];
  supports: Support[];
  preferences: UserPreferences;
  hasInitializedDemo: boolean;
  lastSavedAt: string | null;
}

export interface WorkspaceBackupEnvelope {
  format: 'sea-workbench-backup';
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  workspace: WorkspaceStateData;
}

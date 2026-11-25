export const APP_VERSION = '1.0.0-rc.2';
export const WORKSPACE_SCHEMA_VERSION = '6.0.0';
export const EXPERIMENT_DATA_VERSION = '6.0.0';
export const CALC_ENGINE_VERSION = '1.0.0-rc.2-release-candidate';

export type ActiveModule =
  | 'library'
  | 'overview'
  | 'batch-synthesis'
  | 'uptake-survey'
  | 'analytical'
  | 'bench-runner'
  | 'lab-report'
  | 'research-analytics'
  | 'databases';

export type ExperimentType =
  | 'Batch Synthesis'
  | 'Uptake Survey'
  | 'PZC / pH Shift Survey';

export type ExperimentStatus =
  | 'Draft'
  | 'Planned'
  | 'In Progress'
  | 'Measurements Pending'
  | 'Analysis in Progress'
  | 'Under Review'
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
export type ErrorBarMode = 'none' | 'sd' | 'sem' | 'recorded_uncertainty';
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
  | 'distribution'
  | 'box_plot';

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type LegendPosition = 'top' | 'bottom' | 'none';
export type TickDensity = 'compact' | 'standard' | 'dense';

export interface AnalysisProvenanceMetadata {
  sourceExperimentUuid: string;
  sourceCollectionId: string;
  sourceCollectionLabel: string;
  includedMeasurementIds: string[];
  sourceContentHash: string;
  exclusionSettingsSummary: string;
  unitSummary: string;
  calcEngineVersion: string;
  capturedAt: string;
  provenance: DataProvenance;
  scientificReviewStatus: ScientificReviewStatus;
}

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
  analysisProvenance?: AnalysisProvenanceMetadata | null;
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

export type InstrumentType =
  | 'ICP-OES'
  | 'Flame AAS'
  | 'Graphite Furnace AAS'
  | 'AAS'
  | 'ICP-MS'
  | 'UV-Vis'
  | 'Other';

export type AnalyticalWorkspaceTab =
  | 'overview'
  | 'calibration'
  | 'samples'
  | 'dilutions'
  | 'quality'
  | 'figures';

export type AnalyticalSessionStatus = 'Active' | 'Archived';

export type ReportedValueBasis =
  | 'as_measured_diluted'
  | 'already_dilution_corrected'
  | 'unspecified';

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

export interface AnalyticalAnalyte {
  id: string;
  name: string;
  symbol: string;
  wavelengthNm: number | null;
  measurementUnit: string;
  methodReference: string;
  calibrationDatasetId: string | null;
  notes: string;
}

export interface CalibrationStandard {
  id: string;
  standardId: string;
  analyteId?: string | null;
  isBlank?: boolean;
  replicateGroupId?: string;
  nominalConc: number | null;
  unit: string;
  instrumentResponse: number | null;
  responseUnit: string;
  replicateNumber: number;
  provenance: DataProvenance;
  qualityStatus: MeasurementQualityStatus;
  exclusionReason?: string;
  notes: string;
}

export interface CalibrationDataset {
  id: string;
  calibrationId: string;
  title: string;
  sessionId: string;
  analyteId: string | null;
  referenceMethod: string;
  concUnit: string;
  responseUnit: string;
  analyst: string;
  analysisDate: string;
  provenance: DataProvenance;
  standards: CalibrationStandard[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type SampleStage =
  | 'Initial'
  | 'Final'
  | 'Blank'
  | 'Control'
  | 'Reference Material'
  | 'Replicate'
  | 'User-Defined';

export type MeasurementValueQualifier =
  | 'valid_numeric'
  | 'valid_zero'
  | 'missing'
  | 'not_measured'
  | 'not_detected'
  | 'below_lod'
  | 'below_loq'
  | 'instrument_invalid'
  | 'excluded_by_user';

export type SuppliedLimitType = 'LOD' | 'LOQ' | 'MDL' | 'Other';

export interface InstrumentMeasurement {
  /** Stable internal identifier independent of editable display label */
  id: string;
  sampleId: string;
  sessionId?: string;
  analyteId?: string | null;
  calibrationDatasetId?: string | null;
  linkedSurveyDatasetId?: string | null;
  linkedSurveyMeasurementId?: string | null;
  linkedSurveySampleId: string;
  analyte: string;
  stage: SampleStage;
  classificationLabel?: string;
  replicateId: string;
  dilutionFactor: number | null;
  reportedValueBasis?: ReportedValueBasis;
  rawSignal: number | null;
  signalUnit: string;
  reportedConc: number | null;
  concUnit: string;
  /** Phase 5 explicit analytical measurement qualifier preserved independently of numeric value */
  valueQualifier?: MeasurementValueQualifier;
  /** Original raw token from import or entry (e.g., "<LOD", "<0.02", "ND", "BDL", "0") */
  originalValueToken?: string | null;
  /** Optional externally supplied detection/quantification limit value (never automatically inferred) */
  suppliedLimitValue?: number | null;
  suppliedLimitType?: SuppliedLimitType | null;
  suppliedLimitUnit?: string | null;
  instrumentFlag?: string;
  exclusionReason?: string;
  importRecordId?: string | null;
  importRowNumber?: number | null;
  originalReportedConc?: string | null;
  originalConcUnit?: string | null;
  analysisTimestamp?: string;
  provenance: DataProvenance;
  qualityStatus: MeasurementQualityStatus;
  measurementDate: string;
  notes: string;
}

export interface DilutionRecord {
  id: string;
  sampleMeasurementId: string | null;
  sampleId: string;
  stage: 'Initial' | 'Final' | 'Other';
  dilutionFactor: number | null;
  sourceVolumeMl: number | null;
  finalVolumeMl: number | null;
  concUnit: string;
  reportedValueBasis: ReportedValueBasis;
  preparationReference: string;
  matrixDescription: string;
  analyst: string;
  date: string;
  verificationStatus: VerificationStatus;
  provenance: DataProvenance;
  notes: string;
}

export type InstrumentImportColumnKey =
  | 'sampleId'
  | 'analyte'
  | 'stage'
  | 'replicateId'
  | 'reportedConc'
  | 'concUnit'
  | 'rawSignal'
  | 'signalUnit'
  | 'dilutionFactor'
  | 'analysisTimestamp'
  | 'instrumentFlag'
  | 'notes';

export interface InstrumentImportRecord {
  id: string;
  filename: string;
  importedAt: string;
  format: 'csv' | 'tsv' | 'clipboard';
  targetSessionId: string;
  sourceHeaders: string[];
  columnMapping: Partial<Record<InstrumentImportColumnKey, string>>;
  totalRows: number;
  acceptedCount: number;
  incompleteCount: number;
  rejectedCount: number;
  duplicateCount: number;
  unresolvedLinkCount: number;
}

export interface ImportMappingTemplate {
  id: string;
  name: string;
  technique: InstrumentType;
  mappings: Partial<Record<InstrumentImportColumnKey, string>>;
  createdAt: string;
}

export type AnalyticalQualityIssueCategory =
  | 'missing_measurement'
  | 'incomplete_metadata'
  | 'unresolved_survey_association'
  | 'incompatible_units'
  | 'duplicate_measurement'
  | 'conflicting_dilution_metadata'
  | 'missing_calibration_association'
  | 'instrument_warning'
  | 'flagged_observation'
  | 'user_excluded_record'
  | 'pending_review';

export type AnalyticalReviewStatus =
  | 'Open'
  | 'Under Review'
  | 'Resolved'
  | 'Acknowledged'
  | 'Excluded by Researcher';

export interface AnalyticalReviewHistoryEntry {
  timestamp: string;
  status: AnalyticalReviewStatus;
  author: string;
  note: string;
}

export interface AnalyticalReviewRecord {
  id: string;
  issueKey: string;
  category: AnalyticalQualityIssueCategory;
  sessionId: string;
  recordId: string;
  recordLabel: string;
  description: string;
  provenance: DataProvenance;
  identifiedAt: string;
  status: AnalyticalReviewStatus;
  researcherNotes: string;
  history: AnalyticalReviewHistoryEntry[];
}

export type AnalyticalFigurePlotType =
  | 'calibration_scatter'
  | 'calibration_regression'
  | 'residuals_vs_conc'
  | 'residuals_vs_fitted'
  | 'replicate_response'
  | 'measurement_distribution'
  | 'concentration_comparison'
  | 'multi_session_comparison';

export interface AnalyticalFigureConfiguration {
  id: string;
  name: string;
  plotType: AnalyticalFigurePlotType;
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
  exportWidthPx: number;
  exportHeightPx: number;
  exportScale: 1 | 2 | 3;
  savedAt: string;
  analysisProvenance?: AnalysisProvenanceMetadata | null;
}

export interface AnalyticalSession {
  id: string;
  sessionId: string;
  title: string;
  experimentUuid: string;
  status: AnalyticalSessionStatus;
  technique: InstrumentType;
  customTechniqueName: string;
  instrumentManufacturer: string;
  instrumentModel: string;
  instrumentIdentifier: string;
  methodReference: string;
  analyst: string;
  analysisDate: string;
  matrixDescription: string;
  conditionsNote: string;
  analytes: AnalyticalAnalyte[];
  activeAnalyteId: string | null;
  calibrationDatasets: CalibrationDataset[];
  activeCalibrationDatasetId: string | null;
  sampleMeasurements: InstrumentMeasurement[];
  dilutionRecords: DilutionRecord[];
  importHistory: InstrumentImportRecord[];
  reviewRecords: AnalyticalReviewRecord[];
  figureConfig: AnalyticalFigureConfiguration;
  savedFigures: AnalyticalFigureConfiguration[];
  observations: string;
  provenance: DataProvenance;
  scientificReviewStatus: ScientificReviewStatus;
  isDemonstration: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticalComparisonConfig {
  selectedSessionIds: string[];
  compareAnalyteSymbol: string;
  plotMode: 'concentration_comparison' | 'calibration_comparison';
}

export type ObservationCategory =
  | 'General'
  | 'Synthesis'
  | 'Survey'
  | 'Analytical'
  | 'Bench'
  | 'General observation'
  | 'Measurement record'
  | 'Research deviation'
  | 'Equipment note'
  | 'Analytical observation'
  | 'Data-quality concern'
  | 'Follow-up question'
  | 'Research interpretation';

export type ObservationReferenceKind =
  | 'experiment'
  | 'survey_dataset'
  | 'analytical_session'
  | 'sample_measurement'
  | 'material_snapshot'
  | 'milestone'
  | 'figure';

export interface ObservationReference {
  kind: ObservationReferenceKind;
  id: string;
  label: string;
}

export interface ExperimentalObservation {
  id: string;
  timestamp: string;
  module: ActiveModule;
  category: ObservationCategory;
  author: string;
  text: string;
  provenance: DataProvenance;
  references?: ObservationReference[];
}

export interface BenchChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  plannedTime: string;
  actualCompletedAt: string | null;
  notes: string;
}

export type MilestoneStatus = 'pending' | 'completed' | 'archived';

export interface ResearchMilestone {
  id: string;
  title: string;
  description: string;
  plannedDateTime: string;
  actualCompletedAt: string | null;
  status: MilestoneStatus;
  linkedModule: ActiveModule | null;
  linkedRecordId: string | null;
  linkedRecordLabel: string;
  notes: string;
  deviations: string;
  order: number;
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

export interface ResearchTimerHistoryEntry {
  timestamp: string;
  action: 'created' | 'started' | 'paused' | 'resumed' | 'reset' | 'completed' | 'configured';
  detail: string;
}

export interface ResearchTimer {
  id: string;
  name: string;
  mode: 'elapsed' | 'countdown';
  /** User-configured duration in seconds (for countdown mode) */
  configuredDurationSec: number;
  /** Active session duration in seconds applied to the current countdown */
  activeDurationSec: number;
  elapsedMs: number;
  remainingMs: number;
  status: CountdownTimerStatus;
  lastTickAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  linkedMilestoneId: string | null;
  history: ResearchTimerHistoryEntry[];
}

export interface BenchLog {
  id: string;
  timestamp: string;
  eventType: 'timer' | 'checklist' | 'observation' | 'status';
  message: string;
}

export interface ExperimentLifecycleEvent {
  id: string;
  fromStatus: ExperimentStatus | null;
  toStatus: ExperimentStatus;
  timestamp: string;
  researcher: string;
  explanation: string;
  snapshotId?: string | null;
}

export interface ResearchPlanDeviation {
  id: string;
  timestamp: string;
  description: string;
  reason: string;
  author: string;
}

export interface ResearchPlanMetadata {
  researchQuestions: string[];
  plannedSampleIds: string[];
  plannedMeasurementRequirements: string;
  plannedAnalyticalSessions: string;
  expectedDeliverables: string;
  externalProtocolRefs: string[];
  deviations: ResearchPlanDeviation[];
}

export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  experimentType: ExperimentType;
  defaultObjective: string;
  researchQuestions: string[];
  sampleNamingConvention: string;
  plannedMeasurementRequirements: string;
  plannedAnalyticalSessions: string;
  expectedDeliverables: string;
  externalProtocolRefs: string[];
  defaultMilestones: Array<{
    title: string;
    description: string;
    plannedDateTime: string;
  }>;
  preferredReportType: ReportType;
  createdAt: string;
}

export type SampleDocumentationStatus =
  | 'Planned'
  | 'Recorded'
  | 'Analytically Linked'
  | 'Flagged / Review Needed'
  | 'Excluded';

export interface SampleRegistryNote {
  sampleKey: string;
  classification: string;
  notes: string;
}

export type OverviewWorkspaceTab =
  | 'summary'
  | 'samples'
  | 'timeline'
  | 'review'
  | 'snapshots';

export type ActivityEventType =
  | 'experiment_created'
  | 'metadata_edited'
  | 'material_changed'
  | 'lifecycle_transition'
  | 'milestone_updated'
  | 'timer_event'
  | 'observation_logged'
  | 'survey_dataset_event'
  | 'instrument_import'
  | 'measurement_link_changed'
  | 'quality_review_decision'
  | 'figure_saved'
  | 'interpretation_logged'
  | 'report_finalized'
  | 'snapshot_created'
  | 'experiment_archived';

export interface ExperimentActivityEvent {
  id: string;
  eventType: ActivityEventType;
  module: ActiveModule;
  timestamp: string;
  experimentUuid: string;
  sourceKind?: string;
  sourceId?: string | null;
  sourceLabel?: string;
  author: string;
  description: string;
}

export type ReportMode = 'pre-experiment' | 'post-experiment';

export type ReportType =
  | 'research-planning'
  | 'experiment-progress'
  | 'survey-analysis'
  | 'analytical-data'
  | 'complete-research'
  | 'data-review-summary';

export type ReportSectionId =
  | 'identification'
  | 'objectives_project'
  | 'materials'
  | 'planned_vs_actual'
  | 'timeline_milestones'
  | 'observations'
  | 'sample_registry'
  | 'survey_datasets'
  | 'analytical_sessions'
  | 'quality_review'
  | 'cross_experiment_analytics'
  | 'measurement_uncertainty'
  | 'interpretations_conclusions'
  | 'references'
  | 'snapshot_provenance';

export interface ReportConfiguration {
  mode: ReportMode;
  reportType?: ReportType;
  reportTitle?: string;
  reportSubtitle?: string;
  researcherName?: string;
  reportDate?: string;
  includeCoverPage?: boolean;
  includePageNumbers?: boolean;
  sectionOrder?: ReportSectionId[];
  includeMaterialSnapshots: boolean;
  includeBatchRecords: boolean;
  includePlannedVsActual?: boolean;
  includeResearchTimeline?: boolean;
  includeSampleRegistry?: boolean;
  includeSnapshotMetadata?: boolean;
  includeSurveyOverview: boolean;
  includeSurveyTable: boolean;
  includeSurveyFigure: boolean;
  includeStatisticalSummaries: boolean;
  includeComparativeSummary: boolean;
  includeAnalyticalRecords: boolean;
  includeRegressionSummary: boolean;
  /** Phase 4 granular analytical report sections */
  includeAnalyticalOverview?: boolean;
  includeCalibrationRecords?: boolean;
  includeAnalyticalFigures?: boolean;
  includeDilutionRecords?: boolean;
  includeAnalyticalQualityReview?: boolean;
  includeSurveyAnalyticalLinks?: boolean;
  /** Phase 6 research analytics and uncertainty report sections */
  includeCrossExperimentSummary?: boolean;
  includeResearchMatrix?: boolean;
  includeAdvancedStatistics?: boolean;
  includeMeasurementUncertainty?: boolean;
  includeCompatibilityLimitations?: boolean;
  includeAnalysisAssumptions?: boolean;
  includeDataQualityLimitations: boolean;
  includeResearchInterpretations: boolean;
  includeScientificReferences: boolean;
  includeObservations: boolean;
  includeBenchChecklist: boolean;
  researcherConclusions?: string;
  /** Selected survey dataset IDs to include in report; empty array means active dataset */
  selectedSurveyDatasetIds: string[];
  /** Selected saved survey figure IDs to include in report */
  selectedFigureIds: string[];
  /** Selected analytical session IDs to include in report; empty array means active session */
  selectedAnalyticalSessionIds?: string[];
  /** Selected saved analytical figure IDs to include in report */
  selectedAnalyticalFigureIds?: string[];
  institutionHeader: string;
  reportFooterNote: string;
}

export type UncertaintyType =
  | 'sample_sd'
  | 'sem'
  | 'standard_uncertainty'
  | 'expanded_uncertainty'
  | 'researcher_reported'
  | 'manufacturer_reported'
  | 'unknown';

export type UncertaintyRecordTargetKind =
  | 'survey_measurement'
  | 'analytical_measurement'
  | 'batch_parameter'
  | 'material_property'
  | 'general_quantity';

export interface MeasurementUncertaintyRecord {
  id: string;
  experimentUuid: string;
  targetKind: UncertaintyRecordTargetKind;
  /** Stable internal measurement ID or parameter key */
  measurementId: string;
  measurementLabel: string;
  quantityName: string;
  value: number | null;
  unit: string;
  uncertaintyValue: number | null;
  uncertaintyUnit: string;
  uncertaintyType: UncertaintyType;
  source: string;
  reference: string;
  conditions: string;
  coverageFactor: number | null;
  provenance: DataProvenance;
  reviewStatus: ScientificReviewStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UncertaintyPropagationTerm {
  id: string;
  label: string;
  symbol: string;
  value: number;
  unit: string;
  standardUncertainty: number;
  uncertaintyType: UncertaintyType;
  /** Linear coefficient c_i for y = sum(c_i * x_i) or exponent p_i for y = k * prod(x_i^p_i) */
  coefficientOrExponent: number;
  sourceNote: string;
}

export interface UncertaintyCorrelationPair {
  termIdA: string;
  termIdB: string;
  correlationCoefficient: number;
}

export type ResearchAnalyticsTab =
  | 'overview'
  | 'comparison'
  | 'uncertainty'
  | 'matrix';

export type ResearchScopeMode =
  | 'all_experiments'
  | 'selected_project'
  | 'selected_experiments'
  | 'selected_survey_datasets'
  | 'selected_analytical_sessions';

export interface ResearchScopeFilter {
  mode: ResearchScopeMode;
  projectIds: string[];
  experimentUuids: string[];
  surveyDatasetIds: string[];
  analyticalSessionIds: string[];
  dateFrom: string;
  dateTo: string;
  supportIds: string[];
  precursorIds: string[];
  experimentTypes: ExperimentType[];
  statuses: ExperimentStatus[];
  reviewStatuses: ScientificReviewStatus[];
  provenances: DataProvenance[];
  /** Exclude synthetic demonstration fixtures by default unless researcher enables */
  includeSyntheticDemo: boolean;
}

export type AnalysisStalenessStatus =
  | 'saved_current'
  | 'requires_regeneration'
  | 'source_unavailable';

export type ComparisonQuantityKey =
  | 'uptake_umol_m2'
  | 'final_ph'
  | 'delta_ph'
  | 'initial_conc_ppm'
  | 'final_conc_ppm'
  | 'reported_conc'
  | 'surface_loading_m2_l'
  | 'metal_loading_wt_pct';

export interface ResearchComparisonConfiguration {
  id: string;
  name: string;
  description: string;
  quantityKey: ComparisonQuantityKey;
  scope: ResearchScopeFilter;
  selectedExperimentUuids: string[];
  selectedSurveyDatasetIds: string[];
  selectedAnalyticalSessionIds: string[];
  excludeFlaggedMeasurements: boolean;
  errorBarMode: ErrorBarMode;
  sourceContentHash: string;
  calcEngineVersion: string;
  createdAt: string;
  updatedAt: string;
}

export type ResearchMatrixGranularity =
  | 'experiment'
  | 'survey_dataset'
  | 'analytical_session';

export type ResearchMatrixColumnId =
  | 'recordId'
  | 'title'
  | 'recordKind'
  | 'projectCode'
  | 'experimentType'
  | 'status'
  | 'reviewStatus'
  | 'provenance'
  | 'experimentDate'
  | 'supportName'
  | 'supportBetM2G'
  | 'supportPzc'
  | 'precursorName'
  | 'precursorMetal'
  | 'surfaceLoadingM2L'
  | 'temperatureC'
  | 'observationCount'
  | 'validCount'
  | 'missingOrQualifiedCount'
  | 'meanValue'
  | 'sdValue'
  | 'semValue'
  | 'medianValue'
  | 'iqrValue'
  | 'madValue'
  | 'minMaxRange'
  | 'unitLabel'
  | 'openQualityIssues'
  | 'uncertaintyRecordsCount';

export interface ResearchMatrixConfiguration {
  id: string;
  name: string;
  description: string;
  granularity: ResearchMatrixGranularity;
  quantityKey: ComparisonQuantityKey;
  columns: ResearchMatrixColumnId[];
  sortColumn: ResearchMatrixColumnId;
  sortDirection: 'asc' | 'desc';
  searchQuery: string;
  scope: ResearchScopeFilter;
  sourceContentHash: string;
  calcEngineVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchAnalysisSnapshot {
  id: string;
  title: string;
  analysisKind: 'cross_experiment_comparison' | 'research_matrix' | 'uncertainty_propagation' | 'descriptive_statistics';
  scope: ResearchScopeFilter;
  includedExperimentUuids: string[];
  includedSurveyDatasetIds: string[];
  includedAnalyticalSessionIds: string[];
  includedMeasurementIds: string[];
  exclusionRulesSummary: string;
  unitSummary: string;
  provenanceSummary: DataProvenance[];
  scientificReviewStatus: ScientificReviewStatus;
  containsSyntheticData: boolean;
  sourceContentHash: string;
  calcEngineVersion: string;
  capturedAt: string;
  summaryNotes: string;
}

export type WorkspaceSearchCategory =
  | 'project'
  | 'experiment'
  | 'support'
  | 'precursor'
  | 'survey_dataset'
  | 'analytical_session'
  | 'sample'
  | 'measurement'
  | 'observation'
  | 'reference'
  | 'interpretation'
  | 'figure'
  | 'snapshot'
  | 'report';

export interface WorkspaceSearchResult {
  id: string;
  category: WorkspaceSearchCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  experimentUuid: string | null;
  experimentIdLabel: string | null;
  projectId: string | null;
  projectLabel: string | null;
  matchingSnippet: string;
  provenance: DataProvenance;
  isAvailable: boolean;
  targetModule: ActiveModule;
  targetDatasetId?: string | null;
  targetSessionId?: string | null;
  targetRecordId?: string | null;
}

export type ExperimentSnapshotPayload = Omit<
  Experiment,
  'snapshots' | 'finalizedReports'
>;

export interface ExperimentSnapshot {
  snapshotId: string;
  name: string;
  description: string;
  capturedAt: string;
  researcher: string;
  schemaVersion: string;
  experimentUuid: string;
  experimentDataVersion: string;
  calcEngineVersion: string;
  scientificReviewStatus: ScientificReviewStatus;
  byteSize: number;
  payload: ExperimentSnapshotPayload;
}

export interface FinalizedReport {
  id: string;
  versionNumber: number;
  title: string;
  reportType: ReportType;
  snapshotId: string;
  snapshotName: string;
  finalizedAt: string;
  researcher: string;
  scientificReviewStatus: ScientificReviewStatus;
  reportConfig: ReportConfiguration;
  notes: string;
  /**
   * Immutable companion experiment snapshots captured at report finalization time
   * so cross-experiment comparisons and Section 13 summaries remain reproducible
   * even if live workspace experiments are later edited or deleted.
   */
  crossExperimentSnapshots?: ExperimentSnapshot[];
}

export interface ResearchExportManifestFile {
  path: string;
  mimeType: string;
  bytes: number;
  description: string;
}

export interface ResearchExportManifest {
  format: 'sea-workbench-research-package';
  experimentUuid: string;
  experimentId: string;
  experimentTitle: string;
  snapshotId: string | null;
  snapshotName: string | null;
  appVersion: string;
  schemaVersion: string;
  calcEngineVersion: string;
  exportedAt: string;
  dataProvenance: DataProvenance[];
  scientificReviewStatus: ScientificReviewStatus;
  containsSyntheticData: boolean;
  includedFiles: ResearchExportManifestFile[];
  unavailableRecords: string[];
  notices: string[];
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
  /** Phase 5 structured research planning record */
  researchPlan?: ResearchPlanMetadata;
  /** Phase 5 chronological lifecycle transition log */
  lifecycleHistory?: ExperimentLifecycleEvent[];
  /** Deterministic compatibility projection of active survey dataset config */
  surveyConfig: SurveyConfiguration;
  /** Deterministic compatibility projection of active survey dataset measurements */
  surveyMeasurements: SurveyMeasurement[];
  /** Authoritative Phase 3+ multi-dataset research series collection */
  surveyDatasets: SurveyDataset[];
  activeSurveyDatasetId: string | null;
  datasetComparison: DatasetComparisonConfig;
  /** Deterministic compatibility projection of active analytical session config */
  analyticalConfig: AnalyticalConfiguration;
  /** Deterministic compatibility projection of active calibration dataset standards */
  calibrationStandards: CalibrationStandard[];
  /** Deterministic compatibility projection of all experiment analytical sample measurements */
  instrumentMeasurements: InstrumentMeasurement[];
  /** Authoritative Phase 4 multi-session analytical chemistry collection */
  analyticalSessions: AnalyticalSession[];
  activeAnalyticalSessionId: string | null;
  analyticalComparison: AnalyticalComparisonConfig;
  observations: ExperimentalObservation[];
  benchChecklist: BenchChecklistItem[];
  /** Phase 5 structured milestones (synchronized cleanly with benchChecklist compatibility) */
  milestones?: ResearchMilestone[];
  benchTimer: BenchTimerState;
  /** Phase 5 multiple independently named timers */
  timers?: ResearchTimer[];
  benchLogs: BenchLog[];
  /** Phase 5 lightweight registry annotations keyed by stable sample ID */
  sampleRegistryNotes?: SampleRegistryNote[];
  /** Phase 5 explicit logged activity events (merged with derived history in timeline) */
  activityEvents?: ExperimentActivityEvent[];
  /** Phase 5 versioned immutable snapshots of this experiment */
  snapshots?: ExperimentSnapshot[];
  /** Phase 5 immutable snapshot-bound finalized reports */
  finalizedReports?: FinalizedReport[];
  /** Phase 6 recorded externally supplied measurement uncertainty metadata */
  uncertaintyRecords?: MeasurementUncertaintyRecord[];
  reportConfig: ReportConfiguration;
}

export interface UserPreferences {
  sidebarCollapsed: boolean;
  defaultResearcher: string;
  lastBackupExportedAt?: string | null;
}

export interface WorkspaceStateData {
  schemaVersion: string;
  appVersion: string;
  projects: ResearchProject[];
  experiments: Experiment[];
  activeExperimentUuid: string | null;
  precursors: Precursor[];
  supports: Support[];
  importMappingTemplates?: ImportMappingTemplate[];
  experimentTemplates?: ExperimentTemplate[];
  /** Phase 6 saved cross-experiment comparison configurations */
  researchComparisonConfigs?: ResearchComparisonConfiguration[];
  /** Phase 6 saved research comparison matrix configurations */
  researchMatrixConfigs?: ResearchMatrixConfiguration[];
  /** Phase 6 saved reproducible research analysis snapshots */
  researchAnalysisSnapshots?: ResearchAnalysisSnapshot[];
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

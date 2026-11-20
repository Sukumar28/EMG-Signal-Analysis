export type NavPageId =
  | 'dashboard'
  | 'analysis'
  | 'recognition'
  | 'visualization'
  | 'performance'
  | 'history'
  | 'about';

export interface PreprocessingConfig {
  sampling_frequency: number;
  apply_bandpass: boolean;
  bandpass_low_hz: number;
  bandpass_high_hz: number;
  filter_order: number;
  apply_notch: boolean;
  notch_freq_hz: number;
  notch_q: number;
  normalization: 'zscore' | 'minmax' | 'none';
  window_size_ms: number;
  window_overlap_pct: number;
}

export interface WindowFeatures {
  window_index: number;
  start_sample: number;
  end_sample: number;
  start_time_s: number;
  end_time_s: number;
  mav: number;
  rms: number;
  wl: number;
  zc: number;
  ssc: number;
  variance: number;
  iemg: number;
}

export interface FeatureStat {
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface FeatureSummary {
  mav: FeatureStat;
  rms: FeatureStat;
  wl: FeatureStat;
  zc: FeatureStat;
  ssc: FeatureStat;
  variance: FeatureStat;
  iemg: FeatureStat;
}

export interface SignalQualityReport {
  overall_grade: 'Good' | 'Fair' | 'Poor';
  snr_db: number;
  missing_count: number;
  missing_ratio_pct: number;
  clipped_ratio_pct: number;
  baseline_offset: number;
  duration_seconds: number;
  sample_count: number;
  notes: string[];
}

export interface UploadResponse {
  ok: boolean;
  upload_id: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  columns: string[];
  numeric_columns: string[];
  non_numeric_columns: string[];
  timestamp_column: string | null;
  label_column: string | null;
  detected_labels: string[];
  inferred_sampling_frequency: number | null;
  missing_summary: Record<string, number>;
  preview_rows: Record<string, string>[];
  warnings: string[];
  uploaded_at: string;
}

export interface ProbabilityEntry {
  movement: string;
  probability: number;
}

export interface VisualizationPayload {
  time_raw: number[];
  raw_signal: number[];
  time_filtered: number[];
  filtered_signal: number[];
  time_normalized: number[];
  normalized_signal: number[];
  windows: WindowFeatures[];
  amplitude_samples: number[];
}

export interface AnalysisResult {
  ok?: boolean;
  model_trained: boolean;
  error_code?: string;
  message?: string;
  id?: string;
  upload_id?: string;
  filename: string;
  uploaded_at?: string;
  channel: string;
  sampling_frequency: number;
  predicted_movement?: string;
  confidence?: number;
  probabilities?: ProbabilityEntry[];
  windows_analyzed: number;
  model_version?: string;
  model_type?: 'random_forest' | 'svm';
  status?: string;
  processing_time_ms: number;
  signal_quality: SignalQualityReport;
  reliability_warning?: string | null;
  ood_distance?: number;
  ood_threshold?: number;
  feature_summary: FeatureSummary;
  preprocessing_config: PreprocessingConfig;
  warnings?: string[];
  visualization: VisualizationPayload;
}

export interface ClassReportRow {
  label: string;
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

export interface EvaluationMetrics {
  model_type: 'random_forest' | 'svm';
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_f1: number;
  classes: string[];
  confusion_matrix: number[][];
  classification_report: ClassReportRow[];
  evaluated_samples: number;
}

export interface TrainingRunSummary {
  id: string;
  model_version: string;
  trained_at: string;
  dataset_name: string;
  classes: string[];
  train_windows: number;
  test_windows: number;
  active_model_type: string;
  rf_accuracy: number | null;
  svm_accuracy: number | null;
}

export interface ModelPerformanceResponse {
  ok: boolean;
  status: 'Evaluated' | 'Evaluation Pending';
  model_trained: boolean;
  message?: string;
  run_id?: string;
  model_version: string | null;
  trained_at?: string;
  dataset_name?: string;
  classes: string[];
  feature_names?: string[];
  train_windows?: number;
  test_windows?: number;
  active_model_type: 'random_forest' | 'svm' | null;
  rf_metrics: EvaluationMetrics | null;
  svm_metrics: EvaluationMetrics | null;
  preprocessing_config: PreprocessingConfig;
  training_history: TrainingRunSummary[];
}

export interface DashboardResponse {
  ok: boolean;
  kpis: {
    total_signals_analyzed: number;
    recognized_movements: number;
    available_movement_classes: number;
    movement_class_names: string[];
    model_accuracy: number | null;
    model_trained: boolean;
    model_version: string | null;
    active_model_type: 'random_forest' | 'svm' | null;
  };
  movement_distribution: { movement: string; count: number }[];
  activity_timeline: { date: string; count: number }[];
  recent_analyses: HistoryListItem[];
  latest_prediction: {
    id: string;
    filename: string;
    uploaded_at: string;
    channel: string;
    sampling_frequency: number;
    predicted_movement: string;
    confidence: number;
    model_version: string;
    model_type: string;
    status: string;
    windows_analyzed: number;
    processing_time_ms: number;
    reliability_warning: string | null;
    probabilities: ProbabilityEntry[];
  } | null;
}

export interface HistoryListItem {
  id: string;
  upload_id?: string;
  filename: string;
  uploaded_at: string;
  channel: string;
  sampling_frequency: number;
  predicted_movement: string;
  confidence: number;
  model_version: string;
  model_type: 'random_forest' | 'svm';
  status: string;
  windows_analyzed: number;
  processing_time_ms: number;
  reliability_warning: string | null;
  signal_quality?: SignalQualityReport;
  probabilities?: ProbabilityEntry[];
  feature_summary?: FeatureSummary;
  preprocessing_config?: PreprocessingConfig;
}

export interface SampleDatasetInfo {
  filename: string;
  title: string;
  type: 'training' | 'inference';
  sampling_frequency: number;
  duration_seconds: number;
  description: string;
  size_bytes: number;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

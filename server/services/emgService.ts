import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  deleteAnalysisById,
  getAnalysisById,
  getDashboardStats,
  getLatestModelRun,
  getUploadById,
  insertAnalysis,
  insertModelRun,
  insertUpload,
  listAnalyses,
  listModelRuns,
  MODEL_DIR,
  updateActiveModelType,
  UPLOAD_DIR,
} from '../database/db.ts';
import {
  computeEvaluationMetrics,
  computeOodStats,
  fitScaler,
  loadModelBundle,
  minCentroidRmsDistance,
  predictRandomForestProba,
  predictSvmProba,
  saveModelBundle,
  stratifiedTrainTestSplit,
  type TrainedModelBundle,
  trainOneVsRestSvm,
  trainRandomForest,
  transformScaler,
} from '../ml/classifiers.ts';
import {
  DEFAULT_PREPROCESSING_CONFIG,
  downsampleForPlot,
  extractNumericSeries,
  FEATURE_NAMES,
  parseCsvText,
  type PreprocessingConfig,
  runSignalProcessingPipeline,
} from '../signal_processing/pipeline.ts';
import { ensureSampleDatasets, SAMPLE_DATA_DIR } from './sampleGenerator.ts';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

let cachedBundle: { path: string; bundle: TrainedModelBundle } | null = null;

export function getActiveModelBundle(): {
  bundle: TrainedModelBundle | null;
  activeModelType: 'random_forest' | 'svm';
  runId: string | null;
} {
  const latest = getLatestModelRun();
  if (!latest) {
    return { bundle: null, activeModelType: 'random_forest', runId: null };
  }
  const activeType = latest.active_model_type === 'svm' ? 'svm' : 'random_forest';
  if (cachedBundle && cachedBundle.path === latest.artifact_path) {
    return { bundle: cachedBundle.bundle, activeModelType: activeType, runId: latest.id };
  }
  const loaded = loadModelBundle(latest.artifact_path);
  if (!loaded) {
    return { bundle: null, activeModelType: activeType, runId: null };
  }
  cachedBundle = { path: latest.artifact_path, bundle: loaded };
  return { bundle: loaded, activeModelType: activeType, runId: latest.id };
}

export function handleCsvUpload(originalFilename: string, rawBuffer: Buffer) {
  if (!rawBuffer || rawBuffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (rawBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the 25 MB maximum upload limit.');
  }

  const safeOriginal = path.basename(originalFilename).replace(/[^a-zA-Z0-9._ -]/g, '_');
  if (!safeOriginal.toLowerCase().endsWith('.csv')) {
    throw new Error('Only .csv files are supported for EMG signal upload.');
  }

  const csvText = rawBuffer.toString('utf-8');
  const parsed = parseCsvText(csvText);

  const uploadId = `upl_${crypto.randomUUID().slice(0, 12)}`;
  const storedPath = path.join(UPLOAD_DIR, `${uploadId}_${safeOriginal}`);
  // Preserve original uploaded CSV untouched on disk
  fs.writeFileSync(storedPath, rawBuffer);

  const uploadedAt = new Date().toISOString();
  insertUpload({
    id: uploadId,
    original_filename: safeOriginal,
    stored_path: storedPath,
    file_size_bytes: rawBuffer.length,
    row_count: parsed.rowCount,
    columns_json: JSON.stringify(parsed.headers),
    numeric_columns_json: JSON.stringify(parsed.numericColumns),
    timestamp_column: parsed.timestampColumn,
    label_column: parsed.labelColumn,
    inferred_fs: parsed.inferredFs,
    missing_summary_json: JSON.stringify(parsed.missingSummary),
    uploaded_at: uploadedAt,
  });

  // Detect unique movement labels if label column exists
  let detectedLabels: string[] = [];
  if (parsed.labelColumn) {
    const labelSet = new Set<string>();
    for (const r of parsed.rows) {
      const val = (r[parsed.labelColumn] ?? '').trim();
      if (val) labelSet.add(val);
    }
    detectedLabels = Array.from(labelSet);
  }

  return {
    upload_id: uploadId,
    filename: safeOriginal,
    file_size_bytes: rawBuffer.length,
    row_count: parsed.rowCount,
    columns: parsed.headers,
    numeric_columns: parsed.numericColumns,
    non_numeric_columns: parsed.nonNumericColumns,
    timestamp_column: parsed.timestampColumn,
    label_column: parsed.labelColumn,
    detected_labels: detectedLabels,
    inferred_sampling_frequency: parsed.inferredFs,
    missing_summary: parsed.missingSummary,
    preview_rows: parsed.previewRows,
    warnings: parsed.warnings,
    uploaded_at: uploadedAt,
  };
}

export function loadSampleAsUpload(sampleFilename: string) {
  ensureSampleDatasets();
  const safeName = path.basename(sampleFilename);
  const fullPath = path.join(SAMPLE_DATA_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Sample CSV "${safeName}" was not found.`);
  }
  const buf = fs.readFileSync(fullPath);
  return handleCsvUpload(safeName, buf);
}

export interface TrainRequestOptions {
  upload_id?: string;
  use_bundled_dataset?: boolean;
  signal_column?: string;
  label_column?: string;
  preprocessing?: Partial<PreprocessingConfig>;
  test_split_ratio?: number;
  n_estimators?: number;
  svm_c?: number;
  preferred_model?: 'random_forest' | 'svm';
}

/**
 * Genuine supervised ML training pipeline:
 * Reads real labelled EMG CSV -> groups contiguous segments by movement label ->
 * applies exact DSP pipeline per segment -> extracts 7 EMG features per window ->
 * stratified block train/test split (no window leakage) -> fits StandardScaler on train only ->
 * trains Random Forest AND RBF-kernel SVM -> evaluates on held-out test split -> saves model bundle + SQLite run.
 */
export function trainModels(options: TrainRequestOptions) {
  const startMs = performance.now();
  let csvText: string;
  let datasetName: string;

  if (options.use_bundled_dataset) {
    ensureSampleDatasets();
    datasetName = 'emg_labelled_training_dataset.csv';
    csvText = fs.readFileSync(path.join(SAMPLE_DATA_DIR, datasetName), 'utf-8');
  } else if (options.upload_id) {
    const upload = getUploadById(options.upload_id);
    if (!upload || !fs.existsSync(upload.stored_path)) {
      throw new Error('Uploaded training dataset could not be found. Please upload a labelled CSV file.');
    }
    datasetName = upload.original_filename;
    csvText = fs.readFileSync(upload.stored_path, 'utf-8');
  } else {
    throw new Error('Please upload a labelled EMG training CSV or select the included labelled dataset.');
  }

  const parsed = parseCsvText(csvText);
  const labelCol = options.label_column || parsed.labelColumn;
  if (!labelCol || !parsed.headers.includes(labelCol)) {
    throw new Error(
      'No movement label column found in the training CSV. A labelled dataset with a column such as "movement_label" or "label" is strictly required.'
    );
  }

  const signalCol = options.signal_column || parsed.numericColumns[0];
  if (!signalCol || !parsed.headers.includes(signalCol)) {
    throw new Error('Please specify a valid numeric EMG signal column for training.');
  }

  const prepConfig: PreprocessingConfig = {
    ...DEFAULT_PREPROCESSING_CONFIG,
    sampling_frequency: parsed.inferredFs ?? DEFAULT_PREPROCESSING_CONFIG.sampling_frequency,
    ...(options.preprocessing ?? {}),
  };

  // Group contiguous rows with identical movement labels into physiological trial segments
  const segments: { label: string; rows: Record<string, string>[] }[] = [];
  let currentLabel: string | null = null;
  let currentRows: Record<string, string>[] = [];

  for (const row of parsed.rows) {
    const lbl = (row[labelCol] ?? '').trim();
    if (!lbl) continue;
    if (lbl !== currentLabel) {
      if (currentLabel !== null && currentRows.length > 0) {
        segments.push({ label: currentLabel, rows: currentRows });
      }
      currentLabel = lbl;
      currentRows = [row];
    } else {
      currentRows.push(row);
    }
  }
  if (currentLabel !== null && currentRows.length > 0) {
    segments.push({ label: currentLabel, rows: currentRows });
  }

  const uniqueClasses = Array.from(new Set(segments.map((s) => s.label))).sort();
  if (uniqueClasses.length < 2) {
    throw new Error(
      `Training requires at least 2 distinct movement classes. Found only ${uniqueClasses.length} class(es) in column "${labelCol}".`
    );
  }

  const classToIndex = new Map<string, number>(uniqueClasses.map((c, idx) => [c, idx]));
  const allX: number[][] = [];
  const allY: number[] = [];
  let effectiveConfig = prepConfig;

  for (const seg of segments) {
    if (seg.rows.length < 20) continue;
    const { values, missingCount } = extractNumericSeries(seg.rows, signalCol);
    const processed = runSignalProcessingPipeline(values, missingCount, prepConfig);
    effectiveConfig = processed.effective_config;
    const clsIdx = classToIndex.get(seg.label)!;
    for (const vec of processed.feature_vectors) {
      allX.push(vec);
      allY.push(clsIdx);
    }
  }

  if (allX.length < uniqueClasses.length * 4) {
    throw new Error(
      `Insufficient segmented EMG windows (${allX.length}) for reliable train/test evaluation. Provide a longer labelled recording per movement class.`
    );
  }

  const testRatio = Math.min(0.4, Math.max(0.15, options.test_split_ratio ?? 0.25));
  const { XTrain, yTrain, XTest, yTest } = stratifiedTrainTestSplit(allX, allY, testRatio, 42);

  // Fit scaler STRICTLY on training fold to prevent data leakage
  const scaler = fitScaler(XTrain);
  const XTrainZ = transformScaler(XTrain, scaler);
  const XTestZ = transformScaler(XTest, scaler);

  // Train Random Forest baseline
  const nEstimators = Math.min(120, Math.max(15, options.n_estimators ?? 60));
  const rfModel = trainRandomForest(XTrainZ, yTrain, uniqueClasses, nEstimators, 10, 42);
  const rfTestProba = predictRandomForestProba(rfModel, XTestZ);
  const rfTestPred = rfTestProba.map((p) => p.indexOf(Math.max(...p)));
  const rfMetrics = computeEvaluationMetrics(yTest, rfTestPred, uniqueClasses, 'random_forest');

  // Train RBF Support Vector Machine comparison model
  const svmC = Math.min(20, Math.max(0.2, options.svm_c ?? 2.5));
  const svmModel = trainOneVsRestSvm(XTrainZ, yTrain, uniqueClasses, svmC, 42);
  const svmTestProba = predictSvmProba(svmModel, XTestZ);
  const svmTestPred = svmTestProba.map((p) => p.indexOf(Math.max(...p)));
  const svmMetrics = computeEvaluationMetrics(yTest, svmTestPred, uniqueClasses, 'svm');

  // Compute OOD statistics on standardized training feature space
  const ood = computeOodStats(XTrainZ, yTrain, uniqueClasses.length);

  const existingRuns = listModelRuns();
  const nextMinor = existingRuns.length + 1;
  const modelVersion = `v1.${nextMinor}.0`;
  const trainedAt = new Date().toISOString();
  const activeModelType = options.preferred_model === 'svm' ? 'svm' : 'random_forest';

  const bundle: TrainedModelBundle = {
    model_version: modelVersion,
    trained_at: trainedAt,
    dataset_name: datasetName,
    classes: uniqueClasses,
    feature_names: [...FEATURE_NAMES],
    scaler,
    class_centroids_z: ood.centroids,
    ood_distance_threshold: ood.threshold,
    preprocessing_config: effectiveConfig,
    random_forest: rfModel,
    svm: svmModel,
    rf_metrics: rfMetrics,
    svm_metrics: svmMetrics,
    train_windows: XTrain.length,
    test_windows: XTest.length,
  };

  const artifactPath = saveModelBundle(bundle, MODEL_DIR);
  const runId = `mdl_${crypto.randomUUID().slice(0, 12)}`;

  insertModelRun({
    id: runId,
    model_version: modelVersion,
    trained_at: trainedAt,
    dataset_name: datasetName,
    classes_json: JSON.stringify(uniqueClasses),
    train_windows: XTrain.length,
    test_windows: XTest.length,
    active_model_type: activeModelType,
    rf_metrics_json: JSON.stringify(rfMetrics),
    svm_metrics_json: JSON.stringify(svmMetrics),
    preprocessing_config_json: JSON.stringify(effectiveConfig),
    artifact_path: artifactPath,
  });

  cachedBundle = { path: artifactPath, bundle };
  const elapsedMs = Number((performance.now() - startMs).toFixed(1));

  return {
    run_id: runId,
    model_version: modelVersion,
    trained_at: trainedAt,
    dataset_name: datasetName,
    signal_column: signalCol,
    label_column: labelCol,
    classes: uniqueClasses,
    train_windows: XTrain.length,
    test_windows: XTest.length,
    active_model_type: activeModelType,
    rf_metrics: rfMetrics,
    svm_metrics: svmMetrics,
    preprocessing_config: effectiveConfig,
    training_time_ms: elapsedMs,
  };
}

export interface AnalyzeRequestOptions {
  upload_id: string;
  signal_column: string;
  model_type?: 'random_forest' | 'svm';
  preprocessing?: Partial<PreprocessingConfig>;
}

/**
 * Full inference pipeline:
 * Load original uploaded CSV -> run DSP pipeline -> extract features ->
 * require real trained model -> run inference across all windows ->
 * compute mean class probability distribution + OOD reliability check ->
 * persist to SQLite -> return full prediction + Plotly visualization payloads.
 */
export function analyzeSignal(options: AnalyzeRequestOptions) {
  const startMs = performance.now();

  const upload = getUploadById(options.upload_id);
  if (!upload || !fs.existsSync(upload.stored_path)) {
    throw new Error('Uploaded file record not found. Please upload a valid EMG CSV file first.');
  }

  const csvText = fs.readFileSync(upload.stored_path, 'utf-8');
  const parsed = parseCsvText(csvText);

  if (!options.signal_column || !parsed.headers.includes(options.signal_column)) {
    throw new Error(
      `Signal column "${options.signal_column}" not found. Available numeric columns: ${parsed.numericColumns.join(', ')}`
    );
  }

  const { values, missingCount } = extractNumericSeries(parsed.rows, options.signal_column);

  // Extract optional timestamps
  let timestamps: number[] | undefined;
  if (parsed.timestampColumn && parsed.headers.includes(parsed.timestampColumn)) {
    const ts = parsed.rows.map((r) => Number(r[parsed.timestampColumn!]));
    if (ts.every((v) => Number.isFinite(v))) {
      timestamps = ts;
    }
  }

  const { bundle, activeModelType } = getActiveModelBundle();
  const baseConfig: PreprocessingConfig = {
    ...(bundle?.preprocessing_config ?? DEFAULT_PREPROCESSING_CONFIG),
    ...(options.preprocessing ?? {}),
  };

  const processed = runSignalProcessingPipeline(values, missingCount, baseConfig, timestamps);

  // Strict requirement: If model is unavailable, return explicit MODEL NOT TRAINED state
  // (still returning processed waveforms so user can inspect preprocessing, but refusing fake prediction!)
  const rawPlot = downsampleForPlot(processed.time_axis, processed.raw_signal, 1800);
  const filteredPlot = downsampleForPlot(processed.time_axis, processed.filtered_signal, 1800);
  const normalizedPlot = downsampleForPlot(processed.time_axis, processed.normalized_signal, 1800);

  // Build amplitude histogram bins on filtered signal
  const histogramSamples =
    processed.filtered_signal.length > 4000
      ? processed.filtered_signal.filter((_, idx) => idx % Math.ceil(processed.filtered_signal.length / 4000) === 0)
      : processed.filtered_signal;

  const visualizationPayload = {
    time_raw: rawPlot.t,
    raw_signal: rawPlot.y,
    time_filtered: filteredPlot.t,
    filtered_signal: filteredPlot.y,
    time_normalized: normalizedPlot.t,
    normalized_signal: normalizedPlot.y,
    windows: processed.windows,
    amplitude_samples: histogramSamples.map((v) => Number(v.toFixed(5))),
  };

  if (!bundle) {
    return {
      model_trained: false,
      error_code: 'MODEL_NOT_TRAINED',
      message: 'MODEL NOT TRAINED – Please configure a labelled EMG training dataset.',
      filename: upload.original_filename,
      channel: options.signal_column,
      sampling_frequency: processed.effective_config.sampling_frequency,
      windows_analyzed: processed.windows.length,
      signal_quality: processed.signal_quality,
      feature_summary: processed.feature_summary,
      preprocessing_config: processed.effective_config,
      warnings: processed.warnings,
      visualization: visualizationPayload,
      processing_time_ms: Number((performance.now() - startMs).toFixed(1)),
    };
  }

  const chosenModelType = options.model_type ?? activeModelType;
  const Xz = transformScaler(processed.feature_vectors, bundle.scaler);

  const windowProbas =
    chosenModelType === 'svm'
      ? predictSvmProba(bundle.svm, Xz)
      : predictRandomForestProba(bundle.random_forest, Xz);

  const numClasses = bundle.classes.length;
  const avgProba = new Array<number>(numClasses).fill(0);
  for (const row of windowProbas) {
    for (let c = 0; c < numClasses; c++) avgProba[c] += row[c];
  }
  for (let c = 0; c < numClasses; c++) {
    avgProba[c] /= Math.max(1, windowProbas.length);
  }

  // Compute OOD distance across windows
  const oodDistances = Xz.map((z) => minCentroidRmsDistance(z, bundle.class_centroids_z));
  const meanOodDistance =
    oodDistances.reduce((a, b) => a + b, 0) / Math.max(1, oodDistances.length);

  let bestClassIdx = 0;
  for (let c = 1; c < numClasses; c++) {
    if (avgProba[c] > avgProba[bestClassIdx]) bestClassIdx = c;
  }

  const confidence = Number((avgProba[bestClassIdx] * 100).toFixed(2));
  const predictedMovement = bundle.classes[bestClassIdx];

  const probabilities = bundle.classes
    .map((label, idx) => ({
      movement: label,
      probability: Number((avgProba[idx] * 100).toFixed(2)),
    }))
    .sort((a, b) => b.probability - a.probability);

  // Reliability / Out-of-Distribution Guard
  let reliabilityWarning: string | null = null;
  let status = 'Completed';

  if (meanOodDistance > bundle.ood_distance_threshold) {
    reliabilityWarning = `Out-of-distribution signal detected (feature distance ${meanOodDistance.toFixed(
      2
    )} exceeds trained threshold ${bundle.ood_distance_threshold.toFixed(
      2
    )}). Input amplitude or spectral profile diverges significantly from the trained EMG dataset — treat prediction with caution.`;
    status = 'Low Reliability';
  } else if (confidence < 55) {
    reliabilityWarning = `Low classification confidence (${confidence.toFixed(
      1
    )}%). The EMG signal shows ambiguous multi-class overlap across windows and cannot be definitively assigned.`;
    status = 'Low Confidence';
  } else if (processed.signal_quality.overall_grade === 'Poor') {
    reliabilityWarning = `Poor signal quality detected (${processed.signal_quality.notes.join(
      ' '
    )}). Verify electrode contact or sampling frequency.`;
  }

  const processingTimeMs = Number((performance.now() - startMs).toFixed(1));
  const analysisId = `anl_${crypto.randomUUID().slice(0, 12)}`;
  const timestampIso = new Date().toISOString();

  insertAnalysis({
    id: analysisId,
    upload_id: upload.id,
    filename: upload.original_filename,
    uploaded_at: timestampIso,
    channel: options.signal_column,
    sampling_frequency: processed.effective_config.sampling_frequency,
    predicted_movement: predictedMovement,
    confidence,
    model_version: bundle.model_version,
    model_type: chosenModelType,
    status,
    windows_analyzed: processed.windows.length,
    processing_time_ms: processingTimeMs,
    signal_quality_json: JSON.stringify(processed.signal_quality),
    reliability_warning: reliabilityWarning,
    probabilities_json: JSON.stringify(probabilities),
    features_summary_json: JSON.stringify(processed.feature_summary),
    preprocessing_config_json: JSON.stringify(processed.effective_config),
    visualization_json: JSON.stringify(visualizationPayload),
  });

  return {
    model_trained: true,
    id: analysisId,
    upload_id: upload.id,
    filename: upload.original_filename,
    uploaded_at: timestampIso,
    channel: options.signal_column,
    sampling_frequency: processed.effective_config.sampling_frequency,
    predicted_movement: predictedMovement,
    confidence,
    probabilities,
    windows_analyzed: processed.windows.length,
    model_version: bundle.model_version,
    model_type: chosenModelType,
    status,
    processing_time_ms: processingTimeMs,
    signal_quality: processed.signal_quality,
    reliability_warning: reliabilityWarning,
    ood_distance: Number(meanOodDistance.toFixed(3)),
    ood_threshold: bundle.ood_distance_threshold,
    feature_summary: processed.feature_summary,
    preprocessing_config: processed.effective_config,
    warnings: processed.warnings,
    visualization: visualizationPayload,
  };
}

export function getModelPerformancePayload() {
  const { bundle, activeModelType, runId } = getActiveModelBundle();
  const runs = listModelRuns().map((r) => ({
    id: r.id,
    model_version: r.model_version,
    trained_at: r.trained_at,
    dataset_name: r.dataset_name,
    classes: JSON.parse(r.classes_json) as string[],
    train_windows: r.train_windows,
    test_windows: r.test_windows,
    active_model_type: r.active_model_type,
    rf_accuracy: r.rf_metrics_json ? JSON.parse(r.rf_metrics_json).accuracy : null,
    svm_accuracy: r.svm_metrics_json ? JSON.parse(r.svm_metrics_json).accuracy : null,
  }));

  if (!bundle) {
    return {
      status: 'Evaluation Pending',
      model_trained: false,
      message: 'MODEL NOT TRAINED – Please configure a labelled EMG training dataset.',
      active_model_type: null,
      model_version: null,
      classes: ['Hand Open', 'Hand Close', 'Wrist Flexion', 'Wrist Extension'],
      rf_metrics: null,
      svm_metrics: null,
      preprocessing_config: DEFAULT_PREPROCESSING_CONFIG,
      training_history: runs,
    };
  }

  return {
    status: 'Evaluated',
    model_trained: true,
    run_id: runId,
    model_version: bundle.model_version,
    trained_at: bundle.trained_at,
    dataset_name: bundle.dataset_name,
    classes: bundle.classes,
    feature_names: bundle.feature_names,
    train_windows: bundle.train_windows,
    test_windows: bundle.test_windows,
    active_model_type: activeModelType,
    rf_metrics: bundle.rf_metrics,
    svm_metrics: bundle.svm_metrics,
    preprocessing_config: bundle.preprocessing_config,
    training_history: runs,
  };
}

export function setActiveModel(modelType: 'random_forest' | 'svm') {
  const { runId, bundle } = getActiveModelBundle();
  if (!runId || !bundle) {
    throw new Error('MODEL NOT TRAINED – Please train a model before switching classifiers.');
  }
  updateActiveModelType(runId, modelType);
  return { active_model_type: modelType, model_version: bundle.model_version };
}

export function getDashboardPayload() {
  const stats = getDashboardStats();
  const { bundle, activeModelType } = getActiveModelBundle();

  let modelAccuracy: number | null = null;
  if (bundle) {
    const activeMetrics = activeModelType === 'svm' ? bundle.svm_metrics : bundle.rf_metrics;
    modelAccuracy = Number((activeMetrics.accuracy * 100).toFixed(2));
  }

  const latestRaw = stats.recent_analyses[0] as Record<string, unknown> | undefined;
  let latestSummary = null;
  if (latestRaw) {
    const full = getAnalysisById(String(latestRaw.id));
    if (full) {
      latestSummary = {
        id: full.id,
        filename: full.filename,
        uploaded_at: full.uploaded_at,
        channel: full.channel,
        sampling_frequency: full.sampling_frequency,
        predicted_movement: full.predicted_movement,
        confidence: full.confidence,
        model_version: full.model_version,
        model_type: full.model_type,
        status: full.status,
        windows_analyzed: full.windows_analyzed,
        processing_time_ms: full.processing_time_ms,
        reliability_warning: full.reliability_warning,
        probabilities: JSON.parse(full.probabilities_json),
      };
    }
  }

  return {
    kpis: {
      total_signals_analyzed: stats.total_signals_analyzed,
      recognized_movements: stats.recognized_movements,
      available_movement_classes: bundle ? bundle.classes.length : 4,
      movement_class_names: bundle
        ? bundle.classes
        : ['Hand Open', 'Hand Close', 'Wrist Flexion', 'Wrist Extension'],
      model_accuracy: modelAccuracy,
      model_trained: Boolean(bundle),
      model_version: bundle?.model_version ?? null,
      active_model_type: bundle ? activeModelType : null,
    },
    movement_distribution: stats.movement_distribution,
    activity_timeline: stats.activity_timeline,
    recent_analyses: stats.recent_analyses,
    latest_prediction: latestSummary,
  };
}

export function getHistoryList(query: {
  search?: string;
  movement?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const rows = listAnalyses(query);
  return rows.map((r) => ({
    id: r.id,
    upload_id: r.upload_id,
    filename: r.filename,
    uploaded_at: r.uploaded_at,
    channel: r.channel,
    sampling_frequency: r.sampling_frequency,
    predicted_movement: r.predicted_movement,
    confidence: r.confidence,
    model_version: r.model_version,
    model_type: r.model_type,
    status: r.status,
    windows_analyzed: r.windows_analyzed,
    processing_time_ms: r.processing_time_ms,
    reliability_warning: r.reliability_warning,
    signal_quality: JSON.parse(r.signal_quality_json),
    probabilities: JSON.parse(r.probabilities_json),
    feature_summary: JSON.parse(r.features_summary_json),
    preprocessing_config: JSON.parse(r.preprocessing_config_json),
  }));
}

export function getHistoryDetail(id: string) {
  const row = getAnalysisById(id);
  if (!row) return null;
  return {
    model_trained: true,
    id: row.id,
    upload_id: row.upload_id,
    filename: row.filename,
    uploaded_at: row.uploaded_at,
    channel: row.channel,
    sampling_frequency: row.sampling_frequency,
    predicted_movement: row.predicted_movement,
    confidence: row.confidence,
    model_version: row.model_version,
    model_type: row.model_type,
    status: row.status,
    windows_analyzed: row.windows_analyzed,
    processing_time_ms: row.processing_time_ms,
    reliability_warning: row.reliability_warning,
    signal_quality: JSON.parse(row.signal_quality_json),
    probabilities: JSON.parse(row.probabilities_json),
    feature_summary: JSON.parse(row.features_summary_json),
    preprocessing_config: JSON.parse(row.preprocessing_config_json),
    visualization: JSON.parse(row.visualization_json),
  };
}

export function deleteHistoryItem(id: string): boolean {
  return deleteAnalysisById(id);
}

export function exportHistoryCsv(): string {
  const rows = listAnalyses({});
  const header = [
    'Analysis ID',
    'Filename',
    'Upload Timestamp',
    'Channel',
    'Sampling Frequency (Hz)',
    'Predicted Movement',
    'Confidence (%)',
    'Model Type',
    'Model Version',
    'Windows Analyzed',
    'Processing Time (ms)',
    'Status',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.filename,
        r.uploaded_at,
        r.channel,
        r.sampling_frequency,
        r.predicted_movement,
        r.confidence,
        r.model_type,
        r.model_version,
        r.windows_analyzed,
        r.processing_time_ms,
        r.status,
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n') + '\n';
}

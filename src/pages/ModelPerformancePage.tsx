import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  Play,
  RefreshCw,
  Upload,
} from 'lucide-react';
import PlotlyChart from '../components/PlotlyChart';
import {
  fetchModelPerformance,
  getSampleDownloadUrl,
  switchActiveModel,
  trainEmgModels,
  uploadCsvFile,
} from '../services/api';
import type { EvaluationMetrics, ModelPerformanceResponse, UploadResponse } from '../types/emg';

interface ModelPerformancePageProps {
  onModelUpdated: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

export default function ModelPerformancePage({
  onModelUpdated,
  onNotify,
}: ModelPerformancePageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [perf, setPerf] = useState<ModelPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Training configuration state
  const [datasetSource, setDatasetSource] = useState<'bundled' | 'custom'>('bundled');
  const [customUpload, setCustomUpload] = useState<UploadResponse | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [signalCol, setSignalCol] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [testSplitPct, setTestSplitPct] = useState(25);
  const [nEstimators, setNEstimators] = useState(60);
  const [svmC, setSvmC] = useState(2.5);
  const [preferredModel, setPreferredModel] = useState<'random_forest' | 'svm'>('random_forest');
  const [trainError, setTrainError] = useState<string | null>(null);

  // Active inspection tab between RF and SVM
  const [inspectModel, setInspectModel] = useState<'random_forest' | 'svm'>('random_forest');

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const res = await fetchModelPerformance();
      setPerf(res);
      if (res.active_model_type) {
        setInspectModel(res.active_model_type);
      }
    } catch (err) {
      onNotify(
        'error',
        'Failed to load model metrics',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerformance();
  }, []);

  const handleUploadTrainingCsv = async (file: File) => {
    setTrainError(null);
    setUploadingCsv(true);
    try {
      const res = await uploadCsvFile(file);
      setCustomUpload(res);
      setSignalCol(res.numeric_columns[0] ?? '');
      setLabelCol(res.label_column ?? '');
      if (!res.label_column) {
        setTrainError(
          'No movement label column was auto-detected. Supervised training strictly requires a labelled column (e.g. "movement_label" or "label").'
        );
      } else {
        onNotify(
          'success',
          'Labelled dataset uploaded',
          `${res.filename} · ${res.detected_labels.length} movement class(es) detected`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse training CSV.';
      setTrainError(msg);
      onNotify('error', 'Training CSV invalid', msg);
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleTrain = async () => {
    setTrainError(null);
    if (datasetSource === 'custom') {
      if (!customUpload) {
        setTrainError('Please upload a labelled EMG training CSV file first.');
        return;
      }
      if (!labelCol) {
        setTrainError('Please select the movement label column. Unlabelled CSVs cannot be used for training.');
        return;
      }
      if (!signalCol) {
        setTrainError('Please select a numeric EMG signal channel.');
        return;
      }
    }

    setTraining(true);
    try {
      const res = await trainEmgModels({
        use_bundled_dataset: datasetSource === 'bundled',
        upload_id: datasetSource === 'custom' ? customUpload?.upload_id : undefined,
        signal_column: datasetSource === 'custom' ? signalCol : undefined,
        signal_columns:
          datasetSource === 'custom'
            ? customUpload && customUpload.numeric_columns.length > 1
              ? customUpload.numeric_columns
              : [signalCol]
            : undefined,
        label_column: datasetSource === 'custom' ? labelCol : 'movement_label',
        test_split_ratio: testSplitPct / 100,
        n_estimators: nEstimators,
        svm_c: svmC,
        preferred_model: preferredModel,
      });

      onNotify(
        'success',
        `Models trained & evaluated (${res.model_version})`,
        `Trained across ${res.classes.length} muscle actions (${res.train_windows} train / ${res.test_windows} held-out test windows) in ${res.training_time_ms} ms.`
      );
      await loadPerformance();
      onModelUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Model training failed.';
      setTrainError(msg);
      onNotify('error', 'Training failed', msg);
    } finally {
      setTraining(false);
    }
  };

  const handleSwitchActive = async (modelType: 'random_forest' | 'svm') => {
    setSwitching(true);
    try {
      await switchActiveModel(modelType);
      setInspectModel(modelType);
      await loadPerformance();
      onModelUpdated();
      onNotify(
        'info',
        'Active classifier updated',
        `Default inference model switched to ${modelType === 'svm' ? 'RBF Support Vector Machine' : 'Random Forest'}.`
      );
    } catch (err) {
      onNotify('error', 'Switch failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSwitching(false);
    }
  };

  const activeMetrics: EvaluationMetrics | null =
    perf && perf.model_trained
      ? inspectModel === 'svm'
        ? perf.svm_metrics
        : perf.rf_metrics
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Model Training & Performance Evaluation
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Supervised Random Forest and RBF Support Vector Machine training across all 12 human muscle actions with leakage-free block-stratified held-out testing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={getSampleDownloadUrl('emg_labelled_training_dataset.csv')}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            12-Action Training CSV
          </a>
          <button
            type="button"
            onClick={loadPerformance}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Training Workflow Console */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-teal-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Supervised Model Training Pipeline</h2>
              <p className="text-xs text-slate-500">
                Trains both Random Forest (baseline) and RBF SVM (comparison) using identical multi-channel DSP & 7-feature extraction
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setDatasetSource('bundled');
                setTrainError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                datasetSource === 'bundled'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Included 12-Action sEMG Dataset
            </button>
            <button
              type="button"
              onClick={() => {
                setDatasetSource('custom');
                setTrainError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                datasetSource === 'custom'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upload Labelled CSV
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 border-t border-slate-100 pt-5 lg:grid-cols-12">
          {/* Dataset Selection Details */}
          <div className="space-y-3 lg:col-span-6">
            {datasetSource === 'bundled' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-900">
                  emg_labelled_training_dataset.csv (12 Muscle Actions · 4 Channels)
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Biophysically modeled 4-channel surface EMG dataset sampled at 1000 Hz (42,000 samples) spanning <strong>Rest (Baseline)</strong>, <strong>Hand Open</strong>, <strong>Hand Close</strong>, <strong>Pinch Grip</strong>, <strong>Pointing Index</strong>, <strong>Wrist Flexion</strong>, <strong>Wrist Extension</strong>, <strong>Wrist Pronation</strong>, <strong>Wrist Supination</strong>, <strong>Radial Deviation</strong>, <strong>Ulnar Deviation</strong>, and <strong>Elbow Flexion</strong>.
                </p>
                <p className="mt-2 font-mono text-[11px] text-slate-500">
                  Channels: Flexor, Extensor, Pronator, Biceps (28 features/window) · Bandpass: 20–450 Hz · Notch: 50 Hz
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800">
                      {customUpload ? customUpload.filename : 'Select a labelled EMG training CSV'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {customUpload
                        ? `${customUpload.row_count.toLocaleString()} rows · ${customUpload.detected_labels.length} detected classes`
                        : 'Must include numeric EMG channel column and movement label column'}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadTrainingCsv(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingCsv}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingCsv ? 'Uploading...' : 'Choose CSV'}
                  </button>
                </div>

                {customUpload && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Signal Column</label>
                      <select
                        value={signalCol}
                        onChange={(e) => setSignalCol(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                      >
                        {customUpload.numeric_columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Movement Label Column</label>
                      <select
                        value={labelCol}
                        onChange={(e) => setLabelCol(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                      >
                        <option value="">-- Select label column --</option>
                        {customUpload.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hyperparameters & Trigger */}
          <div className="space-y-4 lg:col-span-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Test Split (%)</label>
                <input
                  type="number"
                  min={15}
                  max={40}
                  step={5}
                  value={testSplitPct}
                  onChange={(e) => setTestSplitPct(Number(e.target.value) || 25)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">RF Trees</label>
                <input
                  type="number"
                  min={20}
                  max={120}
                  step={10}
                  value={nEstimators}
                  onChange={(e) => setNEstimators(Number(e.target.value) || 60)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">SVM C</label>
                <input
                  type="number"
                  min={0.2}
                  max={20}
                  step={0.5}
                  value={svmC}
                  onChange={(e) => setSvmC(Number(e.target.value) || 2.5)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Default Active</label>
                <select
                  value={preferredModel}
                  onChange={(e) => setPreferredModel(e.target.value as 'random_forest' | 'svm')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="random_forest">Random Forest</option>
                  <option value="svm">RBF SVM</option>
                </select>
              </div>
            </div>

            {trainError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{trainError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={training}
              onClick={handleTrain}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#173661] disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {training ? 'Extracting Features & Training RF + SVM...' : 'Train & Evaluate Models'}
            </button>
          </div>
        </div>
      </section>

      {/* Evaluation Pending State (when untrained) */}
      {!perf?.model_trained ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="font-mono text-xs font-semibold tracking-wider text-amber-700">
            STATUS: EVALUATION PENDING
          </p>
          <h2 className="mt-2 font-display text-xl font-bold text-slate-900">
            MODEL NOT TRAINED – Please configure a labelled EMG training dataset.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Held-out accuracy, precision, recall, F1-score, and confusion matrices are never fabricated. Click <strong>Train & Evaluate Models</strong> above to train on the included 4-class labelled sEMG dataset or your own labelled CSV.
          </p>
        </section>
      ) : (
        <>
          {/* Active Classifier Switcher + Model Version Summary */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-semibold text-slate-900">
                  Evaluated Model Bundle · {perf.model_version}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Dataset: <span className="font-mono text-slate-700">{perf.dataset_name}</span> · Train Windows:{' '}
                <span className="font-mono text-slate-700">{perf.train_windows}</span> · Held-Out Test Windows:{' '}
                <span className="font-mono text-slate-700">{perf.test_windows}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setInspectModel('random_forest')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    inspectModel === 'random_forest'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Random Forest
                </button>
                <button
                  type="button"
                  onClick={() => setInspectModel('svm')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    inspectModel === 'svm'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Support Vector Machine (RBF)
                </button>
              </div>

              {perf.active_model_type !== inspectModel && (
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => handleSwitchActive(inspectModel)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {switching ? 'Switching...' : 'Set as Active Classifier'}
                </button>
              )}
              {perf.active_model_type === inspectModel && (
                <span className="text-xs font-medium text-teal-700 whitespace-nowrap">
                  Active for Inference
                </span>
              )}
            </div>
          </div>

          {/* 4 Genuine Held-Out Metric Cards */}
          {activeMetrics && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Held-Out Accuracy</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-[#0F2544] tabular-nums">
                  {(activeMetrics.accuracy * 100).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Evaluated on {activeMetrics.evaluated_samples} unseen test windows
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Macro Precision</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-teal-700 tabular-nums">
                  {(activeMetrics.macro_precision * 100).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">Mean positive predictive value</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Macro Recall</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-cyan-700 tabular-nums">
                  {(activeMetrics.macro_recall * 100).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">Mean sensitivity across classes</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Macro F1-Score</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-[#0F2544] tabular-nums">
                  {(activeMetrics.macro_f1 * 100).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Weighted F1: {(activeMetrics.weighted_f1 * 100).toFixed(2)}%
                </p>
              </div>
            </div>
          )}

          {/* Confusion Matrix + RF vs SVM Comparison */}
          {activeMetrics && perf.rf_metrics && perf.svm_metrics && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
                <h3 className="text-sm font-semibold text-slate-900">
                  Confusion Matrix — {inspectModel === 'svm' ? 'RBF SVM' : 'Random Forest'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  True movement classes (rows) vs predicted classes (columns) on held-out test split
                </p>
                <div className="mt-3">
                  <PlotlyChart
                    height={activeMetrics.classes.length > 6 ? 470 : 330}
                    data={[
                      {
                        type: 'heatmap',
                        z: activeMetrics.confusion_matrix,
                        x: activeMetrics.classes,
                        y: activeMetrics.classes,
                        colorscale: [
                          [0, '#f8fafc'],
                          [0.5, '#5eead4'],
                          [1, '#0f2544'],
                        ],
                        showscale: true,
                        hovertemplate: 'True: %{y}<br>Predicted: %{x}<br>Count: %{z}<extra></extra>',
                      },
                    ]}
                    layout={{
                      margin: {
                        t: 14,
                        r: 18,
                        b: activeMetrics.classes.length > 6 ? 112 : 64,
                        l: activeMetrics.classes.length > 6 ? 132 : 110,
                      },
                      xaxis: {
                        title: { text: 'Predicted Label' },
                        tickangle: activeMetrics.classes.length > 6 ? -35 : 0,
                        automargin: true,
                      },
                      yaxis: {
                        title: { text: 'True Label' },
                        autorange: 'reversed',
                        automargin: true,
                      },
                      annotations: activeMetrics.confusion_matrix.flatMap((row, rIdx) =>
                        row.map((val, cIdx) => {
                          const maxVal = Math.max(1, ...activeMetrics.confusion_matrix.flat());
                          return {
                            x: activeMetrics.classes[cIdx],
                            y: activeMetrics.classes[rIdx],
                            text: String(val),
                            showarrow: false,
                            font: {
                              family: 'IBM Plex Mono, monospace',
                              size: activeMetrics.classes.length > 6 ? 10 : 13,
                              color: val > maxVal * 0.55 ? '#ffffff' : '#0f172a',
                            },
                          };
                        })
                      ),
                    }}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
                <h3 className="text-sm font-semibold text-slate-900">
                  Random Forest vs RBF SVM Comparison
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Direct side-by-side comparison evaluated on the exact same held-out windows
                </p>
                <div className="mt-3">
                  <PlotlyChart
                    height={330}
                    data={[
                      {
                        type: 'bar',
                        name: 'Random Forest',
                        x: ['Accuracy', 'Macro Precision', 'Macro Recall', 'Macro F1'],
                        y: [
                          perf.rf_metrics.accuracy * 100,
                          perf.rf_metrics.macro_precision * 100,
                          perf.rf_metrics.macro_recall * 100,
                          perf.rf_metrics.macro_f1 * 100,
                        ],
                        marker: { color: '#0F2544' },
                        hovertemplate: 'Random Forest %{x}: %{y:.2f}%<extra></extra>',
                      },
                      {
                        type: 'bar',
                        name: 'RBF SVM',
                        x: ['Accuracy', 'Macro Precision', 'Macro Recall', 'Macro F1'],
                        y: [
                          perf.svm_metrics.accuracy * 100,
                          perf.svm_metrics.macro_precision * 100,
                          perf.svm_metrics.macro_recall * 100,
                          perf.svm_metrics.macro_f1 * 100,
                        ],
                        marker: { color: '#0D9488' },
                        hovertemplate: 'RBF SVM %{x}: %{y:.2f}%<extra></extra>',
                      },
                    ]}
                    layout={{
                      barmode: 'group',
                      legend: { orientation: 'h', y: 1.12, x: 0 },
                      yaxis: { title: { text: 'Score (%)' }, range: [0, 108] },
                    }}
                  />
                </div>
              </section>
            </div>
          )}

          {/* Per-Class Classification Report Table */}
          {activeMetrics && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Per-Class Classification Report ({inspectModel === 'svm' ? 'RBF SVM' : 'Random Forest'})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                      <th className="px-5 py-3">Movement Class</th>
                      <th className="px-4 py-3 text-right">Precision</th>
                      <th className="px-4 py-3 text-right">Recall</th>
                      <th className="px-4 py-3 text-right">F1-Score</th>
                      <th className="px-5 py-3 text-right">Test Support (Windows)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeMetrics.classification_report.map((row) => (
                      <tr key={row.label} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3 font-medium text-slate-900">{row.label}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {(row.precision * 100).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {(row.recall * 100).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-teal-700 tabular-nums">
                          {(row.f1_score * 100).toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-600 tabular-nums">
                          {row.support}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

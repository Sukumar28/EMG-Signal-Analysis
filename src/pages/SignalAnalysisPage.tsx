import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Play,
  Sliders,
  Upload,
} from 'lucide-react';
import {
  analyzeEmgSignal,
  fetchSamples,
  getSampleDownloadUrl,
  loadSampleDataset,
  uploadCsvFile,
} from '../services/api';
import type {
  AnalysisResult,
  NavPageId,
  PreprocessingConfig,
  SampleDatasetInfo,
  UploadResponse,
} from '../types/emg';

interface SignalAnalysisPageProps {
  modelTrained: boolean;
  activeModelType: 'random_forest' | 'svm';
  onAnalysisComplete: (result: AnalysisResult) => void;
  onNavigate: (page: NavPageId) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

const DEFAULT_CONFIG: PreprocessingConfig = {
  sampling_frequency: 1000,
  apply_bandpass: true,
  bandpass_low_hz: 20,
  bandpass_high_hz: 450,
  filter_order: 4,
  apply_notch: true,
  notch_freq_hz: 50,
  notch_q: 30,
  normalization: 'zscore',
  window_size_ms: 250,
  window_overlap_pct: 50,
};

const SAMPLE_CATEGORIES = ['All', 'Baseline', 'Hand & Fingers', 'Wrist & Forearm', 'Upper Limb'] as const;

export default function SignalAnalysisPage({
  modelTrained,
  activeModelType,
  onAnalysisComplete,
  onNavigate,
  onNotify,
}: SignalAnalysisPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<'random_forest' | 'svm'>(activeModelType);
  const [config, setConfig] = useState<PreprocessingConfig>(DEFAULT_CONFIG);
  const [samples, setSamples] = useState<SampleDatasetInfo[]>([]);
  const [sampleCategory, setSampleCategory] = useState<(typeof SAMPLE_CATEGORIES)[number]>('All');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedModel(activeModelType);
  }, [activeModelType]);

  useEffect(() => {
    fetchSamples()
      .then((res) => setSamples(res.samples))
      .catch(() => setSamples([]));
  }, []);

  const applyUploadedMetadata = (res: UploadResponse) => {
    setUploadData(res);
    setValidationError(null);
    const defaultCol = res.numeric_columns[0] ?? '';
    setSelectedColumn(defaultCol);
    setSelectedChannels(res.numeric_columns);
    if (res.inferred_sampling_frequency) {
      setConfig((prev) => ({
        ...prev,
        sampling_frequency: res.inferred_sampling_frequency!,
        bandpass_high_hz: Math.min(prev.bandpass_high_hz, Math.floor(res.inferred_sampling_frequency! * 0.45)),
      }));
    }
  };

  const toggleChannel = (col: string) => {
    setSelectedChannels((prev) => {
      const exists = prev.includes(col);
      if (exists && prev.length === 1) return prev; // keep at least 1 channel
      const next = exists ? prev.filter((c) => c !== col) : [...prev, col];
      if (!next.includes(selectedColumn)) {
        setSelectedColumn(next[0]);
      }
      return next;
    });
  };

  const handleFileSelected = async (file: File) => {
    setValidationError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      const msg = 'Invalid file format. Only .csv EMG recordings are accepted.';
      setValidationError(msg);
      onNotify('error', 'Invalid file type', msg);
      return;
    }
    if (file.size === 0) {
      const msg = 'The selected CSV file is empty (0 bytes).';
      setValidationError(msg);
      onNotify('error', 'Empty file', msg);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      const msg = 'File exceeds maximum 25 MB limit.';
      setValidationError(msg);
      onNotify('error', 'File too large', msg);
      return;
    }

    setUploading(true);
    try {
      const res = await uploadCsvFile(file);
      applyUploadedMetadata(res);
      onNotify(
        'success',
        'CSV validated and stored',
        `${res.filename} · ${res.row_count.toLocaleString()} samples · ${res.numeric_columns.length} numeric channel(s)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to validate uploaded CSV.';
      setValidationError(msg);
      onNotify('error', 'CSV validation failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleLoadSample = async (filename: string) => {
    setUploading(true);
    setValidationError(null);
    try {
      const res = await loadSampleDataset(filename);
      applyUploadedMetadata(res);
      onNotify('info', 'Sample recording loaded', `${res.filename} (${res.numeric_columns.length} channels) ready for analysis.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load sample file.';
      setValidationError(msg);
      onNotify('error', 'Sample load error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!uploadData) {
      setValidationError('Please upload or load an EMG CSV recording first.');
      return;
    }
    if (!selectedColumn) {
      setValidationError('Please select a numeric EMG signal column.');
      return;
    }

    const nyquist = config.sampling_frequency / 2;
    if (config.sampling_frequency < 50 || config.sampling_frequency > 20000) {
      setValidationError('Sampling frequency must be between 50 Hz and 20,000 Hz.');
      return;
    }
    if (config.apply_bandpass && (config.bandpass_low_hz <= 0 || config.bandpass_low_hz >= config.bandpass_high_hz)) {
      setValidationError('Bandpass low cutoff must be > 0 Hz and strictly less than high cutoff.');
      return;
    }
    if (config.apply_bandpass && config.bandpass_high_hz >= nyquist) {
      setValidationError(
        `Bandpass high cutoff (${config.bandpass_high_hz} Hz) must be below Nyquist frequency (${nyquist} Hz).`
      );
      return;
    }

    setValidationError(null);
    setAnalyzing(true);
    try {
      const result = await analyzeEmgSignal({
        upload_id: uploadData.upload_id,
        signal_column: selectedColumn,
        signal_columns: selectedChannels.length > 0 ? selectedChannels : [selectedColumn],
        model_type: selectedModel,
        preprocessing: config,
      });

      onAnalysisComplete(result);
      if (!result.model_trained) {
        onNotify(
          'warning',
          'Signal processed — Model not trained',
          result.message || 'MODEL NOT TRAINED – Please configure a labelled EMG training dataset.'
        );
      } else {
        onNotify(
          'success',
          `Predicted: ${result.predicted_movement}`,
          `Confidence ${result.confidence?.toFixed(1)}% across ${result.windows_analyzed} windows (${result.processing_time_ms} ms)`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signal analysis failed.';
      setValidationError(msg);
      onNotify('error', 'Analysis error', msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const inferenceSamples = samples.filter((s) => s.type === 'inference');
  const filteredSamples =
    sampleCategory === 'All'
      ? inferenceSamples
      : inferenceSamples.filter((s) => s.category === sampleCategory);
  const trainingSamples = samples.filter((s) => s.type === 'training');

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
          EMG Signal Upload & Processing
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload single or multi-channel sEMG CSV recordings, configure digital filtering and windowing, extract 7 time-domain features per channel, and classify across all 12 muscle actions.
        </p>
      </div>

      {!modelTrained && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                MODEL NOT TRAINED – Please configure a labelled EMG training dataset.
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
                Train the classifier on the 12-action labelled sEMG dataset or upload your own labelled training CSV before running predictions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('performance')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-950 whitespace-nowrap shrink-0"
          >
            Go to Model Training
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: CSV Dropzone + All 12 Muscle Action Sample Recordings */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">1. Upload EMG CSV File</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Supports single or 4-channel anatomical sEMG CSV files with optional timestamps and labels (max 25 MB). Original CSV is preserved untouched.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
                dragActive
                  ? 'border-teal-500 bg-teal-50/50'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
              }`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0F2544]/10 text-[#0F2544]">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">
                {uploading ? 'Validating CSV structure...' : 'Drag and drop an EMG CSV file here'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Numeric amplitude columns required · Comma-separated (.csv)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-lg bg-[#0F2544] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#173661] disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Browse CSV Files'}
              </button>
            </div>

            {validationError && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{validationError}</span>
              </div>
            )}

            {uploadData && (
              <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    <span className="font-mono">{uploadData.filename}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
                    <span>{uploadData.row_count.toLocaleString()} rows</span>
                    <span aria-hidden="true">·</span>
                    <span>{(uploadData.file_size_bytes / 1024).toFixed(1)} KB</span>
                    <span aria-hidden="true">·</span>
                    <span>{uploadData.numeric_columns.length} numeric ch</span>
                    {uploadData.inferred_sampling_frequency && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Inferred {uploadData.inferred_sampling_frequency} Hz</span>
                      </>
                    )}
                  </div>
                </div>

                {uploadData.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {uploadData.warnings.join(' ')}
                  </div>
                )}

                {/* Multi-Channel Selection Checkboxes */}
                {uploadData.numeric_columns.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        Active EMG Channels for ML Feature Vector ({selectedChannels.length} selected)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedChannels(uploadData.numeric_columns)}
                        className="text-[11px] font-medium text-teal-700 hover:text-teal-900"
                      >
                        Select all
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {uploadData.numeric_columns.map((col) => {
                        const checked = selectedChannels.includes(col);
                        return (
                          <label
                            key={col}
                            className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                              checked
                                ? 'border-teal-300 bg-teal-50/50 text-slate-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate font-mono">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleChannel(col)}
                                className="h-3.5 w-3.5 accent-teal-600"
                              />
                              <span className="truncate">{col}</span>
                            </span>
                            <span className="ml-2 shrink-0 font-mono text-[10px] text-slate-400">
                              NaN:{uploadData.missing_summary[col] ?? 0}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="signal-col-select" className="block text-xs font-medium text-slate-700">
                      Primary Waveform Visualization Channel
                    </label>
                    <select
                      id="signal-col-select"
                      value={selectedColumn}
                      onChange={(e) => setSelectedColumn(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                    >
                      {uploadData.numeric_columns.map((col) => (
                        <option key={col} value={col}>
                          {col} (missing: {uploadData.missing_summary[col] ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="classifier-select" className="block text-xs font-medium text-slate-700">
                      Classification Model
                    </label>
                    <select
                      id="classifier-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value as 'random_forest' | 'svm')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                    >
                      <option value="random_forest">Random Forest (Baseline)</option>
                      <option value="svm">Support Vector Machine (RBF Kernel)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* All 12 Muscle Action Sample Recordings */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Sample EMG Recordings — All 12 Muscle Actions
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  4-channel anatomical sEMG test CSVs across baseline, hand/finger, wrist/forearm, and upper-limb actions
                </p>
              </div>
              {trainingSamples[0] && (
                <a
                  href={getSampleDownloadUrl(trainingSamples[0].filename)}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  12-Action Training CSV
                </a>
              )}
            </div>

            {/* Category Filter Tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {SAMPLE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSampleCategory(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    sampleCategory === cat
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'All' ? `All (${inferenceSamples.length})` : cat}
                </button>
              ))}
            </div>

            <div className="mt-3 max-h-[390px] divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 pr-1">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.filename}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal-600" />
                      <span className="text-xs font-semibold text-slate-900">
                        {sample.muscle_action ?? sample.title}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {sample.filename} · {sample.channels ?? 4} ch · {sample.sampling_frequency} Hz
                      </span>
                    </div>
                    <p className="mt-0.5 pl-6 text-xs text-slate-500">
                      {sample.primary_muscles ? `${sample.primary_muscles} — ` : ''}
                      {sample.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pl-6 sm:pl-0 shrink-0">
                    <a
                      href={getSampleDownloadUrl(sample.filename)}
                      download
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => handleLoadSample(sample.filename)}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Biomedical Signal Processing Configuration */}
        <div className="lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-teal-600" />
              <h2 className="text-base font-semibold text-slate-900">2. Signal Processing Parameters</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Zero-phase digital Butterworth bandpass, power-line notch filter, normalization, and sliding window segmentation.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="fs-input" className="block text-xs font-medium text-slate-700">
                  Sampling Frequency (Hz)
                </label>
                <input
                  id="fs-input"
                  type="number"
                  min={50}
                  max={20000}
                  step={50}
                  value={config.sampling_frequency}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, sampling_frequency: Number(e.target.value) || 1000 }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Nyquist limit: <span className="font-mono">{(config.sampling_frequency / 2).toFixed(0)} Hz</span>
                </p>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="flex items-center justify-between text-xs font-medium text-slate-800">
                  <span>Bandpass Butterworth Filter</span>
                  <input
                    type="checkbox"
                    checked={config.apply_bandpass}
                    onChange={(e) => setConfig((c) => ({ ...c, apply_bandpass: e.target.checked }))}
                    className="h-4 w-4 accent-teal-600"
                  />
                </label>
                {config.apply_bandpass && (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500">Low Cut (Hz)</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={config.bandpass_low_hz}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, bandpass_low_hz: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">High Cut (Hz)</label>
                      <input
                        type="number"
                        min={20}
                        max={5000}
                        value={config.bandpass_high_hz}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, bandpass_high_hz: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">Order</label>
                      <select
                        value={config.filter_order}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, filter_order: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                      >
                        <option value={2}>2nd</option>
                        <option value={4}>4th</option>
                        <option value={6}>6th</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="flex items-center justify-between text-xs font-medium text-slate-800">
                  <span>Power-Line Notch Filter</span>
                  <input
                    type="checkbox"
                    checked={config.apply_notch}
                    onChange={(e) => setConfig((c) => ({ ...c, apply_notch: e.target.checked }))}
                    className="h-4 w-4 accent-teal-600"
                  />
                </label>
                {config.apply_notch && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500">Mains Frequency</label>
                      <select
                        value={config.notch_freq_hz}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, notch_freq_hz: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                      >
                        <option value={50}>50 Hz (EU / Asia)</option>
                        <option value={60}>60 Hz (Americas)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">Quality Factor (Q)</label>
                      <input
                        type="number"
                        min={5}
                        max={80}
                        value={config.notch_q}
                        onChange={(e) => setConfig((c) => ({ ...c, notch_q: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Signal Normalization</label>
                  <select
                    value={config.normalization}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        normalization: e.target.value as 'zscore' | 'minmax' | 'none',
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="zscore">Z-Score Standardization (μ=0, σ=1)</option>
                    <option value="minmax">Min-Max Scaling ([-1, +1])</option>
                    <option value="none">None (Raw Filtered mV)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500">Window Length (ms)</label>
                    <input
                      type="number"
                      min={50}
                      max={2000}
                      step={25}
                      value={config.window_size_ms}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, window_size_ms: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Overlap (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={85}
                      step={5}
                      value={config.window_overlap_pct}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, window_overlap_pct: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={!uploadData || analyzing}
                  onClick={handleRunAnalysis}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#173661] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  {analyzing ? 'Processing Signal & Classifying...' : 'Run Signal Analysis & Recognition'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Live CSV Data Preview Table */}
      {uploadData && uploadData.preview_rows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">
              CSV Data Preview — First {uploadData.preview_rows.length} Samples
            </h2>
            <p className="text-xs text-slate-500">
              Original uploaded tabular data prior to filtering or missing-value imputation
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-2.5">#</th>
                  {uploadData.columns.map((col) => (
                    <th
                      key={col}
                      className={`px-4 py-2.5 ${
                        selectedChannels.includes(col) ? 'bg-teal-50/70 font-semibold text-teal-900' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uploadData.preview_rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                    {uploadData.columns.map((col) => (
                      <td
                        key={col}
                        className={`px-4 py-2 tabular-nums ${
                          selectedChannels.includes(col)
                            ? 'bg-teal-50/30 font-medium text-slate-900'
                            : 'text-slate-700'
                        }`}
                      >
                        {row[col] === '' ? <span className="text-amber-600">NaN</span> : row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

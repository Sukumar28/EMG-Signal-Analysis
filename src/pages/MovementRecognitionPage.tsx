import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Upload,
  Waves,
} from 'lucide-react';
import PlotlyChart from '../components/PlotlyChart';
import VirtualHandVisualizer from '../components/VirtualHandVisualizer';
import type { AnalysisResult, NavPageId } from '../types/emg';

interface MovementRecognitionPageProps {
  analysis: AnalysisResult | null;
  onNavigate: (page: NavPageId) => void;
}

export default function MovementRecognitionPage({
  analysis,
  onNavigate,
}: MovementRecognitionPageProps) {
  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Movement Recognition Results
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Predicted human hand/wrist movement, class probabilities, virtual hand animation, and extracted EMG features.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-slate-900">No active classification result</p>
          <p className="mt-1.5 max-w-md text-sm text-slate-500">
            Upload an EMG CSV recording in Signal Analysis (or select a historical record in Analysis History) to inspect movement recognition outputs.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('analysis')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-sm font-medium text-white hover:bg-[#173661]"
          >
            <Upload className="h-4 w-4" />
            Upload & Analyze EMG CSV
          </button>
        </div>
      </div>
    );
  }

  // Case where DSP ran but model is NOT trained
  if (!analysis.model_trained) {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Movement Recognition Results
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Signal preprocessed from <span className="font-mono text-slate-800">{analysis.filename}</span>
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-base font-bold text-amber-950">
                MODEL NOT TRAINED – Please configure a labelled EMG training dataset.
              </h2>
              <p className="mt-1.5 text-sm text-amber-900">
                Signal filtering, windowing ({analysis.windows_analyzed} windows), and 7 time-domain EMG features completed successfully, but classification cannot execute without a trained supervised model.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('performance')}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-2 text-xs font-medium text-white hover:bg-amber-950"
                >
                  Train Classifier Now
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('visualization')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100/50"
                >
                  <Waves className="h-3.5 w-3.5" />
                  Inspect Preprocessed Waveforms
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const probabilities = analysis.probabilities ?? [];
  const unreliable = Boolean(analysis.reliability_warning);
  const predictedLabel = (analysis.predicted_movement ?? 'Unknown').toUpperCase();

  const handleDownloadReport = () => {
    const reportObj = {
      analysis_id: analysis.id,
      filename: analysis.filename,
      timestamp: analysis.uploaded_at,
      channel: analysis.channel,
      sampling_frequency_hz: analysis.sampling_frequency,
      predicted_movement: analysis.predicted_movement,
      confidence_pct: analysis.confidence,
      reliability_warning: analysis.reliability_warning ?? null,
      model_type: analysis.model_type,
      model_version: analysis.model_version,
      windows_analyzed: analysis.windows_analyzed,
      processing_time_ms: analysis.processing_time_ms,
      probabilities: analysis.probabilities,
      signal_quality: analysis.signal_quality,
      feature_summary: analysis.feature_summary,
      preprocessing_config: analysis.preprocessing_config,
    };
    const blob = new Blob([JSON.stringify(reportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emg_report_${analysis.id ?? 'result'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const featureRows = [
    { key: 'mav', name: 'Mean Absolute Value (MAV)', unit: 'mV', stat: analysis.feature_summary.mav },
    { key: 'rms', name: 'Root Mean Square (RMS)', unit: 'mV', stat: analysis.feature_summary.rms },
    { key: 'wl', name: 'Waveform Length (WL)', unit: 'mV', stat: analysis.feature_summary.wl },
    { key: 'zc', name: 'Zero Crossings (ZC)', unit: 'count', stat: analysis.feature_summary.zc },
    { key: 'ssc', name: 'Slope Sign Changes (SSC)', unit: 'count', stat: analysis.feature_summary.ssc },
    { key: 'variance', name: 'Signal Variance (VAR)', unit: 'mV²', stat: analysis.feature_summary.variance },
    { key: 'iemg', name: 'Integrated EMG (IEMG)', unit: 'mV', stat: analysis.feature_summary.iemg },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Movement Recognition Results
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono text-slate-700">{analysis.filename}</span>
            <span aria-hidden="true">·</span>
            <span>Channel {analysis.channel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{analysis.sampling_frequency} Hz</span>
            <span aria-hidden="true">·</span>
            <span>{analysis.model_type === 'svm' ? 'RBF SVM' : 'Random Forest'} {analysis.model_version}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('visualization')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Waves className="h-3.5 w-3.5 text-cyan-600" />
            Signal Visualization
          </button>
          <button
            type="button"
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-xs font-medium text-white hover:bg-[#173661] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Download Results
          </button>
        </div>
      </div>

      {/* Out-of-Distribution / Low-Confidence Guard Banner */}
      {analysis.reliability_warning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">Unreliable / Out-of-Distribution Signal Warning</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              {analysis.reliability_warning}
            </p>
          </div>
        </div>
      )}

      {/* Primary Result Card + Animated Virtual Hand Visualization */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left: Primary Movement Result Banner & Probability Distribution */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-[#0F2544] p-6 text-white">
            <p className="text-xs font-medium tracking-wide text-teal-300">
              {unreliable ? 'TENTATIVE PREDICTION (LOW RELIABILITY)' : 'PREDICTED MOVEMENT'}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              PREDICTED MOVEMENT: {predictedLabel}
            </h2>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/15 pt-5 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-slate-300">Confidence</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-teal-300 tabular-nums">
                  {analysis.confidence?.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-300">Windows Analyzed</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                  {analysis.windows_analyzed}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-300">Processing Time</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                  {analysis.processing_time_ms.toFixed(1)}
                  <span className="ml-1 text-xs text-slate-300">ms</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-300">Model Version</p>
                <p className="mt-1 font-mono text-lg font-semibold text-cyan-200">
                  {analysis.model_version}
                </p>
              </div>
            </div>
          </section>

          {/* Class Probability Distribution Plotly Chart */}
          <section className="flex-1 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">Class Probability Distribution</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Mean posterior probabilities aggregated across all {analysis.windows_analyzed} segmented EMG windows
            </p>
            <div className="mt-3">
              <PlotlyChart
                height={Math.max(240, Math.min(390, probabilities.length * 26 + 56))}
                data={[
                  {
                    type: 'bar',
                    orientation: 'h',
                    y: [...probabilities].reverse().map((p) => p.movement),
                    x: [...probabilities].reverse().map((p) => p.probability),
                    marker: {
                      color: [...probabilities]
                        .reverse()
                        .map((p) =>
                          p.movement === analysis.predicted_movement
                            ? unreliable
                              ? '#d97706'
                              : '#0d9488'
                            : '#94a3b8'
                        ),
                    },
                    text: [...probabilities].reverse().map((p) => `${p.probability.toFixed(1)}%`),
                    textposition: 'outside',
                    hovertemplate: '<b>%{y}</b><br>Probability: %{x:.2f}%<extra></extra>',
                  },
                ]}
                layout={{
                  margin: { t: 8, r: 52, b: 36, l: 132 },
                  xaxis: { title: { text: 'Probability (%)' }, range: [0, 114] },
                  yaxis: { automargin: true },
                }}
              />
            </div>
          </section>
        </div>

        {/* Right: Animated Virtual Hand Visualization */}
        <div className="lg:col-span-5">
          <VirtualHandVisualizer
            movement={analysis.predicted_movement ?? 'Hand Open'}
            confidence={analysis.confidence}
            unreliable={unreliable}
          />
        </div>
      </div>

      {/* Signal Quality + Extracted Feature Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Signal Quality Indicator */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Signal Quality Indicator</h3>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                analysis.signal_quality.overall_grade === 'Good'
                  ? 'text-teal-700'
                  : analysis.signal_quality.overall_grade === 'Fair'
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}
            >
              {analysis.signal_quality.overall_grade === 'Good' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {analysis.signal_quality.overall_grade}
            </span>
          </div>

          <dl className="mt-4 divide-y divide-slate-100 text-xs">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Estimated Pre-Filter SNR</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {analysis.signal_quality.snr_db.toFixed(2)} dB
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Recording Duration</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {analysis.signal_quality.duration_seconds.toFixed(3)} s ({analysis.signal_quality.sample_count.toLocaleString()} pts)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Missing Values Imputed</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {analysis.signal_quality.missing_count} ({analysis.signal_quality.missing_ratio_pct}%)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Near-Rail Clipping</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {analysis.signal_quality.clipped_ratio_pct}%
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Baseline DC Offset</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {analysis.signal_quality.baseline_offset.toFixed(5)} mV
              </dd>
            </div>
          </dl>

          <div className="mt-3 border-t border-slate-100 pt-3">
            {analysis.signal_quality.notes.map((note, idx) => (
              <p key={idx} className="text-xs leading-relaxed text-slate-600">
                {note}
              </p>
            ))}
          </div>
        </section>

        {/* Extracted 7-Feature Biomedical Summary */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Extracted EMG Feature Summary</h3>
              <p className="text-xs text-slate-500">
                Aggregate time-domain statistics computed across {analysis.windows_analyzed} segmented windows
              </p>
            </div>
            <Activity className="h-4 w-4 text-teal-600" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                  <th className="px-5 py-2.5">Biomedical Feature</th>
                  <th className="px-4 py-2.5 text-right">Mean</th>
                  <th className="px-4 py-2.5 text-right">Std Dev</th>
                  <th className="px-4 py-2.5 text-right">Min</th>
                  <th className="px-5 py-2.5 text-right">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featureRows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50/70">
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      {row.name}{' '}
                      <span className="font-mono text-[11px] font-normal text-slate-400">
                        ({row.unit})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-900 tabular-nums">
                      {row.stat.mean.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600 tabular-nums">
                      {row.stat.std.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600 tabular-nums">
                      {row.stat.min.toFixed(4)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600 tabular-nums">
                      {row.stat.max.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

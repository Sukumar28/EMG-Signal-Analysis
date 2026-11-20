import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import PlotlyChart from '../components/PlotlyChart';
import type { AnalysisResult, NavPageId } from '../types/emg';

interface SignalVisualizationPageProps {
  analysis: AnalysisResult | null;
  onNavigate: (page: NavPageId) => void;
}

type FeatureKey = 'mav' | 'rms' | 'wl' | 'zc' | 'ssc' | 'variance' | 'iemg';

const FEATURE_META: Record<FeatureKey, { label: string; unit: string; color: string }> = {
  mav: { label: 'Mean Absolute Value (MAV)', unit: 'mV', color: '#0F2544' },
  rms: { label: 'Root Mean Square (RMS)', unit: 'mV', color: '#0D9488' },
  wl: { label: 'Waveform Length (WL)', unit: 'mV', color: '#0891B2' },
  zc: { label: 'Zero Crossings (ZC)', unit: 'count', color: '#2563EB' },
  ssc: { label: 'Slope Sign Changes (SSC)', unit: 'count', color: '#0F766E' },
  variance: { label: 'Signal Variance', unit: 'mV²', color: '#475569' },
  iemg: { label: 'Integrated EMG (IEMG)', unit: 'mV', color: '#0369A1' },
};

export default function SignalVisualizationPage({
  analysis,
  onNavigate,
}: SignalVisualizationPageProps) {
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey>('rms');
  const [overlayOriginal, setOverlayOriginal] = useState(true);

  const windowShapes = useMemo(() => {
    if (!analysis?.visualization.windows) return [];
    // Show up to 24 alternating window segments cleanly without visual clutter
    return analysis.visualization.windows.slice(0, 24).map((w, idx) => ({
      type: 'rect' as const,
      xref: 'x' as const,
      yref: 'paper' as const,
      x0: w.start_time_s,
      x1: w.end_time_s,
      y0: 0,
      y1: 1,
      fillcolor: idx % 2 === 0 ? 'rgba(13, 148, 136, 0.08)' : 'rgba(8, 145, 178, 0.04)',
      line: { color: 'rgba(15, 37, 68, 0.25)', width: 1, dash: 'dot' as const },
    }));
  }, [analysis]);

  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Interactive Signal Visualization
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Interactive Plotly time-series waveforms, bandpass/notch filtering comparison, window segmentation, feature trajectories, and amplitude distribution.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-slate-900">No waveform data loaded</p>
          <p className="mt-1.5 max-w-md text-sm text-slate-500">
            Analyze an EMG CSV file or open a previous record from Analysis History to explore interactive Plotly charts.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('analysis')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-sm font-medium text-white hover:bg-[#173661]"
          >
            <Upload className="h-4 w-4" />
            Go to Signal Analysis
          </button>
        </div>
      </div>
    );
  }

  const viz = analysis.visualization;
  const cfg = analysis.preprocessing_config;
  const featureMeta = FEATURE_META[selectedFeature];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Interactive Signal Visualization
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono text-slate-800">{analysis.filename}</span>
            <span aria-hidden="true">·</span>
            <span>Channel {analysis.channel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{cfg.sampling_frequency} Hz</span>
            <span aria-hidden="true">·</span>
            <span>
              Bandpass {cfg.apply_bandpass ? `${cfg.bandpass_low_hz}-${cfg.bandpass_high_hz} Hz` : 'Off'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Notch {cfg.apply_notch ? `${cfg.notch_freq_hz} Hz` : 'Off'}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Drag to zoom · Double-click to reset · Hover for exact timestamps
        </p>
      </div>

      {/* 1. Original EMG Waveform */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">1. Original Raw EMG Waveform</h2>
            <p className="text-xs text-slate-500">
              Unfiltered surface EMG recording including baseline DC offset and power-line interference
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">
            Duration: {analysis.signal_quality.duration_seconds} s
          </span>
        </div>
        <PlotlyChart
          height={290}
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              name: 'Original EMG',
              x: viz.time_raw,
              y: viz.raw_signal,
              line: { color: '#64748b', width: 1.2 },
              hovertemplate: 'Time: %{x:.4f} s<br>Raw: %{y:.4f} mV<extra></extra>',
            },
          ]}
          layout={{
            xaxis: { title: { text: 'Time (seconds)' } },
            yaxis: { title: { text: 'Amplitude (mV)' } },
          }}
        />
      </section>

      {/* 2. Filtered EMG Waveform (with Raw vs Filtered Toggle) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">2. Filtered EMG Waveform</h2>
            <p className="text-xs text-slate-500">
              Zero-phase Butterworth bandpass + IIR notch filtered signal clearly differentiated from raw input
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={overlayOriginal}
              onChange={(e) => setOverlayOriginal(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-600"
            />
            Overlay original signal
          </label>
        </div>
        <PlotlyChart
          height={300}
          data={[
            ...(overlayOriginal
              ? [
                  {
                    type: 'scatter' as const,
                    mode: 'lines' as const,
                    name: 'Original (Raw)',
                    x: viz.time_raw,
                    y: viz.raw_signal,
                    line: { color: 'rgba(148, 163, 184, 0.55)', width: 1 },
                    hovertemplate: 'Time: %{x:.4f} s<br>Raw: %{y:.4f} mV<extra></extra>',
                  },
                ]
              : []),
            {
              type: 'scatter',
              mode: 'lines',
              name: 'Filtered EMG',
              x: viz.time_filtered,
              y: viz.filtered_signal,
              line: { color: '#0D9488', width: 1.4 },
              hovertemplate: 'Time: %{x:.4f} s<br>Filtered: %{y:.4f} mV<extra></extra>',
            },
          ]}
          layout={{
            legend: { orientation: 'h', y: 1.12, x: 0 },
            xaxis: { title: { text: 'Time (seconds)' } },
            yaxis: { title: { text: 'Filtered Amplitude (mV)' } },
          }}
        />
      </section>

      {/* 3 & 4 Side-by-Side: Normalized Signal + Window Segmentation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">3. Normalized EMG Signal</h2>
            <p className="text-xs text-slate-500">
              Mode: {cfg.normalization === 'zscore' ? 'Z-Score (μ=0, σ=1)' : cfg.normalization === 'minmax' ? 'Min-Max ([-1, +1])' : 'Unnormalized'}
            </p>
          </div>
          <PlotlyChart
            height={280}
            data={[
              {
                type: 'scatter',
                mode: 'lines',
                name: 'Normalized',
                x: viz.time_normalized,
                y: viz.normalized_signal,
                line: { color: '#0891B2', width: 1.25 },
                hovertemplate: 'Time: %{x:.4f} s<br>Value: %{y:.4f}<extra></extra>',
              },
            ]}
            layout={{
              xaxis: { title: { text: 'Time (seconds)' } },
              yaxis: { title: { text: 'Normalized Units' } },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">4. Window Segmentation</h2>
            <p className="text-xs text-slate-500">
              {viz.windows.length} sliding windows ({cfg.window_size_ms} ms · {cfg.window_overlap_pct}% overlap)
            </p>
          </div>
          <PlotlyChart
            height={280}
            data={[
              {
                type: 'scatter',
                mode: 'lines',
                name: 'Filtered EMG',
                x: viz.time_filtered,
                y: viz.filtered_signal,
                line: { color: '#0F2544', width: 1.2 },
                hovertemplate: 'Time: %{x:.4f} s<br>Filtered: %{y:.4f} mV<extra></extra>',
              },
            ]}
            layout={{
              shapes: windowShapes,
              xaxis: { title: { text: 'Time (seconds)' } },
              yaxis: { title: { text: 'Amplitude (mV)' } },
            }}
          />
        </section>
      </div>

      {/* 5 & 6 Side-by-Side: Window Feature Comparison + Signal Amplitude Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">5. Feature Comparison Across Windows</h2>
              <p className="text-xs text-slate-500">{featureMeta.label}</p>
            </div>
            <select
              aria-label="Select EMG feature to plot"
              value={selectedFeature}
              onChange={(e) => setSelectedFeature(e.target.value as FeatureKey)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {(Object.keys(FEATURE_META) as FeatureKey[]).map((k) => (
                <option key={k} value={k}>
                  {k.toUpperCase()} — {FEATURE_META[k].label}
                </option>
              ))}
            </select>
          </div>
          <PlotlyChart
            height={280}
            data={[
              {
                type: 'bar',
                x: viz.windows.map((w) => `W${w.window_index + 1}`),
                y: viz.windows.map((w) => w[selectedFeature]),
                marker: { color: featureMeta.color },
                hovertemplate: `Window %{x}<br>${selectedFeature.toUpperCase()}: %{y:.4f} ${featureMeta.unit}<extra></extra>`,
              },
            ]}
            layout={{
              xaxis: { title: { text: 'Segmented Window Index' } },
              yaxis: { title: { text: `${selectedFeature.toUpperCase()} (${featureMeta.unit})` } },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">6. Signal Amplitude Distribution</h2>
            <p className="text-xs text-slate-500">
              Histogram of filtered EMG sample amplitudes (verifying zero-mean symmetry and envelope spread)
            </p>
          </div>
          <PlotlyChart
            height={280}
            data={[
              {
                type: 'histogram',
                x: viz.amplitude_samples,
                nbinsx: 42,
                marker: {
                  color: 'rgba(13, 148, 136, 0.78)',
                  line: { color: '#0F2544', width: 0.6 },
                },
                hovertemplate: 'Amplitude Bin: %{x:.3f} mV<br>Samples: %{y}<extra></extra>',
              },
            ]}
            layout={{
              xaxis: { title: { text: 'Filtered Amplitude (mV)' } },
              yaxis: { title: { text: 'Sample Frequency' } },
            }}
          />
        </section>
      </div>
    </div>
  );
}

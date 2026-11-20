import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Hand,
  RefreshCw,
  Upload,
} from 'lucide-react';
import PlotlyChart from '../components/PlotlyChart';
import { fetchDashboard, fetchHistoryDetail } from '../services/api';
import type { AnalysisResult, DashboardResponse, NavPageId } from '../types/emg';

interface DashboardPageProps {
  onNavigate: (page: NavPageId) => void;
  onSelectAnalysis: (analysis: AnalysisResult, targetPage?: NavPageId) => void;
  onError: (title: string, msg?: string) => void;
  refreshToken: number;
}

export default function DashboardPage({
  onNavigate,
  onSelectAnalysis,
  onError,
  refreshToken,
}: DashboardPageProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchDashboard();
      setData(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard metrics.';
      setErrorMsg(message);
      onError('Dashboard unavailable', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshToken]);

  const handleOpenRecord = async (id: string, target: NavPageId = 'recognition') => {
    setLoadingId(id);
    try {
      const res = await fetchHistoryDetail(id);
      onSelectAnalysis(res.analysis, target);
    } catch (err) {
      onError('Failed to open record', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">Unable to load dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">{errorMsg}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-sm font-medium text-white hover:bg-[#173661]"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const kpis = data!.kpis;
  const dist = data!.movement_distribution;
  const activity = data!.activity_timeline;
  const recent = data!.recent_analyses;
  const latest = data!.latest_prediction;

  return (
    <div className="space-y-6">
      {/* Page Header & Quick Actions */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Biomedical Research Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Surface Electromyography signal processing, feature extraction, and supervised human movement classification.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => onNavigate('performance')}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2 text-sm font-medium text-teal-800 transition-colors hover:bg-teal-100/80 whitespace-nowrap"
          >
            <Cpu className="h-4 w-4" />
            {kpis.model_trained ? 'Model Evaluation' : 'Train Model'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('analysis')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#173661] whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            Quick CSV Upload
          </button>
        </div>
      </div>

      {/* Explicit Untrained Model Banner (never hides untrained state) */}
      {!kpis.model_trained && (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">
                MODEL NOT TRAINED – Please configure a labelled EMG training dataset.
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                No fabricated metrics or mock classifiers are loaded. Train Random Forest and SVM models on a labelled EMG dataset (or use the included 4-class reference sEMG dataset) before running movement inference.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('performance')}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-950 whitespace-nowrap shrink-0"
          >
            Configure & Train Model
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4 KPI Strip — Strictly Computed From Actual SQLite & Held-Out Model Data */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Signals Analyzed</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-[#0F2544] tabular-nums">
            {kpis.total_signals_analyzed}
          </p>
          <p className="mt-2 text-xs text-slate-500">Persisted SQLite analysis sessions</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Recognized Movements</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-teal-700 tabular-nums">
            {kpis.recognized_movements}
          </p>
          <p className="mt-2 text-xs text-slate-500">High-reliability completed classifications</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Available Movement Classes</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-[#0F2544] tabular-nums">
            {kpis.available_movement_classes}
          </p>
          <p className="mt-2 truncate text-xs text-slate-500" title={kpis.movement_class_names.join(' · ')}>
            {kpis.movement_class_names.join(' · ')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Held-Out Model Accuracy</p>
          {kpis.model_accuracy !== null ? (
            <>
              <p className="mt-2 font-mono text-3xl font-semibold text-cyan-700 tabular-nums">
                {kpis.model_accuracy.toFixed(1)}
                <span className="ml-1 text-base font-normal text-slate-400">%</span>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {kpis.active_model_type === 'svm' ? 'RBF SVM' : 'Random Forest'} · {kpis.model_version}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-xl font-semibold text-slate-400">
                Evaluation Pending
              </p>
              <p className="mt-2 text-xs text-slate-500">Train on labelled EMG dataset</p>
            </>
          )}
        </div>
      </div>

      {/* Latest Prediction Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Latest Prediction Summary</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Most recent EMG classification persisted in local SQLite storage
            </p>
          </div>
          {latest && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loadingId === latest.id}
                onClick={() => handleOpenRecord(latest.id, 'recognition')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Hand className="h-3.5 w-3.5 text-teal-600" />
                View Recognition
              </button>
              <button
                type="button"
                disabled={loadingId === latest.id}
                onClick={() => handleOpenRecord(latest.id, 'visualization')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
              >
                <Activity className="h-3.5 w-3.5" />
                Inspect Waveforms
              </button>
            </div>
          )}
        </div>

        {latest ? (
          <div className="mt-5 grid grid-cols-1 gap-6 border-t border-slate-100 pt-5 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-medium text-slate-500">Predicted Movement</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#0F2544]">
                {latest.predicted_movement}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-slate-700">{latest.filename}</span>
                <span aria-hidden="true">·</span>
                <span>Channel {latest.channel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{latest.sampling_frequency} Hz</span>
              </div>
              {latest.reliability_warning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {latest.reliability_warning}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 lg:col-span-4">
              <div>
                <p className="text-xs text-slate-500">Confidence</p>
                <p className="mt-1 font-mono text-xl font-semibold text-teal-700 tabular-nums">
                  {latest.confidence.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Windows</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {latest.windows_analyzed}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Runtime</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {latest.processing_time_ms.toFixed(0)} ms
                </p>
              </div>
            </div>

            <div className="space-y-2 lg:col-span-3">
              <p className="text-xs font-medium text-slate-500">Class Probabilities</p>
              {latest.probabilities.slice(0, 4).map((p) => (
                <div key={p.movement} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-700">{p.movement}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {p.probability.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600"
                      style={{ width: `${Math.min(100, Math.max(0, p.probability))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">No EMG signal predictions recorded yet</p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Train the classifier on a labelled dataset, then upload or load a sample EMG CSV recording to execute the full recognition pipeline.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('analysis')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-4 py-2 text-xs font-medium text-white hover:bg-[#173661]"
            >
              Go to Signal Analysis
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Interactive Analytics Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Movement Distribution</h2>
            <p className="text-xs text-slate-500">
              Aggregated classification frequency across all analyzed recordings
            </p>
          </div>
          {dist.length > 0 ? (
            <PlotlyChart
              height={280}
              data={[
                {
                  type: 'bar',
                  x: dist.map((d) => d.movement),
                  y: dist.map((d) => d.count),
                  marker: {
                    color: ['#0F2544', '#0D9488', '#0891B2', '#334155'],
                  },
                  hovertemplate: '<b>%{x}</b><br>Analyses: %{y}<extra></extra>',
                },
              ]}
              layout={{
                margin: { t: 16, r: 16, b: 44, l: 48 },
                yaxis: { title: { text: 'Count' }, dtick: 1 },
              }}
            />
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
              Distribution chart populates after your first EMG analysis.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Signal Analysis Activity</h2>
            <p className="text-xs text-slate-500">
              Daily count of processed EMG recordings from SQLite history
            </p>
          </div>
          {activity.length > 0 ? (
            <PlotlyChart
              height={280}
              data={[
                {
                  type: 'scatter',
                  mode: 'lines+markers',
                  x: activity.map((a) => a.date),
                  y: activity.map((a) => a.count),
                  line: { color: '#0891B2', width: 2.5 },
                  marker: { color: '#0F2544', size: 7 },
                  fill: 'tozeroy',
                  fillcolor: 'rgba(8, 145, 178, 0.1)',
                  hovertemplate: 'Date: %{x}<br>Signals: %{y}<extra></extra>',
                },
              ]}
              layout={{
                margin: { t: 16, r: 16, b: 44, l: 48 },
                yaxis: { title: { text: 'Signals' }, dtick: 1 },
              }}
            />
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
              Activity timeline populates once analyses are logged.
            </div>
          )}
        </div>
      </div>

      {/* Recent Analysis Table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Analyses</h2>
            <p className="text-xs text-slate-500">Click any record to inspect full prediction details and waveforms</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
          >
            View All History
          </button>
        </div>

        {recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">File</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Predicted Movement</th>
                  <th className="px-4 py-3 text-right">Confidence</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-mono text-xs text-slate-800">{row.filename}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.channel}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.predicted_movement}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium text-teal-700 tabular-nums">
                      {row.confidence.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.model_type === 'svm' ? 'SVM' : 'Random Forest'} · {row.model_version}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          row.status === 'Completed'
                            ? 'font-medium text-teal-700'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={loadingId === row.id}
                        onClick={() => handleOpenRecord(row.id, 'recognition')}
                        className="text-xs font-medium text-[#0F2544] hover:text-teal-700 whitespace-nowrap"
                      >
                        {loadingId === row.id ? 'Loading...' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-xs text-slate-500">
            No analysis history entries yet. Upload an EMG CSV file to begin.
          </div>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  Download,
  Eye,
  RefreshCw,
  Search,
  Trash2,
  Waves,
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  deleteHistoryRecord,
  fetchHistory,
  fetchHistoryDetail,
  getHistoryExportUrl,
} from '../services/api';
import type { AnalysisResult, HistoryListItem, NavPageId } from '../types/emg';

interface AnalysisHistoryPageProps {
  onSelectAnalysis: (analysis: AnalysisResult, targetPage: NavPageId) => void;
  onHistoryMutated: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
  refreshToken: number;
}

export default function AnalysisHistoryPage({
  onSelectAnalysis,
  onHistoryMutated,
  onNotify,
  refreshToken,
}: AnalysisHistoryPageProps) {
  const [records, setRecords] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movementFilter, setMovementFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HistoryListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetchHistory({
        search,
        movement: movementFilter,
        sortBy,
        sortOrder,
      });
      setRecords(res.records);
    } catch (err) {
      onNotify(
        'error',
        'Could not load analysis history',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadHistory, 180);
    return () => window.clearTimeout(timer);
  }, [search, movementFilter, sortBy, sortOrder, refreshToken]);

  const handleInspect = async (id: string, target: NavPageId) => {
    setLoadingDetailId(id);
    try {
      const res = await fetchHistoryDetail(id);
      onSelectAnalysis(res.analysis, target);
    } catch (err) {
      onNotify('error', 'Unable to open analysis', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteHistoryRecord(pendingDelete.id);
      setRecords((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      onHistoryMutated();
      onNotify('success', 'Record deleted', `Removed analysis ${pendingDelete.id} from SQLite.`);
      setPendingDelete(null);
    } catch (err) {
      onNotify('error', 'Delete failed', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F2544]">
            Analysis History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            SQLite-persisted EMG signal analysis records with search, movement filtering, sorting, inspection, and CSV export.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <a
            href={getHistoryExportUrl()}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2544] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#173661] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Filter & Sort Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, analysis ID, channel..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <select
              aria-label="Filter by predicted movement"
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="ALL">All Movement Classes</option>
              <option value="Hand Open">Hand Open</option>
              <option value="Hand Close">Hand Close</option>
              <option value="Wrist Flexion">Wrist Flexion</option>
              <option value="Wrist Extension">Wrist Extension</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Sort column"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="uploaded_at">Sort: Timestamp</option>
              <option value="confidence">Sort: Confidence</option>
              <option value="filename">Sort: Filename</option>
              <option value="predicted_movement">Sort: Movement</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Sort direction"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </section>

      {/* Persisted Records Table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3.5 text-xs text-slate-500">
          Showing <span className="font-mono font-medium text-slate-900">{records.length}</span> record(s)
        </div>

        {loading && records.length === 0 ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">No analysis records match your filters</p>
            <p className="mt-1 text-xs text-slate-500">
              Run a signal analysis to store predictions automatically in SQLite.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                  <th className="px-4 py-3">Analysis ID</th>
                  <th className="px-4 py-3">Filename</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Channel / Rate</th>
                  <th className="px-4 py-3">Predicted Movement</th>
                  <th className="px-4 py-3 text-right">Confidence</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/75">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{rec.id}</td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-800">{rec.filename}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600 tabular-nums">
                      {new Date(rec.uploaded_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {rec.channel} · {rec.sampling_frequency} Hz
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {rec.predicted_movement}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-teal-700 tabular-nums">
                      {rec.confidence.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {rec.model_type === 'svm' ? 'SVM' : 'RF'} · {rec.model_version}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          rec.status === 'Completed'
                            ? 'font-medium text-teal-700'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={loadingDetailId === rec.id}
                          onClick={() => handleInspect(rec.id, 'recognition')}
                          title="Inspect recognition results"
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={loadingDetailId === rec.id}
                          onClick={() => handleInspect(rec.id, 'visualization')}
                          title="Inspect waveforms"
                          className="rounded-md border border-slate-200 p-1.5 text-cyan-700 hover:bg-cyan-50"
                        >
                          <Waves className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(rec)}
                          title="Delete analysis record"
                          className="rounded-md border border-slate-200 p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Analysis Record"
        description={`Permanently delete analysis ${pendingDelete?.id ?? ''} (${pendingDelete?.filename ?? ''}) from the SQLite database? This action cannot be undone.`}
        confirmLabel="Delete Record"
        destructive
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

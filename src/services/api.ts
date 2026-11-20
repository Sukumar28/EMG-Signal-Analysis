import type {
  AnalysisResult,
  DashboardResponse,
  HistoryListItem,
  ModelPerformanceResponse,
  PreprocessingConfig,
  SampleDatasetInfo,
  UploadResponse,
} from '../types/emg';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      (payload && (typeof payload.error === 'string' ? payload.error : typeof payload.detail === 'string' ? payload.detail : null)) ||
      `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  return payload as T;
}

export async function checkHealth(): Promise<{
  ok: boolean;
  status: string;
  service: string;
  model_trained: boolean;
  model_version: string | null;
}> {
  const res = await fetch(`${API_BASE}/health`);
  return parseJsonResponse(res);
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE}/dashboard`);
  return parseJsonResponse(res);
}

export async function fetchSamples(): Promise<{ ok: boolean; samples: SampleDatasetInfo[] }> {
  const res = await fetch(`${API_BASE}/samples`);
  return parseJsonResponse(res);
}

export function getSampleDownloadUrl(filename: string): string {
  return `${API_BASE}/samples/${encodeURIComponent(filename)}/download`;
}

export async function loadSampleDataset(filename: string): Promise<UploadResponse> {
  const res = await fetch(`${API_BASE}/samples/${encodeURIComponent(filename)}/load`, {
    method: 'POST',
  });
  return parseJsonResponse(res);
}

export async function uploadCsvFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: form,
  });
  return parseJsonResponse(res);
}

export async function analyzeEmgSignal(payload: {
  upload_id: string;
  signal_column: string;
  signal_columns?: string[];
  model_type?: 'random_forest' | 'svm';
  preprocessing?: Partial<PreprocessingConfig>;
}): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function trainEmgModels(payload: {
  upload_id?: string;
  use_bundled_dataset?: boolean;
  signal_column?: string;
  signal_columns?: string[];
  label_column?: string;
  preprocessing?: Partial<PreprocessingConfig>;
  test_split_ratio?: number;
  n_estimators?: number;
  svm_c?: number;
  preferred_model?: 'random_forest' | 'svm';
}) {
  const res = await fetch(`${API_BASE}/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<{
    ok: boolean;
    run_id: string;
    model_version: string;
    trained_at: string;
    dataset_name: string;
    classes: string[];
    train_windows: number;
    test_windows: number;
    active_model_type: 'random_forest' | 'svm';
    training_time_ms: number;
  }>(res);
}

export async function switchActiveModel(model_type: 'random_forest' | 'svm') {
  const res = await fetch(`${API_BASE}/model/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_type }),
  });
  return parseJsonResponse<{ ok: boolean; active_model_type: 'random_forest' | 'svm'; model_version: string }>(res);
}

export async function fetchModelPerformance(): Promise<ModelPerformanceResponse> {
  const res = await fetch(`${API_BASE}/model/performance`);
  return parseJsonResponse(res);
}

export async function fetchHistory(params?: {
  search?: string;
  movement?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ ok: boolean; count: number; records: HistoryListItem[] }> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.movement && params.movement !== 'ALL') query.set('movement', params.movement);
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/history${qs ? `?${qs}` : ''}`);
  return parseJsonResponse(res);
}

export async function fetchHistoryDetail(id: string): Promise<{ ok: boolean; analysis: AnalysisResult }> {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`);
  return parseJsonResponse(res);
}

export async function deleteHistoryRecord(id: string): Promise<{ ok: boolean; deleted_id: string }> {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return parseJsonResponse(res);
}

export function getHistoryExportUrl(): string {
  return `${API_BASE}/history/export`;
}

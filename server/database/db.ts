import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.EMG_UPLOAD_DIR
  ? path.resolve(process.env.EMG_UPLOAD_DIR)
  : path.join(DATA_DIR, 'uploads');
export const MODEL_DIR = process.env.EMG_MODEL_DIR
  ? path.resolve(process.env.EMG_MODEL_DIR)
  : path.join(DATA_DIR, 'models');
const DB_PATH = process.env.EMG_DB_PATH
  ? path.resolve(process.env.EMG_DB_PATH)
  : path.join(DATA_DIR, 'emg_intelligence.db');

for (const dir of [DATA_DIR, UPLOAD_DIR, MODEL_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    row_count INTEGER NOT NULL,
    columns_json TEXT NOT NULL,
    numeric_columns_json TEXT NOT NULL,
    timestamp_column TEXT,
    label_column TEXT,
    inferred_fs REAL,
    missing_summary_json TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    upload_id TEXT,
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    channel TEXT NOT NULL,
    sampling_frequency REAL NOT NULL,
    predicted_movement TEXT NOT NULL,
    confidence REAL NOT NULL,
    model_version TEXT NOT NULL,
    model_type TEXT NOT NULL,
    status TEXT NOT NULL,
    windows_analyzed INTEGER NOT NULL,
    processing_time_ms REAL NOT NULL,
    signal_quality_json TEXT NOT NULL,
    reliability_warning TEXT,
    probabilities_json TEXT NOT NULL,
    features_summary_json TEXT NOT NULL,
    preprocessing_config_json TEXT NOT NULL,
    visualization_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_runs (
    id TEXT PRIMARY KEY,
    model_version TEXT NOT NULL,
    trained_at TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    classes_json TEXT NOT NULL,
    train_windows INTEGER NOT NULL,
    test_windows INTEGER NOT NULL,
    active_model_type TEXT NOT NULL,
    rf_metrics_json TEXT,
    svm_metrics_json TEXT,
    preprocessing_config_json TEXT NOT NULL,
    artifact_path TEXT NOT NULL
  );
`);

export interface UploadRecord {
  id: string;
  original_filename: string;
  stored_path: string;
  file_size_bytes: number;
  row_count: number;
  columns_json: string;
  numeric_columns_json: string;
  timestamp_column: string | null;
  label_column: string | null;
  inferred_fs: number | null;
  missing_summary_json: string;
  uploaded_at: string;
}

export interface AnalysisRecord {
  id: string;
  upload_id: string | null;
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
  signal_quality_json: string;
  reliability_warning: string | null;
  probabilities_json: string;
  features_summary_json: string;
  preprocessing_config_json: string;
  visualization_json: string;
}

export interface ModelRunRecord {
  id: string;
  model_version: string;
  trained_at: string;
  dataset_name: string;
  classes_json: string;
  train_windows: number;
  test_windows: number;
  active_model_type: string;
  rf_metrics_json: string | null;
  svm_metrics_json: string | null;
  preprocessing_config_json: string;
  artifact_path: string;
}

export function insertUpload(rec: UploadRecord): void {
  const stmt = db.prepare(`
    INSERT INTO uploads (
      id, original_filename, stored_path, file_size_bytes, row_count,
      columns_json, numeric_columns_json, timestamp_column, label_column,
      inferred_fs, missing_summary_json, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    rec.id,
    rec.original_filename,
    rec.stored_path,
    rec.file_size_bytes,
    rec.row_count,
    rec.columns_json,
    rec.numeric_columns_json,
    rec.timestamp_column,
    rec.label_column,
    rec.inferred_fs,
    rec.missing_summary_json,
    rec.uploaded_at
  );
}

export function getUploadById(id: string): UploadRecord | null {
  const stmt = db.prepare('SELECT * FROM uploads WHERE id = ?');
  const row = stmt.get(id) as UploadRecord | undefined;
  return row ?? null;
}

export function insertAnalysis(rec: AnalysisRecord): void {
  const stmt = db.prepare(`
    INSERT INTO analyses (
      id, upload_id, filename, uploaded_at, channel, sampling_frequency,
      predicted_movement, confidence, model_version, model_type, status,
      windows_analyzed, processing_time_ms, signal_quality_json,
      reliability_warning, probabilities_json, features_summary_json,
      preprocessing_config_json, visualization_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    rec.id,
    rec.upload_id,
    rec.filename,
    rec.uploaded_at,
    rec.channel,
    rec.sampling_frequency,
    rec.predicted_movement,
    rec.confidence,
    rec.model_version,
    rec.model_type,
    rec.status,
    rec.windows_analyzed,
    rec.processing_time_ms,
    rec.signal_quality_json,
    rec.reliability_warning,
    rec.probabilities_json,
    rec.features_summary_json,
    rec.preprocessing_config_json,
    rec.visualization_json
  );
}

export function listAnalyses(params?: {
  search?: string;
  movement?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Omit<AnalysisRecord, 'visualization_json'>[] {
  const where: string[] = [];
  const values: (string | number)[] = [];

  if (params?.search && params.search.trim()) {
    where.push('(filename LIKE ? OR id LIKE ? OR channel LIKE ? OR predicted_movement LIKE ?)');
    const q = `%${params.search.trim()}%`;
    values.push(q, q, q, q);
  }
  if (params?.movement && params.movement !== 'ALL') {
    where.push('predicted_movement = ?');
    values.push(params.movement);
  }

  const allowedSort: Record<string, string> = {
    uploaded_at: 'uploaded_at',
    filename: 'filename',
    confidence: 'confidence',
    predicted_movement: 'predicted_movement',
    sampling_frequency: 'sampling_frequency',
  };
  const sortCol = allowedSort[params?.sortBy ?? 'uploaded_at'] ?? 'uploaded_at';
  const order = params?.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT
      id, upload_id, filename, uploaded_at, channel, sampling_frequency,
      predicted_movement, confidence, model_version, model_type, status,
      windows_analyzed, processing_time_ms, signal_quality_json,
      reliability_warning, probabilities_json, features_summary_json,
      preprocessing_config_json
    FROM analyses
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${sortCol} ${order}
  `;
  const stmt = db.prepare(sql);
  return stmt.all(...values) as unknown as Omit<AnalysisRecord, 'visualization_json'>[];
}

export function getAnalysisById(id: string): AnalysisRecord | null {
  const stmt = db.prepare('SELECT * FROM analyses WHERE id = ?');
  const row = stmt.get(id) as AnalysisRecord | undefined;
  return row ?? null;
}

export function deleteAnalysisById(id: string): boolean {
  const stmt = db.prepare('DELETE FROM analyses WHERE id = ?');
  const result = stmt.run(id);
  return Number(result.changes) > 0;
}

export function insertModelRun(rec: ModelRunRecord): void {
  const stmt = db.prepare(`
    INSERT INTO model_runs (
      id, model_version, trained_at, dataset_name, classes_json,
      train_windows, test_windows, active_model_type,
      rf_metrics_json, svm_metrics_json, preprocessing_config_json, artifact_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    rec.id,
    rec.model_version,
    rec.trained_at,
    rec.dataset_name,
    rec.classes_json,
    rec.train_windows,
    rec.test_windows,
    rec.active_model_type,
    rec.rf_metrics_json,
    rec.svm_metrics_json,
    rec.preprocessing_config_json,
    rec.artifact_path
  );
}

export function getLatestModelRun(): ModelRunRecord | null {
  const stmt = db.prepare('SELECT * FROM model_runs ORDER BY trained_at DESC LIMIT 1');
  const row = stmt.get() as ModelRunRecord | undefined;
  return row ?? null;
}

export function updateActiveModelType(runId: string, modelType: string): void {
  const stmt = db.prepare('UPDATE model_runs SET active_model_type = ? WHERE id = ?');
  stmt.run(modelType, runId);
}

export function listModelRuns(): ModelRunRecord[] {
  const stmt = db.prepare('SELECT * FROM model_runs ORDER BY trained_at DESC LIMIT 10');
  return stmt.all() as unknown as ModelRunRecord[];
}

export function getDashboardStats() {
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM analyses').get() as { count: number };
  const recognizedRow = db
    .prepare("SELECT COUNT(*) as count FROM analyses WHERE status = 'Completed'")
    .get() as { count: number };

  const distRows = db
    .prepare(`
      SELECT predicted_movement as movement, COUNT(*) as count
      FROM analyses
      GROUP BY predicted_movement
      ORDER BY count DESC
    `)
    .all() as { movement: string; count: number }[];

  const activityRows = db
    .prepare(`
      SELECT substr(uploaded_at, 1, 10) as date, COUNT(*) as count
      FROM analyses
      GROUP BY substr(uploaded_at, 1, 10)
      ORDER BY date ASC
      LIMIT 30
    `)
    .all() as { date: string; count: number }[];

  const recentRows = db
    .prepare(`
      SELECT
        id, filename, uploaded_at, channel, sampling_frequency,
        predicted_movement, confidence, model_version, model_type,
        status, windows_analyzed, processing_time_ms, reliability_warning
      FROM analyses
      ORDER BY uploaded_at DESC
      LIMIT 8
    `)
    .all();

  return {
    total_signals_analyzed: Number(totalRow?.count ?? 0),
    recognized_movements: Number(recognizedRow?.count ?? 0),
    movement_distribution: distRows,
    activity_timeline: activityRows,
    recent_analyses: recentRows,
  };
}

export default db;

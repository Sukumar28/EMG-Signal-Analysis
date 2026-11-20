import sqlite3
from typing import Any, Dict, List, Optional
from app.core.config import DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
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
            """
        )


def fetch_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


def fetch_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def execute_write(query: str, params: tuple = ()) -> int:
    with get_connection() as conn:
        cur = conn.execute(query, params)
        conn.commit()
        return cur.rowcount

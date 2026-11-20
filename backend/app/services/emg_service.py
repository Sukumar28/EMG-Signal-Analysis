from datetime import datetime, timezone
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
import joblib
import numpy as np
import pandas as pd

from app.core.config import MAX_UPLOAD_BYTES, MODEL_DIR, SAMPLE_DATA_DIR, UPLOAD_DIR
from app.database.sqlite_store import execute_write, fetch_all, fetch_one
from app.ml.trainer import train_and_save_sklearn_bundle
from app.signal_processing.pipeline import run_scipy_emg_pipeline, validate_and_parse_csv


def _summarize_windows(windows: List[Dict[str, Any]]) -> Dict[str, Any]:
    summary: Dict[str, Any] = {}
    for key in ("mav", "rms", "wl", "zc", "ssc", "variance", "iemg"):
        vals = np.array([w[key] for w in windows], dtype=np.float64)
        summary[key] = {
            "mean": round(float(np.mean(vals)), 5),
            "std": round(float(np.std(vals)), 5),
            "min": round(float(np.min(vals)), 5),
            "max": round(float(np.max(vals)), 5),
        }
    return summary


def save_and_validate_upload(filename: str, raw_bytes: bytes) -> Dict[str, Any]:
    if not raw_bytes:
        raise ValueError("Uploaded file is empty.")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("File exceeds 25 MB limit.")
    safe_name = Path(filename).name
    if not safe_name.lower().endswith(".csv"):
        raise ValueError("Only .csv files are supported.")

    upload_id = f"upl_{uuid.uuid4().hex[:12]}"
    dest = UPLOAD_DIR / f"{upload_id}_{safe_name}"
    dest.write_bytes(raw_bytes)

    parsed = validate_and_parse_csv(str(dest))
    df: pd.DataFrame = parsed["df"]
    now = datetime.now(timezone.utc).isoformat()

    execute_write(
        """
        INSERT INTO uploads (
            id, original_filename, stored_path, file_size_bytes, row_count,
            columns_json, numeric_columns_json, timestamp_column, label_column,
            inferred_fs, missing_summary_json, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            upload_id,
            safe_name,
            str(dest),
            len(raw_bytes),
            len(df),
            json.dumps(parsed["headers"]),
            json.dumps(parsed["numeric_columns"]),
            parsed["timestamp_column"],
            parsed["label_column"],
            parsed["inferred_fs"],
            json.dumps(parsed["missing_summary"]),
            now,
        ),
    )

    detected_labels = (
        sorted(df[parsed["label_column"]].dropna().astype(str).unique().tolist())
        if parsed["label_column"]
        else []
    )
    preview = df.head(12).fillna("").astype(str).to_dict(orient="records")

    return {
        "upload_id": upload_id,
        "filename": safe_name,
        "file_size_bytes": len(raw_bytes),
        "row_count": len(df),
        "columns": parsed["headers"],
        "numeric_columns": parsed["numeric_columns"],
        "non_numeric_columns": parsed["non_numeric_columns"],
        "timestamp_column": parsed["timestamp_column"],
        "label_column": parsed["label_column"],
        "detected_labels": detected_labels,
        "inferred_sampling_frequency": parsed["inferred_fs"],
        "missing_summary": parsed["missing_summary"],
        "preview_rows": preview,
        "warnings": [],
        "uploaded_at": now,
    }


def load_active_bundle() -> tuple[Optional[Dict[str, Any]], str, Optional[str]]:
    row = fetch_one("SELECT * FROM model_runs ORDER BY trained_at DESC LIMIT 1")
    if not row:
        return None, "random_forest", None
    artifact = Path(row["artifact_path"])
    if not artifact.exists():
        return None, row["active_model_type"], None
    return joblib.load(artifact), row["active_model_type"], row["id"]


def train_models_service(payload: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.perf_counter()
    if payload.get("use_bundled_dataset"):
        dataset_path = SAMPLE_DATA_DIR / "emg_labelled_training_dataset.csv"
        dataset_name = dataset_path.name
    elif payload.get("upload_id"):
        up = fetch_one("SELECT * FROM uploads WHERE id = ?", (payload["upload_id"],))
        if not up:
            raise ValueError("Uploaded training file not found.")
        dataset_path = Path(up["stored_path"])
        dataset_name = up["original_filename"]
    else:
        raise ValueError("Provide upload_id or set use_bundled_dataset=true.")

    parsed = validate_and_parse_csv(str(dataset_path))
    df: pd.DataFrame = parsed["df"]
    label_col = payload.get("label_column") or parsed["label_column"]
    if not label_col or label_col not in df.columns:
        raise ValueError("Labelled movement column is required for supervised ML training.")

    signal_col = payload.get("signal_column") or parsed["numeric_columns"][0]
    prep = payload.get("preprocessing") or {
        "sampling_frequency": parsed["inferred_fs"] or 1000.0,
        "apply_bandpass": True,
        "bandpass_low_hz": 20.0,
        "bandpass_high_hz": 450.0,
        "filter_order": 4,
        "apply_notch": True,
        "notch_freq_hz": 50.0,
        "notch_q": 30.0,
        "normalization": "zscore",
        "window_size_ms": 250.0,
        "window_overlap_pct": 50.0,
    }

    classes = sorted(df[label_col].dropna().astype(str).str.strip().unique().tolist())
    if len(classes) < 2:
        raise ValueError("At least 2 movement classes are required.")
    cls_map = {c: i for i, c in enumerate(classes)}

    X_blocks: List[np.ndarray] = []
    y_blocks: List[np.ndarray] = []

    # Segment contiguous runs per movement label
    labels_series = df[label_col].astype(str).str.strip()
    run_ids = (labels_series != labels_series.shift()).cumsum()
    for _, grp in df.groupby(run_ids, sort=False):
        lbl = str(grp[label_col].iloc[0]).strip()
        if lbl not in cls_map or len(grp) < 20:
            continue
        res = run_scipy_emg_pipeline(grp[signal_col], prep)
        X_blocks.append(res["feature_matrix"])
        y_blocks.append(np.full(len(res["feature_matrix"]), cls_map[lbl], dtype=np.int64))

    X = np.vstack(X_blocks)
    y = np.concatenate(y_blocks)

    runs = fetch_all("SELECT id FROM model_runs")
    version = f"v1.{len(runs) + 1}.0"
    bundle, artifact_path = train_and_save_sklearn_bundle(
        X=X,
        y=y,
        classes=classes,
        preprocessing_config=prep,
        dataset_name=dataset_name,
        model_version=version,
        model_dir=MODEL_DIR,
        test_ratio=float(payload.get("test_split_ratio", 0.25)),
        n_estimators=int(payload.get("n_estimators", 100)),
        svm_c=float(payload.get("svm_c", 2.5)),
    )

    run_id = f"mdl_{uuid.uuid4().hex[:12]}"
    active_type = payload.get("preferred_model", "random_forest")
    execute_write(
        """
        INSERT INTO model_runs (
            id, model_version, trained_at, dataset_name, classes_json,
            train_windows, test_windows, active_model_type,
            rf_metrics_json, svm_metrics_json, preprocessing_config_json, artifact_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            version,
            bundle["trained_at"],
            dataset_name,
            json.dumps(classes),
            bundle["train_windows"],
            bundle["test_windows"],
            active_type,
            json.dumps(bundle["rf_metrics"]),
            json.dumps(bundle["svm_metrics"]),
            json.dumps(prep),
            str(artifact_path),
        ),
    )

    return {
        "run_id": run_id,
        "model_version": version,
        "trained_at": bundle["trained_at"],
        "dataset_name": dataset_name,
        "classes": classes,
        "train_windows": bundle["train_windows"],
        "test_windows": bundle["test_windows"],
        "active_model_type": active_type,
        "rf_metrics": bundle["rf_metrics"],
        "svm_metrics": bundle["svm_metrics"],
        "preprocessing_config": prep,
        "training_time_ms": round((time.perf_counter() - t0) * 1000.0, 1),
    }


def analyze_signal_service(payload: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.perf_counter()
    up = fetch_one("SELECT * FROM uploads WHERE id = ?", (payload["upload_id"],))
    if not up:
        raise ValueError("Uploaded CSV record not found.")

    parsed = validate_and_parse_csv(up["stored_path"])
    df: pd.DataFrame = parsed["df"]
    col = payload["signal_column"]
    if col not in df.columns:
        raise ValueError(f"Signal column '{col}' not found.")

    bundle, active_type, _ = load_active_bundle()
    prep = payload.get("preprocessing") or (bundle["preprocessing_config"] if bundle else {"sampling_frequency": 1000.0})

    ts = (
        pd.to_numeric(df[parsed["timestamp_column"]], errors="coerce").to_numpy(dtype=np.float64)
        if parsed["timestamp_column"]
        else None
    )
    processed = run_scipy_emg_pipeline(df[col], prep, timestamps=ts)
    feat_summary = _summarize_windows(processed["windows"])

    step = max(1, len(processed["time_axis"]) // 1800)
    viz = {
        "time_raw": np.round(processed["time_axis"][::step], 5).tolist(),
        "raw_signal": np.round(processed["raw_signal"][::step], 5).tolist(),
        "time_filtered": np.round(processed["time_axis"][::step], 5).tolist(),
        "filtered_signal": np.round(processed["filtered_signal"][::step], 5).tolist(),
        "time_normalized": np.round(processed["time_axis"][::step], 5).tolist(),
        "normalized_signal": np.round(processed["normalized_signal"][::step], 5).tolist(),
        "windows": processed["windows"],
        "amplitude_samples": np.round(processed["filtered_signal"][::step], 5).tolist(),
    }

    quality = {
        "overall_grade": "Good" if processed["snr_db"] >= 6 else "Fair",
        "snr_db": processed["snr_db"],
        "missing_count": processed["missing_count"],
        "missing_ratio_pct": round(100.0 * processed["missing_count"] / max(1, len(df)), 2),
        "clipped_ratio_pct": 0.0,
        "baseline_offset": processed["baseline_offset"],
        "duration_seconds": round(len(df) / float(prep.get("sampling_frequency", 1000.0)), 3),
        "sample_count": len(df),
        "notes": ["Processed via SciPy Butterworth + Notch zero-phase pipeline."],
    }

    if not bundle:
        return {
            "model_trained": False,
            "error_code": "MODEL_NOT_TRAINED",
            "message": "MODEL NOT TRAINED – Please configure a labelled EMG training dataset.",
            "filename": up["original_filename"],
            "channel": col,
            "sampling_frequency": float(prep.get("sampling_frequency", 1000.0)),
            "windows_analyzed": len(processed["windows"]),
            "signal_quality": quality,
            "feature_summary": feat_summary,
            "preprocessing_config": prep,
            "warnings": processed["warnings"],
            "visualization": viz,
            "processing_time_ms": round((time.perf_counter() - t0) * 1000.0, 1),
        }

    chosen_model = payload.get("model_type") or active_type
    clf = bundle["svm"] if chosen_model == "svm" else bundle["random_forest"]
    X_z = bundle["scaler"].transform(processed["feature_matrix"])
    probas = clf.predict_proba(X_z)
    avg_proba = np.mean(probas, axis=0)
    best_idx = int(np.argmax(avg_proba))
    predicted = bundle["classes"][best_idx]
    confidence = round(float(avg_proba[best_idx] * 100.0), 2)

    dists = [
        float(np.min(np.sqrt(np.mean((bundle["centroids"] - z) ** 2, axis=1))))
        for z in X_z
    ]
    mean_ood = float(np.mean(dists))
    warning = None
    status = "Completed"
    if mean_ood > bundle["ood_threshold"]:
        warning = f"Out-of-distribution signal detected (distance {mean_ood:.2f} > {bundle['ood_threshold']:.2f})."
        status = "Low Reliability"
    elif confidence < 55.0:
        warning = f"Low classification confidence ({confidence:.1f}%)."
        status = "Low Confidence"

    probabilities = sorted(
        [{"movement": cls, "probability": round(float(avg_proba[i] * 100.0), 2)} for i, cls in enumerate(bundle["classes"])],
        key=lambda x: x["probability"],
        reverse=True,
    )

    analysis_id = f"anl_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    elapsed = round((time.perf_counter() - t0) * 1000.0, 1)

    execute_write(
        """
        INSERT INTO analyses (
            id, upload_id, filename, uploaded_at, channel, sampling_frequency,
            predicted_movement, confidence, model_version, model_type, status,
            windows_analyzed, processing_time_ms, signal_quality_json,
            reliability_warning, probabilities_json, features_summary_json,
            preprocessing_config_json, visualization_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            analysis_id, up["id"], up["original_filename"], now, col,
            float(prep.get("sampling_frequency", 1000.0)), predicted, confidence,
            bundle["model_version"], chosen_model, status, len(processed["windows"]),
            elapsed, json.dumps(quality), warning, json.dumps(probabilities),
            json.dumps(feat_summary), json.dumps(prep), json.dumps(viz),
        ),
    )

    return {
        "model_trained": True,
        "id": analysis_id,
        "upload_id": up["id"],
        "filename": up["original_filename"],
        "uploaded_at": now,
        "channel": col,
        "sampling_frequency": float(prep.get("sampling_frequency", 1000.0)),
        "predicted_movement": predicted,
        "confidence": confidence,
        "probabilities": probabilities,
        "windows_analyzed": len(processed["windows"]),
        "model_version": bundle["model_version"],
        "model_type": chosen_model,
        "status": status,
        "processing_time_ms": elapsed,
        "signal_quality": quality,
        "reliability_warning": warning,
        "feature_summary": feat_summary,
        "preprocessing_config": prep,
        "warnings": processed["warnings"],
        "visualization": viz,
    }

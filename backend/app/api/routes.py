from datetime import datetime, timezone
import json
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse

from app.core.config import SAMPLE_DATA_DIR
from app.database.sqlite_store import execute_write, fetch_all, fetch_one
from app.schemas.emg_schemas import AnalyzeRequest, SwitchModelRequest, TrainRequest
from app.services.emg_service import (
    analyze_signal_service,
    load_active_bundle,
    save_and_validate_upload,
    train_models_service,
)

router = APIRouter(prefix="/api", tags=["EMG Intelligence API"])


@router.get("/health")
def health_check():
    bundle, _, _ = load_active_bundle()
    return {
        "ok": True,
        "status": "healthy",
        "service": "EMG INTELLIGENCE Python FastAPI Backend",
        "model_trained": bundle is not None,
        "model_version": bundle["model_version"] if bundle else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/upload", status_code=201)
async def upload_csv(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        result = save_and_validate_upload(file.filename or "signal.csv", raw)
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/analyze")
def analyze_emg(req: AnalyzeRequest):
    try:
        result = analyze_signal_service(req.model_dump(exclude_none=True))
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/train", status_code=201)
def train_ml_models(req: TrainRequest):
    try:
        result = train_models_service(req.model_dump(exclude_none=True))
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/model/active")
def switch_active_model(req: SwitchModelRequest):
    bundle, _, run_id = load_active_bundle()
    if not bundle or not run_id:
        raise HTTPException(status_code=400, detail="MODEL NOT TRAINED – Please configure a labelled EMG training dataset.")
    execute_write("UPDATE model_runs SET active_model_type = ? WHERE id = ?", (req.model_type, run_id))
    return {"ok": True, "active_model_type": req.model_type, "model_version": bundle["model_version"]}


@router.get("/dashboard")
def get_dashboard():
    total = (fetch_one("SELECT COUNT(*) as c FROM analyses") or {"c": 0})["c"]
    recognized = (fetch_one("SELECT COUNT(*) as c FROM analyses WHERE status = 'Completed'") or {"c": 0})["c"]
    dist = fetch_all("SELECT predicted_movement as movement, COUNT(*) as count FROM analyses GROUP BY predicted_movement ORDER BY count DESC")
    timeline = fetch_all("SELECT substr(uploaded_at, 1, 10) as date, COUNT(*) as count FROM analyses GROUP BY substr(uploaded_at, 1, 10) ORDER BY date ASC LIMIT 30")
    recent = fetch_all(
        "SELECT id, filename, uploaded_at, channel, sampling_frequency, predicted_movement, confidence, model_version, model_type, status, windows_analyzed, processing_time_ms, reliability_warning FROM analyses ORDER BY uploaded_at DESC LIMIT 8"
    )
    bundle, active_type, _ = load_active_bundle()
    accuracy = None
    if bundle:
        m = bundle["svm_metrics"] if active_type == "svm" else bundle["rf_metrics"]
        accuracy = round(m["accuracy"] * 100.0, 2)
    return {
        "ok": True,
        "kpis": {
            "total_signals_analyzed": total,
            "recognized_movements": recognized,
            "available_movement_classes": len(bundle["classes"]) if bundle else 4,
            "movement_class_names": bundle["classes"] if bundle else ["Hand Open", "Hand Close", "Wrist Flexion", "Wrist Extension"],
            "model_accuracy": accuracy,
            "model_trained": bundle is not None,
            "model_version": bundle["model_version"] if bundle else None,
            "active_model_type": active_type if bundle else None,
        },
        "movement_distribution": dist,
        "activity_timeline": timeline,
        "recent_analyses": recent,
        "latest_prediction": recent[0] if recent else None,
    }


@router.get("/model/performance")
def get_model_performance():
    bundle, active_type, run_id = load_active_bundle()
    if not bundle:
        return {
            "ok": True,
            "status": "Evaluation Pending",
            "model_trained": False,
            "message": "MODEL NOT TRAINED – Please configure a labelled EMG training dataset.",
            "rf_metrics": None,
            "svm_metrics": None,
        }
    return {
        "ok": True,
        "status": "Evaluated",
        "model_trained": True,
        "run_id": run_id,
        "model_version": bundle["model_version"],
        "trained_at": bundle["trained_at"],
        "dataset_name": bundle["dataset_name"],
        "classes": bundle["classes"],
        "train_windows": bundle["train_windows"],
        "test_windows": bundle["test_windows"],
        "active_model_type": active_type,
        "rf_metrics": bundle["rf_metrics"],
        "svm_metrics": bundle["svm_metrics"],
        "preprocessing_config": bundle["preprocessing_config"],
    }


@router.get("/history")
def list_history(
    search: str = Query(default=""),
    movement: str = Query(default="ALL"),
):
    where = []
    params = []
    if search.strip():
        q = f"%{search.strip()}%"
        where.append("(filename LIKE ? OR id LIKE ? OR channel LIKE ?)")
        params.extend([q, q, q])
    if movement != "ALL":
        where.append("predicted_movement = ?")
        params.append(movement)
    sql = "SELECT id, upload_id, filename, uploaded_at, channel, sampling_frequency, predicted_movement, confidence, model_version, model_type, status, windows_analyzed, processing_time_ms, reliability_warning, signal_quality_json, probabilities_json, features_summary_json, preprocessing_config_json FROM analyses"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY uploaded_at DESC"
    rows = fetch_all(sql, tuple(params))
    records = [
        {
            **{k: v for k, v in r.items() if not k.endswith("_json")},
            "signal_quality": json.loads(r["signal_quality_json"]),
            "probabilities": json.loads(r["probabilities_json"]),
            "feature_summary": json.loads(r["features_summary_json"]),
            "preprocessing_config": json.loads(r["preprocessing_config_json"]),
        }
        for r in rows
    ]
    return {"ok": True, "count": len(records), "records": records}


@router.get("/history/export")
def export_history():
    rows = fetch_all("SELECT id, filename, uploaded_at, channel, sampling_frequency, predicted_movement, confidence, model_type, model_version, status FROM analyses ORDER BY uploaded_at DESC")
    lines = ["Analysis ID,Filename,Upload Timestamp,Channel,Sampling Frequency (Hz),Predicted Movement,Confidence (%),Model Type,Model Version,Status"]
    for r in rows:
        lines.append(",".join(str(r[k]) for k in r.keys()))
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/csv")


@router.get("/history/{analysis_id}")
def get_history_detail(analysis_id: str):
    row = fetch_one("SELECT * FROM analyses WHERE id = ?", (analysis_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    return {
        "ok": True,
        "analysis": {
            "model_trained": True,
            **{k: v for k, v in row.items() if not k.endswith("_json")},
            "signal_quality": json.loads(row["signal_quality_json"]),
            "probabilities": json.loads(row["probabilities_json"]),
            "feature_summary": json.loads(row["features_summary_json"]),
            "preprocessing_config": json.loads(row["preprocessing_config_json"]),
            "visualization": json.loads(row["visualization_json"]),
        },
    }


@router.delete("/history/{analysis_id}")
def delete_history(analysis_id: str):
    deleted = execute_write("DELETE FROM analyses WHERE id = ?", (analysis_id,))
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    return {"ok": True, "deleted_id": analysis_id}


@router.get("/samples/{filename}/download")
def download_sample(filename: str):
    target = SAMPLE_DATA_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Sample file not found.")
    return FileResponse(str(target), media_type="text/csv", filename=filename)

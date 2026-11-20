from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = Path(os.getenv("EMG_UPLOAD_DIR", str(DATA_DIR / "uploads")))
MODEL_DIR = Path(os.getenv("EMG_MODEL_DIR", str(DATA_DIR / "models")))
DB_PATH = Path(os.getenv("EMG_DB_PATH", str(DATA_DIR / "emg_intelligence.db")))
SAMPLE_DATA_DIR = BASE_DIR.parent / "sample_data"

for directory in (DATA_DIR, UPLOAD_DIR, MODEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    if origin.strip()
]

# EMG INTELLIGENCE — Intelligent Human Movement Recognition Using Electromyography Signals

A complete biomedical signal processing, machine learning, and interactive visualization platform designed for surface Electromyography (sEMG) human hand/wrist action recognition.

## Architecture & Runtime Modes

This repository includes two 100% API-compatible backend implementations sharing identical REST contracts, SQLite schema, signal processing stages, and supervised ML workflows:

1. **Integrated Full-Stack Server (`/server.ts` + `/server/`)**: Runs live in Node.js environments (including cloud sandboxes without Python scientific wheels). Implements real server-side zero-phase Butterworth bandpass filtering (`filtfilt`), IIR notch filtering, sliding window segmentation, 7 time-domain EMG feature extractors (MAV, RMS, WL, ZC, SSC, Variance, IEMG), Random Forest + RBF-kernel SVM classifiers, out-of-distribution (OOD) detection, and persistent SQLite storage.
2. **Standalone Python FastAPI Backend (`/backend/`)**: Production Python backend using **FastAPI, NumPy, Pandas, SciPy (`butter`, `iirnotch`, `filtfilt`), Scikit-learn (`RandomForestClassifier`, `SVC`, `StandardScaler`), and SQLite**.

## Running Locally

### Option A: Integrated Full-Stack Mode (Node.js 22+)
```bash
npm install
npm run dev
# Opens on http://localhost:3000
```

### Option B: Standalone Python FastAPI Backend + React Frontend
```bash
# Terminal 1 — Python FastAPI Backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Interactive Swagger docs: http://localhost:8000/docs

# Terminal 2 — React Frontend pointing to FastAPI
VITE_API_BASE_URL=http://localhost:8000/api npm run dev
```

## Model Training Workflow

1. Navigate to **Model Performance** (or click **Train Model** from Dashboard / Signal Analysis).
2. Either select the included 4-class labelled sEMG dataset (`sample_data/emg_labelled_training_dataset.csv`) or upload your own labelled EMG CSV containing numeric signal channel(s) and a movement label column (`movement_label` / `label`).
3. Configure sampling frequency, bandpass filter (`20–450 Hz`), power-line notch filter (`50/60 Hz`), window length (`250 ms`), overlap (`50%`), and train/test split ratio.
4. Click **Train & Evaluate Models**. The backend performs contiguous block-stratified splitting (preventing sliding-window data leakage), fits `StandardScaler` exclusively on training windows, trains both **Random Forest** and **RBF SVM**, persists serialized model artifacts, and reports genuine held-out accuracy, precision, recall, F1-score, and confusion matrices.

## Sample Datasets (`/sample_data/`)

- `emg_labelled_training_dataset.csv` — 2-channel labelled sEMG dataset (22,000 samples @ 1000 Hz) spanning Hand Open, Hand Close, Wrist Flexion, and Wrist Extension.
- `sample_hand_open.csv` — Unlabelled test sEMG recording.
- `sample_hand_close.csv` — Unlabelled test sEMG recording.
- `sample_wrist_flexion.csv` — Unlabelled test sEMG recording.
- `sample_wrist_extension.csv` — Unlabelled test sEMG recording.

## Disclaimer

This software is an academic engineering research prototype developed for educational demonstration and biomedical signal processing research. It is **not** a certified medical diagnostic device and must not be used for clinical diagnosis or patient treatment decisions.

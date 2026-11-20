from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt, iirnotch

FEATURE_NAMES = ["MAV", "RMS", "WL", "ZC", "SSC", "Variance", "IEMG"]


def validate_and_parse_csv(file_path: str) -> Dict[str, Any]:
    df = pd.read_csv(file_path)
    if df.empty or len(df.columns) == 0:
        raise ValueError("The uploaded CSV file is empty.")

    headers = [str(c) for c in df.columns]
    numeric_cols: List[str] = []
    non_numeric_cols: List[str] = []
    missing_summary: Dict[str, int] = {}

    for col in headers:
        series = df[col]
        missing_count = int(series.isna().sum())
        missing_summary[col] = missing_count
        converted = pd.to_numeric(series, errors="coerce")
        non_empty = int(series.notna().sum())
        valid_num = int(converted.notna().sum())
        if non_empty > 0 and (valid_num / non_empty) >= 0.85:
            numeric_cols.append(col)
        else:
            non_numeric_cols.append(col)

    if not numeric_cols:
        raise ValueError("No valid numeric EMG signal columns were detected in this CSV.")

    lower_map = {h.lower(): h for h in headers}
    timestamp_col = next(
        (lower_map[c] for c in ("timestamp", "time", "time_s", "time_ms", "t", "seconds") if c in lower_map),
        None,
    )
    label_col = next(
        (lower_map[c] for c in ("movement_label", "label", "movement", "class", "gesture", "action") if c in lower_map),
        None,
    )

    inferred_fs: Optional[float] = None
    if timestamp_col and timestamp_col in numeric_cols and len(df) >= 10:
        ts = pd.to_numeric(df[timestamp_col], errors="coerce").dropna().values
        diffs = np.diff(ts[:500])
        diffs = diffs[diffs > 0]
        if len(diffs) >= 5:
            med = float(np.median(diffs))
            rate = 1.0 / med
            if 50 <= rate <= 20000:
                inferred_fs = round(rate)
            elif 0.1 <= med <= 20:
                inferred_fs = round(1000.0 / med)

    signal_cols = [c for c in numeric_cols if c != timestamp_col] or numeric_cols
    return {
        "df": df,
        "headers": headers,
        "numeric_columns": signal_cols,
        "non_numeric_columns": non_numeric_cols,
        "timestamp_column": timestamp_col,
        "label_column": label_col,
        "inferred_fs": inferred_fs,
        "missing_summary": missing_summary,
    }


def extract_window_features(segment: np.ndarray, idx: int, start: int, end: int, fs: float) -> Dict[str, Any]:
    n = len(segment)
    if n == 0:
        return {
            "window_index": idx,
            "start_sample": start,
            "end_sample": end,
            "start_time_s": start / fs,
            "end_time_s": end / fs,
            "mav": 0.0, "rms": 0.0, "wl": 0.0, "zc": 0, "ssc": 0, "variance": 0.0, "iemg": 0.0,
        }

    abs_seg = np.abs(segment)
    mav = float(np.mean(abs_seg))
    rms = float(np.sqrt(np.mean(segment ** 2)))
    wl = float(np.sum(np.abs(np.diff(segment)))) if n > 1 else 0.0
    variance = float(np.var(segment, ddof=1)) if n > 1 else 0.0
    iemg = float(np.sum(abs_seg))
    std_dev = float(np.sqrt(max(variance, 0.0)))

    zc_thresh = max(1e-4, 0.02 * std_dev)
    ssc_thresh = max(1e-7, (0.015 * std_dev) ** 2)

    zc = int(np.sum((segment[:-1] * segment[1:] < 0) & (np.abs(segment[:-1] - segment[1:]) >= zc_thresh))) if n > 1 else 0
    ssc = int(np.sum(((segment[1:-1] - segment[:-2]) * (segment[1:-1] - segment[2:])) >= ssc_thresh)) if n > 2 else 0

    return {
        "window_index": idx,
        "start_sample": start,
        "end_sample": end,
        "start_time_s": round(start / fs, 4),
        "end_time_s": round(end / fs, 4),
        "mav": round(mav, 6),
        "rms": round(rms, 6),
        "wl": round(wl, 6),
        "zc": zc,
        "ssc": ssc,
        "variance": round(variance, 6),
        "iemg": round(iemg, 6),
    }


def run_scipy_emg_pipeline(
    raw_series: pd.Series,
    config: Dict[str, Any],
    timestamps: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    numeric = pd.to_numeric(raw_series, errors="coerce")
    missing_count = int(numeric.isna().sum())
    if int(numeric.notna().sum()) < 16:
        raise ValueError("Selected signal column contains fewer than 16 valid numeric samples.")

    raw = numeric.interpolate(method="linear").bfill().ffill().to_numpy(dtype=np.float64)
    n = len(raw)
    fs = float(config.get("sampling_frequency", 1000.0))
    nyquist = fs / 2.0
    warnings: List[str] = []

    if timestamps is not None and len(timestamps) == n:
        span = float(timestamps[-1] - timestamps[0])
        scale = 0.001 if span > n * 0.5 else 1.0
        time_axis = (timestamps - timestamps[0]) * scale
    else:
        time_axis = np.arange(n, dtype=np.float64) / fs

    raw_mean = float(np.mean(raw))
    filtered = raw - raw_mean

    if config.get("apply_bandpass", True) and n > 24:
        low = float(config.get("bandpass_low_hz", 20.0))
        high = float(config.get("bandpass_high_hz", 450.0))
        order = int(config.get("filter_order", 4))
        if high >= nyquist:
            high = max(low + 5.0, float(int(nyquist * 0.92)))
            warnings.append(f"Bandpass high cutoff clamped below Nyquist to {high} Hz.")
        if low <= 0 or low >= high:
            raise ValueError(f"Invalid bandpass range ({low}-{high} Hz) for fs={fs} Hz.")
        b, a = butter(order, [low / nyquist, high / nyquist], btype="bandpass")
        filtered = filtfilt(b, a, filtered)

    if config.get("apply_notch", True) and n > 24:
        notch_f0 = float(config.get("notch_freq_hz", 50.0))
        notch_q = float(config.get("notch_q", 30.0))
        if 0 < notch_f0 < nyquist:
            b_n, a_n = iirnotch(notch_f0, notch_q, fs)
            filtered = filtfilt(b_n, a_n, filtered)
        else:
            warnings.append("Notch frequency outside Nyquist range; bypassed.")

    norm_mode = config.get("normalization", "zscore")
    if norm_mode == "zscore":
        std = float(np.std(filtered, ddof=1)) if n > 1 else 0.0
        normalized = (filtered - np.mean(filtered)) / std if std > 1e-12 else filtered.copy()
    elif norm_mode == "minmax":
        lo, hi = float(np.min(filtered)), float(np.max(filtered))
        normalized = (2.0 * (filtered - lo) / (hi - lo) - 1.0) if (hi - lo) > 1e-12 else filtered.copy()
    else:
        normalized = filtered.copy()

    win_ms = float(config.get("window_size_ms", 250.0))
    overlap_pct = float(config.get("window_overlap_pct", 50.0))
    win_samples = max(16, int(round((win_ms / 1000.0) * fs)))
    step_samples = max(1, int(round(win_samples * (1.0 - overlap_pct / 100.0))))

    windows: List[Dict[str, Any]] = []
    if n <= win_samples:
        windows.append(extract_window_features(filtered, 0, 0, n - 1, fs))
    else:
        idx = 0
        for start in range(0, n - win_samples + 1, step_samples):
            windows.append(extract_window_features(filtered[start : start + win_samples], idx, start, start + win_samples - 1, fs))
            idx += 1

    feature_matrix = np.array(
        [[w["mav"], w["rms"], w["wl"], w["zc"], w["ssc"], w["variance"], w["iemg"]] for w in windows],
        dtype=np.float64,
    )

    sig_pow = float(np.mean(filtered ** 2))
    noise_pow = float(np.mean(((raw - raw_mean) - filtered) ** 2))
    snr_db = round(10.0 * np.log10(sig_pow / noise_pow), 2) if (sig_pow > 1e-12 and noise_pow > 1e-12) else 30.0

    return {
        "time_axis": time_axis,
        "raw_signal": raw,
        "filtered_signal": filtered,
        "normalized_signal": normalized,
        "windows": windows,
        "feature_matrix": feature_matrix,
        "missing_count": missing_count,
        "snr_db": snr_db,
        "baseline_offset": round(raw_mean, 5),
        "warnings": warnings,
    }

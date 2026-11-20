from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


def block_stratified_split(
    X: np.ndarray, y: np.ndarray, test_ratio: float = 0.25
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    train_idx: List[int] = []
    test_idx: List[int] = []
    for cls in np.unique(y):
        indices = np.where(y == cls)[0]
        n_test = max(1, int(round(len(indices) * test_ratio)))
        n_train = max(1, len(indices) - n_test)
        train_idx.extend(indices[:n_train].tolist())
        test_idx.extend(indices[n_train:].tolist())
    return X[train_idx], y[train_idx], X[test_idx], y[test_idx]


def evaluate_classifier(y_true: np.ndarray, y_pred: np.ndarray, classes: List[str], model_type: str) -> Dict[str, Any]:
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(classes))))
    acc = float(accuracy_score(y_true, y_pred))
    mp, mr, mf1, _ = precision_recall_fscore_support(y_true, y_pred, average="macro", zero_division=0)
    _, _, wf1, _ = precision_recall_fscore_support(y_true, y_pred, average="weighted", zero_division=0)
    rep = classification_report(
        y_true, y_pred, labels=list(range(len(classes))), target_names=classes, output_dict=True, zero_division=0
    )

    rows = [
        {
            "label": cls,
            "precision": round(float(rep[cls]["precision"]), 4),
            "recall": round(float(rep[cls]["recall"]), 4),
            "f1_score": round(float(rep[cls]["f1-score"]), 4),
            "support": int(rep[cls]["support"]),
        }
        for cls in classes
    ]

    return {
        "model_type": model_type,
        "accuracy": round(acc, 4),
        "macro_precision": round(float(mp), 4),
        "macro_recall": round(float(mr), 4),
        "macro_f1": round(float(mf1), 4),
        "weighted_f1": round(float(wf1), 4),
        "classes": classes,
        "confusion_matrix": cm.tolist(),
        "classification_report": rows,
        "evaluated_samples": int(len(y_true)),
    }


def train_and_save_sklearn_bundle(
    X: np.ndarray,
    y: np.ndarray,
    classes: List[str],
    preprocessing_config: Dict[str, Any],
    dataset_name: str,
    model_version: str,
    model_dir: Path,
    test_ratio: float = 0.25,
    n_estimators: int = 100,
    svm_c: float = 2.5,
) -> Tuple[Dict[str, Any], Path]:
    X_train, y_train, X_test, y_test = block_stratified_split(X, y, test_ratio=test_ratio)

    # Fit StandardScaler exclusively on training data to eliminate data leakage
    scaler = StandardScaler()
    X_train_z = scaler.fit_transform(X_train)
    X_test_z = scaler.transform(X_test)

    rf = RandomForestClassifier(n_estimators=n_estimators, max_depth=12, random_state=42)
    rf.fit(X_train_z, y_train)
    rf_metrics = evaluate_classifier(y_test, rf.predict(X_test_z), classes, "random_forest")

    svm = SVC(kernel="rbf", C=svm_c, gamma="scale", probability=True, random_state=42)
    svm.fit(X_train_z, y_train)
    svm_metrics = evaluate_classifier(y_test, svm.predict(X_test_z), classes, "svm")

    # Class centroids and 98th percentile RMS distance for OOD detection
    centroids = np.array([X_train_z[y_train == c].mean(axis=0) for c in range(len(classes))])
    dists = [float(np.sqrt(np.mean((X_train_z[i] - centroids[y_train[i]]) ** 2))) for i in range(len(X_train_z))]
    ood_thresh = round(max(2.6, float(np.percentile(dists, 98)) * 1.9), 4)

    bundle = {
        "model_version": model_version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_name": dataset_name,
        "classes": classes,
        "scaler": scaler,
        "random_forest": rf,
        "svm": svm,
        "rf_metrics": rf_metrics,
        "svm_metrics": svm_metrics,
        "centroids": centroids,
        "ood_threshold": ood_thresh,
        "preprocessing_config": preprocessing_config,
        "train_windows": int(len(X_train)),
        "test_windows": int(len(X_test)),
    }

    artifact_path = model_dir / f"sklearn_{model_version.replace('.', '_')}.joblib"
    joblib.dump(bundle, artifact_path)
    return bundle, artifact_path

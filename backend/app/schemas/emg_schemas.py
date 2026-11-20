from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class PreprocessingConfigSchema(BaseModel):
    sampling_frequency: float = Field(1000.0, ge=50.0, le=20000.0)
    apply_bandpass: bool = True
    bandpass_low_hz: float = Field(20.0, gt=0.0)
    bandpass_high_hz: float = Field(450.0, gt=1.0)
    filter_order: int = Field(4, ge=2, le=8)
    apply_notch: bool = True
    notch_freq_hz: float = Field(50.0, gt=0.0)
    notch_q: float = Field(30.0, ge=2.0, le=100.0)
    normalization: Literal["zscore", "minmax", "none"] = "zscore"
    window_size_ms: float = Field(250.0, ge=20.0, le=5000.0)
    window_overlap_pct: float = Field(50.0, ge=0.0, lt=95.0)


class AnalyzeRequest(BaseModel):
    upload_id: str
    signal_column: str
    signal_columns: Optional[List[str]] = None
    model_type: Optional[Literal["random_forest", "svm"]] = None
    preprocessing: Optional[PreprocessingConfigSchema] = None


class TrainRequest(BaseModel):
    upload_id: Optional[str] = None
    use_bundled_dataset: bool = False
    signal_column: Optional[str] = None
    signal_columns: Optional[List[str]] = None
    label_column: Optional[str] = None
    preprocessing: Optional[PreprocessingConfigSchema] = None
    test_split_ratio: float = Field(0.25, ge=0.15, le=0.4)
    n_estimators: int = Field(100, ge=15, le=300)
    svm_c: float = Field(2.5, ge=0.1, le=50.0)
    preferred_model: Literal["random_forest", "svm"] = "random_forest"


class SwitchModelRequest(BaseModel):
    model_type: Literal["random_forest", "svm"]

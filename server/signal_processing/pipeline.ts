export interface PreprocessingConfig {
  sampling_frequency: number;
  apply_bandpass: boolean;
  bandpass_low_hz: number;
  bandpass_high_hz: number;
  filter_order: number;
  apply_notch: boolean;
  notch_freq_hz: number;
  notch_q: number;
  normalization: 'zscore' | 'minmax' | 'none';
  window_size_ms: number;
  window_overlap_pct: number;
}

export const DEFAULT_PREPROCESSING_CONFIG: PreprocessingConfig = {
  sampling_frequency: 1000,
  apply_bandpass: true,
  bandpass_low_hz: 20,
  bandpass_high_hz: 450,
  filter_order: 4,
  apply_notch: true,
  notch_freq_hz: 50,
  notch_q: 30,
  normalization: 'zscore',
  window_size_ms: 250,
  window_overlap_pct: 50,
};

export interface WindowFeatures {
  window_index: number;
  start_sample: number;
  end_sample: number;
  start_time_s: number;
  end_time_s: number;
  mav: number;
  rms: number;
  wl: number;
  zc: number;
  ssc: number;
  variance: number;
  iemg: number;
}

export interface FeatureSummary {
  mav: { mean: number; std: number; min: number; max: number };
  rms: { mean: number; std: number; min: number; max: number };
  wl: { mean: number; std: number; min: number; max: number };
  zc: { mean: number; std: number; min: number; max: number };
  ssc: { mean: number; std: number; min: number; max: number };
  variance: { mean: number; std: number; min: number; max: number };
  iemg: { mean: number; std: number; min: number; max: number };
}

export interface SignalQualityReport {
  overall_grade: 'Good' | 'Fair' | 'Poor';
  snr_db: number;
  missing_count: number;
  missing_ratio_pct: number;
  clipped_ratio_pct: number;
  baseline_offset: number;
  duration_seconds: number;
  sample_count: number;
  notes: string[];
}

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  numericColumns: string[];
  nonNumericColumns: string[];
  timestampColumn: string | null;
  labelColumn: string | null;
  inferredFs: number | null;
  missingSummary: Record<string, number>;
  previewRows: Record<string, string>[];
  warnings: string[];
}

export interface ProcessedSignalResult {
  time_axis: number[];
  raw_signal: number[];
  filtered_signal: number[];
  normalized_signal: number[];
  windows: WindowFeatures[];
  feature_vectors: number[][];
  feature_summary: FeatureSummary;
  signal_quality: SignalQualityReport;
  effective_config: PreprocessingConfig;
  warnings: string[];
}

export const FEATURE_NAMES = ['MAV', 'RMS', 'WL', 'ZC', 'SSC', 'Variance', 'IEMG'] as const;

/**
 * Robust RFC-4180 compatible CSV parser (handles quoted fields, CRLF/LF, trailing newlines).
 */
export function parseCsvText(csvText: string): ParsedCsvResult {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    throw new Error('The uploaded CSV file is empty.');
  }

  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"') {
      if (inQuotes && cleaned[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && cleaned[i + 1] === '\n') i++;
      if (current.trim().length > 0) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) lines.push(current);

  if (lines.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row.');
  }

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const rawHeaders = splitRow(lines[0]);
  const headers = rawHeaders.map((h, idx) => (h.length > 0 ? h : `column_${idx + 1}`));
  const uniqueHeaders = new Set(headers);
  if (uniqueHeaders.size !== headers.length) {
    throw new Error('CSV contains duplicate column names. Please ensure all headers are unique.');
  }

  const rows: Record<string, string>[] = [];
  const warnings: string[] = [];
  let malformedCount = 0;

  for (let r = 1; r < lines.length; r++) {
    const vals = splitRow(lines[r]);
    if (vals.length !== headers.length) {
      malformedCount++;
      if (vals.length < headers.length) {
        while (vals.length < headers.length) vals.push('');
      }
    }
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = vals[c] ?? '';
    }
    rows.push(rowObj);
  }

  if (malformedCount > 0) {
    warnings.push(`${malformedCount} row(s) had mismatched column counts and were padded/trimmed.`);
  }

  const numericColumns: string[] = [];
  const nonNumericColumns: string[] = [];
  const missingSummary: Record<string, number> = {};

  for (const col of headers) {
    let missing = 0;
    let validNum = 0;
    let nonEmpty = 0;

    for (const row of rows) {
      const raw = row[col];
      if (raw === '' || raw.toLowerCase() === 'nan' || raw.toLowerCase() === 'null' || raw === 'NA') {
        missing++;
      } else {
        nonEmpty++;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          validNum++;
        }
      }
    }
    missingSummary[col] = missing;
    if (nonEmpty > 0 && validNum / nonEmpty >= 0.85) {
      numericColumns.push(col);
    } else {
      nonNumericColumns.push(col);
    }
  }

  if (numericColumns.length === 0) {
    throw new Error(
      'No valid numeric EMG signal columns were detected in this CSV. Arbitrary non-numeric text files cannot be processed as EMG signals.'
    );
  }

  const lowerMap = new Map(headers.map((h) => [h.toLowerCase(), h]));
  let timestampColumn: string | null = null;
  for (const candidate of ['timestamp', 'time', 'time_s', 'time_ms', 't', 'seconds', 'ms']) {
    if (lowerMap.has(candidate)) {
      timestampColumn = lowerMap.get(candidate)!;
      break;
    }
  }
  if (!timestampColumn) {
    const match = headers.find((h) => /time|stamp|sec/i.test(h) && numericColumns.includes(h));
    if (match) timestampColumn = match;
  }

  let labelColumn: string | null = null;
  for (const candidate of ['label', 'movement', 'class', 'gesture', 'action', 'movement_label', 'target']) {
    if (lowerMap.has(candidate)) {
      labelColumn = lowerMap.get(candidate)!;
      break;
    }
  }
  if (!labelColumn) {
    const match = nonNumericColumns.find((h) => /label|move|class|gest|act/i.test(h));
    if (match) labelColumn = match;
  }

  let inferredFs: number | null = null;
  if (timestampColumn && numericColumns.includes(timestampColumn) && rows.length >= 10) {
    const diffs: number[] = [];
    for (let i = 1; i < Math.min(rows.length, 500); i++) {
      const t0 = Number(rows[i - 1][timestampColumn]);
      const t1 = Number(rows[i][timestampColumn]);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
        diffs.push(t1 - t0);
      }
    }
    if (diffs.length >= 5) {
      diffs.sort((a, b) => a - b);
      const medianDt = diffs[Math.floor(diffs.length / 2)];
      if (medianDt > 0) {
        // Distinguish seconds (e.g. 0.001 -> 1000 Hz) vs milliseconds (e.g. 1.0 -> 1000 Hz)
        const rawRate = 1 / medianDt;
        if (rawRate >= 50 && rawRate <= 20000) {
          inferredFs = Math.round(rawRate);
        } else if (medianDt >= 0.1 && medianDt <= 20) {
          inferredFs = Math.round(1000 / medianDt);
        }
      }
    }
  }

  // Filter timestamp column out of default signal suggestions if there are other numeric columns
  const signalNumericColumns = numericColumns.filter((c) => c !== timestampColumn);
  if (signalNumericColumns.length === 0) {
    warnings.push('Only a timestamp-like numeric column was found; verify your EMG channel selection.');
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    numericColumns: signalNumericColumns.length > 0 ? signalNumericColumns : numericColumns,
    nonNumericColumns,
    timestampColumn,
    labelColumn,
    inferredFs,
    missingSummary,
    previewRows: rows.slice(0, 12),
    warnings,
  };
}

/**
 * Extract numeric channel and impute missing values with linear interpolation.
 */
export function extractNumericSeries(
  rows: Record<string, string>[],
  column: string
): { values: number[]; missingCount: number; nonNumericCount: number } {
  if (!rows.length) {
    throw new Error('Dataset contains zero rows.');
  }
  if (!(column in rows[0])) {
    throw new Error(`Selected signal column "${column}" does not exist in CSV.`);
  }

  const rawVals: (number | null)[] = new Array(rows.length);
  let missingCount = 0;
  let nonNumericCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const str = (rows[i][column] ?? '').trim();
    if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str === 'NA') {
      rawVals[i] = null;
      missingCount++;
    } else {
      const n = Number(str);
      if (Number.isFinite(n)) {
        rawVals[i] = n;
      } else {
        rawVals[i] = null;
        nonNumericCount++;
      }
    }
  }

  const validCount = rows.length - missingCount - nonNumericCount;
  if (validCount < 16) {
    throw new Error(
      `Signal column "${column}" has only ${validCount} valid numeric samples. At least 16 numeric samples are required.`
    );
  }
  if (nonNumericCount / rows.length > 0.15) {
    throw new Error(
      `Signal column "${column}" contains ${nonNumericCount} non-numeric entries (${((nonNumericCount / rows.length) * 100).toFixed(1)}%). Please select a valid numeric EMG channel.`
    );
  }

  // Linear interpolation for missing samples
  const values = new Array<number>(rows.length);
  let lastValidIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rawVals[i] !== null) {
      const currVal = rawVals[i]!;
      values[i] = currVal;
      if (lastValidIdx === -1 && i > 0) {
        for (let k = 0; k < i; k++) values[k] = currVal;
      } else if (lastValidIdx >= 0 && i - lastValidIdx > 1) {
        const startVal = values[lastValidIdx];
        const span = i - lastValidIdx;
        for (let k = lastValidIdx + 1; k < i; k++) {
          values[k] = startVal + ((currVal - startVal) * (k - lastValidIdx)) / span;
        }
      }
      lastValidIdx = i;
    }
  }
  if (lastValidIdx < rows.length - 1 && lastValidIdx >= 0) {
    for (let k = lastValidIdx + 1; k < rows.length; k++) {
      values[k] = values[lastValidIdx];
    }
  }

  return { values, missingCount: missingCount + nonNumericCount, nonNumericCount };
}

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * 2nd-order Butterworth high-pass biquad via bilinear transform.
 */
function butterworthHighpassSection(fc: number, fs: number, q: number): BiquadCoeffs {
  const K = Math.tan((Math.PI * fc) / fs);
  const K2 = K * K;
  const norm = 1 / (1 + K / q + K2);
  return {
    b0: 1 * norm,
    b1: -2 * norm,
    b2: 1 * norm,
    a1: 2 * (K2 - 1) * norm,
    a2: (1 - K / q + K2) * norm,
  };
}

/**
 * 2nd-order Butterworth low-pass biquad via bilinear transform.
 */
function butterworthLowpassSection(fc: number, fs: number, q: number): BiquadCoeffs {
  const K = Math.tan((Math.PI * fc) / fs);
  const K2 = K * K;
  const norm = 1 / (1 + K / q + K2);
  return {
    b0: K2 * norm,
    b1: 2 * K2 * norm,
    b2: K2 * norm,
    a1: 2 * (K2 - 1) * norm,
    a2: (1 - K / q + K2) * norm,
  };
}

/**
 * 2nd-order IIR Notch filter biquad.
 */
function notchBiquad(f0: number, fs: number, Q: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: 1 / a0,
    b1: (-2 * cosW0) / a0,
    b2: 1 / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquadForward(x: number[], c: BiquadCoeffs): number[] {
  const n = x.length;
  const y = new Array<number>(n);
  let x1 = x[0] ?? 0;
  let x2 = x[0] ?? 0;
  let y1 = x[0] ?? 0;
  let y2 = x[0] ?? 0;

  for (let i = 0; i < n; i++) {
    const x0 = x[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = Number.isFinite(y0) ? y0 : 0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y[i];
  }
  return y;
}

/**
 * Zero-phase forward-backward digital filter (equivalent to scipy.signal.filtfilt)
 * with odd reflection padding to suppress edge transients.
 */
function filtfiltBiquads(signal: number[], sections: BiquadCoeffs[]): number[] {
  const n = signal.length;
  if (n < 12 || sections.length === 0) return [...signal];

  const padLen = Math.min(n - 1, 3 * (sections.length * 2 + 1));
  const padded = new Array<number>(n + 2 * padLen);

  // Odd reflection at left edge
  for (let i = 0; i < padLen; i++) {
    padded[i] = 2 * signal[0] - signal[padLen - i];
  }
  for (let i = 0; i < n; i++) {
    padded[padLen + i] = signal[i];
  }
  // Odd reflection at right edge
  for (let i = 0; i < padLen; i++) {
    padded[padLen + n + i] = 2 * signal[n - 1] - signal[n - 2 - i];
  }

  let data = padded;
  for (const sec of sections) {
    // Forward pass
    data = applyBiquadForward(data, sec);
    // Reverse
    data.reverse();
    // Backward pass
    data = applyBiquadForward(data, sec);
    // Restore order
    data.reverse();
  }

  return data.slice(padLen, padLen + n);
}

/**
 * Compute Butterworth Q factors for cascaded biquad sections of order 2*M.
 */
function butterworthQs(order: number): number[] {
  const evenOrder = Math.max(2, Math.min(8, Math.round(order / 2) * 2));
  const sections = evenOrder / 2;
  const qs: number[] = [];
  for (let k = 0; k < sections; k++) {
    const angle = (Math.PI * (2 * k + 1)) / (2 * evenOrder);
    qs.push(1 / (2 * Math.cos(angle)));
  }
  return qs;
}

export function validatePreprocessingConfig(
  partial: Partial<PreprocessingConfig>,
  sampleCount: number
): { config: PreprocessingConfig; warnings: string[] } {
  const warnings: string[] = [];
  const cfg: PreprocessingConfig = {
    ...DEFAULT_PREPROCESSING_CONFIG,
    ...partial,
  };

  if (!Number.isFinite(cfg.sampling_frequency) || cfg.sampling_frequency < 50 || cfg.sampling_frequency > 20000) {
    throw new Error(
      `Invalid sampling frequency (${cfg.sampling_frequency} Hz). Sampling frequency must be between 50 Hz and 20,000 Hz.`
    );
  }

  const nyquist = cfg.sampling_frequency / 2;

  if (cfg.apply_bandpass) {
    if (!Number.isFinite(cfg.bandpass_low_hz) || !Number.isFinite(cfg.bandpass_high_hz)) {
      throw new Error('Bandpass cutoff frequencies must be valid numbers.');
    }
    if (cfg.bandpass_low_hz <= 0) {
      throw new Error('Bandpass low cutoff frequency must be greater than 0 Hz.');
    }
    if (cfg.bandpass_low_hz >= cfg.bandpass_high_hz) {
      throw new Error(
        `Invalid bandpass range: low cutoff (${cfg.bandpass_low_hz} Hz) must be less than high cutoff (${cfg.bandpass_high_hz} Hz).`
      );
    }
    if (cfg.bandpass_high_hz >= nyquist) {
      const clamped = Math.max(cfg.bandpass_low_hz + 5, Math.floor(nyquist * 0.92));
      if (clamped <= cfg.bandpass_low_hz) {
        throw new Error(
          `Bandpass cutoffs (${cfg.bandpass_low_hz}-${cfg.bandpass_high_hz} Hz) exceed Nyquist limit (${nyquist} Hz) for fs=${cfg.sampling_frequency} Hz.`
        );
      }
      warnings.push(
        `High cutoff (${cfg.bandpass_high_hz} Hz) reached/exceeded Nyquist (${nyquist} Hz); automatically adjusted to ${clamped} Hz.`
      );
      cfg.bandpass_high_hz = clamped;
    }
  }

  if (cfg.apply_notch) {
    if (cfg.notch_freq_hz <= 0 || cfg.notch_freq_hz >= nyquist) {
      warnings.push(
        `Notch frequency (${cfg.notch_freq_hz} Hz) is outside valid range (0, ${nyquist} Hz); notch filter was bypassed.`
      );
      cfg.apply_notch = false;
    }
    if (!Number.isFinite(cfg.notch_q) || cfg.notch_q < 2 || cfg.notch_q > 100) {
      cfg.notch_q = 30;
    }
  }

  if (!Number.isFinite(cfg.window_size_ms) || cfg.window_size_ms < 20 || cfg.window_size_ms > 5000) {
    throw new Error('Window size must be between 20 ms and 5,000 ms.');
  }
  if (!Number.isFinite(cfg.window_overlap_pct) || cfg.window_overlap_pct < 0 || cfg.window_overlap_pct >= 95) {
    throw new Error('Window overlap must be between 0% and 94%.');
  }

  const samplesPerWindow = Math.max(8, Math.round((cfg.window_size_ms / 1000) * cfg.sampling_frequency));
  if (sampleCount < samplesPerWindow) {
    const adjustedMs = Math.max(20, Math.floor((sampleCount / cfg.sampling_frequency) * 1000));
    warnings.push(
      `Signal length (${sampleCount} samples) is shorter than one ${cfg.window_size_ms} ms window; using single-window analysis (${adjustedMs} ms).`
    );
  }

  return { config: cfg, warnings };
}

/**
 * Compute all 7 standard time-domain EMG biomedical features for a single signal window.
 */
export function extractWindowFeatures(
  segment: number[],
  windowIndex: number,
  startSample: number,
  endSample: number,
  fs: number
): WindowFeatures {
  const n = segment.length;
  if (n === 0) {
    return {
      window_index: windowIndex,
      start_sample: startSample,
      end_sample: endSample,
      start_time_s: startSample / fs,
      end_time_s: endSample / fs,
      mav: 0,
      rms: 0,
      wl: 0,
      zc: 0,
      ssc: 0,
      variance: 0,
      iemg: 0,
    };
  }

  let sumAbs = 0;
  let sumSq = 0;
  let sum = 0;
  let wl = 0;

  for (let i = 0; i < n; i++) {
    const v = segment[i];
    sum += v;
    sumAbs += Math.abs(v);
    sumSq += v * v;
    if (i > 0) {
      wl += Math.abs(v - segment[i - 1]);
    }
  }

  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = segment[i] - mean;
    varSum += d * d;
  }

  const variance = n > 1 ? varSum / (n - 1) : 0;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const mav = sumAbs / n;
  const rms = Math.sqrt(sumSq / n);
  const iemg = sumAbs;

  // Noise-adaptive dead-zone thresholds for ZC and SSC (standard Hudgins formulation)
  const zcThreshold = Math.max(1e-4, 0.02 * stdDev);
  const sscThreshold = Math.max(1e-7, Math.pow(0.015 * stdDev, 2));

  let zc = 0;
  for (let i = 0; i < n - 1; i++) {
    const x0 = segment[i];
    const x1 = segment[i + 1];
    if (x0 * x1 < 0 && Math.abs(x0 - x1) >= zcThreshold) {
      zc++;
    }
  }

  let ssc = 0;
  for (let i = 1; i < n - 1; i++) {
    const prod = (segment[i] - segment[i - 1]) * (segment[i] - segment[i + 1]);
    if (prod >= sscThreshold) {
      ssc++;
    }
  }

  return {
    window_index: windowIndex,
    start_sample: startSample,
    end_sample: endSample,
    start_time_s: Number((startSample / fs).toFixed(4)),
    end_time_s: Number((endSample / fs).toFixed(4)),
    mav: Number(mav.toFixed(6)),
    rms: Number(rms.toFixed(6)),
    wl: Number(wl.toFixed(6)),
    zc,
    ssc,
    variance: Number(variance.toFixed(6)),
    iemg: Number(iemg.toFixed(6)),
  };
}

export function featureVectorFromWindow(w: WindowFeatures): number[] {
  return [w.mav, w.rms, w.wl, w.zc, w.ssc, w.variance, w.iemg];
}

function summarizeFeature(values: number[]) {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / values.length;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) ** 2;
  const std = Math.sqrt(varSum / values.length);
  return {
    mean: Number(mean.toFixed(5)),
    std: Number(std.toFixed(5)),
    min: Number(min.toFixed(5)),
    max: Number(max.toFixed(5)),
  };
}

/**
 * Full EMG biomedical signal processing pipeline:
 * Missing-value imputation -> Bandpass Butterworth -> Notch -> Normalization -> Windowing -> Feature Extraction.
 */
export function runSignalProcessingPipeline(
  rawSignal: number[],
  missingCount: number,
  partialConfig: Partial<PreprocessingConfig> = {},
  timestamps?: number[]
): ProcessedSignalResult {
  const { config, warnings } = validatePreprocessingConfig(partialConfig, rawSignal.length);
  const n = rawSignal.length;
  const fs = config.sampling_frequency;

  // Build time axis
  const timeAxis = new Array<number>(n);
  if (timestamps && timestamps.length === n && Number.isFinite(timestamps[0])) {
    const t0 = timestamps[0];
    const span = timestamps[n - 1] - t0;
    const scale = span > n * 0.5 ? 0.001 : 1; // convert ms -> s if timestamps appear in ms
    for (let i = 0; i < n; i++) {
      timeAxis[i] = Number(((timestamps[i] - t0) * scale).toFixed(5));
    }
  } else {
    for (let i = 0; i < n; i++) {
      timeAxis[i] = Number((i / fs).toFixed(5));
    }
  }

  // Compute baseline DC offset before filtering
  let rawMean = 0;
  for (let i = 0; i < n; i++) rawMean += rawSignal[i];
  rawMean /= n;

  // Step 4: Filtering
  let filtered = rawSignal.map((v) => v - rawMean);
  if (config.apply_bandpass) {
    const qs = butterworthQs(config.filter_order);
    const hpSections = qs.map((q) => butterworthHighpassSection(config.bandpass_low_hz, fs, q));
    const lpSections = qs.map((q) => butterworthLowpassSection(config.bandpass_high_hz, fs, q));
    filtered = filtfiltBiquads(filtered, [...hpSections, ...lpSections]);
  }
  if (config.apply_notch) {
    const notch = notchBiquad(config.notch_freq_hz, fs, config.notch_q);
    filtered = filtfiltBiquads(filtered, [notch]);
  }

  // Step 5: Normalization
  let normalized = [...filtered];
  if (config.normalization === 'zscore') {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += filtered[i];
    mean /= n;
    let varSum = 0;
    for (let i = 0; i < n; i++) varSum += (filtered[i] - mean) ** 2;
    const std = Math.sqrt(varSum / Math.max(1, n - 1));
    if (std > 1e-12) {
      normalized = filtered.map((v) => (v - mean) / std);
    } else {
      warnings.push('Filtered signal has near-zero variance; Z-score normalization left signal unchanged.');
    }
  } else if (config.normalization === 'minmax') {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      if (filtered[i] < min) min = filtered[i];
      if (filtered[i] > max) max = filtered[i];
    }
    const range = max - min;
    if (range > 1e-12) {
      normalized = filtered.map((v) => (2 * (v - min)) / range - 1);
    }
  }

  // Step 6 & 7: Window Segmentation & Feature Extraction
  // Note: Extract features on the filtered signal (preserving physiological amplitude differences across gestures!)
  // unless user specifically trained/analyzed with normalized signal. We use filtered signal for amplitude-sensitive
  // biomedical features (MAV, RMS, IEMG, WL, Variance) so gesture contraction power is preserved!
  const featureSourceSignal = filtered;
  const winSamples = Math.max(16, Math.round((config.window_size_ms / 1000) * fs));
  const stepSamples = Math.max(1, Math.round(winSamples * (1 - config.window_overlap_pct / 100)));

  const windows: WindowFeatures[] = [];
  if (n <= winSamples) {
    windows.push(extractWindowFeatures(featureSourceSignal, 0, 0, n - 1, fs));
  } else {
    let idx = 0;
    for (let start = 0; start + winSamples <= n; start += stepSamples) {
      const seg = featureSourceSignal.slice(start, start + winSamples);
      windows.push(extractWindowFeatures(seg, idx++, start, start + winSamples - 1, fs));
    }
  }

  const featureVectors = windows.map(featureVectorFromWindow);

  const featureSummary: FeatureSummary = {
    mav: summarizeFeature(windows.map((w) => w.mav)),
    rms: summarizeFeature(windows.map((w) => w.rms)),
    wl: summarizeFeature(windows.map((w) => w.wl)),
    zc: summarizeFeature(windows.map((w) => w.zc)),
    ssc: summarizeFeature(windows.map((w) => w.ssc)),
    variance: summarizeFeature(windows.map((w) => w.variance)),
    iemg: summarizeFeature(windows.map((w) => w.iemg)),
  };

  // Signal Quality Estimation (SNR via filtered signal power vs removed noise residual power)
  let signalPower = 0;
  let noisePower = 0;
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const centeredRaw = rawSignal[i] - rawMean;
    const fVal = filtered[i];
    signalPower += fVal * fVal;
    const resid = centeredRaw - fVal;
    noisePower += resid * resid;
    const absRaw = Math.abs(rawSignal[i]);
    if (absRaw > maxAbs) maxAbs = absRaw;
  }
  const snrDb =
    noisePower > 1e-12 && signalPower > 1e-12
      ? Number((10 * Math.log10(signalPower / noisePower)).toFixed(2))
      : signalPower > 1e-12
      ? 30.0
      : 0.0;

  let clippedCount = 0;
  if (maxAbs > 1e-9) {
    const clipThresh = maxAbs * 0.995;
    for (let i = 0; i < n; i++) {
      if (Math.abs(rawSignal[i]) >= clipThresh) clippedCount++;
    }
  }
  const clippedRatioPct = Number(((clippedCount / n) * 100).toFixed(2));
  const missingRatioPct = Number(((missingCount / n) * 100).toFixed(2));

  const qualityNotes: string[] = [];
  if (missingRatioPct > 5) qualityNotes.push(`High missing-value ratio (${missingRatioPct}%).`);
  if (clippedRatioPct > 2) qualityNotes.push(`Potential ADC saturation detected (${clippedRatioPct}% near rail).`);
  if (snrDb < 5) qualityNotes.push(`Elevated out-of-band noise or power-line interference (pre-filter SNR ${snrDb} dB).`);
  if (Math.sqrt(signalPower / n) < 1e-4) qualityNotes.push('Very low RMS amplitude; check electrode contact.');
  if (qualityNotes.length === 0) qualityNotes.push('Clean surface EMG envelope within physiological bounds.');

  let overallGrade: 'Good' | 'Fair' | 'Poor' = 'Good';
  if (missingRatioPct > 10 || Math.sqrt(signalPower / n) < 1e-4 || snrDb < 0) {
    overallGrade = 'Poor';
  } else if (missingRatioPct > 2 || clippedRatioPct > 2 || snrDb < 6) {
    overallGrade = 'Fair';
  }

  return {
    time_axis: timeAxis,
    raw_signal: rawSignal,
    filtered_signal: filtered,
    normalized_signal: normalized,
    windows,
    feature_vectors: featureVectors,
    feature_summary: featureSummary,
    signal_quality: {
      overall_grade: overallGrade,
      snr_db: snrDb,
      missing_count: missingCount,
      missing_ratio_pct: missingRatioPct,
      clipped_ratio_pct: clippedRatioPct,
      baseline_offset: Number(rawMean.toFixed(5)),
      duration_seconds: Number((n / fs).toFixed(3)),
      sample_count: n,
      notes: qualityNotes,
    },
    effective_config: config,
    warnings,
  };
}

/**
 * Downsample long arrays cleanly for responsive browser Plotly rendering while preserving peaks.
 */
export function downsampleForPlot(
  time: number[],
  series: number[],
  maxPoints = 2000
): { t: number[]; y: number[] } {
  const n = time.length;
  if (n <= maxPoints) {
    return {
      t: time.map((v) => Number(v.toFixed(5))),
      y: series.map((v) => Number(v.toFixed(5))),
    };
  }
  const bucketCount = Math.floor(maxPoints / 2);
  const bucketSize = n / bucketCount;
  const tOut: number[] = [];
  const yOut: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(n, Math.floor((b + 1) * bucketSize));
    let minIdx = start;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      if (series[i] < series[minIdx]) minIdx = i;
      if (series[i] > series[maxIdx]) maxIdx = i;
    }
    const first = Math.min(minIdx, maxIdx);
    const second = Math.max(minIdx, maxIdx);
    tOut.push(Number(time[first].toFixed(5)));
    yOut.push(Number(series[first].toFixed(5)));
    if (second !== first) {
      tOut.push(Number(time[second].toFixed(5)));
      yOut.push(Number(series[second].toFixed(5)));
    }
  }
  return { t: tOut, y: yOut };
}

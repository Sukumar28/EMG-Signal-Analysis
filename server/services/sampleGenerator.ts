import fs from 'node:fs';
import path from 'node:path';

export const SAMPLE_DATA_DIR = path.resolve(process.cwd(), 'sample_data');

interface GestureBiophysics {
  label: string;
  filename: string;
  description: string;
  // Biophysically distinct sEMG motor-unit recruitment parameters on forearm flexor/extensor sites
  ch1Amp: number;       // Forearm flexor carpi radialis / palmaris amplitude scale (mV)
  ch2Amp: number;       // Forearm extensor digitorum amplitude scale (mV)
  muapRateHz: number;   // Aggregate MUAP firing rate (Hz)
  muapWidthMs: number;  // Biphasic MUAP duration parameter (controls spectral centroid & ZC/SSC)
  burstFreqHz: number;  // Low-frequency force modulation envelope
  burstDepth: number;   // Modulation depth
  noiseStd: number;     // Instrumentation thermal noise (mV)
}

const GESTURE_PROFILES: GestureBiophysics[] = [
  {
    label: 'Hand Open',
    filename: 'sample_hand_open.csv',
    description: 'Extensor digitorum recruitment with moderate amplitude and higher-frequency MUAP firing.',
    ch1Amp: 0.42,
    ch2Amp: 0.95,
    muapRateHz: 145,
    muapWidthMs: 1.55,
    burstFreqHz: 1.2,
    burstDepth: 0.18,
    noiseStd: 0.025,
  },
  {
    label: 'Hand Close',
    filename: 'sample_hand_close.csv',
    description: 'Strong flexor digitorum superficialis & profundus power grip contraction with high RMS/MAV.',
    ch1Amp: 1.38,
    ch2Amp: 0.48,
    muapRateHz: 210,
    muapWidthMs: 1.95,
    burstFreqHz: 0.8,
    burstDepth: 0.14,
    noiseStd: 0.032,
  },
  {
    label: 'Wrist Flexion',
    filename: 'sample_wrist_flexion.csv',
    description: 'Focused flexor carpi radialis contraction with mid-high amplitude and lower spectral ZC rate.',
    ch1Amp: 0.86,
    ch2Amp: 0.24,
    muapRateHz: 112,
    muapWidthMs: 2.55,
    burstFreqHz: 1.6,
    burstDepth: 0.22,
    noiseStd: 0.024,
  },
  {
    label: 'Wrist Extension',
    filename: 'sample_wrist_extension.csv',
    description: 'Sustained extensor carpi radialis activation with sharp biphasic spikes and high SSC density.',
    ch1Amp: 0.22,
    ch2Amp: 1.28,
    muapRateHz: 265,
    muapWidthMs: 1.22,
    burstFreqHz: 1.0,
    burstDepth: 0.15,
    noiseStd: 0.022,
  },
];

function createSeededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianNoise(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Synthesize realistic surface EMG time series by superposing biphasic/triphasic MUAP wavelets,
 * plus 50 Hz power-line interference and low-frequency motion/baseline drift (removed by our DSP pipeline).
 */
function synthesizeEmgSegment(
  profile: GestureBiophysics,
  durationSec: number,
  fs: number,
  seed: number
): { ch1: number[]; ch2: number[] } {
  const n = Math.round(durationSec * fs);
  const ch1 = new Float64Array(n);
  const ch2 = new Float64Array(n);
  const rng = createSeededRng(seed);

  const generateChannel = (target: Float64Array, ampScale: number, rateHz: number, widthMs: number) => {
    const totalEvents = Math.round(durationSec * rateHz);
    const halfSupport = Math.ceil((widthMs * 4.5 * fs) / 1000);
    const sigma = (widthMs / 1000) * fs;

    for (let e = 0; e < totalEvents; e++) {
      const center = rng() * n;
      const polarity = rng() > 0.5 ? 1 : -1;
      const eventAmp = ampScale * (0.65 + 0.7 * rng()) * polarity;
      const start = Math.max(0, Math.floor(center - halfSupport));
      const end = Math.min(n - 1, Math.ceil(center + halfSupport));

      // First-derivative / biphasic Hermite MUAP waveform
      for (let i = start; i <= end; i++) {
        const u = (i - center) / sigma;
        const muap = -u * Math.exp(-0.5 * u * u) * 1.65;
        target[i] += eventAmp * muap;
      }
    }

    const driftPhase = rng() * Math.PI * 2;
    const mainsPhase = rng() * Math.PI * 2;
    const mainsAmp = 0.08 + 0.04 * rng();
    const dcOffset = (rng() - 0.5) * 0.14;

    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const env = 1 + profile.burstDepth * Math.sin(2 * Math.PI * profile.burstFreqHz * t + driftPhase);
      const baselineWander = 0.06 * Math.sin(2 * Math.PI * 0.65 * t + driftPhase) + dcOffset;
      const powerLine = mainsAmp * Math.sin(2 * Math.PI * 50 * t + mainsPhase);
      const thermal = profile.noiseStd * gaussianNoise(rng);
      target[i] = target[i] * env + baselineWander + powerLine + thermal;
    }
  };

  generateChannel(ch1, profile.ch1Amp, profile.muapRateHz, profile.muapWidthMs);
  generateChannel(ch2, profile.ch2Amp, profile.muapRateHz * 1.04, profile.muapWidthMs * 0.96);

  return { ch1: Array.from(ch1), ch2: Array.from(ch2) };
}

export interface SampleDatasetInfo {
  filename: string;
  title: string;
  type: 'training' | 'inference';
  sampling_frequency: number;
  duration_seconds: number;
  description: string;
  size_bytes: number;
}

export function ensureSampleDatasets(): void {
  if (!fs.existsSync(SAMPLE_DATA_DIR)) {
    fs.mkdirSync(SAMPLE_DATA_DIR, { recursive: true });
  }

  const fsHz = 1000;

  // 1. Multi-class labelled training CSV (5.5s per movement class = 22,000 samples @ 1000 Hz)
  const trainPath = path.join(SAMPLE_DATA_DIR, 'emg_labelled_training_dataset.csv');
  if (!fs.existsSync(trainPath)) {
    const lines: string[] = ['timestamp_s,emg_ch1_mV,emg_ch2_mV,movement_label'];
    let globalIdx = 0;
    GESTURE_PROFILES.forEach((profile, idx) => {
      const seg = synthesizeEmgSegment(profile, 5.5, fsHz, 1001 + idx * 97);
      for (let i = 0; i < seg.ch1.length; i++) {
        const t = (globalIdx / fsHz).toFixed(4);
        lines.push(`${t},${seg.ch1[i].toFixed(5)},${seg.ch2[i].toFixed(5)},${profile.label}`);
        globalIdx++;
      }
    });
    fs.writeFileSync(trainPath, lines.join('\n') + '\n', 'utf-8');
  }

  // 2. Unlabelled inference sample CSVs (one per movement, different random seeds from training data!)
  GESTURE_PROFILES.forEach((profile, idx) => {
    const samplePath = path.join(SAMPLE_DATA_DIR, profile.filename);
    if (!fs.existsSync(samplePath)) {
      const seg = synthesizeEmgSegment(profile, 2.5, fsHz, 9001 + idx * 131);
      const lines: string[] = ['timestamp_s,emg_ch1_mV,emg_ch2_mV'];
      for (let i = 0; i < seg.ch1.length; i++) {
        const t = (i / fsHz).toFixed(4);
        lines.push(`${t},${seg.ch1[i].toFixed(5)},${seg.ch2[i].toFixed(5)}`);
      }
      fs.writeFileSync(samplePath, lines.join('\n') + '\n', 'utf-8');
    }
  });
}

export function listSampleDatasets(): SampleDatasetInfo[] {
  ensureSampleDatasets();
  const entries: SampleDatasetInfo[] = [
    {
      filename: 'emg_labelled_training_dataset.csv',
      title: '4-Class Labelled sEMG Training Dataset',
      type: 'training',
      sampling_frequency: 1000,
      duration_seconds: 22.0,
      description:
        'Labelled 2-channel surface EMG dataset (22,000 samples @ 1000 Hz) spanning Hand Open, Hand Close, Wrist Flexion, and Wrist Extension with realistic 50 Hz interference and baseline drift.',
      size_bytes: fs.statSync(path.join(SAMPLE_DATA_DIR, 'emg_labelled_training_dataset.csv')).size,
    },
    ...GESTURE_PROFILES.map((p) => ({
      filename: p.filename,
      title: `Unlabelled Test Recording — ${p.label}`,
      type: 'inference' as const,
      sampling_frequency: 1000,
      duration_seconds: 2.5,
      description: p.description,
      size_bytes: fs.statSync(path.join(SAMPLE_DATA_DIR, p.filename)).size,
    })),
  ];
  return entries;
}

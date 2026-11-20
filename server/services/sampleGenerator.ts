import fs from 'node:fs';
import path from 'node:path';

export const SAMPLE_DATA_DIR = path.resolve(process.cwd(), 'sample_data');

export interface MuscleActionProfile {
  label: string;
  category: 'Baseline' | 'Hand & Fingers' | 'Wrist & Forearm' | 'Upper Limb';
  filename: string;
  primaryMuscles: string;
  description: string;
  // 4-channel anatomical sEMG amplitude profiles (mV):
  // ch1: Forearm Flexor (FDS / FCR), ch2: Forearm Extensor (ED / ECR),
  // ch3: Pronator / Ulnar-Radial Stabilizer (PT / FCU), ch4: Upper Arm Biceps / Brachioradialis
  chAmps: [number, number, number, number];
  muapRateHz: number;
  muapWidthMs: number;
  burstFreqHz: number;
  burstDepth: number;
  noiseStd: number;
}

export const ALL_MUSCLE_ACTIONS: MuscleActionProfile[] = [
  {
    label: 'Rest (Baseline)',
    category: 'Baseline',
    filename: 'sample_rest_baseline.csv',
    primaryMuscles: 'Tonic Resting Baseline (Relaxed Upper Limb)',
    description: 'Relaxed neuromuscular baseline with minimal spontaneous motor unit firing.',
    chAmps: [0.03, 0.03, 0.03, 0.03],
    muapRateHz: 25,
    muapWidthMs: 2.2,
    burstFreqHz: 0.4,
    burstDepth: 0.05,
    noiseStd: 0.018,
  },
  {
    label: 'Hand Open',
    category: 'Hand & Fingers',
    filename: 'sample_hand_open.csv',
    primaryMuscles: 'Extensor Digitorum & Abductor Pollicis Longus',
    description: 'Full 5-digit finger extension and metacarpophalangeal splay.',
    chAmps: [0.22, 1.15, 0.28, 0.14],
    muapRateHz: 155,
    muapWidthMs: 1.55,
    burstFreqHz: 1.1,
    burstDepth: 0.16,
    noiseStd: 0.022,
  },
  {
    label: 'Hand Close',
    category: 'Hand & Fingers',
    filename: 'sample_hand_close.csv',
    primaryMuscles: 'Flexor Digitorum Superficialis & Profundus',
    description: 'High-force cylindrical power grip finger flexion across all digits.',
    chAmps: [1.45, 0.36, 0.42, 0.22],
    muapRateHz: 215,
    muapWidthMs: 1.95,
    burstFreqHz: 0.8,
    burstDepth: 0.14,
    noiseStd: 0.028,
  },
  {
    label: 'Pinch Grip',
    category: 'Hand & Fingers',
    filename: 'sample_pinch_grip.csv',
    primaryMuscles: 'Flexor Pollicis Longus & First Dorsal Interosseous',
    description: 'Precision thumb-to-index opposition with moderate controlled flexor recruitment.',
    chAmps: [0.68, 0.24, 0.56, 0.10],
    muapRateHz: 240,
    muapWidthMs: 1.25,
    burstFreqHz: 1.8,
    burstDepth: 0.18,
    noiseStd: 0.020,
  },
  {
    label: 'Pointing Index',
    category: 'Hand & Fingers',
    filename: 'sample_pointing_index.csv',
    primaryMuscles: 'Extensor Indicis & Selective Flexor Digitorum',
    description: 'Isolated index finger extension while digits 3–5 flex into palm.',
    chAmps: [0.62, 0.78, 0.18, 0.12],
    muapRateHz: 178,
    muapWidthMs: 1.48,
    burstFreqHz: 1.3,
    burstDepth: 0.15,
    noiseStd: 0.021,
  },
  {
    label: 'Wrist Flexion',
    category: 'Wrist & Forearm',
    filename: 'sample_wrist_flexion.csv',
    primaryMuscles: 'Flexor Carpi Radialis & Flexor Carpi Ulnaris',
    description: 'Palmar (volar) wrist flexion driven by superficial forearm flexors.',
    chAmps: [1.08, 0.16, 0.72, 0.18],
    muapRateHz: 120,
    muapWidthMs: 2.45,
    burstFreqHz: 1.4,
    burstDepth: 0.20,
    noiseStd: 0.023,
  },
  {
    label: 'Wrist Extension',
    category: 'Wrist & Forearm',
    filename: 'sample_wrist_extension.csv',
    primaryMuscles: 'Extensor Carpi Radialis Longus/Brevis & Ulnaris',
    description: 'Dorsal wrist elevation with sharp high-frequency extensor motor spikes.',
    chAmps: [0.16, 1.42, 0.34, 0.16],
    muapRateHz: 265,
    muapWidthMs: 1.18,
    burstFreqHz: 1.0,
    burstDepth: 0.14,
    noiseStd: 0.022,
  },
  {
    label: 'Wrist Pronation',
    category: 'Wrist & Forearm',
    filename: 'sample_wrist_pronation.csv',
    primaryMuscles: 'Pronator Teres & Pronator Quadratus',
    description: 'Internal axial forearm rotation turning the palm downward.',
    chAmps: [0.46, 0.22, 1.28, 0.26],
    muapRateHz: 185,
    muapWidthMs: 1.72,
    burstFreqHz: 1.2,
    burstDepth: 0.17,
    noiseStd: 0.024,
  },
  {
    label: 'Wrist Supination',
    category: 'Wrist & Forearm',
    filename: 'sample_wrist_supination.csv',
    primaryMuscles: 'Supinator & Biceps Brachii (Short/Long Head)',
    description: 'External axial forearm rotation turning the palm upward with biceps synergy.',
    chAmps: [0.18, 0.54, 0.88, 0.92],
    muapRateHz: 165,
    muapWidthMs: 1.85,
    burstFreqHz: 0.9,
    burstDepth: 0.16,
    noiseStd: 0.024,
  },
  {
    label: 'Radial Deviation',
    category: 'Wrist & Forearm',
    filename: 'sample_radial_deviation.csv',
    primaryMuscles: 'Flexor Carpi Radialis & Extensor Carpi Radialis Longus',
    description: 'Lateral abduction of the wrist toward the radial (thumb) side.',
    chAmps: [0.74, 0.88, 0.84, 0.16],
    muapRateHz: 142,
    muapWidthMs: 2.05,
    burstFreqHz: 1.5,
    burstDepth: 0.18,
    noiseStd: 0.022,
  },
  {
    label: 'Ulnar Deviation',
    category: 'Wrist & Forearm',
    filename: 'sample_ulnar_deviation.csv',
    primaryMuscles: 'Flexor Carpi Ulnaris & Extensor Carpi Ulnaris',
    description: 'Medial adduction of the wrist toward the ulnar (pinky) side.',
    chAmps: [0.34, 0.42, 1.12, 0.52],
    muapRateHz: 228,
    muapWidthMs: 1.38,
    burstFreqHz: 1.6,
    burstDepth: 0.19,
    noiseStd: 0.023,
  },
  {
    label: 'Elbow Flexion',
    category: 'Upper Limb',
    filename: 'sample_elbow_flexion.csv',
    primaryMuscles: 'Biceps Brachii, Brachialis & Brachioradialis',
    description: 'Strong humero-ulnar flexion dominated by upper-arm biceps recruitment.',
    chAmps: [0.28, 0.22, 0.36, 1.58],
    muapRateHz: 195,
    muapWidthMs: 2.15,
    burstFreqHz: 0.75,
    burstDepth: 0.15,
    noiseStd: 0.026,
  },
];

export const DEFAULT_EMG_CHANNELS = [
  'emg_ch1_flexor_mV',
  'emg_ch2_extensor_mV',
  'emg_ch3_pronator_mV',
  'emg_ch4_biceps_mV',
] as const;

const DATASET_HEADER_SIGNATURE = `timestamp_s,${DEFAULT_EMG_CHANNELS.join(',')},movement_label`;

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
 * Synthesize 4-channel surface EMG recording via biphasic MUAP superposition,
 * 50 Hz mains interference, and low-frequency motion/baseline drift.
 */
function synthesizeMultiChannelEmg(
  profile: MuscleActionProfile,
  durationSec: number,
  fs: number,
  seed: number
): number[][] {
  const n = Math.round(durationSec * fs);
  const rng = createSeededRng(seed);

  return profile.chAmps.map((ampScale, chIdx) => {
    const buf = new Float64Array(n);
    const rateHz = profile.muapRateHz * (0.94 + 0.04 * chIdx);
    const widthMs = profile.muapWidthMs * (1.03 - 0.02 * chIdx);
    const totalEvents = Math.max(4, Math.round(durationSec * rateHz));
    const halfSupport = Math.ceil((widthMs * 4.5 * fs) / 1000);
    const sigma = (widthMs / 1000) * fs;

    for (let e = 0; e < totalEvents; e++) {
      const center = rng() * n;
      const polarity = rng() > 0.5 ? 1 : -1;
      const eventAmp = ampScale * (0.68 + 0.64 * rng()) * polarity;
      const start = Math.max(0, Math.floor(center - halfSupport));
      const end = Math.min(n - 1, Math.ceil(center + halfSupport));
      for (let i = start; i <= end; i++) {
        const u = (i - center) / sigma;
        const muap = -u * Math.exp(-0.5 * u * u) * 1.65;
        buf[i] += eventAmp * muap;
      }
    }

    const driftPhase = rng() * Math.PI * 2;
    const mainsPhase = rng() * Math.PI * 2;
    const mainsAmp = 0.06 + 0.03 * rng();
    const dcOffset = (rng() - 0.5) * 0.12;

    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const env = 1 + profile.burstDepth * Math.sin(2 * Math.PI * profile.burstFreqHz * t + driftPhase);
      const baselineWander = 0.05 * Math.sin(2 * Math.PI * 0.6 * t + driftPhase) + dcOffset;
      const powerLine = mainsAmp * Math.sin(2 * Math.PI * 50 * t + mainsPhase);
      const thermal = profile.noiseStd * gaussianNoise(rng);
      buf[i] = buf[i] * env + baselineWander + powerLine + thermal;
    }

    return Array.from(buf);
  });
}

export interface SampleDatasetInfo {
  filename: string;
  title: string;
  category: string;
  muscle_action?: string;
  primary_muscles?: string;
  type: 'training' | 'inference';
  sampling_frequency: number;
  duration_seconds: number;
  channels: number;
  description: string;
  size_bytes: number;
}

export function ensureSampleDatasets(): void {
  if (!fs.existsSync(SAMPLE_DATA_DIR)) {
    fs.mkdirSync(SAMPLE_DATA_DIR, { recursive: true });
  }

  const fsHz = 1000;
  const trainPath = path.join(SAMPLE_DATA_DIR, 'emg_labelled_training_dataset.csv');

  // Upgrade older 4-class CSV automatically if header signature changed
  let needsRegen = !fs.existsSync(trainPath);
  if (!needsRegen) {
    const firstLine = fs.readFileSync(trainPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
    if (firstLine !== DATASET_HEADER_SIGNATURE) {
      needsRegen = true;
    }
  }

  if (needsRegen) {
    // 3.5s per muscle action × 12 actions = 42,000 rows @ 1000 Hz (4 anatomical channels)
    const lines: string[] = [DATASET_HEADER_SIGNATURE];
    let globalIdx = 0;
    ALL_MUSCLE_ACTIONS.forEach((profile, idx) => {
      const chData = synthesizeMultiChannelEmg(profile, 3.5, fsHz, 2021 + idx * 103);
      const len = chData[0].length;
      for (let i = 0; i < len; i++) {
        const t = (globalIdx / fsHz).toFixed(4);
        lines.push(
          `${t},${chData[0][i].toFixed(5)},${chData[1][i].toFixed(5)},${chData[2][i].toFixed(5)},${chData[3][i].toFixed(5)},${profile.label}`
        );
        globalIdx++;
      }
    });
    fs.writeFileSync(trainPath, lines.join('\n') + '\n', 'utf-8');
  }

  // Generate/upgrade all 12 unlabelled inference sample CSVs (distinct seeds from training set!)
  const inferenceHeader = `timestamp_s,${DEFAULT_EMG_CHANNELS.join(',')}`;
  ALL_MUSCLE_ACTIONS.forEach((profile, idx) => {
    const samplePath = path.join(SAMPLE_DATA_DIR, profile.filename);
    let regenSample = !fs.existsSync(samplePath);
    if (!regenSample) {
      const firstLine = fs.readFileSync(samplePath, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
      if (firstLine !== inferenceHeader) regenSample = true;
    }
    if (regenSample) {
      const chData = synthesizeMultiChannelEmg(profile, 2.0, fsHz, 9401 + idx * 149);
      const len = chData[0].length;
      const lines: string[] = [inferenceHeader];
      for (let i = 0; i < len; i++) {
        const t = (i / fsHz).toFixed(4);
        lines.push(
          `${t},${chData[0][i].toFixed(5)},${chData[1][i].toFixed(5)},${chData[2][i].toFixed(5)},${chData[3][i].toFixed(5)}`
        );
      }
      fs.writeFileSync(samplePath, lines.join('\n') + '\n', 'utf-8');
    }
  });
}

export function listSampleDatasets(): SampleDatasetInfo[] {
  ensureSampleDatasets();
  const trainFile = path.join(SAMPLE_DATA_DIR, 'emg_labelled_training_dataset.csv');
  return [
    {
      filename: 'emg_labelled_training_dataset.csv',
      title: '12-Action Multi-Channel Labelled sEMG Training Dataset',
      category: 'Training Dataset',
      type: 'training',
      sampling_frequency: 1000,
      duration_seconds: 42.0,
      channels: 4,
      description:
        '4-channel surface EMG dataset (42,000 samples @ 1000 Hz) spanning all 12 muscle actions: Rest, Hand Open/Close, Pinch Grip, Pointing Index, Wrist Flexion/Extension/Pronation/Supination, Radial/Ulnar Deviation, and Elbow Flexion.',
      size_bytes: fs.statSync(trainFile).size,
    },
    ...ALL_MUSCLE_ACTIONS.map((p) => ({
      filename: p.filename,
      title: `Unlabelled Recording — ${p.label}`,
      category: p.category,
      muscle_action: p.label,
      primary_muscles: p.primaryMuscles,
      type: 'inference' as const,
      sampling_frequency: 1000,
      duration_seconds: 2.0,
      channels: 4,
      description: p.description,
      size_bytes: fs.statSync(path.join(SAMPLE_DATA_DIR, p.filename)).size,
    })),
  ];
}

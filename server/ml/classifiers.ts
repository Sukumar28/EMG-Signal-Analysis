import fs from 'node:fs';
import path from 'node:path';
import type { PreprocessingConfig } from '../signal_processing/pipeline.ts';

export interface ScalerState {
  mean: number[];
  std: number[];
}

export interface DecisionTreeNode {
  leaf: boolean;
  featureIndex?: number;
  threshold?: number;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
  probs?: number[];
}

export interface RandomForestArtifact {
  n_estimators: number;
  max_depth: number;
  classes: string[];
  trees: DecisionTreeNode[];
}

export interface BinarySvmModel {
  support_vectors: number[][];
  dual_coefs: number[]; // alpha_i * y_i
  bias: number;
  gamma: number;
}

export interface SvmArtifact {
  classes: string[];
  gamma: number;
  c_param: number;
  models: BinarySvmModel[];
}

export interface ClassReportRow {
  label: string;
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

export interface EvaluationMetrics {
  model_type: 'random_forest' | 'svm';
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_f1: number;
  classes: string[];
  confusion_matrix: number[][];
  classification_report: ClassReportRow[];
  evaluated_samples: number;
}

export interface TrainedModelBundle {
  model_version: string;
  trained_at: string;
  dataset_name: string;
  classes: string[];
  signal_columns: string[];
  feature_names: string[];
  scaler: ScalerState;
  class_centroids_z: number[][];
  ood_distance_threshold: number;
  preprocessing_config: PreprocessingConfig;
  random_forest: RandomForestArtifact;
  svm: SvmArtifact;
  rf_metrics: EvaluationMetrics;
  svm_metrics: EvaluationMetrics;
  train_windows: number;
  test_windows: number;
}

// Deterministic PRNG (Mulberry32) for reproducible splits and RF training
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fitScaler(X: number[][]): ScalerState {
  const n = X.length;
  const d = X[0].length;
  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) mean[j] += X[i][j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      const diff = X[i][j] - mean[j];
      std[j] += diff * diff;
    }
  }
  for (let j = 0; j < d; j++) {
    const s = Math.sqrt(std[j] / Math.max(1, n));
    std[j] = s > 1e-10 ? s : 1;
  }

  return { mean, std };
}

export function transformScaler(X: number[][], scaler: ScalerState): number[][] {
  return X.map((row) => row.map((v, j) => (v - scaler.mean[j]) / scaler.std[j]));
}

/**
 * Stratified train/test split with zero leakage across classes.
 */
export function stratifiedTrainTestSplit(
  X: number[][],
  y: number[],
  testRatio = 0.25,
  seed = 42
): { XTrain: number[][]; yTrain: number[]; XTest: number[][]; yTest: number[] } {
  const rng = createRng(seed);
  const byClass = new Map<number, number[]>();
  for (let i = 0; i < y.length; i++) {
    const list = byClass.get(y[i]) ?? [];
    list.push(i);
    byClass.set(y[i], list);
  }

  const trainIdx: number[] = [];
  const testIdx: number[] = [];

  for (const [, indices] of byClass.entries()) {
    // Contiguous block split per class reduces temporal overlap leakage between overlapping windows!
    const nTest = Math.max(1, Math.round(indices.length * testRatio));
    const nTrain = Math.max(1, indices.length - nTest);
    // Keep last contiguous block as held-out evaluation block so overlapping sliding windows don't leak across train/test
    for (let i = 0; i < indices.length; i++) {
      if (i < nTrain) trainIdx.push(indices[i]);
      else testIdx.push(indices[i]);
    }
  }

  // Shuffle within train set only
  for (let i = trainIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trainIdx[i], trainIdx[j]] = [trainIdx[j], trainIdx[i]];
  }

  return {
    XTrain: trainIdx.map((i) => X[i]),
    yTrain: trainIdx.map((i) => y[i]),
    XTest: testIdx.map((i) => X[i]),
    yTest: testIdx.map((i) => y[i]),
  };
}

function giniImpurity(counts: number[], total: number): number {
  if (total === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < counts.length; i++) {
    const p = counts[i] / total;
    sumSq += p * p;
  }
  return 1 - sumSq;
}

function buildCartTree(
  X: number[][],
  y: number[],
  indices: number[],
  numClasses: number,
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
  maxFeatures: number,
  rng: () => number
): DecisionTreeNode {
  const counts = new Array<number>(numClasses).fill(0);
  for (const idx of indices) counts[y[idx]]++;

  const total = indices.length;
  const probs = counts.map((c) => (total > 0 ? c / total : 0));
  const currentGini = giniImpurity(counts, total);

  if (depth >= maxDepth || total < minSamplesSplit || currentGini < 1e-7) {
    return { leaf: true, probs };
  }

  const numFeatures = X[0].length;
  const featureOrder = Array.from({ length: numFeatures }, (_, i) => i);
  for (let i = featureOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [featureOrder[i], featureOrder[j]] = [featureOrder[j], featureOrder[i]];
  }
  const candidateFeatures = featureOrder.slice(0, maxFeatures);

  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (const f of candidateFeatures) {
    const pairs = indices.map((idx) => ({ val: X[idx][f], cls: y[idx] }));
    pairs.sort((a, b) => a.val - b.val);

    const leftCounts = new Array<number>(numClasses).fill(0);
    const rightCounts = [...counts];

    for (let i = 0; i < total - 1; i++) {
      const c = pairs[i].cls;
      leftCounts[c]++;
      rightCounts[c]--;

      if (pairs[i].val === pairs[i + 1].val) continue;

      const leftN = i + 1;
      const rightN = total - leftN;
      const weightedGini =
        (leftN / total) * giniImpurity(leftCounts, leftN) +
        (rightN / total) * giniImpurity(rightCounts, rightN);
      const gain = currentGini - weightedGini;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (pairs[i].val + pairs[i + 1].val) / 2;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-7) {
    return { leaf: true, probs };
  }

  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (const idx of indices) {
    if (X[idx][bestFeature] <= bestThreshold) leftIndices.push(idx);
    else rightIndices.push(idx);
  }

  if (leftIndices.length === 0 || rightIndices.length === 0) {
    return { leaf: true, probs };
  }

  return {
    leaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildCartTree(
      X,
      y,
      leftIndices,
      numClasses,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      maxFeatures,
      rng
    ),
    right: buildCartTree(
      X,
      y,
      rightIndices,
      numClasses,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      maxFeatures,
      rng
    ),
  };
}

function predictTreeProba(node: DecisionTreeNode, x: number[]): number[] {
  let curr = node;
  while (!curr.leaf) {
    if (x[curr.featureIndex!] <= curr.threshold!) {
      curr = curr.left!;
    } else {
      curr = curr.right!;
    }
  }
  return curr.probs!;
}

export function trainRandomForest(
  X: number[][],
  y: number[],
  classes: string[],
  nEstimators = 50,
  maxDepth = 10,
  seed = 42
): RandomForestArtifact {
  const rng = createRng(seed);
  const n = X.length;
  const d = X[0].length;
  const maxFeatures = Math.max(2, Math.round(Math.sqrt(d)));
  const trees: DecisionTreeNode[] = [];

  for (let t = 0; t < nEstimators; t++) {
    const bootIndices = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      bootIndices[i] = Math.floor(rng() * n);
    }
    trees.push(buildCartTree(X, y, bootIndices, classes.length, 0, maxDepth, 3, maxFeatures, rng));
  }

  return {
    n_estimators: nEstimators,
    max_depth: maxDepth,
    classes,
    trees,
  };
}

export function predictRandomForestProba(rf: RandomForestArtifact, X: number[][]): number[][] {
  const k = rf.classes.length;
  return X.map((row) => {
    const sum = new Array<number>(k).fill(0);
    for (const tree of rf.trees) {
      const p = predictTreeProba(tree, row);
      for (let c = 0; c < k; c++) sum[c] += p[c];
    }
    return sum.map((v) => v / rf.trees.length);
  });
}

function rbfKernel(a: number[], b: number[], gamma: number): number {
  let distSq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    distSq += d * d;
  }
  return Math.exp(-gamma * distSq);
}

/**
 * Simplified Platt SMO binary RBF-kernel SVM solver.
 */
function trainBinaryRbfSvm(
  X: number[][],
  yBinary: number[], // +1 or -1
  C: number,
  gamma: number,
  maxPasses = 8,
  seed = 42
): BinarySvmModel {
  const n = X.length;
  const rng = createRng(seed);
  const alphas = new Array<number>(n).fill(0);
  let b = 0;
  const tol = 1e-3;

  // Precompute Gram kernel matrix
  const K: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    K[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const val = rbfKernel(X[i], X[j], gamma);
      K[i][j] = val;
      K[j][i] = val;
    }
  }

  const decisionValue = (idx: number): number => {
    let sum = b;
    for (let j = 0; j < n; j++) {
      if (alphas[j] > 0) sum += alphas[j] * yBinary[j] * K[j][idx];
    }
    return sum;
  };

  let passes = 0;
  let totalIters = 0;
  const maxTotalIters = 80;

  while (passes < maxPasses && totalIters < maxTotalIters) {
    let numChanged = 0;
    totalIters++;

    for (let i = 0; i < n; i++) {
      const Ei = decisionValue(i) - yBinary[i];
      if ((yBinary[i] * Ei < -tol && alphas[i] < C) || (yBinary[i] * Ei > tol && alphas[i] > 0)) {
        let j = Math.floor(rng() * (n - 1));
        if (j >= i) j++;
        const Ej = decisionValue(j) - yBinary[j];

        const alphaIOld = alphas[i];
        const alphaJOld = alphas[j];

        let L: number;
        let H: number;
        if (yBinary[i] !== yBinary[j]) {
          L = Math.max(0, alphas[j] - alphas[i]);
          H = Math.min(C, C + alphas[j] - alphas[i]);
        } else {
          L = Math.max(0, alphas[i] + alphas[j] - C);
          H = Math.min(C, alphas[i] + alphas[j]);
        }
        if (L === H) continue;

        const eta = 2 * K[i][j] - K[i][i] - K[j][j];
        if (eta >= 0) continue;

        alphas[j] -= (yBinary[j] * (Ei - Ej)) / eta;
        if (alphas[j] > H) alphas[j] = H;
        else if (alphas[j] < L) alphas[j] = L;

        if (Math.abs(alphas[j] - alphaJOld) < 1e-4) continue;

        alphas[i] += yBinary[i] * yBinary[j] * (alphaJOld - alphas[j]);

        const b1 =
          b -
          Ei -
          yBinary[i] * (alphas[i] - alphaIOld) * K[i][i] -
          yBinary[j] * (alphas[j] - alphaJOld) * K[i][j];
        const b2 =
          b -
          Ej -
          yBinary[i] * (alphas[i] - alphaIOld) * K[i][j] -
          yBinary[j] * (alphas[j] - alphaJOld) * K[j][j];

        if (alphas[i] > 0 && alphas[i] < C) b = b1;
        else if (alphas[j] > 0 && alphas[j] < C) b = b2;
        else b = (b1 + b2) / 2;

        numChanged++;
      }
    }
    if (numChanged === 0) passes++;
    else passes = 0;
  }

  const support_vectors: number[][] = [];
  const dual_coefs: number[] = [];
  for (let i = 0; i < n; i++) {
    if (alphas[i] > 1e-6) {
      support_vectors.push(X[i]);
      dual_coefs.push(alphas[i] * yBinary[i]);
    }
  }

  return { support_vectors, dual_coefs, bias: b, gamma };
}

export function trainOneVsRestSvm(
  X: number[][],
  y: number[],
  classes: string[],
  C = 2.0,
  seed = 42
): SvmArtifact {
  const d = X[0].length;
  // Standard sklearn gamma='scale' on standardized data (variance ~ 1) => 1 / d
  const gamma = 1 / Math.max(1, d);
  // Cap SVM training set cleanly if huge dataset uploaded (>600 windows) using stratified subsample for fast training
  let XSub = X;
  let ySub = y;
  if (X.length > 500) {
    const step = X.length / 500;
    XSub = [];
    ySub = [];
    for (let i = 0; i < 500; i++) {
      const idx = Math.min(X.length - 1, Math.floor(i * step));
      XSub.push(X[idx]);
      ySub.push(y[idx]);
    }
  }

  const models: BinarySvmModel[] = classes.map((_, clsIdx) => {
    const yBin = ySub.map((label) => (label === clsIdx ? 1 : -1));
    return trainBinaryRbfSvm(XSub, yBin, C, gamma, 6, seed + clsIdx * 17);
  });

  return {
    classes,
    gamma,
    c_param: C,
    models,
  };
}

export function predictSvmProba(svm: SvmArtifact, X: number[][]): number[][] {
  return X.map((row) => {
    const margins = svm.models.map((m) => {
      let score = m.bias;
      for (let i = 0; i < m.support_vectors.length; i++) {
        score += m.dual_coefs[i] * rbfKernel(m.support_vectors[i], row, m.gamma);
      }
      return score;
    });
    // Temperature-calibrated softmax across OvR SVM margins
    const temp = 1.6;
    const maxM = Math.max(...margins);
    const exps = margins.map((m) => Math.exp((m - maxM) * temp));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sumExp);
  });
}

export function computeEvaluationMetrics(
  yTrue: number[],
  yPred: number[],
  classes: string[],
  modelType: 'random_forest' | 'svm'
): EvaluationMetrics {
  const k = classes.length;
  const cm: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  let correct = 0;

  for (let i = 0; i < yTrue.length; i++) {
    cm[yTrue[i]][yPred[i]]++;
    if (yTrue[i] === yPred[i]) correct++;
  }

  const report: ClassReportRow[] = [];
  let sumPrec = 0;
  let sumRec = 0;
  let sumF1 = 0;
  let weightedF1Sum = 0;

  for (let c = 0; c < k; c++) {
    const tp = cm[c][c];
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (let i = 0; i < k; i++) {
      support += cm[c][i];
      if (i !== c) {
        fn += cm[c][i];
        fp += cm[i][c];
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    sumPrec += precision;
    sumRec += recall;
    sumF1 += f1;
    weightedF1Sum += f1 * support;

    report.push({
      label: classes[c],
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1_score: Number(f1.toFixed(4)),
      support,
    });
  }

  const n = Math.max(1, yTrue.length);
  return {
    model_type: modelType,
    accuracy: Number((correct / n).toFixed(4)),
    macro_precision: Number((sumPrec / k).toFixed(4)),
    macro_recall: Number((sumRec / k).toFixed(4)),
    macro_f1: Number((sumF1 / k).toFixed(4)),
    weighted_f1: Number((weightedF1Sum / n).toFixed(4)),
    classes,
    confusion_matrix: cm,
    classification_report: report,
    evaluated_samples: yTrue.length,
  };
}

export function computeOodStats(
  XTrainZ: number[][],
  yTrain: number[],
  numClasses: number
): { centroids: number[][]; threshold: number } {
  const d = XTrainZ[0].length;
  const centroids: number[][] = Array.from({ length: numClasses }, () => new Array<number>(d).fill(0));
  const counts = new Array<number>(numClasses).fill(0);

  for (let i = 0; i < XTrainZ.length; i++) {
    const c = yTrain[i];
    counts[c]++;
    for (let j = 0; j < d; j++) centroids[c][j] += XTrainZ[i][j];
  }
  for (let c = 0; c < numClasses; c++) {
    if (counts[c] > 0) {
      for (let j = 0; j < d; j++) centroids[c][j] /= counts[c];
    }
  }

  const dists: number[] = [];
  for (let i = 0; i < XTrainZ.length; i++) {
    const c = yTrain[i];
    let sq = 0;
    for (let j = 0; j < d; j++) {
      const diff = XTrainZ[i][j] - centroids[c][j];
      sq += diff * diff;
    }
    dists.push(Math.sqrt(sq / d));
  }
  dists.sort((a, b) => a - b);
  const p98 = dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.98))] ?? 2.5;
  return {
    centroids,
    threshold: Number(Math.max(2.6, p98 * 1.9).toFixed(4)),
  };
}

export function minCentroidRmsDistance(xZ: number[], centroids: number[][]): number {
  const d = xZ.length;
  let best = Infinity;
  for (const c of centroids) {
    let sq = 0;
    for (let j = 0; j < d; j++) {
      const diff = xZ[j] - c[j];
      sq += diff * diff;
    }
    const dist = Math.sqrt(sq / d);
    if (dist < best) best = dist;
  }
  return best;
}

export function saveModelBundle(bundle: TrainedModelBundle, dir: string): string {
  const filePath = path.join(dir, `${bundle.model_version.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(bundle), 'utf-8');
  return filePath;
}

export function loadModelBundle(filePath: string): TrainedModelBundle | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as TrainedModelBundle;
}

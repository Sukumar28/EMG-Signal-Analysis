import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import {
  analyzeSignal,
  deleteHistoryItem,
  exportHistoryCsv,
  getDashboardPayload,
  getHistoryDetail,
  getHistoryList,
  getModelPerformancePayload,
  handleCsvUpload,
  loadSampleAsUpload,
  setActiveModel,
  trainModels,
} from './server/services/emgService.ts';
import {
  ensureSampleDatasets,
  listSampleDatasets,
  SAMPLE_DATA_DIR,
} from './server/services/sampleGenerator.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Ensure realistic sample EMG CSV datasets exist on disk at startup
ensureSampleDatasets();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers for decoupled frontend/backend deployment compatibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
    files: 1,
  },
});

// Helper to map domain validation errors cleanly to HTTP 400/422 without leaking stack traces
function sendApiError(res: Response, err: unknown, defaultStatus = 400) {
  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred while processing the request.';
  const status =
    message.includes('not found') || message.includes('could not be found') ? 404 : defaultStatus;
  res.status(status).json({
    ok: false,
    error: message,
  });
}

// 1. Health check
app.get('/api/health', (_req, res) => {
  const perf = getModelPerformancePayload();
  res.json({
    ok: true,
    status: 'healthy',
    service: 'EMG INTELLIGENCE Biomedical API',
    runtime: 'Node.js Express DSP + ML Engine (FastAPI parity backend included in /backend)',
    model_trained: perf.model_trained,
    model_version: perf.model_version,
    timestamp: new Date().toISOString(),
  });
});

// 2. Sample CSV datasets list & download
app.get('/api/samples', (_req, res) => {
  try {
    res.json({ ok: true, samples: listSampleDatasets() });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

app.get('/api/samples/:filename/download', (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(SAMPLE_DATA_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ ok: false, error: 'Sample file not found.' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.sendFile(filePath);
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

app.post('/api/samples/:filename/load', (req, res) => {
  try {
    const result = loadSampleAsUpload(req.params.filename);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    sendApiError(res, err, 400);
  }
});

// 3. POST /api/upload — Multipart CSV upload & validation
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'No CSV file provided. Please select a .csv file.' });
      return;
    }
    const result = handleCsvUpload(req.file.originalname, req.file.buffer);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    sendApiError(res, err, 422);
  }
});

// 4. POST /api/analyze — Full DSP + Feature Extraction + ML Prediction
app.post('/api/analyze', (req, res) => {
  try {
    const { upload_id, signal_column, signal_columns, model_type, preprocessing } = req.body ?? {};
    if (!upload_id || typeof upload_id !== 'string') {
      res.status(400).json({ ok: false, error: 'upload_id is required.' });
      return;
    }
    if (!signal_column || typeof signal_column !== 'string') {
      res.status(400).json({ ok: false, error: 'signal_column is required.' });
      return;
    }
    const result = analyzeSignal({
      upload_id,
      signal_column,
      signal_columns: Array.isArray(signal_columns) ? signal_columns : undefined,
      model_type,
      preprocessing,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    sendApiError(res, err, 422);
  }
});

// 5. POST /api/train — Genuine supervised ML training (RF + SVM)
app.post('/api/train', (req, res) => {
  try {
    const result = trainModels(req.body ?? {});
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    sendApiError(res, err, 422);
  }
});

// 6. POST /api/model/active — Switch active classifier (random_forest vs svm)
app.post('/api/model/active', (req, res) => {
  try {
    const { model_type } = req.body ?? {};
    if (model_type !== 'random_forest' && model_type !== 'svm') {
      res.status(400).json({ ok: false, error: 'model_type must be "random_forest" or "svm".' });
      return;
    }
    const result = setActiveModel(model_type);
    res.json({ ok: true, ...result });
  } catch (err) {
    sendApiError(res, err, 400);
  }
});

// 7. GET /api/dashboard — Real calculated KPIs & recent activity
app.get('/api/dashboard', (_req, res) => {
  try {
    res.json({ ok: true, ...getDashboardPayload() });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

// 8. GET /api/model/performance — Held-out evaluation metrics
app.get('/api/model/performance', (_req, res) => {
  try {
    res.json({ ok: true, ...getModelPerformancePayload() });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

// 9. GET /api/history & Export
app.get('/api/history/export', (_req, res) => {
  try {
    const csv = exportHistoryCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="emg_analysis_history.csv"');
    res.send(csv);
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

app.get('/api/history', (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const movement = typeof req.query.movement === 'string' ? req.query.movement : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'uploaded_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    const records = getHistoryList({ search, movement, sortBy, sortOrder });
    res.json({ ok: true, count: records.length, records });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

// 10. GET /api/history/:id
app.get('/api/history/:id', (req, res) => {
  try {
    const detail = getHistoryDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ ok: false, error: 'Analysis record not found.' });
      return;
    }
    res.json({ ok: true, analysis: detail });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

// 11. DELETE /api/history/:id
app.delete('/api/history/:id', (req, res) => {
  try {
    const deleted = deleteHistoryItem(req.params.id);
    if (!deleted) {
      res.status(404).json({ ok: false, error: 'Analysis record not found.' });
      return;
    }
    res.json({ ok: true, deleted_id: req.params.id });
  } catch (err) {
    sendApiError(res, err, 500);
  }
});

// Multer & global error handler (never expose internal stack traces)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ ok: false, error: 'Uploaded file exceeds the 25 MB limit.' });
      return;
    }
    res.status(400).json({ ok: false, error: `File upload error: ${err.message}` });
    return;
  }
  res.status(500).json({ ok: false, error: 'Internal processing error. Please verify your input and retry.' });
});

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EMG INTELLIGENCE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

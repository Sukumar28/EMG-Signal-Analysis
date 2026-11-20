import { useCallback, useEffect, useState } from 'react';
import ToastContainer from './components/ToastContainer';
import { useToast } from './hooks/useToast';
import AppLayout from './layouts/AppLayout';
import AboutProjectPage from './pages/AboutProjectPage';
import AnalysisHistoryPage from './pages/AnalysisHistoryPage';
import DashboardPage from './pages/DashboardPage';
import ModelPerformancePage from './pages/ModelPerformancePage';
import MovementRecognitionPage from './pages/MovementRecognitionPage';
import SignalAnalysisPage from './pages/SignalAnalysisPage';
import SignalVisualizationPage from './pages/SignalVisualizationPage';
import { checkHealth, fetchModelPerformance } from './services/api';
import type { AnalysisResult, NavPageId } from './types/emg';

export default function App() {
  const [activePage, setActivePage] = useState<NavPageId>('dashboard');
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [modelTrained, setModelTrained] = useState(false);
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [activeModelType, setActiveModelType] = useState<'random_forest' | 'svm'>('random_forest');
  const [backendHealthy, setBackendHealthy] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const { toasts, pushToast, dismissToast } = useToast();

  const syncSystemStatus = useCallback(async () => {
    try {
      const [health, perf] = await Promise.all([checkHealth(), fetchModelPerformance()]);
      setBackendHealthy(Boolean(health.ok));
      setModelTrained(Boolean(perf.model_trained));
      setModelVersion(perf.model_version);
      if (perf.active_model_type) {
        setActiveModelType(perf.active_model_type);
      }
    } catch {
      setBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    syncSystemStatus();
  }, [syncSystemStatus]);

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setCurrentAnalysis(result);
    setRefreshToken((t) => t + 1);
    setActivePage('recognition');
  };

  const handleSelectHistoricalAnalysis = (analysis: AnalysisResult, target: NavPageId = 'recognition') => {
    setCurrentAnalysis(analysis);
    setActivePage(target);
  };

  const handleModelUpdated = () => {
    syncSystemStatus();
    setRefreshToken((t) => t + 1);
  };

  const handleHistoryMutated = () => {
    setRefreshToken((t) => t + 1);
  };

  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      modelTrained={modelTrained}
      modelVersion={modelVersion}
      backendHealthy={backendHealthy}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          onNavigate={setActivePage}
          onSelectAnalysis={handleSelectHistoricalAnalysis}
          onError={(title, msg) => pushToast('error', title, msg)}
          refreshToken={refreshToken}
        />
      )}

      {activePage === 'analysis' && (
        <SignalAnalysisPage
          modelTrained={modelTrained}
          activeModelType={activeModelType}
          onAnalysisComplete={handleAnalysisComplete}
          onNavigate={setActivePage}
          onNotify={pushToast}
        />
      )}

      {activePage === 'recognition' && (
        <MovementRecognitionPage
          analysis={currentAnalysis}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'visualization' && (
        <SignalVisualizationPage
          analysis={currentAnalysis}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'performance' && (
        <ModelPerformancePage
          onModelUpdated={handleModelUpdated}
          onNotify={pushToast}
        />
      )}

      {activePage === 'history' && (
        <AnalysisHistoryPage
          onSelectAnalysis={handleSelectHistoricalAnalysis}
          onHistoryMutated={handleHistoryMutated}
          onNotify={pushToast}
          refreshToken={refreshToken}
        />
      )}

      {activePage === 'about' && <AboutProjectPage />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AppLayout>
  );
}

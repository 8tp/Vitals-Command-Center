import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout.js';
import DashboardPage from './pages/DashboardPage.js';
import SleepPage from './pages/SleepPage.js';
import WorkoutsPage from './pages/WorkoutsPage.js';
import TrendsPage from './pages/TrendsPage.js';
import AskPage from './pages/AskPage.js';
import { useSettingsStore, selectAiEnabled } from './stores/settingsStore.js';

export default function App() {
  // Load app-level settings once so nav + dashboard can gate AI surfaces.
  const loadApp = useSettingsStore((s) => s.loadApp);
  const aiEnabled = useSettingsStore(selectAiEnabled);
  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sleep" element={<SleepPage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="trends" element={<TrendsPage />} />
        {/* Ask is an AI surface — when AI is disabled the route falls through to home. */}
        <Route path="ask" element={aiEnabled ? <AskPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

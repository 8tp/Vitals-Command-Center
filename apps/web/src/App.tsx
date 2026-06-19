import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout.js';
import DashboardPage from './pages/DashboardPage.js';
import SleepPage from './pages/SleepPage.js';
import WorkoutsPage from './pages/WorkoutsPage.js';
import HabitsPage from './pages/HabitsPage.js';
import AskPage from './pages/AskPage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sleep" element={<SleepPage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

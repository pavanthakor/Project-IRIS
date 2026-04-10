import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';

// Layouts
import AppLayout from './layouts/AppLayout';
import PublicLayout from './layouts/PublicLayout';

// Pages
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import SearchHistoryPage from './pages/SearchHistoryPage';
import LiveFeedPage from './pages/LiveFeedPage';
import ReportPage from './pages/ReportPage';
import SettingsPage from './pages/SettingsPage';
import MitrePage from './pages/MitrePage';
import BulkUploadPage from './pages/BulkUploadPage';

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="p-6 text-iris-text-dim">Loading…</div>;
  return isAuthenticated ? <Outlet /> : <Navigate to="/" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
      </Route>

      <Route element={<AppLayout />}>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/history" element={<SearchHistoryPage />} />
          <Route path="/feeds" element={<LiveFeedPage />} />
          <Route path="/reports" element={<ReportPage />} />
          <Route path="/mitre" element={<MitrePage />} />
          <Route path="/bulk" element={<BulkUploadPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}


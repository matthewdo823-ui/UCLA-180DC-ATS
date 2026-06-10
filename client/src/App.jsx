import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage/DashboardPage";
import FlaggedCandidatesPage from "./pages/FlaggedCandidatesPage/FlaggedCandidatesPage";
import CycleManagementPage from "./pages/CycleManagementPage/CycleManagementPage";
import GraderScoreboardPage from "./pages/GraderScoreboardPage/GraderScoreboardPage";
import LoginPage from "./pages/LoginPage/LoginPage";
import NoAccessPage from "./pages/NoAccessPage/NoAccessPage";
import ScreenerPage from "./pages/ScreenerPage/ScreenerPage";
import InterviewManagementPage from "./pages/InterviewManagementPage/InterviewManagementPage";
import GradingRouterPage from "./pages/GradingRouterPage/GradingRouterPage";
import ScoreboardPage from "./pages/ScoreboardPage/ScoreboardPage";
import Sidebar from "./components/Sidebar/Sidebar";

function AppShell() {
  const location = useLocation();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/no-access";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {!hideSidebar && <Sidebar />}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/no-access"
            element={(
              <ProtectedRoute allowedRoles={["admin", "member", "applicant"]}>
                <NoAccessPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/"
            element={(
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/grading"
            element={(
              <ProtectedRoute>
                <GradingRouterPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/resume-screener"
            element={(
              <ProtectedRoute>
                <ScreenerPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/interviews"
            element={(
              <ProtectedRoute>
                <InterviewManagementPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/scoreboard"
            element={(
              <ProtectedRoute>
                <ScoreboardPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/grader-scoreboard"
            element={(
              <ProtectedRoute allowedRoles={["admin"]}>
                <GraderScoreboardPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/flagged-candidates"
            element={(
              <ProtectedRoute allowedRoles={["admin"]}>
                <FlaggedCandidatesPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/cycle-management"
            element={(
              <ProtectedRoute allowedRoles={["admin"]}>
                <CycleManagementPage />
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </Router>
  );
}
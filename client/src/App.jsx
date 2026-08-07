import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Sidebar from "./components/Sidebar/Sidebar";

// Lazy Loading as Vite can handle the chunking for diff elements
const DashboardPage = lazy(() => import("./pages/DashboardPage/DashboardPage"));
const FlaggedCandidatesPage = lazy(() => import("./pages/FlaggedCandidatesPage/FlaggedCandidatesPage"));
const CycleManagementPage = lazy(() => import("./pages/CycleManagementPage/CycleManagementPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage/UserManagementPage"));
const AssignmentsPage = lazy(() => import("./pages/AssignmentsPage/AssignmentsPage"));
const GraderScoreboardPage = lazy(() => import("./pages/GraderScoreboardPage/GraderScoreboardPage"));
const LoginPage = lazy(() => import("./pages/LoginPage/LoginPage"));
const NoAccessPage = lazy(() => import("./pages/NoAccessPage/NoAccessPage"));
const ScreenerPage = lazy(() => import("./pages/ScreenerPage/ScreenerPage"));
const InterviewManagementPage = lazy(() => import("./pages/InterviewManagementPage/InterviewManagementPage"));
const GradingRouterPage = lazy(() => import("./pages/GradingRouterPage/GradingRouterPage"));
const ScoreboardPage = lazy(() => import("./pages/ScoreboardPage/ScoreboardPage"));
const DemographicsPage = lazy(() => import("./pages/DemographicsPage/DemographicsPage"));
const CandidateApplicationPage = lazy(() => import("./pages/CandidateApplicationPage/CandidateApplicationPage"));

// We can prolly do better but this is temp placeholder for loading
const PageLoader = () => (
  <div style={{ padding: "20px", display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
    Loading...
  </div>
);

function AppShell() {
  const location = useLocation();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/no-access";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {!hideSidebar && <Sidebar />}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 3. Wrap only the Routes inside Suspense */}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/no-access"
              element={
                <ProtectedRoute allowedRoles={["admin", "member", "applicant"]}>
                  <NoAccessPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/grading"
              element={
                <ProtectedRoute>
                  <GradingRouterPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/resume-screener"
              element={
                <ProtectedRoute>
                  <ScreenerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interviews"
              element={
                <ProtectedRoute>
                  <InterviewManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scoreboard"
              element={
                <ProtectedRoute>
                  <ScoreboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/demographics"
              element={
                <ProtectedRoute>
                  <DemographicsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scoreboard/:candidateId/application"
              element={
                <ProtectedRoute>
                  <CandidateApplicationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/grader-scoreboard"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <GraderScoreboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/flagged-candidates"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <FlaggedCandidatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cycle-management"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <CycleManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assignments"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AssignmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
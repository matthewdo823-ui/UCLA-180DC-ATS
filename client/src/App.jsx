import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage/DashboardPage";
import ScreenerPage from "./pages/ScreenerPage/ScreenerPage";
import ScoreboardPage from "./pages/ScoreboardPage/ScoreboardPage";
import Sidebar from "./components/Sidebar/Sidebar";

export default function App() {
  return (
    <Router>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/resume-screener" element={<ScreenerPage />} />
            <Route path="/scoreboard" element={<ScoreboardPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
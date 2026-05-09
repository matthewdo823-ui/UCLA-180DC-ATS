import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ScreenerPage from "./pages/ScreenerPage/ScreenerPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ScreenerPage />} />
      </Routes>
    </Router>
  );
}
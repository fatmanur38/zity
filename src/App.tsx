import { Navigate, Route, Routes } from "react-router-dom";
import { AboutPage } from "./pages/AboutPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { GamePage } from "./pages/GamePage";
import { LandingPage } from "./pages/LandingPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<GamePage />} />
      <Route path="/present" element={<GamePage presentation />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/architecture" element={<ArchitecturePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

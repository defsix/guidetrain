import { Navigate, Route, Routes } from "react-router-dom";
import Onboarding from "./pages/Onboarding";
import BodyExplorer from "./pages/BodyExplorer";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/explore" element={<BodyExplorer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

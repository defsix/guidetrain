import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Onboarding from "./pages/Onboarding";
import KeyboardDebugBadge from "./components/KeyboardDebugBadge";
import "./App.css";

// Lazy rather than a plain import: BodyExplorer pulls in Three.js and
// react-three-fiber for the 3D model, which is most of this app's JS weight
// and none of it belongs on the welcome screen. Splitting it here means
// Onboarding's own bundle — the one thing every visitor waits on before
// seeing anything at all — no longer pays for a model nobody has asked to
// see yet. See Onboarding.tsx for the other half of this: it prefetches the
// same chunk in the background the moment it mounts, so the wait doesn't
// just move to whoever clicks Continue.
const BodyExplorer = lazy(() => import("./pages/BodyExplorer"));

export default function App() {
  return (
    <>
      {/* TEMPORARY — see KeyboardDebugBadge.tsx. Remove once the Android
          keyboard-inset chain is confirmed working. */}
      <KeyboardDebugBadge />
      <Suspense fallback={<div className="splash" aria-hidden="true" />}>
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route path="/explore" element={<BodyExplorer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

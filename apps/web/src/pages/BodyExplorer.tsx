import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnatomyViewer } from "../anatomy";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { pref, resolved, setPref } = useTheme();

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  return (
    <div className="explorer">
      <div className="explorer-bar">
        <p className="greeting">
          Hi {profile?.username ?? "there"} — rotate the model, filter by region, and tap a muscle.
        </p>
        <ThemeToggle pref={pref} onChange={setPref} />
      </div>
      <div className="explorer-canvas">
        <AnatomyViewer
          modelUrl={MODEL_URL}
          theme={resolved}
          onTrain={(muscle: { id: string; name: string; region: string }) =>
            console.log("muscle:train ->", muscle)
          }
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}

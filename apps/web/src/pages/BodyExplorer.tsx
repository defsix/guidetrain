import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnatomyViewer } from "../anatomy";
import { useProfile } from "../state/useProfile";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile } = useProfile();

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  return (
    <div className="explorer">
      <p className="greeting">
        Hi {profile?.username ?? "there"} — rotate the model, filter by region, and tap a muscle.
      </p>
      <div className="explorer-canvas">
        <AnatomyViewer
          modelUrl={MODEL_URL}
          onTrain={(muscle: { id: string; name: string; region: string; side: string }) =>
            console.log("muscle:train ->", muscle)
          }
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}

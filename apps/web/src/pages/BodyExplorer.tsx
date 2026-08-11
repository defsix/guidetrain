import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnatomyViewer } from "../anatomy";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import { useT } from "../i18n/I18nProvider";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { pref, resolved, setPref } = useTheme();
  const t = useT();

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  return (
    <div className="explorer">
      <div className="explorer-bar">
        {/* Two whole sentences rather than a name slot with "there" in it:
            languages put the name in different places, and some have no
            natural stand-in for an unknown one. */}
        <p className="greeting">
          {profile?.username
            ? t("explorer.greeting", { name: profile.username })
            : t("explorer.greetingAnon")}
        </p>
        <div className="header-controls">
          <ThemeToggle pref={pref} onChange={setPref} />
        </div>
      </div>
      <div className="explorer-canvas">
        {/* The viewer handles Train This itself — it opens one of the muscle's
            exercises. The onTrain/onSelect props and the muscle:train window
            event are still there for a host that wants to record the choice;
            nothing here needs to yet. */}
        <AnatomyViewer modelUrl={MODEL_URL} theme={resolved} />
      </div>
    </div>
  );
}

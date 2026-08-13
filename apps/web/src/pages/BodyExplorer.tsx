import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnatomyViewer } from "../anatomy";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import WorkoutPanel from "../components/WorkoutPanel";
import { useWorkout } from "../state/useWorkout";
import { useLog } from "../state/useLog";
import { useT } from "../i18n/I18nProvider";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { pref, resolved, setPref } = useTheme();
  const { ids, toggle, remove, move, clear } = useWorkout();
  const log = useLog();
  const [showWorkout, setShowWorkout] = useState(false);
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
          {/* The count is the whole point of the button: it is how you know
              anything was saved without opening it. */}
          <button
            className={`workout-button ${ids.length ? "has" : ""}`}
            onClick={() => setShowWorkout(true)}
            aria-expanded={showWorkout}
          >
            {t("workout.title")}
            <span className="wcount">{ids.length}</span>
          </button>
          <ThemeToggle pref={pref} onChange={setPref} />
        </div>
      </div>
      <div className="explorer-canvas">
        {/* The viewer handles Train This itself — it opens one of the muscle's
            exercises. The onTrain/onSelect props and the muscle:train window
            event are still there for a host that wants to record the choice;
            nothing here needs to yet. */}
        <AnatomyViewer
          modelUrl={MODEL_URL}
          theme={resolved}
          savedIds={ids}
          onToggleSave={toggle}
        />
      </div>
      <WorkoutPanel
        ids={ids}
        open={showWorkout}
        onClose={() => setShowWorkout(false)}
        onRemove={remove}
        onMove={move}
        onClear={clear}
        today={log.today}
        best={log.best}
        onAddSet={log.add}
        onRemoveSet={log.remove}
        allSets={log.entries}
        bodyLoad={
          // Everything is kilos now. A profile saved in pounds is left alone
          // rather than converted behind the reader's back — the weight field
          // comes back for it, which is the honest fallback.
          profile?.bodyWeight && profile.bodyWeightUnit !== "lb"
            ? profile.bodyWeight
            : undefined
        }
      />
    </div>
  );
}

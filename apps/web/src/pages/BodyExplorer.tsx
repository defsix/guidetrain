import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnatomyViewer } from "../anatomy";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import Logo from "../components/Logo";
import AccountPanel from "../components/AccountPanel";
import EquipmentPanel from "../components/EquipmentPanel";
import StatsPanel from "../components/StatsPanel";
import WorkoutPanel from "../components/WorkoutPanel";
import PlanLibrary from "../components/PlanLibrary";
import HistoryPanel from "../components/HistoryPanel";
import { usePrograms } from "../state/usePrograms";
import { useLog } from "../state/useLog";
import { useSkips } from "../state/useSkips";
import { useTrainingMax } from "../state/useTrainingMax";
import { useKnownMax } from "../state/useKnownMax";
import { useBodyWeightLog } from "../state/useBodyWeightLog";
import { useGoals } from "../state/useGoals";
import { useInjuries } from "../state/useInjuries";
import { useAuth } from "../state/useAuth";
import { useSync } from "../state/useSync";
import { useT } from "../i18n/I18nProvider";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile, setProfile } = useProfile();
  const { pref, resolved, setPref } = useTheme();
  const programs = usePrograms();
  const log = useLog();
  const skips = useSkips();
  const tms = useTrainingMax();
  const knownMax = useKnownMax();
  const weighIns = useBodyWeightLog();
  const goals = useGoals();
  const injuries = useInjuries();
  const auth = useAuth();
  const sync = useSync(auth.userId);
  const [showWorkout, setShowWorkout] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showEquipment, setShowEquipment] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  // The count is the whole point of the button: it is how you know anything
  // was saved without opening it. Lives in the anatomy canvas's own toolbar
  // rather than the header, at every width — passed down as toolbarExtra —
  // so it never has to compete with Account/Equipment/Progress for room in a
  // scrolling strip, and its position doesn't shift as the window resizes.
  const workoutButton = (
    <button
      className={`workout-button ${programs.ids.length ? "has" : ""}`}
      onClick={() => setShowWorkout(true)}
      aria-expanded={showWorkout}
    >
      {t("workout.title")}
      <span className="wcount">{programs.ids.length}</span>
    </button>
  );

  return (
    <div className="explorer">
      <div className="explorer-bar">
        {/* Mark only, and small. The header already carries a greeting,
            history and the theme, and on a phone that row is full — the name
            would be the first thing to push something off it. */}
        <Logo size={22} />
        {/* Two whole sentences rather than a name slot with "there" in it:
            languages put the name in different places, and some have no
            natural stand-in for an unknown one. */}
        <p className="greeting">
          {profile?.username
            ? t("explorer.greeting", { name: profile.username })
            : t("explorer.greetingAnon")}
        </p>
        <div className="header-controls">
          {/* Only once there is something to look at. An empty history
              button is a promise the app cannot keep yet. */}
          {log.entries.length > 0 && (
            <button
              className="history-button"
              onClick={() => setShowHistory(true)}
              aria-expanded={showHistory}
            >
              {t("history.title")}
            </button>
          )}
          {/* Hidden with no project configured, rather than open onto a
              form that cannot do anything — see AccountPanel. */}
          {auth.available && (
            <button
              className={`account-button ${auth.session ? "signed-in" : ""}`}
              onClick={() => setShowAccount(true)}
              aria-expanded={showAccount}
            >
              {auth.session ? t("account.signedIn") : t("account.title")}
            </button>
          )}
          {/* Marked once something is actually selected, the same "signed-in"
              treatment the account button gets, so a glance at the header
              says whether this is doing anything right now. */}
          {profile && (
            <button
              className={`account-button ${profile.equipment?.length ? "signed-in" : ""}`}
              onClick={() => setShowEquipment(true)}
              aria-expanded={showEquipment}
            >
              {t("equipmentPanel.title")}
            </button>
          )}
          {/* Same "signed-in" treatment once a max has been set by hand or a
              muscle marked injured — Progress carries both now, so either one
              is reason enough to highlight it. A body weight alone came from
              onboarding and isn't. */}
          {profile && (
            <button
              className={`account-button ${
                Object.keys(knownMax.overrides).length || Object.keys(injuries.injuries).length
                  ? "signed-in"
                  : ""
              }`}
              onClick={() => setShowStats(true)}
              aria-expanded={showStats}
            >
              {t("stats.title")}
            </button>
          )}
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
          savedIds={programs.ids}
          onToggleSave={programs.toggle}
          equipmentAvailable={profile?.equipment}
          injuries={injuries.injuries}
          toolbarExtra={workoutButton}
        />
      </div>
      <WorkoutPanel
        ids={programs.ids}
        programs={programs.programs}
        active={programs.active}
        onSelect={programs.select}
        onCreate={() => programs.create()}
        onRename={programs.rename}
        onRemoveProgram={programs.removeProgram}
        open={showWorkout}
        onClose={() => setShowWorkout(false)}
        onRemove={programs.removeExercise}
        onMove={programs.move}
        onClear={programs.clear}
        today={log.today}
        best={log.best}
        onAddSet={log.add}
        onRemoveSet={log.remove}
        allSets={log.entries}
        targets={programs.targets}
        onTarget={programs.setTarget}
        onBrowsePlans={() => { setShowWorkout(false); setShowPlans(true); }}
        skips={skips.skips}
        onSkip={skips.skip}
        onUnskip={skips.unskip}
        trainingMaxes={tms.overrides}
        onSetTrainingMax={tms.set}
        onClearTrainingMax={tms.clear}
        onSwap={programs.swapExercise}
        equipmentAvailable={profile?.equipment}
        goals={goals.goals}
        injuries={injuries.injuries}
        bodyLoad={
          // Everything is kilos now. A profile saved in pounds is left alone
          // rather than converted behind the reader's back — the weight field
          // comes back for it, which is the honest fallback.
          profile?.bodyWeight && profile.bodyWeightUnit !== "lb"
            ? profile.bodyWeight
            : undefined
        }
      />
      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        sets={log.entries}
      />
      {auth.available && (
        <AccountPanel
          open={showAccount}
          onClose={() => setShowAccount(false)}
          auth={auth}
          sync={sync}
        />
      )}
      {profile && (
        <EquipmentPanel
          open={showEquipment}
          onClose={() => setShowEquipment(false)}
          profile={profile}
          onChange={(equipment) => setProfile({ ...profile, equipment })}
        />
      )}
      {profile && (
        <StatsPanel
          open={showStats}
          onClose={() => setShowStats(false)}
          profile={profile}
          onSetBodyWeight={(kg) => {
            setProfile({ ...profile, bodyWeight: kg });
            weighIns.add(kg);
          }}
          weighIns={weighIns.entries}
          allSets={log.entries}
          knownMaxes={knownMax.overrides}
          onSetKnownMax={knownMax.set}
          onClearKnownMax={knownMax.clear}
          trainingMaxes={tms.overrides}
          goals={goals.goals}
          onSetGoal={goals.set}
          onClearGoal={goals.clear}
          injuries={injuries.injuries}
          onSetInjury={injuries.set}
          onClearInjury={injuries.clear}
        />
      )}
      <PlanLibrary
        open={showPlans}
        onClose={() => setShowPlans(false)}
        allSets={log.entries}
        profile={profile ?? null}
        knownMaxes={knownMax.overrides}
        trainingMaxes={tms.overrides}
        goals={goals.goals}
        injuries={injuries.injuries}
        onApply={(days) => { programs.addWorkouts(days); setShowWorkout(true); }}
      />
    </div>
  );
}

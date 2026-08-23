import { useEffect, useMemo, useState } from "react";
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
import CalisthenicsLibrary from "../components/CalisthenicsLibrary";
import StretchingLibrary from "../components/StretchingLibrary";
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
import { recommendExercises } from "../lib/recommend";
import { BY_ID } from "../lib/exerciseCatalogue";
import { useI18n } from "../i18n/I18nProvider";

const MODEL_URL = `${import.meta.env.BASE_URL}models/anatomy_mobile.glb`;

const HINT_KEY = "guidetrain.explorerVisits";
const HINT_VISITS = 3;

/**
 * Whether this is among the first few times the explorer has been opened.
 *
 * Read once per mount rather than in an effect: the hint either belongs on
 * the very first paint or it doesn't, and a moment where it flashes in after
 * the model has already loaded is worse than not having it. Counts visits,
 * not taps on the model itself — someone who opens the app, gets pulled
 * away, and comes back a minute later hasn't used up their explanation yet.
 */
function isEarlyVisit(): boolean {
  const n = Number(localStorage.getItem(HINT_KEY) ?? "0") + 1;
  localStorage.setItem(HINT_KEY, String(n));
  return n <= HINT_VISITS;
}

const RECS_DISMISSED_KEY = "guidetrain.recsDismissed";

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
  const [showCalisthenics, setShowCalisthenics] = useState(false);
  const [showStretching, setShowStretching] = useState(false);
  const [showHint] = useState(isEarlyVisit);
  // On a phone, a selected muscle opens a bottom sheet over the model — the
  // same area the hint/recs card floats in, so either would sit right on
  // top of (and, worse, over the exercise list inside) that sheet once one
  // is open.
  const [muscleSelected, setMuscleSelected] = useState(false);
  const [recsDismissed, setRecsDismissed] = useState(
    () => localStorage.getItem(RECS_DISMISSED_KEY) === "1",
  );
  const { t, localizeExercise } = useI18n();

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  // Only once there's a real number to offer — see recommendExercises()'s
  // own reasoning for why an onboarding-only profile doesn't qualify.
  // Recomputes as programs/log/knownMax change, so adding a recommendation
  // removes it from the list without needing its own dismiss.
  const recommendations = useMemo(
    () =>
      recommendExercises(
        programs.ids,
        log.entries,
        profile,
        knownMax.overrides,
        injuries.injuries,
      ),
    [programs.ids, log.entries, profile, knownMax.overrides, injuries.injuries],
  );
  const showRecs = recommendations.length > 0 && !recsDismissed;

  function dismissRecs() {
    localStorage.setItem(RECS_DISMISSED_KEY, "1");
    setRecsDismissed(true);
  }

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

  // Own pill in the same toolbar rather than the header strip, same
  // reasoning as workoutButton above. Gated on `profile`, matching every
  // other panel that isn't meaningful before onboarding.
  const calisthenicsButton = profile && (
    <button
      className="workout-button"
      onClick={() => setShowCalisthenics(true)}
      aria-expanded={showCalisthenics}
    >
      {t("calisthenics.title")}
    </button>
  );

  const stretchingButton = profile && (
    <button
      className="workout-button"
      onClick={() => setShowStretching(true)}
      aria-expanded={showStretching}
    >
      {t("stretching.title")}
    </button>
  );

  return (
    <div className="explorer">
      <div className="explorer-bar">
        {/* The mark doubles as the link to the account page now — small,
            and already sitting where a reader's eye starts, rather than a
            whole extra pill competing with History/Equipment/Progress for
            room in the scrolling strip. Hidden behind no project configured
            just stays a plain, unclickable mark — see AccountPanel. */}
        {auth.available ? (
          <button
            className="logo-link"
            onClick={() => setShowAccount(true)}
            aria-expanded={showAccount}
            aria-label={auth.session ? t("account.signedIn") : t("account.title")}
          >
            <Logo size={22} />
          </button>
        ) : (
          <Logo size={22} />
        )}
        {/* Just the greeting — how to use the model used to be written out
            here too, and on a phone that sentence was most of why the header
            needed a scrolling strip for its buttons at all. It lives under
            the model now, for a first-time visitor only, and this stays
            short at every visit after. Moving Account onto the mark above
            freed up the room this needs to actually fit instead of eliding. */}
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
            exercises. onTrain and the muscle:train window event are still
            there for a host that wants to record the choice; nothing here
            needs to yet. onSelect just tracks whether the readout sheet is
            open, to keep the hint/recs card out of its way below. */}
        <AnatomyViewer
          modelUrl={MODEL_URL}
          theme={resolved}
          savedIds={programs.ids}
          onToggleSave={programs.toggle}
          equipmentAvailable={profile?.equipment}
          injuries={injuries.injuries}
          toolbarExtra={<>{workoutButton}{calisthenicsButton}{stretchingButton}</>}
          onSelect={(zone) => setMuscleSelected(Boolean(zone))}
        />
        {/* A real number to act on takes priority over the generic
            first-visit hint below — someone who already has a known max or a
            logged set doesn't need to be told to tap a muscle, they need to
            know what to do with the data they've already put in. Neither
            shows once a muscle is selected — on a phone that's the same
            floating spot the readout sheet's own exercise list occupies. */}
        {muscleSelected ? null : showRecs ? (
          <div className="explorer-recs">
            <div className="explorer-recs-head">
              <span>{t("explorer.recs.title")}</span>
              <button
                className="workout-close"
                onClick={dismissRecs}
                aria-label={t("explorer.recs.dismiss")}
              >
                ✕
              </button>
            </div>
            <ul>
              {recommendations.map((r) => {
                const raw = BY_ID.get(r.id);
                if (!raw) return null;
                const name = localizeExercise(raw).name;
                return (
                  <li key={r.id}>
                    <span>
                      {name} — {r.load} {t("unit.kg")}
                    </span>
                    <button onClick={() => programs.toggle(r.id)}>
                      {t("explorer.recs.add")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          /* What the greeting used to say, moved to where the thing it's
             describing actually is. Only for the first few visits — see
             isEarlyVisit() above — since a reminder that outlives its
             usefulness is just something else to read past. */
          showHint && <p className="explorer-hint">{t("explorer.hint")}</p>
        )}
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
        profile={profile}
        knownMaxes={knownMax.overrides}
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
        onEditSet={log.edit}
        onRemoveSet={log.remove}
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
      <CalisthenicsLibrary
        open={showCalisthenics}
        onClose={() => setShowCalisthenics(false)}
        programIds={programs.ids}
        onToggle={programs.toggle}
        injuries={injuries.injuries}
      />
      <StretchingLibrary
        open={showStretching}
        onClose={() => setShowStretching(false)}
        injuries={injuries.injuries}
      />
    </div>
  );
}

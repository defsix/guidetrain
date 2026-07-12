import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BodyScene from "../three/BodyScene";
import { fetchMuscleGroups } from "../lib/api";
import { useProfile } from "../state/useProfile";
import type { MuscleGroup } from "../types";

export default function BodyExplorer() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    fetchMuscleGroups()
      .then(setGroups)
      .catch((err) => setError(err.message));
  }, []);

  const selected = groups.find((g) => g.slug === selectedSlug) ?? null;

  return (
    <div className="explorer">
      <div className="explorer-canvas">
        <BodyScene selectedSlug={selectedSlug} onSelectSlug={setSelectedSlug} />
      </div>
      <aside className="explorer-panel">
        <p className="greeting">Hi {profile?.username ?? "there"} — rotate the model and tap a muscle group.</p>
        {error && <p className="error">Couldn't reach the API: {error}</p>}
        {selected ? (
          <div className="muscle-detail">
            <h2>{selected.name}</h2>
            <p className="latin">{selected.latinName}</p>
            <p>{selected.description}</p>
            <p className="placeholder-note">Exercises for this muscle group are coming in the next phase.</p>
          </div>
        ) : (
          <div className="muscle-detail muscle-detail-empty">
            <p>No muscle group selected yet.</p>
          </div>
        )}
        <div className="muscle-list">
          {groups.map((g) => (
            <button
              key={g.slug}
              className={`muscle-list-item ${g.slug === selectedSlug ? "muscle-list-item-selected" : ""}`}
              onClick={() => setSelectedSlug(g.slug)}
            >
              {g.name}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

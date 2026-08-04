"""
Build the per-muscle exercise list the viewer links to.

Source is the Free Exercise DB (https://github.com/yuhonas/free-exercise-db),
873 exercises released into the public domain under the Unlicense, itself
derived from Ollie Jennings' exercises.json. Only the data is used — names,
equipment, level, mechanic and instructions.

The dataset's images are deliberately NOT used. They carry no stated licence and
the question has sat unanswered on the repo since 2024 (issue #12), so they are
not safe to redistribute. Each exercise instead carries a YouTube *search* URL,
which needs no API key, cannot rot the way a fixed video id does, and is a link
rather than a copy.

    python3 build-exercises.py path/to/exercises.json

Writes data/exercises.json.
"""
import json, re, sys, os, urllib.parse
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SRC = sys.argv[1] if len(sys.argv) > 1 else "exercises.json"
OUT = os.path.join(ROOT, "data", "exercises.json")

# Their muscle vocabulary onto the viewer's zone keys. "middle back" is the
# rhomboids and mid-trapezius, which the model paints as trapezius; "abductors"
# is gluteus medius, which it paints as part of the glutes.
MAP = {
    "abdominals": "abs", "adductors": "add", "abductors": "glute",
    "biceps": "bic", "calves": "calf", "chest": "pec", "forearms": "fore",
    "glutes": "glute", "hamstrings": "ham", "lats": "lat",
    "lower back": "erector", "middle back": "traps", "neck": "neck",
    "quadriceps": "quad", "shoulders": "delt", "traps": "traps",
    "triceps": "tri",
}

# The obliques are not in their vocabulary — rotation and side-bending work is
# filed under "abdominals" — so it is recovered by movement, which is what
# actually distinguishes it.
OBLIQUE = re.compile(
    r"oblique|russian twist|side bend|side plank|woodchop|wood chop|"
    r"twist|side crunch|windmill|side jackknife|landmine",
    re.I)

# Tibialis anterior has nothing usable in the dataset (one self-massage entry
# and one stretch), so these are named here. Exercise names are facts, not
# anyone's copyrighted text.
SHIN = [
    ("Tibialis Raise", "body only", "beginner", "isolation",
     "Stand with your back against a wall, heels a step out, and lift your toes toward your shins."),
    ("Banded Dorsiflexion", "bands", "beginner", "isolation",
     "Anchor a band around the top of your foot, sit with the leg straight, and pull your toes toward you."),
    ("Seated Toe Raise", "body only", "beginner", "isolation",
     "Sit with your feet flat, keep your heels down, and raise your toes as high as they will go."),
    ("Weighted Toe Raise", "dumbbell", "intermediate", "isolation",
     "Sit with a light dumbbell resting across your toes and raise the toes against it."),
    ("Heel Walk", "body only", "beginner", "isolation",
     "Walk forward on your heels with your toes held clear of the floor."),
    ("Reverse Calf Raise on Leg Press", "machine", "intermediate", "isolation",
     "Set your heels on the platform and pull your toes toward you against the sled."),
]

# Training work first; stretching and self-massage are kept out of the list a
# muscle offers to train.
TRAIN = {"strength", "powerlifting", "olympic weightlifting", "plyometrics", "strongman"}
CATEGORY_RANK = {"strength": 0, "powerlifting": 0, "olympic weightlifting": 2,
                 "strongman": 3, "plyometrics": 4}
EQUIP_RANK = {"barbell": 0, "dumbbell": 0, "body only": 1, "machine": 2, "cable": 2,
              "e-z curl bar": 3, "kettlebells": 3, "bands": 4, "medicine ball": 5,
              "exercise ball": 5, "other": 6, "foam roll": 7, None: 8}
LEVEL_RANK = {"beginner": 0, "intermediate": 1, "expert": 2}

# The lifts anyone would expect to see at the top of a list for a muscle. Sorting
# purely on "compound, beginner, least equipment" buried these: chest led with
# four incline push-up variants and quadriceps with rocket jumps and skipping,
# while bench press and back squat never appeared at all.
CANONICAL = re.compile(
    r"\b(bench press|push[- ]?up|dip|fly|flye|crossover|"
    r"pull[- ]?up|chin[- ]?up|pulldown|pullover|row\b|shrug|face pull|"
    r"overhead press|military press|arnold press|lateral raise|front raise|"
    r"rear delt|upright row|"
    r"curl|pushdown|skullcrusher|triceps extension|kickback|"
    r"squat|leg press|lunge|step[- ]?up|leg extension|leg curl|"
    r"deadlift|good morning|hyperextension|back extension|hip thrust|glute bridge|"
    r"calf raise|calf press|"
    r"crunch|sit[- ]?up|leg raise|plank|ab wheel|russian twist|wood ?chop|side bend|"
    r"wrist curl|farmer)\b", re.I)

# Words that only qualify a movement. Two entries that match once these are
# stripped are the same exercise wearing a different hat, and only the best of
# them earns a place.
# Equipment is deliberately absent: a barbell bench press and a dumbbell bench
# press are different exercises to anyone doing them, and treating the kit as a
# qualifier merged the two and dropped the barbell one entirely.
QUALIFIER = re.compile(
    r"\b(seated|standing|lying|kneeling|bent[- ]?over|"
    r"alternate|alternating|single|one|two|"
    r"arm|arms|leg|legs|palms?|in|out|up|down|with|without|on|the|to|a|"
    r"and|or|for|from|behind|"
    r"iso|assisted|version|variation|style|left|right)\b", re.I)

PER_MUSCLE = 12
PER_EQUIPMENT = 4        # don't let one piece of kit fill the list


def youtube(name):
    q = urllib.parse.urlencode({"search_query": f"{name} exercise proper form"})
    return f"https://www.youtube.com/results?{q}"


def family(name):
    """What movement this is, ignoring how it's dressed up."""
    core = QUALIFIER.sub(" ", re.sub(r"[(),/-]", " ", name.lower()))
    toks = sorted(set(re.findall(r"[a-z]+", core)))
    return " ".join(toks) or name.lower()


def rank(e):
    """Recognisable lifts first, then strength work over plyometrics, then
    compound over isolation, then by how easy the movement is to get at."""
    return (0 if CANONICAL.search(e["name"]) else 1,
            CATEGORY_RANK.get(e.get("category"), 5),
            0 if e.get("mechanic") == "compound" else 1,
            LEVEL_RANK.get(e.get("level"), 3),
            EQUIP_RANK.get(e.get("equipment"), 8),
            len(e["name"]),
            e["name"])


def pick(items, n=PER_MUSCLE):
    """Best of each movement family, with no single piece of equipment allowed
    to crowd out the rest."""
    items = sorted(items, key=rank)
    seen, equip, out = set(), defaultdict(int), []
    for e in items:
        f = family(e["name"])
        if f in seen:
            continue
        if equip[e.get("equipment")] >= PER_EQUIPMENT:
            continue
        seen.add(f)
        equip[e.get("equipment")] += 1
        out.append(e)
        if len(out) == n:
            break
    return out


def main():
    raw = json.load(open(SRC))
    by_muscle = defaultdict(list)

    for e in raw:
        if e.get("category") not in TRAIN:
            continue
        primary = e.get("primaryMuscles") or []
        keys = {MAP[m] for m in primary if m in MAP}
        # rotation and side-bending work counts as obliques, not rectus
        if "abdominals" in primary and OBLIQUE.search(e["name"]):
            keys.discard("abs")
            keys.add("obl")
        for k in keys:
            by_muscle[k].append(e)

    out = {}
    for k, items in by_muscle.items():
        out[k] = [{
            "id": e["id"],
            "name": e["name"],
            "equipment": e.get("equipment"),
            "level": e.get("level"),
            "mechanic": e.get("mechanic"),
            "force": e.get("force"),
            "secondary": [MAP[m] for m in (e.get("secondaryMuscles") or []) if m in MAP],
            "instructions": e.get("instructions") or [],
            "youtube": youtube(e["name"]),
            "source": "free-exercise-db",
        } for e in pick(items)]

    out["shin"] = [{
        "id": re.sub(r"[^a-z0-9]+", "_", n.lower()).strip("_"),
        "name": n, "equipment": eq, "level": lv, "mechanic": mech, "force": "pull",
        "secondary": [], "instructions": [ins], "youtube": youtube(n),
        "source": "curated",
    } for n, eq, lv, mech, ins in SHIN]

    doc = {
        "note": "Exercises per muscle zone. Keys match muscle-map.json zone ids.",
        "sources": {
            "free-exercise-db": {
                "url": "https://github.com/yuhonas/free-exercise-db",
                "licence": "Unlicense (public domain)",
                "derivedFrom": "https://github.com/wrkout/exercises.json",
                "note": "Data only. The dataset's images carry no stated licence "
                        "(unanswered issue #12) and are not used.",
            },
            "curated": {
                "note": "Named here where the dataset has no usable entry — "
                        "currently tibialis anterior only.",
            },
        },
        "links": {
            "note": "Each exercise carries a YouTube search URL rather than a "
                    "fixed video id, so it cannot rot and needs no API key.",
        },
        "muscles": {k: out[k] for k in sorted(out)},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(doc, open(OUT, "w"), indent=1)

    zones = json.load(open(os.path.join(ROOT, "apps", "web", "src", "anatomy",
                                        "muscle-map.json")))["zones"]
    want = [z["id"] for z in zones if z.get("selectable")]
    print(f"{sum(len(v) for v in out.values())} exercises over {len(out)} muscles")
    for z in want:
        n = len(out.get(z, []))
        print(f"  {z:<9}{n:>3}" + ("   <-- NONE" if not n else ""))
    missing = [z for z in want if not out.get(z)]
    print(f"\nzones with no exercises: {missing or 'none'}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

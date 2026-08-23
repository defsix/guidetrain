"""
Build the Stretching library's data file from the same source as the
trainable exercise catalogue.

`build-exercises.py` deliberately excludes the source dataset's "stretching"
category — training work comes first, and mixing a hold-and-release stretch
into the list a muscle offers to *train* would feed it into machinery built
for sets/reps/weight (`prescribe()`, `BODYONLY`, the pair/swap checkers),
none of which have any concept of "this isn't trainable". This script pulls
that excluded category out into its own file instead, reusing the same
muscle-vocabulary mapping so both files agree on what a zone key means.

    python3 build-stretches.py path/to/exercises.json

Writes apps/web/src/anatomy/stretches.json.
"""
import importlib.util
import json, os, sys

# build-exercises.py's own filename isn't a valid module name (the hyphen),
# so `import build_exercises` can't reach it — load it directly by path
# instead, for the one thing worth sharing: the muscle-vocabulary map and the
# YouTube-search-link helper, so both files agree on what a zone key means.
_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("build_exercises", os.path.join(_here, "build-exercises.py"))
_build_exercises = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_build_exercises)
MAP, youtube = _build_exercises.MAP, _build_exercises.youtube

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SRC = sys.argv[1] if len(sys.argv) > 1 else "exercises.json"
OUT = os.path.join(ROOT, "apps", "web", "src", "anatomy", "stretches.json")


def main():
    raw = json.load(open(SRC))
    out = []
    for e in raw:
        if e.get("category") != "stretching":
            continue
        primary = sorted({MAP[m] for m in (e.get("primaryMuscles") or []) if m in MAP})
        if not primary:
            continue
        out.append({
            "id": e["id"],
            "name": e["name"],
            # Every muscle it stretches, not just one — unlike the trainable
            # list, nothing here needs a single canonical zone to file under;
            # a reader browsing "hamstrings" and one browsing "glutes" should
            # both find a stretch that covers both.
            "primary": primary,
            "instructions": e.get("instructions") or [],
            "youtube": youtube(e["name"]),
            "source": "free-exercise-db",
        })

    out.sort(key=lambda e: e["name"])

    doc = {
        "note": "Stretches, browse-only — no sets/reps/weight, kept out of "
                "exercises.json on purpose. See this script's own docstring.",
        "sources": {
            "free-exercise-db": {
                "url": "https://github.com/yuhonas/free-exercise-db",
                "licence": "Unlicense (public domain)",
                "note": "Data only, same as exercises.json's own source note — "
                        "the dataset's images are not used.",
            },
        },
        "stretches": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(doc, open(OUT, "w"), indent=1)

    from collections import Counter
    counts = Counter(m for e in out for m in e["primary"])
    print(f"{len(out)} stretches over {len(counts)} muscles")
    for k in sorted(counts):
        print(f"  {k:<9}{counts[k]:>3}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

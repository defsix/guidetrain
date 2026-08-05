"""
Find a YouTube video for each exercise and write its id into exercises.json.

Run this wherever you have a YouTube Data API key. Nothing about it is needed at
runtime — the ids are baked into the data at build time, so the shipped app
carries no key. That matters because the app is static on GitHub Pages, where
anything in the bundle is public.

    YOUTUBE_API_KEY=... python3 resolve-videos.py [--limit N] [--force] [--revalidate]

Quota, in Google's own words: "Projects that enable the YouTube Data API have a
default quota allocation of 100 search.list calls, 100 videos.insert calls, and
10,000 units per day combined for all other endpoints."

So the binding limit is the flat **100 searches a day**, not the unit pool — one
search per exercise, and the videos.list check costs 1 unit against the separate
10,000. Roughly 100 exercises a day either way. The script skips anything already
resolved so it can be run across several days, and --limit caps a single run.
Quotas reset at midnight Pacific. Running out shows up as **429
rateLimitExceeded**, not the 403 quotaExceeded the docs lead you to expect.

Scraping the search page instead would need no key and is how you might be
tempted to do all 180 at once. It is also against YouTube's terms, which permit
automated access only through the API, so it isn't done here.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "apps", "web", "src", "anatomy", "exercises.json")
KEY = os.environ.get("YOUTUBE_API_KEY")
API = "https://www.googleapis.com/youtube/v3"


class Exhausted(Exception):
    """The day's search allowance is gone."""


def get(path, **params):
    params["key"] = KEY
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # The daily search limit comes back as 429 rateLimitExceeded, *not* the
        # 403 quotaExceeded you would expect, and urllib's str() for either is
        # only "HTTP Error 429: Too Many Requests" — the reason is in the body.
        # Without reading it a spent quota looks like 180 unrelated failures.
        try:
            err = json.loads(e.read()).get("error", {})
        except Exception:
            raise
        msg = err.get("message", str(e))
        reasons = {x.get("reason") for x in err.get("errors", [])}
        if e.code in (403, 429) and reasons & {"rateLimitExceeded", "quotaExceeded",
                                              "dailyLimitExceeded"}:
            raise Exhausted(msg) from None
        raise RuntimeError(f"{e.code}: {msg}") from None


# Words that say nothing about which movement a video shows.
STOP = {"the", "a", "an", "with", "and", "on", "to", "in", "of", "for", "your", "you",
        "exercise", "how", "best", "form", "proper", "do", "tutorial", "is", "it",
        "this", "my", "at", "home", "gym", "workout", "tips", "guide", "perfect",
        "technique", "mistakes", "variations"}
# Short forms a title may use where the exercise name spells it out.
ALIAS = {"rdl": {"romanian", "stiff", "legged", "deadlift"}, "db": {"dumbbell"},
         "bb": {"barbell"}, "ohp": {"overhead", "press"},
         "facepull": {"face", "pull"}, "pullup": {"pull", "up"},
         "pushup": {"push", "up"}, "chinup": {"chin", "up"}, "situp": {"sit", "up"}}


def words(s):
    out = set()
    for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split():
        out |= ALIAS.get(w, {w})
    return out - STOP


def relevant(name, title):
    """Does this video actually claim to show this movement?

    The top result for a less common exercise is often a general video about the
    muscle rather than a demonstration: "Reverse Barbell Curl" came back with
    "BIGGER Forearms Workout", and "Standing Olympic Plate Hand Squeeze" with
    "The Perfect Lying Triceps Extension". Requiring the title to share at least
    one meaningful word with the exercise name rejects exactly those and keeps
    every good match — including ones phrased differently, since "Romanian
    Deadlift" still meets "RDL Tutorial" through the aliases above.

    Nothing is better than something wrong here: an exercise with no video falls
    back to the YouTube search link, which works.
    """
    return bool(words(name) & words(title))


def resolve(name):
    """Best embeddable, relevant video for an exercise, or None.

    Embeddability is checked rather than assumed: an owner can forbid embedding,
    and such a video plays fine on youtube.com while showing only an error in
    our player. Those are skipped so the app never opens a dead window.
    """
    q = f"{name} exercise proper form"
    found = get("search", part="snippet", q=q, type="video", maxResults=10,
                videoEmbeddable="true", safeSearch="strict", relevanceLanguage="en")
    ids = [i["id"]["videoId"] for i in found.get("items", [])]
    if not ids:
        return None
    # videoEmbeddable on search is a filter, but confirm against the video
    # itself — it is one cheap call (1 unit) and it is the authoritative answer.
    info = get("videos", part="status,snippet", id=",".join(ids))
    for v in info.get("items", []):
        st = v.get("status", {})
        if not (st.get("embeddable") and st.get("privacyStatus") == "public"):
            continue
        title = v["snippet"]["title"]
        if not relevant(name, title):
            continue
        return {"videoId": v["id"], "videoTitle": title,
                "videoChannel": v["snippet"]["channelTitle"]}
    return None


def main():
    if not KEY:
        sys.exit("Set YOUTUBE_API_KEY. Get one from console.cloud.google.com, "
                 "enabling the YouTube Data API v3.")
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    force = "--force" in sys.argv

    doc = json.load(open(DATA))
    # Ids resolved before the relevance gate existed can be wrong. Drop the ones
    # that would fail it now, so they are re-searched like any unresolved entry
    # — and if the second attempt finds nothing better, they end up on the
    # search-link fallback, which is the right answer for them.
    if "--revalidate" in sys.argv:
        dropped = 0
        for v in doc["muscles"].values():
            for x in v:
                if x.get("videoId") and not relevant(x["name"], x.get("videoTitle", "")):
                    print(f"  dropping {x['name']} -> {x.get('videoTitle')!r}")
                    for k in ("videoId", "videoTitle", "videoChannel"):
                        x.pop(k, None)
                    dropped += 1
        print(f"{dropped} irrelevant ids dropped")

    todo = [x for v in doc["muscles"].values() for x in v
            if force or not x.get("videoId")]
    # an exercise can appear under more than one muscle; resolve it once
    uniq, seen = [], set()
    for x in todo:
        if x["id"] not in seen:
            seen.add(x["id"]); uniq.append(x)
    if limit:
        uniq = uniq[:limit]
    print(f"{len(uniq)} to resolve ({sum(len(v) for v in doc['muscles'].values())} total entries)")

    found = {}
    for i, x in enumerate(uniq, 1):
        try:
            r = resolve(x["name"])
        except Exhausted as e:
            print(f"  [{i}/{len(uniq)}] stopped: {e}")
            print(f"  {len(uniq) - i + 1} left — rerun after the quota resets at "
                  "midnight Pacific; resolved ones are skipped")
            break
        except Exception as e:
            print(f"  [{i}/{len(uniq)}] {x['name']}: {e}")
            continue
        if r:
            found[x["id"]] = r
            print(f"  [{i}/{len(uniq)}] {x['name']} -> {r['videoId']}  {r['videoChannel']}")
        else:
            print(f"  [{i}/{len(uniq)}] {x['name']} -> nothing embeddable")
        time.sleep(0.2)

    for v in doc["muscles"].values():
        for x in v:
            if x["id"] in found:
                x.update(found[x["id"]])
    doc.setdefault("links", {})["video"] = (
        "Video ids resolved at build time by tools/exercises/resolve-videos.py, "
        "so the app ships no API key. Exercises without one fall back to the "
        "YouTube search link.")
    json.dump(doc, open(DATA, "w"), indent=1)

    have = sum(1 for v in doc["muscles"].values() for x in v if x.get("videoId"))
    tot = sum(len(v) for v in doc["muscles"].values())
    print(f"\nresolved this run: {len(found)}   with a video now: {have}/{tot}")


if __name__ == "__main__":
    main()

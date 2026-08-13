"""
Find a YouTube video for each exercise and write its id into exercises.json.

Run this wherever you have a YouTube Data API key. Nothing about it is needed at
runtime — the ids are baked into the data at build time, so the shipped app
carries no key. That matters because the app is static on GitHub Pages, where
anything in the bundle is public.

    YOUTUBE_API_KEY=... python3 resolve-videos.py
        [--limit N] [--force] [--revalidate] [--dedupe]

--revalidate drops ids whose title fails today's relevance rules, --dedupe frees
every exercise but one where several share a video, and both then re-search as
if unresolved. Together they cost one search each per freed exercise, so run
them before checking how much of the day's allowance is left.

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
import collections, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

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
        "technique", "mistakes", "variations",
        # Posture and setup qualifiers. Half the catalogue is "standing" or
        # "seated" something, so agreeing on one is no evidence at all: it is
        # how "Standing Olympic Plate Hand Squeeze" matched "How to do Standing
        # Military Press". "bar" is the same — shared by pullup bars, barbells
        # and T-bars alike, it let "V-Bar Pullup" match "V Bar Pulldown".
        "standing", "seated", "lying", "kneeling", "bar", "machine",
        "alternate", "alternating"}
# Short forms a title may use where the exercise name spells it out.
ALIAS = {"rdl": {"romanian", "stiff", "legged", "deadlift"}, "db": {"dumbbell"},
         "bb": {"barbell"}, "ohp": {"overhead", "press"},
         "facepull": {"face", "pull"}, "pullup": {"pull", "up"},
         "pushup": {"push", "up"}, "chinup": {"chin", "up"}, "situp": {"sit", "up"},
         # Same kit under another name. "Leverage" in this catalogue means a
         # plate-loaded machine, which titles call Hammer Strength, isolateral
         # or just "the machine"; a rope is what hangs off a cable. Without
         # these the contradiction test below reads a synonym as a conflict and
         # throws away the right video.
         "leverage": {"machine"}, "lever": {"machine"}, "hammer": {"machine"},
         "isolateral": {"machine"}, "rope": {"cable"},
         "single": {"one"}, "unilateral": {"one"}, "banded": {"band"},
         # Straps. The catalogue says "suspended"; the world says TRX, which is
         # a brand that became the name of the movement.
         "trx": {"suspended"}, "strap": {"suspended"}, "suspension": {"suspended"}}

# What the movement is actually called, where that differs from the catalogue.
#
# Only the *question* changes. The answer is still judged against the real
# exercise name by the same gate, so this cannot let a wrong video through — it
# can only stop the search returning ten videos of a movement nobody asked
# about. "Suspended Row" searched literally returns barbell rows; searched as
# "TRX row" it returns the exercise.
SEARCH_AS = {
    "Decline Reverse Crunch": "reverse crunch on a decline bench",
    "Suspended Reverse Crunch": "TRX suspended reverse crunch knee tuck",
    "One-Legged Cable Kickback": "single leg cable glute kickback",
    "Kneeling Cable Crunch With Alternating Oblique Twists":
        "kneeling cable oblique crunch with a twist",
    "Reverse Calf Raise on Leg Press": "reverse calf raise on the leg press tibialis",
    "Suspended Row": "TRX suspended row on a suspension trainer",
}

# Qualifiers that separate one variant of a movement from another.
#
# Within a family the words are mutually exclusive — nothing is both seated and
# incline, and a barbell is not a Smith machine. Note that several of these are
# in STOP: they carry no weight as *agreement*, because half the catalogue is
# "seated" something, but they are decisive as *disagreement*. A word can be
# worthless as evidence of a match and conclusive as evidence of a mismatch.
FAMILIES = [
    {"seated", "standing", "lying", "kneeling", "incline", "decline", "bent"},
    {"barbell", "dumbbell", "kettlebell", "cable", "machine", "smith",
     "band", "ball", "sled"},
    {"close", "wide", "medium", "narrow", "neutral"},
    # Not a variant but an opposite: hip adduction and abduction move the leg
    # the other way and train different muscles. "Band Hip Adductions" was
    # showing a banded hip *ab*duction.
    {"adduction", "abduction"},
]

# Words whose absence from a title is itself the mismatch. A "Cable Reverse
# Crunch" video titled "Cable Crunch" is not a differently worded match, it is
# the other exercise. Checked one way only — the name is the specification, and
# a title carrying an extra qualifier is usually just being more precise.
STRONG = {"reverse", "suspended", "one", "oblique", "decline", "incline"}
# "alternating" was here and has been taken out. Reverse changes the movement;
# alternating only describes which side goes first, so a video of a kneeling
# cable oblique crunch demonstrates the alternating version perfectly well. It
# stays in STOP, where it counts for nothing as agreement — the point of the
# two lists is that they answer different questions.


def singular(w):
    """Fold a trailing plural s, so "rows" and "row" are the same word.

    Titles pluralise what exercise names don't ("T-Bar Row" vs "T-Bar Rows"),
    which without this would leave that pair agreeing on nothing. Words of
    three letters or fewer are left alone so "abs" survives, and a double s is
    never stripped so "press" doesn't become "pres".
    """
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def words(s):
    """Meaningful tokens in a name or title.

    Single letters and bare numbers are dropped. Neither identifies a movement
    on its own, and letting them count is how "V-Bar Pullup" matched "Top 9
    Lats Exercises for a V-Shape Body" — on the lone "v". Real three-letter
    words still count ("hip", "row", "box", "sit"), which is what keeps
    "Lateral Box Jump" paired with "box jumps".
    """
    out = set()
    for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split():
        out |= ALIAS.get(w, {w})
    return {singular(w) for w in out - STOP if len(w) > 1 and not w.isdigit()}


def tokens(s):
    """Every word, aliases applied and plurals folded, nothing dropped.

    `words` above removes the qualifiers that say nothing about which movement
    a video shows. Those are precisely the ones needed here, so this keeps them.
    """
    out = set()
    for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split():
        out |= ALIAS.get(w, {w})
    return {singular(w) for w in out}


def contradicts(name, title):
    """Why this title is a different exercise, or None if it isn't.

    Sharing a word is not enough on its own: "Seated Dumbbell Curl" and
    "Incline Dumbbell Curl" share two, and are done on different benches. Where
    the search has no good answer it returns the nearest neighbouring movement,
    which is the one thing worse than returning nothing — a reader who is told
    the video shows their exercise has no reason to doubt it.
    """
    n, t = tokens(name), tokens(title)
    for fam in FAMILIES:
        a, b = n & fam, t & fam
        if a and b and not (a & b):
            return f"{'/'.join(sorted(a))} vs {'/'.join(sorted(b))}"
    gone = (n & STRONG) - t
    if gone:
        return f"name says {'/'.join(sorted(gone))}, title doesn't"
    return None


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
    return bool(words(name) & words(title)) and not contradicts(name, title)


def resolve(name, taken=()):
    """Best embeddable, relevant video for an exercise, or None.

    Embeddability is checked rather than assumed: an owner can forbid embedding,
    and such a video plays fine on youtube.com while showing only an error in
    our player. Those are skipped so the app never opens a dead window.

    A video already given to another exercise is passed over while any other
    candidate remains. The search does not know what the rest of the catalogue
    was given, so on its own it handed one cable crunch video to four different
    exercises — and Train This, dealing a different exercise each press, then
    opened the same video twice in a row and looked broken. Falling back to a
    shared video is still allowed once the alternatives run out: two exercises
    on one demonstration beats one exercise on none.
    """
    q = f"{SEARCH_AS.get(name, name)} exercise proper form"
    found = get("search", part="snippet", q=q, type="video", maxResults=10,
                videoEmbeddable="true", safeSearch="strict", relevanceLanguage="en")
    ids = [i["id"]["videoId"] for i in found.get("items", [])]
    if not ids:
        return None
    # videoEmbeddable on search is a filter, but confirm against the video
    # itself — it is one cheap call (1 unit) and it is the authoritative answer.
    info = get("videos", part="status,snippet", id=",".join(ids))
    fallback = None
    for v in info.get("items", []):
        st = v.get("status", {})
        if not (st.get("embeddable") and st.get("privacyStatus") == "public"):
            continue
        title = v["snippet"]["title"]
        if not relevant(name, title):
            continue
        hit = {"videoId": v["id"], "videoTitle": title,
               "videoChannel": v["snippet"]["channelTitle"]}
        if v["id"] not in taken:
            return hit
        fallback = fallback or hit
    return fallback


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
    # One entry per exercise; the same exercise can be listed under several
    # muscles, and both passes below have to agree about which is which.
    every = {}
    for v in doc["muscles"].values():
        for x in v:
            every.setdefault(x["id"], x)

    def unset(x):
        for k in ("videoId", "videoTitle", "videoChannel"):
            x.pop(k, None)

    if "--revalidate" in sys.argv:
        dropped = 0
        for x in every.values():
            if not x.get("videoId"):
                continue
            title = x.get("videoTitle", "")
            why = (contradicts(x["name"], title) if words(x["name"]) & words(title)
                   else "shares no meaningful word")
            if why:
                print(f"  dropping {x['name']} -> {title!r}  ({why})")
                unset(x)
                dropped += 1
        print(f"{dropped} irrelevant ids dropped")

    # One video, several exercises. Each was resolved knowing nothing about the
    # others, so the same cable crunch video was handed to four of them. The
    # exercise whose name the title matches best keeps it; the rest go back for
    # a search that now knows what is already taken.
    if "--dedupe" in sys.argv:
        by_video = collections.defaultdict(list)
        for x in every.values():
            if x.get("videoId"):
                by_video[x["videoId"]].append(x)
        freed = 0
        for vid, xs in by_video.items():
            if len(xs) < 2:
                continue
            # Most words in common with the title wins; a tie goes to the
            # plainer name, since a title rarely names the fancier variant.
            xs.sort(key=lambda x: (-len(words(x["name"]) & words(x["videoTitle"])),
                                   len(x["name"])))
            print(f"  {vid} kept by {xs[0]['name']!r}, freeing "
                  f"{', '.join(repr(y['name']) for y in xs[1:])}")
            for y in xs[1:]:
                unset(y)
                freed += 1
        print(f"{freed} duplicate ids freed")

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

    # Everything still spoken for, so a re-search doesn't hand back a video
    # another exercise is already using — including ones found in this run.
    taken = {x["videoId"] for x in every.values() if x.get("videoId")}

    found = {}
    for i, x in enumerate(uniq, 1):
        try:
            r = resolve(x["name"], taken)
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
            shared = " (shared — nothing else matched)" if r["videoId"] in taken else ""
            taken.add(r["videoId"])
            print(f"  [{i}/{len(uniq)}] {x['name']} -> {r['videoId']}  "
                  f"{r['videoChannel']}{shared}")
        else:
            # Could be unembeddable, could be that nothing in the results
            # actually showed this movement. Either way it keeps the search
            # link, and saying "nothing embeddable" would name the wrong cause.
            print(f"  [{i}/{len(uniq)}] {x['name']} -> nothing that passes the gate")
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

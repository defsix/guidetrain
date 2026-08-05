"""
Find a YouTube video for each exercise and write its id into exercises.json.

Run this wherever you have a YouTube Data API key. Nothing about it is needed at
runtime — the ids are baked into the data at build time, so the shipped app
carries no key. That matters because the app is static on GitHub Pages, where
anything in the bundle is public.

    YOUTUBE_API_KEY=... python3 resolve-videos.py [--limit N] [--force]

Quota: search.list costs 100 units a call against a default 10,000/day, so about
100 exercises a day. The script skips anything already resolved, so it can be
run across several days, and --limit caps a single run.

Scraping the search page instead would need no key and is how you might be
tempted to do all 180 at once. It is also against YouTube's terms, which permit
automated access only through the API, so it isn't done here.
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "apps", "web", "src", "anatomy", "exercises.json")
KEY = os.environ.get("YOUTUBE_API_KEY")
API = "https://www.googleapis.com/youtube/v3"


def get(path, **params):
    params["key"] = KEY
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def resolve(name):
    """Best embeddable video for an exercise, or None.

    Embeddability is checked rather than assumed: an owner can forbid embedding,
    and such a video plays fine on youtube.com while showing only an error in
    our player. Those are skipped so the app never opens a dead window.
    """
    q = f"{name} exercise proper form"
    found = get("search", part="snippet", q=q, type="video", maxResults=5,
                videoEmbeddable="true", safeSearch="strict", relevanceLanguage="en")
    ids = [i["id"]["videoId"] for i in found.get("items", [])]
    if not ids:
        return None
    # videoEmbeddable on search is a filter, but confirm against the video
    # itself — it is one cheap call (1 unit) and it is the authoritative answer.
    info = get("videos", part="status,snippet", id=",".join(ids))
    for v in info.get("items", []):
        st = v.get("status", {})
        if st.get("embeddable") and st.get("privacyStatus") == "public":
            return {"videoId": v["id"], "videoTitle": v["snippet"]["title"],
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
        except Exception as e:
            print(f"  [{i}/{len(uniq)}] {x['name']}: {e}")
            if "quota" in str(e).lower():
                print("  quota exhausted — rerun tomorrow, already-resolved ones are skipped")
                break
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

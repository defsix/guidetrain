# Bundled fonts

Two families, self-hosted rather than linked from a CDN — a webfont link tells a
third party which pages a reader opens, and the app already declines that trade
elsewhere (the video player fetches nothing from YouTube until it is clicked).

| Family | Version | Copyright | Licence |
| --- | --- | --- | --- |
| [Space Grotesk](https://github.com/floriankarsten/space-grotesk) | Google Fonts v22 | Florian Karsten | [OFL 1.1](OFL-space-grotesk.txt) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | Google Fonts v24 | JetBrains s.r.o. | [OFL 1.1](OFL-jetbrains-mono.txt) |

Both are SIL Open Font License 1.1, which permits bundling and redistribution
with the licence included — which is what the two `OFL-*.txt` files are for.
Neither font is sold, and neither is distributed under a reserved name.

Variable fonts, split by subset: each file covers every weight the site uses in
one download. Space Grotesk has no Cyrillic, so Russian sans text falls back per
glyph; JetBrains Mono does, and carries the translated panel headings. Greek and
Vietnamese subsets are dropped — neither is among the ten languages. Japanese
and Chinese are in neither face and fall back to the system, as they should.

Regenerate with `python3 tools/fonts/fetch-fonts.py`, which rewrites
`apps/web/src/fonts.css` alongside the files.

# 70 — Generated art (M9)

The graphics pass of 2026-11-15 (owner: "Let's do a graphics pass too. Use evilaegis. Flux. And Gemini if needed."). Every
image comes from the local Flux Studio on the GPU PC (FLUX.2 klein, Apache-2.0; KB `local-ai-studios.md`); Gemini was not
needed. Presentation only: no rule, number or balance row changes, and the look stays the scanner ghost-map of spec 50
(PLAN D5): the tokens, the square corners and the instrument language are untouched. What changes is that the instruments
now have something to show: the deck has plating, the bulkheads have panels, the squad has faces and each place has a still.

Everything is original: no publisher art, names or designs; every prompt is in the manifest and passes the prompt lint (KB
rule 23). The owner's look at `art.html` is still owed, the same way the audio waits on `sounds.html`.

## The manifest (`src/data/assets.json`)

- `art` names the provider (`flux-studio`), the model (`klein`) and how many candidates a job renders (4).
- `images[]`: `id`, `kind` (`texture` | `portrait` | `plate` | `decal`), `file` (`art/<id>.webp` under `public/assets/`),
  `aspect`, `size` (published pixels), `use` (where the client shows it), `ref` (portraits: the model slug whose picked
  concept is attached), `prompt`, and once published `pick` (which candidate), `seed` (the job's seed) and `enabled`.

**ART-1 Manifest.** Ids are unique; the file is named after the id; kind, aspect, size and use are from the known sets; a
portrait names a model in `ref` and nothing else does; an enabled image has its file on disk and its pick and seed
recorded; every prompt passes the lint. Checked by `npm run validate:data` and `tests/unit/art.test.ts`.

**ART-2 Coverage.** A face for every squad member (`unit:<id>`) and every stalker model (`model:<slug>`); a still for the
title, every mission (`mission:<id>`) and each of the four endings (`debrief:<seat>-<win|loss>`); a texture for every
board surface (`floor` with at least four variants, `wall`, `ceiling`, `door`, `duct`); a decal for both scars
(`scar:burn`, `scar:kill`). A new mission or squad member without its image fails the validator.

## The set (28 images, about 1 MB shipped)

| Kind | Ids | Made as | Published |
|---|---|---|---|
| Board textures | `deck-plate-a..d`, `wall-panel-a`, `wall-panel-b`, `deckhead`, `door-leaf`, `duct-grille` | text-to-image, an orthographic photograph of one panel "filling the whole frame edge to edge", flat light | greyscale, stretched to the full range, levelled to a mean of 0.5, 512 px (walls 512 x 768), 9 to 42 KB each |
| Faces | `portrait-venn`, `-brandt`, `-okafor`, `-riedel`, `-sato`, `portrait-stalker-a..c` | image edit of the picked concept of the model (`art/concepts/picks.json`), so the bust is the figure on the board | 512 px square, colour |
| Key art | `title-wreck`, `mission-dead-reckoning`, `-cold-berth`, `-last-light`, `debrief-recovered`, `-lost`, `-molt-win`, `-molt-loss` | text-to-image at 2 MP, 16:9, "cinematic still, deep blacks, cold teal light" | 1280 x 720 (title 1600 x 900), 35 to 76 KB each |
| Scars | `scorch-mark`, `ichor-splat-a`, `ichor-splat-b` | text-to-image on plain white paper, seen from above | 512 px with alpha taken from darkness (white is clear) |

`public/og.jpg` (the link-preview card, 1200 x 630) is the title still with the wordmark, made by `tools/art/make-card.mjs`.

## On the board

**ART-3 Textures are tinted, never shown raw.** A board texture is a greyscale multiplier read as plain numbers; the
board multiplies it with the same state colour the flat plate had, times one gain (`TEX_GAIN` in `Deck.tsx`), so every
open-information read of spec 50 survives: a square seen now is the bright plate, a mapped one the dim plate, a sealed
door is still `--alarm`, a torn one `--molt`, a purged duct goes cold.
- Floor: one instanced mesh per plate variant; a square takes its variant and a quarter turn from `tileHash(x, y)`, so it
  keeps its plate for the whole mission and across reloads.
- Walls: the four side faces carry a bulkhead panel (two variants by the same hash); the top carries a plate at wall
  darkness so the hull reads as structure, not a black mass. The texture is drawn for the visor's 1.6-high wall; the map's
  0.6-high wall shows the foot of it, unstretched (`texture.repeat.y`).
- Deckhead (visor only): one ceiling panel a square. Door leaves and duct grates take their texture under the state colour;
  without a duct texture the five bars of spec 50 are drawn as before.
- A soft vignette over the canvas (`.board::after`) sits the deck in the dark. No bloom, no post-processing pass.
- Without an image (not enabled, `?art=none`, or a failed load) every surface is the flat colour of spec 50.

**ART-6 Scars.** The fight marks the deck, tallied from engine events like the debrief and never from state: a splash
where a stalker is destroyed (`destroyed`, kind `stalker`; a Warden or an unresolved contact leaves none), a burn mark on
every square of a fire when it burns out (`burnCleared` names no squares: they are the squares burning before it, plus any
`scorched` burst earlier in the same run of events). A square holds one burn mark and at most two splashes; the deck keeps
the newest 96. Pure in `src/client/board/scars.ts`. Scars are presentation: they are not in the save, so a reopened mission
starts with a clean deck, and they carry no pointer handlers (KB rule 25).

## On the screens

**ART-4 A still is a sensor feed, never a bare photograph.** `.feed`: a 1 px frame, scanlines, a cold tint, and a
caption line in the instrument voice.
- Title: `title-wreck` full-bleed behind the rings, the line map and the sweep, faded to `--void` on the menu side.
- Missions: the mission's still on its card above the deck drawing (dimmed on the cards that are not picked).
- Briefing: the mission's still, captioned `LAST SURVEY STILL // <place>`; a second column on wide screens, a band under
  the heading on narrow ones.
- Debrief: the still of the ending for the seat played, captioned `FEED // CLOSING FRAME` or `FEED // LAST FRAME RECEIVED`.

**ART-5 Faces.** A helmet-camera face beside the name on the Briefing roster, the Debrief cards (grey for the lost), the
squad strip (faded into the card's corner; grey when down) and the visor's tag. On the Molt seat a revealed stalker's card
shows the face of its model (`stalkerSlug`); an unresolved contact shows none, since nobody has seen it.

Pictures are decoration beside text that already says everything: empty `alt`, no `title` attributes (KB rule 8), no
pointer handlers of their own.

**ART-7 Loading.** At startup the client preloads every enabled image: board textures and decals through the texture
loader, stills and faces through the browser cache. The buttons that open a mission (`CUT IN`, `CONTINUE`) wait for the
board textures as they wait for the models, and say so (`Loading deck art 7/12`): a plate is never shown flat first and
textured a moment later (KB rule 26). An image that fails to load is left out, warned once in the console and listed in
Settings. `?art=none` requests nothing (the e2e test counts the requests). `window.__sd.art()` reports enabled ids,
loads, failures and scars.

## Tooling

**ART-8** `tools/art/gen-art.mjs` (`npm run art:gen`), pure parts in `tools/art/lib.mjs`:

```
npm run art:gen -- --dry-run                 # every job body and seed; nothing is sent
npm run art:gen                              # 4 candidates for every id without candidates (tools/out/art/<id>/)
npm run art:gen -- --only title-wreck --reroll 1   # another take (seed offset)
npm run art:gen -- --pick title-wreck:2,scorch-mark:1   # publish candidate n and record pick, seed, enabled
npm run art:gen -- --publish                 # publish every recorded pick again (after a recipe change)
npm run art:gen -- --sheets                  # contact sheets per kind (tools/out/art/contact-<kind>.jpg)
node tools/art/make-card.mjs                 # public/og.jpg from the title still
```

Candidates and sheets are gitignored (`tools/out/`); the repo carries the published files and, in the manifest, the prompt,
seed and pick that make each one again. Publishing (sharp): cover-crop to `size`; textures to greyscale, normalised and
levelled to `TEXTURE_MEAN`; decals with `alphaFromLuma`; WebP. `art.html` lists every image with its use, pick, seed and
prompt: the page for the owner's look.

GPU etiquette (KB rules 10, 17): start Flux Studio detached with its PID in `%TEMP%\flux-studio.pid`, one job at a time
(the generator posts one and waits), stop it by PID when the batch is done.

## Measured (RTX 5080, 2026-11-15)

| Job | Time for 4 candidates |
|---|---|
| Text-to-image, 1 MP | 16 s (36 s with the model load) |
| Text-to-image, 2 MP 16:9 | 26 s |
| Image edit with one reference | 26 s |

28 jobs, 112 candidates, about 12 minutes of GPU; no job failed and nothing was re-rolled.

Prompt lessons:
- A texture prompt that says "orthographic photograph of one square <thing> filling the whole frame edge to edge, flat
  even lighting with no cast shadows and no perspective" gave usable tiles in 4 of 4 for plates and walls; about one in
  four came with a white margin or a room around it (the deckhead: 3 of 4 drew a corridor in perspective). Pick the
  full-bleed one; do not crop a margin away.
- An image edit ignores the job's `aspect`: a 832 x 1216 reference gave 1184 x 880 busts. The publish step crops to the
  square, so compose "the helmet and shoulders filling the frame".
- Decals: "on a plain pure white background, seen from directly above, centred with a wide empty margin" and alpha from
  luminance beats asking for transparency.
- Key art: say what is dark ("no engine glow and no lit windows") and name the one or two lights; state the palette once.

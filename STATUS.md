# STATUS (rewritten at each stage; trust `git log` over this file)

**2026-11-15: M10 the wreck pass (owner on M9: "The ship looks too plain, lots of blue, it's supposed to be a derelict
ship, ruined walls, fires, claw marks etc").** PLAN D9. The board art was made again and the way it is shown changed:

- **Colour, not a teal tint.** Board textures are colour pictures of a wrecked ship now; the board lights them. A square
  seen now is lit steel, a mapped one a dim cold ghost; the sensor teal is left to the HUD, the outlines and the ghost.
  Spec 70 ART-3 is rewritten.
- **Ruin.** Eight deck plates (four sound, and rarer: claw gouges, an old burn, a torn hole with pipes below, a dried
  stain) and five bulkhead panels (two sound, and rarer: raked by claws, burnt out, torn open), drawn by weight so about a
  third of the ship is visibly damaged; a torn deckhead with hanging cables; a clawed door leaf; a corroded duct grate.
- **Fires.** Three to nine bulkheads a mission have a burning breach (`wreck.ts`, deterministic): the `wall-fire` texture
  lit by itself and flickering, shader flames above the wall on the map and licking out at its foot in every view, a soft
  pool of firelight on the deck. Scenery only: walls keep their shape, and the rule state "burning square" keeps its own
  hard-edged fill (spec 70 ART-9).
- **Old damage on the deck.** Claw gouges, debris, stains and scorching on about a fifth of the plain floor squares, under
  the battle scars of M9.
- **Stills.** The title wreck now has torn breaches with fires inside and a debris trail; the three mission stills have
  toppled stacks, smashed berths, a collapsed catwalk, fires and claw marks. The feed frame lost its teal tint.
- **Fixed on the way:** M9 lit only one of the four side faces of each bulkhead (the other three kept their first colour),
  which the visor of this pass showed at once; the four faces now share one material.
- **Measured:** 25 jobs, 100 candidates, about 9 minutes of GPU, no failures or re-rolls. 40 images, 1.6 MB shipped.
- **Gates:** typecheck, 238 unit tests, data validation, prompt lint, sim (300 games, 0 violations), 31 e2e tests, build.
  Looked at on the real GPU (headless Chromium on D3D11).
- **Not verified:** the owner has not seen this pass yet; the audio is still not verified by ear.

**2026-11-15: M9 graphics pass (owner: "Let's do a graphics pass too. Use evilaegis. Flux. And Gemini if needed.").**
28 images from the local Flux Studio on the GPU PC (FLUX.2 klein; Gemini was not needed), spec `docs/spec/70-art.md`
(ART-1..8), about 1 MB shipped under `public/assets/art/`:

- **The board.** Four deck plates, two bulkhead panels, a deckhead, a door leaf and a duct grate as greyscale textures
  tinted with the same state colours as before (seen is still the bright plate; sealed, torn and purged keep their
  colours), a plate texture on the wall tops, a vignette. A square keeps its plate and quarter turn (`tileHash`). The
  visor now looks down a panelled corridor instead of flat faces. **Scars**: a splash where a stalker is destroyed, a burn
  mark where a fire burns out, tallied from engine events (`src/client/board/scars.ts`), not saved.
- **The screens.** The wreck behind the title sweep; a still on each mission card, on the Briefing (`LAST SURVEY STILL //
  <place>`) and on the Debrief (one per ending and seat), each framed as a sensor feed; faces on the roster, the Debrief
  cards (grey for the lost), the squad strip, the visor tag and the Molt seat's stalker cards. Each Warden's face is an
  image edit of the concept its figure was built from.
- **Plumbing.** `tools/art/gen-art.mjs` (`npm run art:gen`: dry run, `--reroll`, `--pick id:n` publishes and records pick
  and seed, `--publish`, `--sheets`); candidates stay in `tools/out/art/` (gitignored). The start buttons wait for the deck
  textures (`Loading deck art n/m`, KB rule 26); `?art=none`; `window.__sd.art()`; `art.html` for the owner's look;
  `public/og.jpg` link-preview card and its meta tags. Validator and prompt lint cover `images[]`.
- **Found on the way.** On screens taller than the window the Briefing's rows shrank to their `min-height` and the brief
  ran into the objective line (phones, since M3): `grid-auto-rows: max-content`. A percentage-width `aspect-ratio` box is
  mis-sized as a grid item; the feeds take their height from padding instead.
- **Measured.** 28 jobs, 112 candidates, about 12 minutes of GPU (16 s per four at 1 MP, 26 s at 2 MP or for an image
  edit); no failures, no re-rolls. Flux Studio was started for the batch and stopped after it.
- **Gates:** typecheck, 234 unit tests (`tests/unit/art.test.ts` new), data validation, sim (300 games, 0 violations), 31 e2e tests
  (`tests/e2e/art.spec.ts` new), build. Looked at on the real GPU (RTX 5080, headless Chromium on D3D11) at 1600 x 900,
  844 x 390 and 390 x 844.
- **Not verified:** the owner has not seen any of it (`art.html`, then the live screens); the audio is still not verified
  by ear.

**2026-11-15: M8 audio through ElevenLabs (owner's one-day key).** Every effect, track and voice line regenerated
with ElevenLabs: sound effects v2 (one take per file, 61 files; the ambience as a 30 s `loop`), Eleven Music (seven
instrumental states at the spec lengths), Eleven v3 speech with **six designed voices** saved to the account as
`Stellar Derelict <name>` (the five Wardens and a comms officer), adopted from their first previews unheard. New:
`servo-turn` on `turned` and `burn-out` on `burnCleared` (the silent list is down to `cpSpent`, `pingHeld`, `roundEnded`,
`watchEnded`), a third variant for hits, scorch, door tears and pings, the four carrier lines in each Warden's own voice
(AUD-10; the generic carrier voice is gone), and a briefing narration per mission read once when the Briefing opens
(AUD-11). Tooling: `tools/audio/gen-eleven.mjs` (`npm run audio:eleven`; dry run with a credit estimate, `--budget`,
`--design`/`--adopt`, `--enable`, cost logged from the `character-cost` header, IPv4-first), the validator checks the
cast, the carrier lines and the briefing texts. Measured: effects 10 credits a second, music 12.5 a second, speech 1 a
character; the whole set about 11,400 credits by the subscription counter (four near-silent first takes re-rolled). Spec 60 rewritten. **Not verified by ear** (the owner's listen on
`sounds.html`, then re-rolls with `--force --only <id>` or another preview with `--design`/`--adopt`).

**2026-11-14: M7 done: three missions, the Molt seat, the boarding run, a fuller debrief.** The plan's last milestone.

- **Missions.** *Cold Berth* (spec 12: a berth deck of one-wide lanes, five by four, the manifest drive behind a sealed
  bulkhead two squares from its lock) and *Last Light* (spec 13: a short spine through two sealed bulkheads into the
  reactor room, alarm arrivals 4). Each has its own balance table; both sit in the 35–55% band against the regular Molt
  with the full squad (CB-4 49.4%, LL-4 45.0%, 1,000 games each; Dead Reckoning 42.5%). Every mission carries its
  own words for the core, the console's room and the exit (`objective`), and the UI uses them everywhere.
- **The Warden policy plays any mission.** Its Dead Reckoning constants (terminal ids, formation squares) became
  `missionPlan` (derived from the mission's terminals and sealed doors) plus `aiHints` slots in the mission data; the
  400-game Dead Reckoning sim gives the same 171 wins before and after, so B-6..B-8 stand.
- **The Molt seat** (spec 50 MOLT-1..5, PLAN D4's "later"): from the Missions screen, `PLAY AS: MOLT` on any single
  mission. The utility squad AI runs the Wardens on the main thread; the person places arrivals by tapping open ducts,
  creeps contacts, reveals, tears and strikes from a contact strip and an action bar with the engine's odds; the Molt view
  shows each contact's stalker count (E-7). No boarding clock on this seat.
- **The boarding run** (spec 10 §15, R-1..R-5; `src/client/run.ts`, `src/data/run.json`): the three missions in order,
  the survivors of one board the next with plating repaired, a loss or fewer than two survivors ends it, every mission's
  seed derives from the run's. The run rides in the mission save and parks under `stellar-derelict-run` between missions;
  the title offers `CONTINUE THE BOARDING RUN`. Short-handed rows are in the mission specs.
- **Debrief.** Tallied from engine events (never from state): shots and hits, kills with the purge's share, contacts
  resolved and how many were exposed by sight, CP spent, doors torn, one card per Warden with its record; the run line
  and `NEXT: <mission>` in a run. A `cpSpent {unit, cp, left}` event (C-2) now exists, and the Sergeant's command-point
  voice line keys to it (once per phase) instead of to `phaseStarted` (the open item of M6 is closed).
- **Gates:** typecheck, 204 unit tests (`tests/unit/run.test.ts` new), data validation (objectives, hints, the run),
  sim 1,000 games on Dead Reckoning (0 violations), 27 e2e tests (`molt.spec.ts`, `run.spec.ts` new), build.
- **Not verified:** nothing of M7 has been seen on a real GPU (SwiftShader screenshots only); the M6 audio is still not
  verified by ear (the owner's listen on `sounds.html`). The stalkers' `heightIn` guesses in `assets.json` worked in the
  owner's playtest and stay as they are.
- **Open (next):** more wrecks beyond the *Halcyon Drift*; a Molt seat for the boarding run (it is Wardens-only); a human
  Molt against a stronger squad policy; the proposed probe rule from spec 10 §13b if a person is stopped by a plugged corridor.

**2026-11-14: TOP DOWN button (owner request).** "A button that brings the view back to top down." `TOP DOWN` at the
top right (`TOP` on phones) and `H` glide the camera to north up, looking nearly straight down (pitch limit raised to
86°), keeping the spot and zoom; from the visor it lands overhead above that Warden. On phones the button row moved
under the clock (four buttons overlapped it). Gates: typecheck, 193 unit tests, data validation, sim (1000 games,
0 violations), 22 e2e tests, build. Visor mode went live the same day; the owner: "It works great."

**2026-11-14: visor mode (owner request).** "A marine visor mode where the view shifts to the marine selected, and you
can control directly from the marine." `C` or the `VISOR` button puts the camera in the selected Warden's helmet:
first-person at 72°, walls raised to 1.6 with `--scan` sensor outlines, a deckhead, fog; W/S/Q/E and the arrow keys act,
drag looks around, Fire or Melee armed shows a bracket with the engine odds on each target and pressing it again shoots
the locked one. Spec 50 "Visor" (VISOR-1..6), `tests/unit/visor.test.ts`, `tests/e2e/visor.spec.ts`. Presentation only:
no rule, data or balance change. Gates: typecheck, 191 unit tests, data validation, sim (1000 games, 0 violations),
21 e2e tests, build. Not yet seen by the owner on a real GPU (SwiftShader screenshots only).

**2026-11-13 — live on Pages, first owner playtest approved.** Owner: "I'm super impressed with my playtest so far.
This is how you get a working prototype." Below is the state as of M5/M6.

**2026-11-12 — M5 figures and M6 audio done on the GPU PC.** Dead Reckoning is playable against the Molt AI
(Recruit / Regular / Veteran) with generated figures and a full soundtrack: all 11 models, 38 effects (54 files),
7 music states and 34 voice lines are enabled and load from `public/assets/`. The audio is **not verified by ear**:
the owner has not yet listened on `sounds.html` (KB rule 9).

- Gates: typecheck, 185 unit tests, data validation, prompt lint, sim (1000 games, 0 violations, Wardens 42.5%),
  19 e2e tests, build.
- Figures (M5): Flux Studio concepts (FLUX.2 klein, image edit with the style reference), one pick per slug in
  `art/concepts/picks.json`; Hunyuan 2.1 shape (10k faces for figures; props decimated to 4k/6k/2k at the shape
  stage), 2.0 paint, finalize; `npm run models:optimize` (meshopt + WebP, about 430 KB per figure). Gallery gate
  passed close up: helmet line at the visor, every model faces -Z (`yaw` 0 except stalker-b -90, stalker-c 180).
- Audio (M6): Stable Audio Open effects (5 s a job), ACE-Step music (10 s a track), Qwen voice design lines (8 s a
  line) through `tools/audio/gen-audio.mjs`; three takes for `repeater-hit` and `stalker-death` (`--reroll`), then a
  layered transient for the hit; `npm run audio:measure` trims, levels (effects -18 LUFS, loop -24, music and voice
  -16, gunshots by peak) and flags; no flags remain. Whole M6 GPU time about 20 minutes.
- Found on the PC: the gallery's "+Z arrow" contradicted the loader (game forward is -Z); ffmpeg's channel
  rematrixing misreads peaks by 3 dB (the analyser now decodes at the file's own channel count); alimiter's default
  auto-level undoes a ceiling (`level=false`); a textured Hunyuan mesh cannot be simplified afterwards.
- Not done: the owner's listen on `sounds.html` (then any re-rolls), a fuller debrief, more missions, the playable
  Molt side, a run layer. Open (closed in M7): Venn's "command points spent" line keyed to `phaseStarted` (no CP-spent
  event); stalkers' base sizes in `assets.json` were guesses that worked.
- Pages: live at https://dragoonant.github.io/StellarDerelict/ (repo made public 2026-11-13; Pages source set to
  the `gh-pages` branch, which the workflow force-pushes after the gates).
- KB: the living entry is `docs/knowledge-base/stellar-derelict.md` (pushed to tabletop-kb 2026-11-13 with the M5/M6
  lessons); `docs/kb-entry-stellar-derelict.md` is now only a pointer and a fallback for sessions without KB push access.

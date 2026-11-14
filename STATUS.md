# STATUS (rewritten at each stage; trust `git log` over this file)

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

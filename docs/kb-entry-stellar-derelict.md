# Stellar Derelict — living entry (DRAFT for `dragoonant/tabletop-kb`)

> This file is the entry meant for `tabletop-kb/stellar-derelict.md`. The cloud session that built the game was not
> given push access to the KB repo (2026-11-13), so the entry waits here. Copy it across, add the index row below to the
> KB `README.md`, and add the three gotchas to `gotchas.md`.

Index row: `| [stellar-derelict.md](stellar-derelict.md) | Stellar Derelict, an original 3D corridor-tactics game (armoured squad vs alien swarm on a derelict ship; same family as the classic boarding-action board games, not a port), 1 human vs AI, started 2026-11-12 in a cloud session; **living entry** | The series' third original ruleset; a two-phase asymmetric engine with hidden contacts and `view(state, seat)`; deterministic weapon heat in place of random jams; a balance table where the obvious levers did nothing. |`

Repo `dragoonant/StellarDerelict` (public since 2026-11-13; live at https://dragoonant.github.io/StellarDerelict/),
started 2026-11-12 from a **claude.ai cloud session**.
Decisions: `PLAN.md` (D1–D8). Rules: `docs/spec/10-rules.md` (rule ids, balance B-0..B-5, rulings). Look:
`docs/spec/50-presentation.md`. State: `STATUS.md`.

## 1. Overview
- **An original game, not a port.** The owner asked for "a spiritual successor to a board game" and confirmed the guess
  (the classic armoured-marines-versus-aliens corridor game). Owner, 2026-11-12: "I love the setting - aliens vs heavily
  armored marines, let's keep that." The premise carries over; the names, numbers, missions and look are written fresh
  (PLAN D1). As with three-kingdoms-tactics and wasteland-behemoths, "the spec is the product".
- Owner decisions 2026-11-12 (one batch of four questions): 3D board (D3); Wardens vs AI first, playable aliens later
  (D4); presentation concept "scanner ghost-map" (D5); push to `main` and Pages after every stage (D6).
- Shape: five Wardens (4 AP each plus a shared command-point roll) against the Molt, who arrive at ducts as pings that
  hide one to three stalkers until a Warden sees them. First mission "Dead Reckoning": unseal the archive at a terminal,
  take the core, carry it back to the airlock within 16 rounds.
- Rules of its own: repeater **heat** (a shot adds 1, locked at 4, cools 2 a round, vent for 1 AP) instead of random
  jams; hardsuit **plating** (the first lethal hit breaches, the second kills); **ship systems** at terminals
  (seal/unseal bulkheads, lights, a one-use purge); a timed Warden phase as a client rule.

## 2. Stack and donor map
| Subsystem | Donor | Notes |
|---|---|---|
| Config (Vite 8, React 19, three 0.186, R3F 9, drei 10, zustand 5, TS 7 strict, Vitest 5, Playwright pinned 1.63.0, `PW_PORT`) | three-kingdoms-tactics | `base: './'` as in wasteland-behemoths |
| Deploy | wasteland-behemoths / bossforge route | Gates, then force-push `dist/` to `gh-pages`; first run green in under a minute |
| Engine contract | KB recipe steps 2 and 4 | Written fresh: `step` never throws, plain-JSON state, sfc32 in state, `legalActions` never empty, `view(state, seat)`, `query.*` |
| Camera and picking (rules 25, 27) | assembly-forge `src/client/board/mapController.ts`, `cameraModel.ts`, `viewApi.ts` | Adapted to a square grid |
| Save (rule 22) | Rule 22 text | Envelope with snapshot + actions; key `stellar-derelict-save` |
| Presentation | none (fresh) | "Scanner ghost-map": teal on black, square corners, mono type; must-not-look-like table in spec 50 |

## 3. Milestone log
| Milestone | Date | Agents | Notes |
|---|---|---|---|
| Kickoff + KB read | 2026-11-12 | coordinator | One question batch (4). The owner said "Go" after the plan |
| M0 scaffold + specs | 2026-11-12 | coordinator | Specs 00/10/11/50 and the mission map written by the session model before any agent ran |
| M1–M2 data + engine | 2026-11-13 | 1 Sonnet | 97 tests by rule id, golden round, sim with invariants. A container restart killed the agent after the code was written; the coordinator finished balance and the golden fixture |
| M3 first playable | 2026-11-13 | 1 Sonnet (~23 min, ~0.3M tokens) | Screens, board, HUD, director, scripted Molt bot, autosave + Continue; 14 e2e tests covering rules 8, 22, 24, 25, 27 and the timer |
| M4 Molt AI + Warden policy | 2026-11-13 | 1 Sonnet, two runs (~0.9M tokens) | Utility Molt AI in a worker, tiers, bench gates; then a utility Warden policy and re-tune (B-6..B-8). 130 unit tests, 16 e2e |
| M5 figures (GPU PC) | 2026-11-12 | session model only | 44 Flux klein concepts (image edit with the style reference, about 26 s per 4), one re-roll (the sergeant's maul never appeared until the weapon line led the prompt); Hunyuan 2.1 shape / 2.0 paint / finalize for 11 models in about 25 min of GPU; props decimated at the shape stage; gallery gate on close-ups |
| M6 audio (GPU PC) | 2026-11-12 | session model only | 79 Audio Studio jobs (Stable Audio Open 5 s each, ACE-Step 10 s a track, Qwen voice design 8 s a line), about 20 min of GPU; three takes for two effects, one layered transient; levelled by kind; enabled, not verified by ear |

## 4. Lessons for the series
- *(added 2026-11-13, stellar-derelict)* **The gh-pages push route still needs one Pages setting.** The workflow
  force-pushed `dist/` to `gh-pages` four times with green runs, and the site was a 404: the repo's Pages source was
  the "GitHub Actions" build type (set when the repo was created), which only serves artifacts from
  `actions/deploy-pages`. After making a repo public, check `gh api repos/<o>/<r>/pages` shows `build_type: legacy`
  and `source.branch: gh-pages`; one `PUT` fixes it and the first build follows within a minute.
- *(added 2026-11-12, stellar-derelict M5)* **Check the facing convention of the gallery against the loader before
  trusting a "face the arrow" gate.** The cloud-written gallery said "+Z", the loader turned every model to -Z (the
  board's facing N), so a correct figure showed its back in "Front view". The wide grid is also too small to see a
  face at all: judge facing one model at a time (`?gallery=<slug>`), and write the arrow from the board's facing table.
- *(added 2026-11-12, stellar-derelict M5)* **A textured Hunyuan mesh cannot be simplified afterwards.** Paint
  exports a triangle soup (30k vertices for 10k faces, every edge a UV seam), so meshopt's simplifier returns it
  unchanged. Prop budgets are met with `stage_shape.py --faces N` before painting; the optimiser only warns.
- *(added 2026-11-12, stellar-derelict M5)* **FLUX.2 klein image-edit copies the reference's props.** Handcuffs, a
  hose and a skull buckle from the style photo kept appearing; a long shared prompt body pushed the per-figure weapon
  line out of the picture (no maul in 4 of 4). Put the weapon line first in the per-figure text and name both hands.
- *(added 2026-11-12, stellar-derelict M6)* **Generated audio needs levelling before anyone listens.** Stable Audio
  Open takes ranged from -11 to -56 LUFS for the same prompt family (two of 54 files were effectively silent), and
  ACE-Step tracks from -13 to -28 LUFS with peaks over 0 dBFS. Level by kind in the measure pass (effects -18 LUFS,
  beds -24, music and voice -16), level gunshot-class sounds by peak so the crest gate still means something, flag
  files under -42 LUFS as failed takes, and re-roll with a seed offset rather than lifting them 30 dB.
- *(added 2026-11-12, stellar-derelict M6)* **Two ffmpeg traps in a measuring tool.** `-ac 1` / `-ac 2` rematrix with
  -3 dB coefficients, so a mono-downmixed stereo file reads 2 dB hot and an upmixed mono file 3 dB quiet: decode at the
  file's own channel count and mix in code. `alimiter` auto-levels to its ceiling by default (`level=false` to use
  it as a ceiling). And a dev server that just streamed a file holds it on Windows: retry the in-place rename.
- *(added 2026-11-12, stellar-derelict M5)* **Long creatures need their own footprint cap.** A 0.95-square cap sized
  the stalkers at half a Warden; 1.25 squares (tail overhang) brought them back to about 0.7 of one.
- *(added 2026-11-13, stellar-derelict)* **A container restart kills background agents but keeps their files.** The
  engine agent's code survived on disk, uncommitted; its hand-back report and its balance notes did not. Tell every
  agent to commit locally at checkpoints and to overwrite a progress report file after each one, and have the
  coordinator checkpoint-commit in-flight work to the feature branch (never `main`) when a stop hook asks.
- *(added 2026-11-13, stellar-derelict)* **In an asymmetric squad game, find out what kills the squad before tuning
  the clock.** Scripted Wardens won 23%. Two more rounds: no change. A lower alarm arrival rate: no change. A softer
  contact mix: +10 points but duller contacts. Removing the swarm's +1 melee bonus: 23% to 56% with the soft mix, 36.9%
  with the original mix (adopted). The sim's reason split (squad lost 69%, out of time 8%) pointed at melee from the
  first row.
- *(added 2026-11-13, stellar-derelict)* **When an agent's report is lost, the session model's read of the rules file
  against the spec is cheap** (about 800 lines) and doubles as the independent review the Legion Forge lesson asks for.
- *(added 2026-11-13, stellar-derelict)* **A cloud session may be refused push access to the KB repo** even when the
  repo is public and readable. Keep the entry as a draft file in the game repo and tell the owner.
- *(added 2026-11-13, stellar-derelict)* **Wall tops drawn with the same grid as the deck read as floor.** On a
  corridor board the walls must be the quietest surface; check the first board screenshot for "where can I walk".
- *(added 2026-11-13, stellar-derelict)* **Bench each scripted side against a random opponent before trusting any
  balance row.** The first scripted Wardens "won 36.9%" against the scripted Molt, and five balance rows were tuned on
  that. The M4 bench then showed a *random* Molt beating them 85%, all on the clock: in one-wide corridors the column
  faced itself and nothing cleared blockers. A utility Warden policy (formation, clearing blockers, flushing contacts
  round corners, a clock budget) beat random 100% with no time-outs, and the tier ladder came out at 73 / 43 / 24%
  Warden wins (recruit / regular / veteran, 400 games each) with no rule change. The earlier rows are kept in the spec
  but marked as measured with the weak policy.
- *(added 2026-11-13, stellar-derelict)* **A bench policy that actually uses every action finds client bugs.** The
  utility Wardens scorched often enough to show that the presented state never spent a scorcher charge.


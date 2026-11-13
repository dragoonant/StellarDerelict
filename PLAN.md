# PLAN — Stellar Derelict

An original corridor-tactics browser game in the family of the classic armoured-squad-versus-alien-swarm board games.
Not a port: the setting, names, numbers, missions and look are ours. Credit: **evilgouki**.

## Decisions (owner's words where quoted; do not re-ask)

| Id | Date | Decision |
|---|---|---|
| D1 | 2026-11-12 | **Original game, same family.** Owner: "I love the setting - aliens vs heavily armored marines, let's keep that." The premise stays; no publisher names, designs, missions, art or rules text. "The spec is the product" (`docs/spec/10-rules.md`, rule ids). |
| D2 | 2026-11-12 | **Browser game** ("Probably a browser game as usual") on the sibling stack: Vite 8, React 19, three 0.186, R3F 9, drei 10, zustand 5, TS 7 strict, Vitest 5, Playwright 1.63.0 (pinned to the cloud container's browser). |
| D3 | 2026-11-12 | **3D board** (owner picked "3D board"). Procedural stand-in figures until a GPU PC session makes GLBs. |
| D4 | 2026-11-12 | **Wardens vs AI Molt first; playable Molt later** (owner picked "Marines first, aliens later"). The engine is built two-sided from the start (`view(state, seat)`, Molt decisions as actions). |
| D5 | 2026-11-12 | **Presentation concept: scanner ghost-map** (owner picked it). The board is what the squad's sensors have mapped; contacts are sonar pings; the HUD is a squad biometric strip with a boarding clock; cold teal on black, amber alarms. Spec `docs/spec/50-presentation.md`. |
| D6 | 2026-11-12 | **Push to `main` and Pages after every stage** (owner picked "Main + Pages each stage"). Route: gates, then force-push `dist/` to `gh-pages` (`.github/workflows/deploy.yml`). The repo is private, so Pages serves only once it is public or the plan allows private Pages. |
| D7 | 2026-11-12 | Names (ours): the **Wardens** of Lantern Squad in Bastion hardsuits; the **Molt** (stalkers, shown as pings until seen); first wreck the *Halcyon Drift*; first mission **Dead Reckoning**. |
| D8 | 2026-11-12 | Signature rules of our own: repeater **heat** instead of random jams, hardsuit **plating** (first lethal hit breaches), **ship systems** at terminals (bulkheads, lights, purge), and a timed Warden phase (setting, default on). |

## Defaults taken (say so if any is wrong)

- One mission first; more missions and a boarding-run layer are M7+.
- Sonnet implementers, one or two per milestone, exact file lists; the session model writes specs and verifies.
- Save key `stellar-derelict-save`; one slot.
- KB linked as a submodule at `docs/knowledge-base`; the game's KB entry is updated each milestone.

## Milestones

| Stage | What lands | State |
|---|---|---|
| M0 | Scaffold, specs 00/10/11/50, deploy workflow | done 2026-11-12 |
| M1–M2 | Data, pure engine, tests by rule id, sim with invariants, balance table B-0..B-5 | done 2026-11-13 |
| M3 | First playable Dead Reckoning: board, HUD, random Molt bot, director, autosave + Continue, phone rules (KB 22, 24–27) with e2e gates | done 2026-11-13 |
| M4 | Utility Molt AI in a worker, three tiers, utility Warden policy, bench gates; balance B-6..B-8 | done 2026-11-13 |
| M5–M6 | Figures and audio (GPU PC session) | prepared 2026-11-13 (specs 30/60, manifest, loaders, generators, `HANDOFF-GPU.md`); generation not run |
| M7 | Polish, more missions, playable Molt, run layer | |

## Open questions for the owner

1. The repo is private: make it public (or confirm private Pages) for the playable link to serve.

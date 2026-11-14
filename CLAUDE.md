# Stellar Derelict — agent orientation

An original 3D corridor-tactics browser game: five armoured Wardens against the Molt swarm aboard a derelict ship.
Credit the owner as **evilgouki**; never write a real name, email or home path anywhere in this repo.

- **Read first:** `PLAN.md` (decisions D1–D8, do not re-ask), `STATUS.md` (current state), then only the spec a task needs:
  `docs/spec/00-architecture.md` (frozen contracts), `10-rules.md` (rules with ids and constants; §15 the boarding run),
  `11-mission-dead-reckoning.md`, `12-mission-cold-berth.md`, `13-mission-last-light.md`, `40-ai.md`, `50-presentation.md`.
- **Knowledge base:** `docs/knowledge-base/` (submodule; `git submodule update --init`). `rules.md` holds the owner's
  standing rules 1–27; `gotchas.md` the cross-project traps. Apply them without re-asking.
- **This is an original game.** No names, designs, missions, art or rules text from any published game.
- **The spec is the product.** Change a rule in `docs/spec/10-rules.md` and `src/data/rules.json` together; tests are
  named by rule id; a balance change needs a sim row in spec 10 §13; ambiguities are logged as `RULING:` lines (§14).
- **Layering** (spec 00): `src/data` ← `src/engine` (pure) ← `src/ai` ← `src/client`. The UI does no rules maths:
  every shown number comes from `query.*`.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright (builds, previews on `PW_PORT`, default 5347; SwiftShader, 1 worker) |
| `npm run validate:data` | Mission and rules data checks |
| `npm run sim -- --games 1000` | Scripted self-play with invariants; prints the balance table (`--mission`, `--roster a,b`, `--override '<json>'`, `--override-file`) |
| `npm run bench:ai` | AI gate (M4) |

Gates before every push: typecheck, test, validate:data, sim (0 violations), e2e, build.

## Cloud-session notes

- Playwright is pinned to 1.63.0 to match the container's Chromium in `/opt/pw-browsers`; never run `playwright install` here.
- No GPU or local studios in the cloud: figures stay procedural and audio is silent until a GPU PC session.
- Deploy: push to `main`; the workflow runs the gates and force-pushes `dist/` to `gh-pages`.
- Commit and push after each stage; the container is reclaimed when idle.

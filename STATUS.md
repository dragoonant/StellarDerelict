# STATUS (rewritten at each stage; trust `git log` over this file)

**2026-11-13 — M0–M4 done; M5–M6 prepared, waiting on the GPU PC.** Dead Reckoning is playable against the Molt AI
(Recruit / Regular / Veteran). The game loads generated models and audio when they exist; none exist yet, so figures
are procedural and the game is silent. `HANDOFF-GPU.md` is the runbook for a session on the GPU PC.

- Gates: typecheck, 185 unit tests, data validation, prompt lint, sim (0 violations), AI bench, 19 e2e tests, build.
- Bench, 400 games each, Warden win %: random 100, recruit 73.0, regular 42.8, veteran 24.0 (bot against bot; not
  yet played by a person).
- Never run against the real studios: the concept, Hunyuan-input, optimize and audio generator scripts (dry-run and a
  fake studio only). The Flux image-edit field names are a guess.
- Not done: generated figures and audio (M5–M6), a fuller debrief, more missions, the playable Molt side, a run layer.
- Pages: the workflow publishes to `gh-pages`; the repo is private, so the link serves only once it is public.
- KB: the entry draft is `docs/kb-entry-stellar-derelict.md` (the cloud session had no push access to the KB repo).

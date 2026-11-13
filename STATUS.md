# STATUS (rewritten at each stage; trust `git log` over this file)

**2026-11-13 — M1–M2 done.** Data loaders, the pure engine (`src/engine`), a random bot, scripted sim policies,
97 unit tests named by rule id, a golden round, save envelope tests, data validation and the sim.

- Sim, 1,000 games on Dead Reckoning: Wardens win 36.9% (target 35–55%), 0 invariant violations, 0 stalls.
  Balance rows B-0..B-5 are in `docs/spec/10-rules.md` §13; the adopted change is `melee.stalkerBonus` 1 → 0.
- The engine build was cut off by a container restart after the code was written and its hand-back report was lost.
  The coordinator then read `src/engine/rules.ts` against spec 10: no rule errors, six rulings logged in §14.
- Next: M3 first playable (board, HUD, random Molt bot, director, autosave + Continue, phone rules).
- Not done: no board, no real AI, no audio, no generated figures. The page still shows only the title.
- Pages: the workflow publishes to `gh-pages`; the repo is private, so the link serves only once it is public.

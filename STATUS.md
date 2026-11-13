# STATUS (rewritten at each stage; trust `git log` over this file)

**2026-11-13 — M4 done: the Molt AI.** `src/ai/molt/` (utility AI, spec 40), tiers Recruit / Regular / Veteran
(`src/ai/tiers.ts`), a Web Worker with a main-thread fallback (`src/ai/worker.ts`, `workerClient.ts`), a Difficulty choice on
the Briefing (saved in `setup.options.difficulty`; `?bot=recruit|regular|veteran|random` overrides), and `npm run bench:ai`.

- Gates: typecheck, unit tests, data validation, sim (0 violations), bench (see below), e2e, build.
- Bench against the scripted Wardens (spec 10 §13b): the Veteran swarm wins about every game; Recruit is about 13 points
  below Regular. The gate "recruit beats random by 15 points" cannot hold with "recruit 10 below regular" because the random
  Molt out-wins the regular one by running the scripted Wardens out of clock; the bench reports it as a FAIL with a note.
- Balance is not re-tuned: the scripted Wardens are the proxy and they lose to the Veteran. Needs a human playtest.

Earlier:

**2026-11-13 — M3 done: Dead Reckoning is playable.** Title, briefing, mission and debrief; 3D board with tile-only
picking and the KB rule 27 camera; HUD (boarding clock and timer, CP, objective, squad strip, action bar, inspector,
comms log, terminal prompt); director at Normal / Fast / Instant; a scripted Molt bot (`src/ai/scripted.ts`,
`?bot=random` for the random one); autosave and Continue.

- Gates: typecheck, 102 unit tests, data validation, sim (0 violations), 14 e2e tests, build.
- Balance: scripted Wardens win 36.9% of 1,000 games (spec 10 §13). Not yet played by a person.
- Rough edges: the debrief is plain; heat bars snap at phase start (cooling has no event); hover and long-press odds
  have no e2e test; no scanline flicker on the wordmark.
- Next: M4 (utility Molt AI in a worker, bench gate).
- Not done: no real AI, no audio, no generated figures (procedural stand-ins), one mission only.
- Pages: the workflow publishes to `gh-pages`; the repo is private, so the link serves only once it is public.

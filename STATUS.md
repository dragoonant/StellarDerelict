# STATUS (rewritten at each stage; trust `git log` over this file)

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

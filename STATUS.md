# STATUS (rewritten at each stage; trust `git log` over this file)

**2026-11-12 — M5 figures done on the GPU PC; M6 audio in progress.** Dead Reckoning is playable against the Molt AI
(Recruit / Regular / Veteran) with generated figures: all 11 manifest models (5 Wardens, 3 stalkers, 3 props) are
enabled and load from `public/assets/models/`. Audio is still silent until M6 lands.

- Gates: typecheck, 185 unit tests, data validation, prompt lint, sim (1000 games, 0 violations, Wardens 42.5%),
  19 e2e tests, build.
- Figures: Flux Studio (FLUX.2 klein, image edit with the style reference) concepts, one pick per slug in
  `art/concepts/picks.json`; Hunyuan 2.1 shape (10k faces for figures, props decimated to 4k/6k/2k at the shape stage),
  2.0 paint, finalize; `npm run models:optimize` (meshopt + WebP, about 430 KB per figure). Gallery gate passed:
  helmet line at the visor, every model faces -Z (`yaw` 0 except stalker-b -90 and stalker-c 180).
- Found on the PC: the gallery's "+Z arrow" contradicted the loader (game forward is -Z, facing N); the gallery now
  looks from -Z and has `?gallery=<slug>` close-ups. Stalkers get a 1.25-square footprint so their long bodies are not
  shrunk to half height. `?models=none&audio=none` keeps the e2e "nothing enabled" test honest.
- Not done: audio (M6: effects, music, voice; generated but "not verified by ear" until the owner listens on
  `sounds.html`), a fuller debrief, more missions, the playable Molt side, a run layer.
- Pages: the workflow publishes to `gh-pages`; the repo is private, so the link serves only once it is public.
- KB: the entry draft is `docs/kb-entry-stellar-derelict.md` (the cloud session had no push access to the KB repo).

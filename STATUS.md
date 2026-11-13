# STATUS (rewritten at each stage; trust `git log` over this file)

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
  Molt side, a run layer. Open: Venn's "command points spent" line keys to `phaseStarted` (no CP-spent event);
  stalkers' base sizes in `units.json` were guesses that worked.
- Pages: the workflow publishes to `gh-pages`; the repo is private, so the link serves only once it is public.
- KB: the entry draft is `docs/kb-entry-stellar-derelict.md` (the cloud session had no push access to the KB repo;
  this PC session has not pushed it either: copy it across with the M5/M6 lessons).

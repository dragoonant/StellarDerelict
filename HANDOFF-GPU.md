# Handoff: figures and audio on the GPU PC (M5–M6)

For a Claude session running **on the owner's GPU PC** in a checkout of this repo. The cloud session that built the
game could not reach that PC, so nothing below has been run against the real studios yet.

## Start prompt (paste into the PC session)

> Read `CLAUDE.md`, `HANDOFF-GPU.md`, `docs/spec/30-figures.md`, `docs/spec/60-audio.md`, `tools/figures/README.md`
> and the knowledge base pages `docs/knowledge-base/local-ai-studios.md` and `rules.md` rules 7, 9, 10, 13, 17, 23.
> Then run M5 (figures) and M6 (audio) for Stellar Derelict as the handoff describes, streaming each item to the next
> stage as it finishes, and push to `main` after each stage with screenshots.

## State on arrival

- `src/data/assets.json` lists 8 figures, 3 props, the effects, music tracks and voice lines, each with its prompt.
  Everything is disabled or absent, so the game shows procedural figures and is silent.
- The game already loads enabled GLBs (meshopt decoder set, preloaded, start button waits, procedural figure only on a
  failed load) and plays any audio file that exists. `?gallery` shows every model with a head-height ruler;
  `sounds.html` auditions every sound.
- Written but never run against the real services: `tools/figures/gen-concepts.mjs` (Flux Studio), the Hunyuan
  inputs script, `tools/models/optimize.mjs`, and `tools/audio/gen-audio.mjs` against the real Audio Studio (it was
  run only against a throwaway fake). **The Flux image-edit request field names are a guess:** check them against
  `flux-studio/server.js` before the first batch (`--dry-run` prints the request body).

## GPU PC: install once
`npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp`
(package.json was NOT edited: only meshoptimizer 1.1.1 is in the offline cache, none of the others.)

## GPU session sequence
1. `git pull`, `npm ci`, install line above, announce GPU work. `npm run figures:lint`.
2. `npm run figures:concepts -- --dry-run`, then `npm run figures:concepts`; review per the spec 30 gate; write `art/concepts/picks.json`.
3. `npm run figures:inputs`; Hunyuan stages per `tools/figures/README.md`; finalize into `public/assets/models`.
4. `npm run models:optimize`; open `/?gallery`; fix `yaw`; set `enabled: true` per slug; commit GLBs.
5. `node tools/audio/gen-audio.mjs --dry-run`, then run it (add `--kind sfx|music|voice`, `--only`); `npm run audio:measure`
   (gunshots under crest 8 are flagged: re-roll or layer); listen on `sounds.html`; `node tools/audio/gen-audio.mjs --enable`.
6. Gates, screenshots, push. Stop the studios.

## Not done / decisions to confirm
- Venn's "command points spent" line is keyed to `phaseStarted` (Warden, cp > 0): the engine emits no CP-spent event.
- Music "near" = Chebyshev 8 squares; interface sounds and the timer tick come from store changes, not engine events.
- Stalkers' footprint and base sizes in `units.json` (25/32/0 mm) are guesses; Hunyuan stage argument spellings are as the KB gives them.


## Rules that apply (knowledge base)

- Announce GPU work; one GPU job at a time; never kill node by image name; stop the studios when done (rules 10, 17).
- Figure style and the per-item gate: rules 7 and 13, `docs/spec/30-figures.md`. Run `npm run figures:lint` before
  every batch (rule 23). Concept approval is delegated to Claude; send contact sheets as FYI.
- Audio is "not verified by ear" until the owner listens on `sounds.html` (rule 9).
- Generated GLBs and audio under `public/assets/` are committed; concept candidates under `art/concepts/` are kept
  out of the build.
- Update `STATUS.md`, `PLAN.md` and the KB entry draft (`docs/kb-entry-stellar-derelict.md`) at the end of each stage.

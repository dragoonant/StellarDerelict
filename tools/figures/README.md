# Figures and props: the GPU-PC runbook (M5)

Runs on the owner's Windows GPU PC only (studios: `docs/knowledge-base/local-ai-studios.md`; look: `docs/spec/30-figures.md`).
The manifest `src/data/assets.json` is the single source: 8 figures and 3 props, every one `enabled: false` until its GLB passes
the gallery check. Announce GPU work first, run one GPU job at a time, never `taskkill /F /IM node.exe`, stop the studio
services at the end. Paths use `%USERPROFILE%`; use your own.

## 0. Check

```powershell
npm run figures:lint                 # fails on any banned prompt word; run before every batch
curl http://localhost:7880/api/jobs  # Flux Studio is up
```

## 1. Concepts (Flux Studio, port 7880)

```powershell
npm run figures:concepts -- --dry-run                    # prints the jobs; nothing is sent
npm run figures:concepts                                 # every slug without a pick or candidates
npm run figures:concepts -- --only warden-sergeant,stalker-a --force
```

Four candidates per slug land in `art/concepts/<slug>/1..4.png` plus a labelled contact sheet per faction
(`art/concepts/contact-wardens|molt|props.png`, or `.html` when `sharp` is not installed). Figures are an image-edit job with
`art/figure-style-reference.jpg` attached; props are text-to-image. The model stays loaded for the batch and is freed at the end.
The edit-mode request field names are not in the KB: confirm them against `flux-studio/server.js` (the dry run prints the body)
and adjust `buildConceptJob` in `tools/figures/lib.mjs` if they differ.

Per-item gate (spec 30, KB rules 7 and 13): put each candidate beside the reference; helmet 33-38% of height, about 2.8
head-heights, shoulders about 1.8 head widths, covered face, matte paint, no extra or missing limbs or weapons, no text, no
cropped figure or base. Stalkers: skull above 40% of body length means redo. Review the first image of each faction before its
3D run starts. Record the keepers in `art/concepts/picks.json`:

```json
{ "warden-sergeant": "art/concepts/warden-sergeant/2.png", "stalker-a": "art/concepts/stalker-a/1.png" }
```

## 2. Hunyuan inputs

```powershell
npm run figures:inputs      # writes tools/out/hunyuan/units.json and picks.json (no BOM)
```

`units.json` is `{ slug: { prompt, height (inches), base (mm) } }` taken from the manifest; `picks.json` maps each slug to an
absolute image path. Copy both to wherever the stage scripts read them. Base sizes (25 mm Wardens, 32 mm stalkers, 0 props)
are a guess: adjust `BASE_MM` in `tools/figures/lib.mjs` if the finalize stage wants other values.

## 3. Hunyuan stages (outside the repo; KB `local-ai-studios.md`)

Directories: `%USERPROFILE%\Hunyuan3D-2` (Python 3.11 venv: cutout, 2.0 paint) and `%USERPROFILE%\Hunyuan3D-2.1`
(Python 3.10 venv with bpy: 2.1 shape, finalize). Set `UV_SYSTEM_CERTS=1`. Do not upgrade `transformers` or `diffusers` in the
2.0 venv. Needs about 40 GB of commit charge for the shape stage: free memory first, and clear stale `outputs/<slug>/shape.glb`
files before a batch (a failed shape stage is otherwise masked by an old file being re-painted; require `shape done` per slug).

Run each stage in the right venv, for the slugs you approved (comma lists shown for the full set):

```powershell
$W = "warden-sergeant,warden-rifle-a,warden-rifle-b,warden-scorcher,warden-tech"
$M = "stalker-a,stalker-b,stalker-c"
$P = "terminal,console,core"

python stage_cutout.py                                        # picks.json images to cutouts
python stage_shape.py --only $W                               # 2.1 venv, about 90 s; auto-cuts the display base
python stage_shape.py --only $M
python stage_shape.py --only terminal --nocut terminal --faces 4000   # props: no display base, and decimate here to the spec 30 budget
python stage_shape.py --only console --nocut console --faces 6000     # (a textured Hunyuan mesh is a triangle soup: a simplifier
python stage_shape.py --only core --nocut core --faces 2000           #  cannot reduce it afterwards, so --faces is the only lever)
python stage_paint.py --only $W                               # 2.0 venv, about 20 s
python stage_paint.py --only $M
python stage_paint.py --only $P
python stage_finalize.py <repo>\public\assets\models $W      # scales to inches, black base, matte, preview PNGs
python stage_finalize.py <repo>\public\assets\models $M
python stage_finalize.py <repo>\public\assets\models $P
```

Stalkers are a non-Marine faction, so their concept stage (if you use the SDXL fallback instead of Flux) takes
`--style 0.2 --avoid "blue armour"`: the Hunyuan style reference otherwise turns everything blue. Hunyuan paint flattens to pale
tan: re-grade if needed. Floor-length capes need `--nocut` (none here). Poses are fused (no A-poses, no skeletal animation).
Exact argument spellings come from each script's `--help`: this page lists only what the KB documents. Whole run: about 12
minutes per five units. Hunyuan3D is under Tencent's non-commercial community licence.

## 4. Optimise

```powershell
npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp   # once
npm run models:optimize -- --dry-run
npm run models:optimize            # dedup, prune, weld, WebP textures at most 1024, meshopt; originals in tools/out/models/raw
npm run models:optimize -- --force # redo already compressed files from their raw copies (after an optimiser change)
```

The client loader already sets the meshopt decoder. Budgets (`maxTris` on the manifest entry, met with `--faces` at the shape
stage; the optimiser only warns): terminal under 4k triangles, console under 6k, core under 2k; figures about 10k. The optimiser
also drops the degenerate 0 mm base disc the finalize stage leaves on props.

## 5. Gallery check, then enable

`npm run dev`, open `/?gallery`. Every manifest model is on a turntable with its slug, enabled state, triangle count and height.
The cyan arrow is -Z, the game's forward (a unit facing N; `fitModel` turns a +Z Hunyuan model to -Z): a figure must face it in
"Front view", which looks from the -Z side so a correct figure faces the camera. If it does not, set `yaw` (degrees) on that
model in `src/data/assets.json` (side-view concepts need 90 or -90; one facing +Z needs 180). `/?gallery=stalker-b` shows one
model close up (up to two slugs, comma-separated), which is the only way to judge facing: the full grid is too small. The amber ruler line is 35% from the top:
it should sit at the chin of the helmet. A missing file shows "not generated".

When a model passes, set `"enabled": true` for that slug in `src/data/assets.json` and commit the GLB with it
(`npm run validate:data` fails if an enabled model has no file). Preview without editing the manifest: `/?models=warden-tech,core`.

## 6. Gates

`npm run typecheck && npm test && npm run validate:data && npm run figures:lint && npm run e2e && npm run build`, then
screenshots and push. Stop Flux Studio and the Hunyuan viewer when done.

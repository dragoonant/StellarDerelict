# 30 — Figures and props (M5)

Runs on the owner's GPU PC only (local studios; KB `local-ai-studios.md`). The cloud build ships procedural stand-ins
and loads a GLB wherever `src/data/assets.json` marks one `enabled`.

## Style (KB rules 7, 13, 23; Mallet 42k `docs/FIGURE-STYLE.md`, approved 2026-10-31)

- Reference image: `art/figure-style-reference.jpg` (the owner's approved master). Attach it to the first request of
  each chat or edit job and ask for "the same proportions and finish as the reference photo".
- Describe figures in measurements and materials only. `tools/figures/lint-prompts.mjs` fails on any word from KB
  rule 23 and on any publisher or model-kit brand word; run it before every batch.
- Original designs: no emblems, logos or lettering on armour; nothing that copies a published sculpt.
- Per-item gate, inside the stream: side-by-side with the reference; helmet about 35% of height (33–38% passes);
  about 2.8 head-heights; shoulders about 1.8 head widths; covered face; matte paint. Creatures: see the Molt note.
  Reject extra or missing limbs or weapons, text, a cropped figure or base. The first image of each faction is
  reviewed before its 3D run starts.

## The Wardens (Lantern Squad, Bastion hardsuits)

Shared look: heavy sealed hardsuit in matte bone-grey ceramic plate over a dark gunmetal undersuit, teal status
strips at the collar and forearms, a smooth helmet with one wide amber visor band and no face, a squat life-support
pack, magnetic boots. Scuffed, scorched and repaired; a boarding crew, not a parade unit.

Shared prompt body (append the per-figure line):

> a highly detailed painted miniature figure of an armoured boarding trooper in a heavy sealed hardsuit, about 2.8
> head-heights tall: a large smooth helmet about a third of its height with one wide amber visor band, very broad
> armoured shoulders almost twice the helmet's width with heavy rounded pauldrons, a deep armoured chest (chin to belt
> about three quarters of a head), short thick legs about one head long with big magnetic boots in a wide planted
> stance, gloved fists about a third of the helmet's height, matte bone-grey ceramic plates over a dark gunmetal
> undersuit, thin teal status strips at the collar and forearms, a squat life-support pack, crisp panel lines,
> rivets, hoses and pouches, scuffs and scorch marks, matte realistic paint with edge highlights, standing on a plain
> black round base, white background, full figure in view, wordless and unmarked armour

| Slug | Role | Per-figure line | Height (in) |
|---|---|---|---|
| `warden-sergeant` | Sergeant | a raised ridge along the helmet crown and one pauldron painted teal; a heavy shock maul with a ribbed head held low in the right fist, a short twin-barrel repeater in the left | 1.6 |
| `warden-rifle-a` | Warden | an oversized twin-barrel repeater with a boxy heat shroud held across the chest in both fists, muzzle to the figure's left | 1.6 |
| `warden-rifle-b` | Warden | the same twin-barrel repeater braced at the hip and pointing forward, left foot leading | 1.6 |
| `warden-scorcher` | Scorcher | a wide-nozzle scorcher with a blackened flared muzzle held in both fists, a fat fuel cylinder on the back pack with a braided hose to the weapon | 1.6 |
| `warden-tech` | Tech | a twin-barrel repeater in the right fist, the left forearm carrying a folding interface arm with a data spike, a short antenna mast and a cable reel on the pack | 1.6 |

Poses are fused (KB rule 15: no A-poses, no separate weapons, no skeletal animation on generated meshes).

## The Molt

A stalker is a low, long-limbed ambush predator that is always part-way through shedding: a wedge-shaped eyeless
skull with a split lower jaw, two long scything forelimbs carried high, a narrow ribbed body, two digitigrade hind
legs and a short whip tail; dark red-black glossy new chitin showing through a flaking, translucent pale old shell.
It must not read as any published alien: two forelimbs (not four), no domed cranium, no purple or blue.

Prompt body:

> a highly detailed painted miniature of a low, long-limbed alien predator in mid-moult, crouched and about as long
> as it is tall: a wedge-shaped eyeless skull about a third of its body length with a split lower jaw and needle
> teeth, two long scything forelimbs raised, a narrow ribbed body, two bent digitigrade hind legs, a short whip tail,
> dark red-black new chitin showing through flaking translucent pale old shell with torn edges, wet highlights only
> on the new chitin, matte old shell, crisp segment lines, standing on a plain black round base, white background,
> full creature in view, wordless

| Slug | Per-figure line | Height (in) |
|---|---|---|
| `stalker-a` | lunging forward, both forelimbs reaching, jaw open | 1.3 |
| `stalker-b` | crouched low and coiled, one forelimb planted, head turned to its right | 1.3 |
| `stalker-c` | reared up on its hind legs, forelimbs spread wide, most of the old shell already shed | 1.5 |

Creature gate: the skull drifts large (KB: a creature test came back at about 50%); redo above 40% of body length.

## Props (optional; flat things stay procedural)

| Slug | Prompt gist | Notes |
|---|---|---|
| `terminal` | a waist-high wall-mounted ship control pedestal with a cracked teal screen, exposed conduit and a hand bar, dark gunmetal, wordless | under 4k tris |
| `console` | a chest-high archive console with a cylindrical glass core socket glowing teal in its centre, heavy clamps, dark gunmetal, wordless | under 6k tris |
| `core` | a short armoured data cylinder with a carry handle and a teal light band | under 2k tris |

Doors, ducts, deck and walls stay procedural (image-to-3D cannot do flat terrain).

## Pipeline (streamed, KB rule 13: never idle a stage)

1. `node tools/figures/lint-prompts.mjs` — prompts come from `src/data/assets.json` (`models[].prompt`).
2. Concepts: `node tools/figures/gen-concepts.mjs [--only slug,…]` asks Flux Studio (port 7880, image edit mode with
   the reference attached; FLUX.2 klein) for 4 candidates per slug into `art/concepts/<slug>/`, and writes a labelled
   contact sheet. Gemini in the owner's Windows Chrome is the alternative route (one chat per faction, reference on
   the first message). Pick one per slug into `art/concepts/picks.json`.
3. 3D: Hunyuan stages per KB `local-ai-studios.md` (cutout → 2.1 shape → 2.0 paint → finalize to
   `public/assets/models/`), each pick queued the moment it is approved. Stalkers: `--style 0.2 --avoid "blue armour"`.
4. `npm run models:optimize` (dedup, prune, weld, WebP ≤ 1024, meshopt) — the loader already sets the meshopt decoder.
5. Check each in `?gallery` close up (facing: figures must face +Z in the gallery; fix with `yaw` in the manifest),
   then set `enabled: true` for that slug in `src/data/assets.json`.
6. Gates, screenshots, push. GLBs under `public/assets/models/` are committed (they are the game's own output).

GPU etiquette (KB rules 10, 17): announce GPU work, one GPU job at a time, never kill node by image name, stop the
studio services when the session is done with them.

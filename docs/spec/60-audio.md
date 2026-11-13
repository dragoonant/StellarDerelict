# 60 — Audio (M6)

Generated on the owner's GPU PC with the local Audio Studio (port 7890; KB `local-ai-studios.md`). Until the files
exist the game is silent and says nothing about it. Everything is original: no sampled or imitated published audio,
and voice lines are our own words. Audio is "not verified by ear" until the owner listens on `sounds.html` (KB rule 9).

The manifest is `src/data/assets.json` (`sounds[]`, `music[]`, `voice[]`): id, file, the generation prompt and
parameters, the engine event that plays it, gain and variants. `tools/audio/gen-audio.mjs` is idempotent (skips files
that exist; `--only`, `--force`), `tools/audio/measure-audio.mjs` reports peak, loudness and crest factor and trims
silence, and `sounds.html` auditions every entry.

## Direction

The sound of a sealed suit inside a dead ship: close, dry and mechanical for the squad (servo whine, suit air, radio
compression), wet and distant for the Molt (skitter on plate, shell cracking, a rising chitter), and the ship itself
as a low groaning bed. Describe the mechanism and state exclusions ("no music, no voices"). Gunshots need a crest
factor of at least 8: measure, and layer a transient if a single prompt cannot get there.

## Effects (Stable Audio Open; 2–3 variants where marked ×3)

| Id | Event | Prompt gist | Seconds |
|---|---|---|---|
| `repeater-shot` ×3 | `fired` | two fast heavy slugs from a twin-barrel autogun in a metal corridor, dry punchy transient, short metallic tail | 1.5 |
| `repeater-hit` ×2 | `fired` hit | a slug punching through brittle shell and wet flesh, close | 1 |
| `repeater-lock` | `locked` | a hot gun breech seizing: a hard clunk and a rising electronic warning chirp | 1.5 |
| `vent` | `vented` | pressurised coolant venting from a weapon, sharp hiss falling away, ticking metal | 2 |
| `watch-set` | `watchSet` | a weapon safety snapping off and a servo brace locking, quiet | 1 |
| `scorch` ×2 | `scorched` | a heavy flame projector burst in a narrow corridor, roar and whoosh, crackling tail | 3 |
| `melee-hit` ×3 | `meleeFought` | claws raking armour plate, a heavy grapple and a crunch | 1.5 |
| `maul` | `meleeFought` by the Sergeant, won | an electrified hammer blow, crackle and a wet crack | 1.5 |
| `breach` | `breached` | armour plate tearing, a sharp air leak and a suit alarm tone | 2 |
| `warden-down` | `destroyed` (Warden) | a heavy armoured body falling on deck plate, a flatline tone cut short | 2.5 |
| `stalker-screech` ×3 | `revealed`, charge | a rising insectile shriek with a clicking undertone | 1.5 |
| `stalker-death` ×3 | `destroyed` (stalker) | a shell bursting and a short gurgling hiss | 1.5 |
| `skitter` ×3 | `moved` (stalker) | many hard claws running on metal plate, fast, close | 1.5 |
| `footstep` ×3 | `moved` (Warden) | one heavy magnetic boot step on deck plate with a servo whine | 0.8 |
| `ping` ×2 | `pingArrived`, ping `moved` | a soft sonar blip with a short watery echo | 1 |
| `duct-rattle` | `pingArrived` | something heavy moving inside sheet-metal ducting, distant | 2.5 |
| `door-open`, `door-close` | `doorChanged` | a heavy pneumatic bulkhead door sliding, hiss and thud | 1.5 |
| `door-seal`, `door-unseal` | `doorChanged` sealed / unsealed | magnetic clamps slamming shut / releasing in sequence | 1.5 |
| `door-tear` ×2 | `tearRolled` | claws wrenching a metal door, shrieking steel (torn: the panel gives way) | 2 |
| `terminal` | `terminalUsed` | old ship console keys and a confirming two-tone beep | 1.5 |
| `lights-on` | `lit` | breakers thrown one after another down a long corridor, hum rising | 3 |
| `purge` | `purged` | a decompression blast: klaxon, a roar of escaping air, then silence | 5 |
| `core-taken` | `coreTaken` | a heavy data cylinder unlocking from clamps, a low power-down | 2.5 |
| `alarm` | `alarm` | a slow ship-wide warning klaxon, three pulses | 4 |
| `core-dropped`, `core-picked` | `coreDropped`, `corePicked` | a metal cylinder hitting deck / being grabbed and locked to a suit | 1.2 |
| `phase-warden`, `phase-molt` | `phaseStarted` | a short clean two-note console chime / a low reversed swell with clicks | 1.5 |
| `timer-warn` | timer under 15 s | a dry metronome tick, urgent | 1 |
| `ui-select`, `ui-arm`, `ui-deny`, `ui-confirm` | interface | small dry instrument clicks and beeps | 0.4 |
| `sting-win`, `sting-loss` | `gameOver` | an airlock cycling and a rising relieved tone / radio static collapsing to a flat tone | 5 |
| `ambience` (loop) | always | the inside of a dead ship: low hull groans, distant ticking, air through broken ducts, no music, no voices | 40 |

## Music (ACE-Step, instrumental; the director crossfades between states)

| State | When | Style line | Seconds |
|---|---|---|---|
| `calm` | no stalker revealed, no ping within 8 squares of a Warden | sparse dark ambient, low analogue drones, slow sonar-like pulses, distant metallic resonance, no drums, 60 bpm | 120 |
| `tense` | pings near, or the timer under 30 s | pulsing bass ostinato, tight ticking percussion, uneasy high strings, 100 bpm | 120 |
| `battle` | a stalker seen or a fight this round | driving industrial percussion, distorted low brass stabs, urgent synth arpeggio, 132 bpm | 120 |
| `alarm` | core taken | battle with a wailing siren motif and faster hats, 140 bpm | 120 |
| `victory`, `defeat` | debrief | a slow warm resolving chord progression / a hollow descending drone | 30 |
| `title` | title and briefing | cold wide ambient pad with a slow three-note motif, radio static textures | 90 |

## Voice (Qwen voice design; radio-compressed in post; one distinct voice per Warden)

Six short lines each for Venn, Brandt, Okafor, Riedel and Sato, in our own words, keyed to events: move
acknowledged, contact seen, weapon locked, plating breached, on watch, and one role line (Venn: command points
spent; Riedel: scorcher fired; Sato: terminal used). Plus four for whoever carries the core ("Core is mine. Moving.").
Lines live in the manifest; at most one voice line plays per two seconds, and never over another.

## Mix and playback

Web Audio; three buses (effects, music, voice) with sliders in Settings, saved under `stellar-derelict-audio`; music
ducks 6 dB under voice. iOS: resume the context from `touchend` / `pointerup` / `click` and keep the unlock listeners
for the session. A missing or failed file is skipped silently in play and listed on `sounds.html`.

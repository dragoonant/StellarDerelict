# 60 — Audio (M6, regenerated through ElevenLabs in M8)

Generated with ElevenLabs from the owner's account (M8, 2026-11-15; the key lived one day and was only ever in the
environment of the generating command). M6's local Audio Studio pipeline (`tools/audio/gen-audio.mjs`, KB
`local-ai-studios.md`) stays as the offline fallback and reads the same manifest. Until the files exist the game is
silent and says nothing about it. Everything is original: no sampled or imitated published audio, and every voice line
is our own words. Audio is "not verified by ear" until the owner listens on `sounds.html` (KB rule 9).

The manifest is `src/data/assets.json`:

- `audio` names the provider and its models (`eleven_text_to_sound_v2` for effects, `music_v1` for music, `eleven_v3`
  for speech, `eleven_ttv_v3` for voice design).
- `voices` is the cast: one designed voice per speaker (the five Wardens and the comms officer), with the ElevenLabs
  voice id, the account name (`Stellar Derelict <name>`), the model and the description it was designed from.
- `sounds[]`, `music[]`, `voice[]`: id, file(s), the generation prompt and parameters, the engine event that plays it,
  gain and variants; voice lines carry `speaker`, `text` and an optional `delivery` audio tag.

`tools/audio/gen-eleven.mjs` (`npm run audio:eleven`) is idempotent (skips files that exist; `--only`, `--kind`,
`--force`, `--budget <credits>`, `--dry-run` prints every request and the credit estimate), designs voices (`--design
<speaker>`: three previews into `tools/out/audio/eleven/design/`) and adopts one (`--adopt <speaker>:<n>` saves it to the
account and records the id), and flips `enabled` once files exist (`--enable`). It logs every reply's `character-cost`
header and resolves IPv4 first (Node's fetch otherwise times out on the API's IPv6 address). `tools/audio/measure-audio.mjs`
then reports peak, loudness and crest factor, trims silence, levels every file to its kind's loudness target (effects
-18 LUFS, the ambience loop -24, music and voice -16, gunshot-class ids by peak to -1 dBFS so the crest survives;
limiter at -1 dB) and flags gunshots under crest 8 and near-silent files; `tools/audio/layer-transient.mjs` mixes a
short noise transient over an attenuated body when no take reaches the crest gate; `sounds.html` auditions every entry
and lists the cast.

## Direction

The sound of a sealed suit inside a dead ship: close, dry and mechanical for the squad (servo whine, suit air, radio
compression), wet and distant for the Molt (skitter on plate, shell cracking, a rising chitter), and the ship itself
as a low groaning bed. Describe the mechanism and state exclusions ("no music, no voices"). Gunshots need a crest
factor of at least 8: measure, and layer a transient if a single prompt cannot get there.

## Effects (sound effects v2; one request per file, so variants are independent takes; `promptInfluence` 0.4 unless set)

| Id | Event | Prompt gist | Seconds |
|---|---|---|---|
| `repeater-shot` ×3 | `fired` | a loud twin-barrel autogun firing two heavy rounds in quick succession inside a steel corridor, a sharp cracking report at full volume, close to the microphone, short metallic ring-off (influence 0.6) | 1.5 |
| `repeater-hit` ×3 | `fired` hit | a slug punching through brittle shell and wet flesh, close | 1 |
| `repeater-lock` | `locked` | a hot gun breech seizing: a hard clunk and a rising electronic warning chirp | 1.5 |
| `vent` | `vented` | pressurised coolant venting from a weapon, sharp hiss falling away, ticking metal | 2 |
| `watch-set` | `watchSet` | a weapon safety snapping off and a servo brace locking, quiet | 1 |
| `scorch` ×3 | `scorched` | a heavy flame projector burst in a narrow corridor, roar and whoosh, crackling tail | 3 |
| `burn-out` | `burnCleared` | the last flames of a chemical fire on deck plate dying down, crackle and hiss fading to ticking metal | 2 |
| `melee-hit` ×3 | `meleeFought` | claws raking armour plate, a heavy grapple and a crunch | 1.5 |
| `maul` | `meleeFought` by the Sergeant, won | an electrified hammer blow, crackle and a wet crack | 1.5 |
| `breach` | `breached` | armour plate tearing, a sharp air leak and a suit alarm tone | 2 |
| `warden-down` | `destroyed` (Warden) | a heavy armoured body falling on deck plate, a flatline tone cut short | 2.5 |
| `stalker-screech` ×3 | `revealed`, charge | a rising insectile shriek with a clicking undertone | 1.5 |
| `stalker-death` ×3 | `destroyed` (stalker) | a shell bursting and a short gurgling hiss | 1.5 |
| `skitter` ×3 | `moved` (stalker) | many hard claws running on metal plate, fast, close | 1.5 |
| `footstep` ×3 | `moved` (Warden) | one heavy magnetic boot step on deck plate with a servo whine | 0.8 |
| `servo-turn` ×2 | `turned` | a small armour servo whirring as a heavy suit turns on the spot, one short motor movement with a soft stop (gain 0.3) | 0.6 |
| `ping` ×3 | `pingArrived`, ping `moved` | a soft sonar blip with a short watery echo | 1 |
| `duct-rattle` | `pingArrived` | something heavy moving inside sheet-metal ducting, distant | 2.5 |
| `door-open`, `door-close` | `doorChanged` | a heavy pneumatic bulkhead door sliding, hiss and thud | 1.5 |
| `door-seal`, `door-unseal` | `doorChanged` sealed / unsealed | magnetic clamps slamming shut / releasing in sequence | 1.5 |
| `door-tear` ×3 | `tearRolled` | claws wrenching a metal door, shrieking steel (torn: the panel gives way) | 2 |
| `terminal` | `terminalUsed` | old ship console keys and a confirming two-tone beep | 1.5 |
| `lights-on` | `lit` | breakers thrown one after another down a long corridor, hum rising | 3 |
| `purge` | `purged` | a decompression blast: klaxon, a roar of escaping air, then silence | 5 |
| `core-taken` | `coreTaken` | a heavy data cylinder unlocking from clamps, a low power-down | 2.5 |
| `alarm` | `alarm` | a slow ship-wide warning klaxon, three pulses | 4 |
| `core-dropped`, `core-picked` | `coreDropped`, `corePicked` | a metal cylinder hitting deck / being grabbed and locked to a suit | 1.2 |
| `phase-warden`, `phase-molt` | `phaseStarted` | a short clean two-note console chime / a low reversed swell with clicks | 1.5 |
| (silent) | `cpSpent` | no effect of its own; the Sergeant's command-point voice line keys to it (once per phase) | |
| (silent) | `pingHeld`, `roundEnded`, `watchEnded` | bookkeeping events | |
| `timer-warn` | timer under 15 s | a dry metronome tick, urgent | 1 |
| `ui-select` (influence 0.6), `ui-arm`, `ui-deny`, `ui-confirm` | interface | small dry instrument clicks and beeps | 0.4 |
| `sting-win`, `sting-loss` | `gameOver` | an airlock cycling and a rising relieved tone / radio static collapsing to a flat tone | 5 |
| `ambience` (loop) | always | the inside of a dead ship, a seamless loop: low hull groans, distant ticking, air through broken ducts | 30 (the model's limit; generated with `loop`) |

Four of the 61 first takes came back near silent (peak under -25 dBFS: two repeater shots, a hit, a ping) and were
re-rolled by deleting the file and running the generator again; the measure pass flags such takes under -42 LUFS. The
repeater shot did it again on the re-roll (two of three), so its prompt now says "loud", "at full volume" and "close to
the microphone" instead of "dry punchy transient": the effects model reads "dry" and "short" as quiet.

## Music (Eleven Music, `force_instrumental`; the director crossfades between states)

| State | When | Style line | Seconds |
|---|---|---|---|
| `calm` | no stalker revealed, no ping within 8 squares of a Warden | sparse dark ambient, low analogue drones, slow sonar-like pulses, distant metallic resonance, no drums, 60 bpm | 120 |
| `tense` | pings near, or the timer under 30 s | pulsing bass ostinato, tight ticking percussion, uneasy high strings, 100 bpm | 120 |
| `battle` | a stalker seen or a fight this round | driving industrial percussion, distorted low brass stabs, urgent synth arpeggio, 132 bpm | 120 |
| `alarm` | core taken | battle with a wailing siren motif and faster hats, 140 bpm | 120 |
| `victory`, `defeat` | debrief | a slow warm resolving chord progression / a hollow descending drone | 30 |
| `title` | title, missions and briefing | cold wide ambient pad with a slow three-note motif, radio static textures | 90 |

The generator appends "Instrumental only, no vocals, no lyrics, written to loop seamlessly." to every style line.

## Voice (Eleven v3 speech; six designed voices; radio band and compression in post)

| Speaker | Design |
|---|---|
| Venn | a man in his fifties with a low, gravelly baritone: a calm, weary squad-leader voice, clipped and unhurried, slightly nasal through a helmet radio |
| Brandt | a woman in her thirties with a dry, level alto: steady, deadpan and economical, quiet, never rushes |
| Okafor | a man in his late twenties with a warm, quick tenor: alert and restrained, a thin edge of nerves under practised calm |
| Riedel | a woman in her forties with a husky mezzo and a rough rasp: blunt, flat and heavy, short sentences |
| Sato | a young woman in her twenties with a light, clear soprano: precise, brisk and focused, slightly breathy |
| comms | a middle-aged ship communications officer, gender-neutral, flat, tired and measured, reading a transmission over a long-range link |

Each voice was designed from the description above with the speaker's own lines as the preview text and the first of
three previews adopted unheard (the owner's listen may swap one: `--design <speaker>`, listen, `--adopt <speaker>:<n>`,
then `--force --only <the speaker's ids>`).

Lines, all in our own words:

- **Six of their own per Warden**, keyed to events: move acknowledged (`moved`, once per Warden per phase), contact seen
  (`revealed`, said by the nearest living Warden), weapon locked, plating breached, on watch, and one role line (Venn:
  command points spent, keyed to `cpSpent` once per phase; Brandt and Okafor: vented; Riedel: scorcher fired; Sato:
  terminal used).
- **AUD-10 Four carrier lines per Warden** (`<id>-core-taken`, `-core-dropped`, `-core-picked`, `-carrier-breached`):
  whoever holds the core speaks of it in their own voice. `coreDropped` names a square, not a Warden, so the line is the
  one of the carrier in the presented view before the event; a breach while carrying uses the carrier line instead of
  the plain one.
- **AUD-11 A briefing per mission** (`briefing-<mission>`), the mission's `brief` text word for word, read by the comms
  officer once when the Briefing screen opens; leaving the screen cuts it (`stopVoice`: the gate opens and the music
  comes back up). The validator checks the text against the mission data.
- `delivery` tags shape the read: `[urgent]` for contact calls, `[pained]` for breaches, `[shouts]` for the dropped core.
  Tags cost a credit a character like the words.

At most one voice line plays per two seconds, and never over another.

## Mix and playback

Web Audio; three buses (effects, music, voice) with sliders in Settings, saved under `stellar-derelict-audio`; music
ducks 6 dB under voice. iOS: resume the context from `touchend` / `pointerup` / `click` and keep the unlock listeners
for the session. A missing or failed file is skipped silently in play and listed on `sounds.html`.

## Costs and limits (Starter plan, measured 2026-11-15)

| Request | Cost | Limits |
|---|---|---|
| Sound effect | 10 credits a second | 0.5–30 s; `loop` for beds |
| Music | 12.5 credits a second (about 750 a minute) | 3–600 s |
| Speech (v3) | 1 credit a character, tags included | |
| Voice design | about the preview text's length (three previews) | 20–1,000 characters of description, 100–1,000 of text |

The M8 set (61 effect files, 7 tracks, 53 lines, 6 designs, plus re-rolls) was about 11,400 credits of the plan's
40,512 a month, read from the subscription counter: music replies carry no `character-cost` header, so the generator's
own total under-counts by the music.

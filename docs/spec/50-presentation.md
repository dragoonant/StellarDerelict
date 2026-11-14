# 50 — Presentation: the scanner ghost-map

**Concept (PLAN D5, one line):** *you are the squad's command channel, and the screen is what Lantern Squad's sensors
have mapped of a dead ship.* Everything on screen is an instrument reading: the board is a sensor ghost of the decks,
contacts are sonar pings, the squad is a strip of biometric traces, the turn is a boarding clock, the log is radio traffic.

## Must not look like (KB rule 21)

| Sibling | Its look | So here, never |
|---|---|---|
| three-kingdoms-tactics | war-council sand table: parchment, brush type, ink seals, warm lamp light | paper textures, serif or brush type, warm browns, seals or stamps |
| assembly-forge (PLAN D5 "hangar deck"; `theme.css` 2026-11-06) | near-black neutral grey panels (`#0d0f12`, `#16191e`), amber accent `#f0a830`, 6–8 px rounded panels and buttons | neutral grey panels, amber as the accent, rounded corners |
| virtually-off (KB entry: "orbital proving ground") | arena fighter with bloom and additive effects | bloom-heavy glow as the main effect language |
| wasteland-behemoths | salvage-yard war map: rust and amber, heavy uppercase wordmark, spiked crests | rust textures, amber as the base colour, distressed type |
| starbound-legions | dark blue-grey panels with a gold accent | navy panels, gold accent, rounded 6 px buttons |

Before the first playable ships: put the title, the briefing and a mid-mission board beside the siblings' screenshots;
if one could be mistaken for another it is not done.

## Tokens (`src/client/theme.css`, CSS variables; no other colour literals in components)

| Token | Value | Role |
|---|---|---|
| `--void` | `#05090b` | page and board background |
| `--deck` | `#0a1418` | panel fill (always with 1 px `--trace` border, square corners) |
| `--trace` | `#12343a` | grid lines, panel borders, unseen deck outlines |
| `--scan` | `#3fe0c8` | the squad, seen deck, primary text accents |
| `--scan-dim` | `#1c6b63` | mapped-but-unseen deck, secondary text |
| `--read` | `#cfeee9` | body text |
| `--alarm` | `#ffb347` | warnings only: clock under 15 s, heat at lock, alarm state, breached plating |
| `--molt` | `#ff4d3d` | Molt units, pings, damage |
| `--lit` | `#e9fff6` | lit sections, hit flashes |

Type: `Chakra Petch` 700 for the wordmark and headings (wide tracking, uppercase); `IBM Plex Mono` for every reading,
label and log line. No rounded corners anywhere; corners are square, with small corner ticks (`┌ ┐ └ ┘` drawn in CSS)
on focus panels. Lines are 1 px. Motion is instrument-like: sweeps, pings, blinks at fixed rates; no bouncy easing.

## Screens

- **Title.** Black field; a slow radar sweep (CSS conic gradient, 8 s) over a faint line drawing of the picked mission's
  map (generated from the mission grid, not an image). Wordmark `STELLAR DERELICT` in spaced caps with a thin scanline
  flicker. Menu as a plain instrument list, left-aligned at the lower left: `CONTINUE` (only when a save exists; it names
  what it reopens, KB rule 22: mission, run progress, round, phase, Wardens alive, where the item is, which side you play,
  difficulty, when), `CONTINUE THE BOARDING RUN` (a run parked between missions: missions done, Wardens left, the next
  cut), `BOARDING RUN` (spec 10 §15), `SINGLE MISSION` (the Missions screen), `HOW TO PLAY`, `SETTINGS`. Footer line:
  "An original game by evilgouki". Starting either kind of game over a save asks once (Replace it / Keep it).
- **Missions** (M7). One card per mission in run order: number, name, a line drawing of its deck, size, rounds and
  arrival rates, and its objective in the mission's own words. A `PLAY AS` choice (Wardens / Molt) with one line on what
  the seat means. `BRIEF` opens the Briefing of the picked mission; `BACK`.
- **Briefing.** The mission's brief text typed out as a transmission; the squad roster as trace cards (in a run, only the
  survivors who board, with a line on missions done and plating patched); the objective line in the mission's words (for
  the Molt seat, inverted: no Warden leaves with the item); timer setting and Difficulty for the Warden seat, a note on the
  squad AI for the Molt seat; `CUT IN` (`LET THEM IN` on the Molt seat) starts the mission; `BACK` (`ABANDON THE RUN` in a run).
- **Mission.** Full-screen 3D board with the HUD around it (below).
- **Debrief** (M7, fuller). Headline in the mission's words: `<ITEM> RECOVERED` or `SIGNAL LOST` for the Wardens, `THE
  HULL KEEPS ITS OWN` or `PREY ESCAPED` for the Molt; why it ended; the run line when in a run (missions done and who
  boards the next cut, or how the run ended); a stats table (mission, rounds, Wardens alive, Molt destroyed with the
  purge's share, repeater shots and hits, contacts resolved and how many were exposed by sight, command points spent,
  doors torn, side, difficulty); one card per Warden (state, shots and hits or bursts, kills, melee record, terminal
  operations, CP drawn); `NEXT: <mission>` in a run with missions left, else `AGAIN`; `TITLE`. Every count is tallied from
  engine events in the client (`stats` in the store, saved with the mission); none is re-derived from state.

## The board (React Three Fiber, one persistent `<Canvas>` for the session)

- **Deck.** Floor squares are dark plates with 1 px teal edge lines. Three brightness states, all open information:
  *seen now* (any Warden sees it, G-7): filled faint `--scan` with a bright edge; *mapped* (not seen now): `--scan-dim`
  edge only; walls are low dark extrusions (0.6 of a square high) with a `--trace` top edge so corridors read as
  channels and never hide a tile. The seen area is the player's read of LOS and of where pings cannot go.
- **Doors** are a bar across the square: open = two short stubs, closed = full bar, sealed = full bar plus a lock
  glyph in `--alarm`, torn = broken stubs in `--molt`.
- **Terminals** are small upright slabs with a blinking cursor; the console is a taller slab with a rotating core
  glyph until the core is taken. Ducts are a hatched grille in `--molt` at low brightness; purged ducts go dark.
- **Lit sections** get a `--lit` wash; **burning squares** a flickering `--alarm` fill.
- **Wardens** (procedural stand-ins, KB rule 7 proportions as far as primitives allow: broad shoulders about 1.8 head
  widths, short thick legs, helmet about a third of the height), matte teal-white with a facing wedge on the tile and a
  thin arc fan showing G-5 when selected. The carrier shows the core glyph above its tile.
- **Stalkers** are low, long-limbed procedural figures in `--molt`. **Pings** are not figures: a pulsing ring on the
  tile with a `?` and a slow sonar ripple.
- **Picking is by tile only** (KB rule 25): one invisible pick plane or instanced tile mesh carries every pointer
  handler; figures and effects have none. A tap resolves in one place: the armed action for that square, else select
  the Warden on it, else inspect it, else clear.
- **Camera** (KB rule 27): starts above the airlock at about 55° pitch. Wheel zooms toward the cursor, right-drag
  rotates and tilts, middle-drag pans, left picks; left-drag pans until the first middle press, remembered under
  `stellar-derelict-mouse`. Touch: one finger pans, two twist and pinch; 8 px tap threshold.
- **TOP DOWN** (owner request 2026-11-14: "a button that brings the view back to top down"): a `TOP DOWN` button at the
  top right (`TOP` on phones) and the `H` key glide the camera to north up (the nearest whole turn, never spinning more
  than half a turn) and as steep as it goes (86°, pitch limit `EL_MAX` 1.5 rad), keeping the spot it looks at and the
  zoom. From the visor it leaves the visor and lands in that view over the Warden. `R` / `Home` still return to the
  opening view above the airlock. On phones the button row sits under the clock.
- **Effects** from engine events only: repeater tracers (hit: `--lit` flash, miss: spark past the target), scorch
  burst, melee lunge, ping-to-stalker reveal (the ring collapses into figures), purge sweep, door slide.
  Additive materials set `fog: false`.

## HUD

- **Boarding clock** (top left): `ROUND 03 / 16`, phase name, and the Warden-phase timer as a draining bar that turns
  `--alarm` under 15 s. With the timer off, the bar is absent.
- **Command points** (under the clock): pips, with held CP shown hollow in the Molt phase.
- **Objective line** (top centre): the current step in plain words, in the mission's own vocabulary (`objective` in the
  mission data: "Unseal the archive at the archive lock terminal", "Take the navigation core from the archive console",
  "Carry the manifest drive to the west airlock"; on the Molt seat, the arrival prompt or "Stop the carrier before the
  forward airlock").
- **Squad strip** (bottom): one trace card per Warden, about 150 × 64: name and role, a scrolling heartbeat trace
  (flat line when destroyed), AP pips, heat bar with the lock mark, plating state (`INTACT` / `BREACHED` in `--alarm`),
  watch and carrier marks. Tapping a card selects that Warden and centres the camera.
- **Action bar** (above the strip, for the selected Warden): one button per action type that is currently legal, each
  showing its AP cost from `query.cost`; arming one highlights its legal squares on the board, and hovering or
  long-pressing a target shows the engine's odds (`query.hitChance`, `query.meleeOdds`) in a small readout.
  `END PHASE` sits at the right and asks once if Wardens still have AP.
- **Comms log** (right, collapsible; a bottom sheet on phones): one terse radio-style line per event, in our words,
  Warden lines in `--scan`, Molt in `--molt`, system in `--read`.
- **Inspector** (replaces native tooltips, KB rule 8): hovering or tapping a square shows what is on it and its states.
  No `title=` attributes and no SVG `<title>` anywhere.
- **Prompts name what they decide** ("Seal which door?"), and every number shown comes from the engine.

## Visor (owner request 2026-11-14: "a marine visor mode where the view shifts to the marine selected, and you can control directly from the marine")

A second camera for the same board: the screen becomes the selected Warden's helmet feed. Presentation only: the rules,
the actions and their costs are the same as on the map, and every number shown still comes from `query.*`.

- **VISOR-1 Toggle.** `C`, or the `VISOR` / `MAP` button at the top right, switches. On, it rides the selected Warden (the
  first one standing if none is selected); `Esc` (with nothing armed or inspected) or `C` returns to the map, which lands
  centred over that Warden. It can be on in either phase (watching the Molt move through a Warden's eyes). The camera
  swings between the two views in about 0.4 s (at once at `Instant` speed).
- **VISOR-2 Whose eyes.** Selecting another Warden (card, `1`–`5`, or a tap on its tile) glides the visor to that helmet
  with a short scanline flash. A tap on an empty square in the visor keeps the selection (on the map it clears it). If the
  Warden is destroyed, `SIGNAL LOST: <NAME>` holds for 1.4 s and the view returns to the map.
- **VISOR-3 The view.** Eye at 0.92 above the deck, 0.2 behind the figure's centre, looking along the facing; 72° field of
  view; the Warden's own figure, ring and marks are not drawn. Walls and door leaves rise to 1.6 (the map's 0.6 walls would
  be waist high), with `--scan` sensor outlines on each wall face that meets the deck (foot, half-height rib, top, uprights)
  and a dark deckhead with the floor grid echoed on it. Fog in `--void` from 3.5 to 15 squares. The deck's seen / mapped
  states, the move and target highlights, pings, effects and the fire arc fan all draw as on the map.
- **VISOR-4 Looking and moving.** Any drag (mouse button, finger, pen) looks around: up to 1.25 rad either side of the
  facing, 0.7 down and 0.4 up. Looking is free; the facing is a rule and costs AP. When the facing changes the look eases
  back to centre. `R` / `Home` recentres. The wheel does nothing. W / S (and ↑ / ↓) step forward and back, Q / E (and ← / →)
  turn, as on the map; a tap on a lit square still moves there; every other action key and button works unchanged.
- **VISOR-5 Shooting.** With Fire or Melee armed, every legal target carries a bracket over its figure with the engine's odds
  (`query.hitChance` as `% KILL`, `query.meleeOdds` as `% WIN`); the bracket nearest the reticle is locked (solid `--lit`).
  Pressing Fire / Melee again (key or button) attacks the locked target; a tap within 90 px of a bracket attacks that one;
  `Esc` disarms. Scorch keeps tile targeting (its burst squares show on the deck).
- **VISOR-6 Helmet HUD.** Corner brackets and faint scanlines; a heading tape and bearing (`090 E`) under the objective; a
  reticle at the centre; the Warden's name, role, AP pips, heat or charges, `BREACHED` and `WATCH` at the frame's lower left;
  one line of key hints (hidden on phones). The comms log folds behind the `COMMS` button as on a phone. The clock, objective,
  action bar and squad strip stay where they are.

## The Molt seat (M7, PLAN D4 "playable Molt later")

The Missions screen's `PLAY AS: MOLT` puts the person on the `molt` seat of a single mission; the utility Warden policy
(spec 40) runs Lantern Squad on the main thread. Same board, same HUD frame, the engine untouched (`view(state, 'molt')`,
E-7: the person sees each contact's stalker count, the squad does not).

- **MOLT-1 Turns.** The Warden phase is the AI's: it plays out like a Molt phase does on the other seat (the director
  animates, controls are disabled). The Molt phase is the person's. No boarding clock on this seat (K-1 is a rule for a
  person playing the Wardens); the Settings and Menu hide it.
- **MOLT-2 Arrivals.** While `state.pending` is set the objective line says "Place the arriving contact: tap an open duct
  (N to place)", the open ducts flicker in `--molt` on the board, a tap on one is the `arrive` action, and `END PHASE` is
  disabled until every arrival is placed (P-2, P-3).
- **MOLT-3 Units.** The squad strip becomes the **contact strip**: one card per contact (its id, `hides N`, AP pips,
  square) and stalker (AP, square), in `--molt`. Tapping a card or a tile selects it (a `--lit` ring on the tile) and
  flies the camera to it; `1`–`9` select by order. Tapping a Warden's tile inspects it.
- **MOLT-4 Actions.** The action bar lists what is legal for the selected unit: `MOVE` (tap a lit square; contacts' lit
  squares exclude seen squares, P-4), `DOOR` and `TEAR` (one adjacent door acts at once, several arm a tap on the door),
  `STRIKE <name>` with the engine's win odds (one adjacent Warden) or an armed tap, `REVEAL` with the count it will place.
  Keys: `M`, `D`, `T`, `G`, `R`, `Space`. Costs come from `query.cost`, odds from `query.meleeOdds`.
- **MOLT-5 Words.** The log, the inspector and the Debrief read the same on both seats (radio traffic is the squad's);
  the clock panel says `// YOU ARE THE MOLT`, the opening log line says the hull stirs, and the Debrief's headline speaks
  for the hull. The visor is a Warden-seat view and its button is absent.

## Director

Events play in order with a presented-state cursor: the board shows the state as of the last animated event, the bot
waits for the queue to drain, controls are disabled (re-rendered) while an action animates, and a speed setting
(Normal / Fast / Instant) scales every duration. `?speed=instant` for e2e.

## Phone layout

At widths under 700 px or heights under 500 px: the squad strip becomes a horizontally scrolling row of compact cards,
the log is a bottom sheet behind a button, the action bar wraps to two rows. Nothing scrolls sideways at 390 px.
KB rule 24 CSS block ships in the base stylesheet from the first commit.

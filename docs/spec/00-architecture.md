# 00 — Architecture (frozen contracts)

Layers, each importing only from the ones above it:

| Folder | What | May import |
|---|---|---|
| `src/data` | `rules.json`, `missions/*.json`, `run.json`, `units.json`, typed loaders | nothing |
| `src/engine` | Pure rules. No DOM, no clock, no `Math.random` | `src/data` |
| `src/ai` | Bots: `(view, seat) -> Action` | `src/engine`, `src/data` |
| `src/client` | React 19 + React Three Fiber board, HUD, store, director, save storage | all |
| `tools/` | `validate-data.ts`, `sim.ts`, `ai-bench.ts` (run with tsx) | engine, ai, data |

## Engine contract (`src/engine/index.ts` exports exactly this surface)

```ts
createGame(setup: Setup): State                    // Setup = { mission: string; seed: number; options?: SetupOptions }
step(state: State, action: Action): StepResult     // { ok: true, state, events } | { ok: false, state, error }
legalActions(state: State): Action[]               // for the seat to act; never empty until state.result is set
view(state: State, seat: Seat): View               // what that seat may know
query                                              // every number the UI or AI shows or reasons with
replay(setup: Setup, actions: Action[]): State
```

- **E-0 Setup options** (`SetupOptions`, all optional): `difficulty` (the Molt AI tier the client plays, spec 40),
  `seat` (`'molt'` when the person plays the Molt; the Wardens when absent, spec 50 "The Molt seat"), `roster` (the ids of
  the squad members who board; the whole squad when absent or when no id matches; squad order is kept: the boarding run,
  spec 10 R-2). The engine reads only `roster`; the others ride in the setup so a save reopens on the same side and tier.
- **E-1 Pure.** `step` never mutates its input and never throws. A rejected action returns `ok: false`, the *same*
  state object and a reason string in our own words.
- **E-2 Plain JSON state.** No classes, Maps, Sets, functions or `undefined` holes: `JSON.parse(JSON.stringify(state))`
  deep-equals `state`. The RNG state (sfc32, seeded from `setup.seed`) is a field of `State`.
- **E-3 One actor.** `state.toAct` is the seat that must act (`'warden' | 'molt'`), or `null` once `state.result` is set.
  `state.pending` is `null` or the single open decision (only kind so far: `{ kind: 'arrive', remaining: number }`, P-2).
- **E-4 `legalActions` is never empty** while the game runs: `endPhase` is always legal in a free phase, and a pending
  decision always has at least one option (the engine resolves a decision with no option itself, P-3).
- **E-5 Replay.** `replay(setup, actions)` deep-equals the state reached live. Dice are only ever drawn inside `step`.
- **E-6 `query` owns every number.** Examples the client and AI need: `query.cost(state, action)`,
  `query.canAfford`, `query.hitChance(state, shooterId, targetId)`, `query.meleeOdds(state, attackerId, defenderId)`
  → `{ attackerWins, tie, defenderWins }`, `query.seenSquares(state)`, `query.sees(state, wardenId, square)`,
  `query.burst(state, wardenId, square)`, `query.openDucts(state)`, `query.reachable(state, unitId)` (squares and AP
  cost), `query.timerSeconds(state)`, `query.terminalOps(state, wardenId)`. The UI does no rules arithmetic.
- **E-7 `view(state, 'warden')`** removes each ping's stalker count, the ping bag and the RNG state, and nothing else
  (the map, doors and every unit position are open information). `view(state, 'molt')` removes only the RNG state.
  A leak test asserts the Warden view's JSON contains none of the hidden values' fields.

### Mission data (`src/data/missions/*.json`, type `Mission` in `src/data/types.ts`)

Besides the grid, legend, terminals, sections, squad, start pings, arrivals, round limit and ping bag (spec 11), every
mission carries `objective: { item, place, exit }`, its own words for the core, the console's room and the way out (the
UI never says "core" unless the mission does), and may carry `aiHints` (`staging`, `arms`, `core`, `deep`: formation slots
for the Warden policy only, spec 40 "Any mission"; no rule reads them). `src/data/run.json` lists the boarding run's
missions in order; `runDef` exports it.

### Actions

| Action | Fields | Rule |
|---|---|---|
| `move` | `unit`, `to: [x, y]` | W-1 (the square ahead or behind), S-1, P-4 |
| `turn` | `unit`, `facing` (90° from current) | W-2 |
| `door` | `unit`, `door: [x, y]` | D-2, D-3 |
| `fire` | `unit`, `target` | F-1 |
| `vent` | `unit` | F-5 |
| `watch` | `unit` | O-1 |
| `scorch` | `unit`, `at: [x, y]` | SC-1 |
| `melee` | `unit`, `target` | M-1 |
| `terminal` | `unit`, `terminal`, `op: 'seal' \| 'unseal' \| 'lights' \| 'purge'`, `door?: [x, y]` | SYS-1..5 |
| `takeCore` | `unit` | V-2 |
| `reveal` | `unit` | P-5 |
| `tear` | `unit`, `door: [x, y]` | D-4 |
| `arrive` | `duct: [x, y]` | P-2 |
| `endPhase` | | T-3, T-5 |

### Events (returned by `step`, in the order things happened; the client animates and logs from these only)

`phaseStarted {seat, round, cp?}` · `moved {unit, from, to}` · `turned {unit, facing}` · `doorChanged {door, state}` ·
`fired {unit, target, dice, need, hit, heat, watch: boolean}` · `locked {unit}` · `cpSpent {unit, cp, left}` (C-2: the CP a
Warden action drew, after `phaseStarted`'s roll; AP-only actions emit none) · `vented {unit, heldCp: boolean}` ·
`watchSet {unit}` · `watchEnded {unit, why}` · `scorched {unit, at, burst}` · `burnCleared {}` ·
`meleeFought {attacker, defender, attackerRoll, defenderRoll, outcome}` · `breached {unit}` ·
`destroyed {unit, by}` · `pingArrived {unit, duct}` · `pingHeld {}` · `revealed {ping, at, stalkers, lost, forced}` ·
`tearRolled {unit, door, die, torn}` · `terminalUsed {unit, terminal, op, door?}` · `lit {section}` ·
`purged {section, ducts}` · `coreTaken {unit}` · `coreDropped {at}` · `corePicked {unit}` · `alarm {}` ·
`roundEnded {round}` · `gameOver {winner, reason}`.

Every event carries what the log line needs, so the client never re-derives an outcome from state.

## Tests and tools (gates)

- Unit tests in `tests/unit`, each `it()` named by rule id (`'F-2 close range lowers the target number'`).
  At least one test per rule id in spec 10, driven through real `step()` calls (not hand-built contexts).
- `tests/fixtures/golden-round.json`: one worked round with a fixed seed, asserting the full event list.
- `tools/sim.ts` (`npm run sim -- --games 1000`): scripted Warden and Molt policies (`tools/policy.ts`) play whole
  missions with invariants checked after every action: one unit per square, nothing inside a wall or closed door, AP and
  CP never negative, heat within 0..lock, no ping on a seen square after a step, `legalActions` non-empty, every legal
  action accepted, state round-trips through JSON, stall cap of 3,000 actions per game. Prints the win table for spec 10 §13.
- `tools/validate-data.ts`: mission grid rectangular, every legend char known, all floor reachable from the airlock,
  terminals and console have a floor neighbour, listed doors are bulkheads, section rects inside the grid, squad on
  airlock squares, bag non-empty, `objective` words present, `aiHints` slots on walkable squares, and the run
  (`run.json`) names known missions once each, all fielding the same squad (R-2).
- `tests/unit/run.test.ts`: the boarding run (R-1..R-5), the `roster` option, `cpSpent`, every mission played through by
  the sim policies with the invariants on, and the mission plan the Warden policy reads from any mission (spec 40).
- `tests/unit/save.test.ts`: the save envelope round-trips (see below).

## Save (KB rule 22) — `src/engine/save.ts`, storage in the client

Envelope `{ game: 'stellar-derelict', version: 1, savedAt, setup, actions, snapshot, ui }`; `snapshot` is what reopens,
`actions` rides along so a bug report replays from the seed. `setup.options` carries the seat, the difficulty and the
roster, so Continue reopens on the same side with the same squad; `ui.run` carries the boarding run in progress, and a
run parked between missions (the Debrief's **Next** not yet taken) lives under `stellar-derelict-run` (spec 10 §15). `readSave(json)` returns `{ ok, save } | { ok: false, reason }`
for bad JSON, a foreign game id, an unknown version, a mission no longer in the game, and a finished game.
Storage key `stellar-derelict-save` (all Pages games share one origin). Autosave after every accepted action and at
mission start, written before the first render.

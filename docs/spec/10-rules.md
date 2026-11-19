# 10 — Rules of Stellar Derelict

An original ruleset. **The spec is the product:** every rule has an id, tests are named by id, every number lives in
`src/data/rules.json` (the "Constants" table below is printed from it), and a balance change needs a sim result recorded
in section 12. An ambiguity found while building is logged in section 13 as
`RULING: <rule id> | <what we did> | <why> | <status>` instead of blocking.

Two sides: the **Wardens** (armoured boarders, seat `warden`) and the **Molt** (alien swarm, seat `molt`).

## Constants (`src/data/rules.json`)

| Key | Value | Used by |
|---|---|---|
| `wardenAp` | 4 | T-3 |
| `stalkerAp`, `pingAp` | 6, 6 | T-5 |
| `cpBase`, `cpDie`, `cpSergeant` | 2, 3, 1 | C-1 |
| `heldCpMax` | 2 | C-3 |
| `cost.forward`, `cost.back`, `cost.turn` | 1, 2, 1 | W-1, W-2 |
| `cost.door`, `cost.fire`, `cost.vent`, `cost.watch` | 1, 1, 1, 2 | D-2, F-1, F-5, O-1 |
| `cost.scorch`, `cost.melee`, `cost.terminal`, `cost.takeCore` | 2, 1, 1, 2 | SC-1, M-1, SYS-1, V-2 |
| `terminalCp` | 1 | SYS-1 |
| `repeater.dice`, `repeater.closeRange`, `repeater.closeTarget`, `repeater.farTarget` | 2, 3, 5, 6 | F-2 |
| `repeater.maxRange` | 12 | F-1 |
| `repeater.heatLock`, `repeater.coolPerRound`, `repeater.heldCpHeat` | 4, 2, 2 | F-4, F-5, O-4 |
| `litBonus` | 1 | SYS-4 |
| `scorcher.range`, `scorcher.charges`, `scorcher.killOn` | 6, 6, 2 | SC-1..3 |
| `melee.stalkerDice`, `melee.stalkerBonus`, `melee.sergeantBonus`, `melee.flankPenalty` | 2, 0, 2, 2 | M-2..4 |
| `stalker.moveCost`, `stalker.doorCost`, `stalker.tearCost`, `stalker.tearOn` | 1, 1, 1, 5 | S-1, D-3, D-4 |
| `ductWatchRadius` | 3 | P-2 |
| `revealRadius` | 2 | P-6 |
| `timer.base`, `timer.perWarden` | 45, 15 | K-1 |
| `run.minSquad` | 2 | R-3 |

Mission numbers (round limit, arrivals, the ping bag) live in the mission file (specs 11, 12, 13).

## 1. Grid and sight

- **G-1** The board is a grid of squares addressed `(x, y)`, x east, y south. A square is `wall`, `floor`, a `door`
  square, a `terminal` or the `console` (objects that fill their square), a `duct` (floor that the Molt arrive on) or
  `airlock` (floor the Wardens start on and leave by).
- **G-2** A square holds at most one unit. Walls, terminals, the console and closed doors cannot be entered.
- **G-3** Movement and adjacency are orthogonal only. Distance between squares is counted in orthogonal steps
  (`|dx| + |dy|`) for every range in these rules; *path distance* is the shortest walk through enterable squares, ignoring units.
- **G-4** A Warden has a facing: N, E, S or W. Stalkers and pings have no facing.
- **G-5 Arc.** With `fwd` the offset along a Warden's facing and `lat` the offset across it, a square is in the Warden's
  arc when `fwd >= 1` and `|lat| <= fwd`.
- **G-6 Line of sight.** Draw the segment between the centres of two squares. LOS exists when no square the segment
  passes through (other than the two ends) is *blocking*. Blocking squares: walls, closed doors, terminals, the console,
  and squares holding any unit. Where the segment passes exactly through a grid corner, it is blocked only if both
  squares touching that corner on either side of the segment are blocking. LOS is symmetric.
- **G-7 Seen.** A Warden *sees* a square when it is in the Warden's arc and in LOS, at any range.
  A square is *seen* when any living Warden sees it.

## 2. Round and phases

- **T-1** A round is the Warden phase, then the Molt phase. The mission starts in the Warden phase of round 1.
- **T-2 Warden phase start, in order:** burn zones are removed (SC-4); every Warden's watch ends (O-2); every repeater
  cools by `repeater.coolPerRound`, not below 0 (F-5); command points are rolled (C-1); every Warden's AP is set to `wardenAp`.
- **T-3** In the Warden phase the Warden player takes any number of actions with any Wardens in any order, each paid in
  AP (and CP, C-2), then ends the phase. Ending is always legal.
- **T-4 Molt phase start, in order:** unspent CP are held (C-3); every stalker and ping gets its AP; arrivals come in (P-1..3).
- **T-5** In the Molt phase the Molt player takes any number of actions with any stalkers and pings in any order, then
  ends the phase. Ending is always legal.
- **T-6 Round end.** After the Molt phase ends, if this was the mission's last round the Molt win (V-5); otherwise the
  round number rises by 1.

## 3. Command points

- **C-1** At the start of the Warden phase, CP = `cpBase` + 1d`cpDie`, plus `cpSergeant` if the Sergeant is alive.
- **C-2** A Warden action is paid from that Warden's AP first; any shortfall is paid from CP. An action is legal while
  AP + CP covers its cost.
- **C-3** At the start of the Molt phase, CP above `heldCpMax` are lost; the rest are *held* for the Molt phase (O-4).
  Held CP do not carry into the next Warden phase.

## 4. Warden movement

- **W-1** Move forward one square (the square the Warden faces): `cost.forward`. Move backward one square, keeping
  facing: `cost.back`. No sidestep.
- **W-2** Turn 90° left or right: `cost.turn`. (About-face is two turns.)
- **W-3** A Warden may not enter a burning square (SC-4).
- **W-4** A Warden that enters the square where the core lies picks it up at once, for no AP (V-3).

## 5. Fire (repeater)

Every Warden except the Scorcher carries a repeater.

- **F-1** Fire: `cost.fire`. The target is a stalker the Warden sees (G-7) within `repeater.maxRange`. The repeater must
  not be locked (F-4).
- **F-2** Roll `repeater.dice` d6. The target number is `repeater.closeTarget` at distance `repeater.closeRange` or less,
  otherwise `repeater.farTarget`; a lit target lowers it by `litBonus` (SYS-4). If any die is at or above the target
  number, the stalker is destroyed.
- **F-3** A shot, hit or miss, adds 1 heat to the repeater.
- **F-4** At `repeater.heatLock` heat the repeater is *locked* and cannot fire.
- **F-5** Vent: `cost.vent`, sets heat to 0. Heat also falls at the start of each Warden phase (T-2).

## 6. Watch

- **O-1** Set watch: `cost.watch`. The Scorcher cannot set watch. A Warden with a locked repeater cannot set watch.
- **O-2** Watch ends at the start of the next Warden phase, when the Warden takes any other action, when the Warden is
  attacked in melee (after the attack is resolved, if it lives), or when its repeater locks with no held CP left (O-4).
- **O-3** In the Molt phase, each time a stalker finishes a move, a door action or a tear action in a square that a
  watching Warden sees within `repeater.maxRange`, that Warden fires one shot at it (F-2, F-3) for no AP. Several
  watching Wardens fire in squad order until the stalker is destroyed. A stalker placed by a reveal (P-5, P-6) and a
  stalker making a melee attack do not trigger watch.
- **O-4** When a watching Warden's repeater locks during the Molt phase and a held CP remains, one held CP is spent
  automatically and the heat is set to `repeater.heldCpHeat`; the watch continues.

## 7. Scorcher

One Warden carries the scorcher instead of a repeater.

- **SC-1** Scorch: `cost.scorch` and one of `scorcher.charges` charges. The target is any square the Warden sees within
  `scorcher.range` that is not a wall, terminal or console; it may be empty.
- **SC-2** The *burst* is the target square plus each orthogonally adjacent square that can be entered (floor, duct,
  airlock or an open door).
- **SC-3** For each unit in the burst roll 1d6; on `scorcher.killOn` or more it takes a lethal hit (stalkers and pings
  are destroyed; Wardens: A-1). A ping is rolled for once, as one unit.
- **SC-4** Every burst square *burns* until the start of the next Warden phase. No unit may enter a burning square.
  Burning does not block LOS. Units already in a burning square are not hit again and may leave.

## 8. Melee

- **M-1** Attack: a stalker adjacent to a Warden, `cost.melee` of its AP; or a Warden against a stalker in the square
  directly ahead of it, `cost.melee`.
- **M-2** The stalker rolls `melee.stalkerDice` d6 and keeps the highest, plus `melee.stalkerBonus`. The Warden rolls
  1d6, plus `melee.sergeantBonus` if it is the Sergeant.
- **M-3** Higher total wins and the loser takes a lethal hit (a stalker is destroyed; Wardens: A-1). A tie has no effect.
- **M-4 Flank.** If the attacking stalker is not in the square directly ahead of the Warden, the Warden's total is
  reduced by `melee.flankPenalty` and the Warden cannot win (a Warden total above the stalker's counts as a tie). If the
  Warden lives, it turns to face the attacker for no AP.
- **M-5** A melee attack against a watching Warden ends its watch (O-2).

## 9. Plating

- **A-1** A Warden's hardsuit absorbs the first lethal hit it takes in a mission: the Warden is *breached* instead of
  destroyed. A breached Warden is destroyed by its next lethal hit. Breach has no other effect.

## 10. The Molt

### Pings
- **P-1 Arrivals.** At the start of the Molt phase the mission's arrivals for this round (plus any held over) come in
  one at a time. For each, a number is drawn from the mission's ping bag (reshuffled when empty); it is how many
  stalkers the ping conceals. The Warden player never sees the number or the bag.
- **P-2** The Molt player chooses an *open* duct for each arriving ping. A duct is open when it is not purged (SYS-5),
  not occupied, and not *watched*: no Warden sees it, and no Warden stands within `ductWatchRadius` path distance of it.
- **P-3** If no duct is open, the ping is held over to the next round's arrivals. An arriving ping has full AP this phase.
- **P-4 Ping movement.** A ping moves one square for 1 AP, opens or closes a door like a stalker (D-3), and may never
  enter a seen square (G-7) or a burning square. Pings cannot attack or tear.
- **P-5 Voluntary reveal.** In the Molt phase a ping that has spent no AP this phase may reveal for 0 AP: it is replaced
  by its stalkers (P-6), each with full AP.
- **P-6 Placement.** The first stalker stands on the ping's square. Each further stalker goes on the nearest empty,
  enterable, non-burning square within `revealRadius` path distance of the ping's square, preferring squares no Warden
  sees, ties broken by lower y then lower x. A stalker with no such square is lost.
- **P-7 Forced reveal.** Whenever a ping is on a seen square (a Warden moved, turned, opened a door, or a blocker was
  removed), it is revealed at once by P-6. In the Molt phase its stalkers keep the ping's remaining AP.

### Stalkers
- **S-1** Move one square: `stalker.moveCost`. Stalkers may not enter burning squares.
- **S-2** Attack: M-1.
- **S-3** Stalkers have one wound: any hit destroys them.

## 11. Doors, systems and the core

### Doors
- **D-1** A door square is `open` or `closed`, and may be `sealed` (bulkhead doors only) or `torn`. A closed door blocks
  movement and LOS. An open door square is ordinary floor. A door cannot be closed while a unit stands in it.
- **D-2** A Warden opens or closes the door in the square directly ahead: `cost.door`. A sealed door cannot be opened.
- **D-3** A stalker or ping opens or closes an adjacent unsealed door: `stalker.doorCost`.
- **D-4 Tear.** A stalker adjacent to a closed door (sealed or not): `stalker.tearCost`, roll 1d6; on `stalker.tearOn`
  or more the door is *torn*: open for the rest of the mission, no longer sealed, and it can never close.

### Ship systems
- **SYS-1** A Warden facing a terminal in the square directly ahead may run one operation the terminal offers:
  `cost.terminal` AP plus `terminalCp` CP. The Tech pays no CP.
- **SYS-2 Bulkheads.** The terminal lists bulkhead doors. Operation: *seal* one listed door that is closed and not torn,
  or *unseal* one listed sealed door. Sealing closes nothing by itself: an open door must be closed first (D-2).
- **SYS-3** (reserved)
- **SYS-4 Lights.** One use. The terminal's section becomes *lit* for the rest of the mission. A stalker on a lit
  square is easier to hit (F-2).
- **SYS-5 Purge.** One use. Every unit in the terminal's section takes a lethal hit with no roll (Wardens: A-1), and the
  terminal's listed ducts are *purged*: nothing arrives there again.

### The core and victory
- **V-1** The mission names a console square. The core starts inside it.
- **V-2** A Warden facing the console in the square directly ahead takes the core: `cost.takeCore`. That Warden is the
  *carrier*. From the next round on, arrivals use the mission's alarm rate.
- **V-3** If the carrier is destroyed the core lies on its square; a Warden who enters that square picks it up (W-4).
  Molt units may stand on it.
- **V-4** The Wardens win at once when the carrier stands on an airlock square.
- **V-5** The Molt win at once when no Warden is alive, or at the end of the mission's last round (T-6).

## 12. The boarding clock (client rule)

- **K-1** With the timer on, the Warden phase lasts `timer.base` + `timer.perWarden` × living Wardens seconds of real
  time. When it runs out the client ends the phase. The clock stops while an action is animating and while a menu is open.
- **K-2** Settings: Standard (K-1), Relaxed (twice as long), Off. Default Standard. The engine never reads a clock.

## 13. Balance record

Fill in from `npm run sim` (spec 00). Target for every mission with the full squad: the utility Wardens beat the regular
Molt in 35–55% of the games. Change one constant at a time and keep every row. Cold Berth's rows are in spec 12 and Last
Light's in spec 13 (`--mission`, `--override`, `--override-file` and `--roster` on the sim try a mission's numbers, a map
variant or a short-handed squad without editing the files).

| Id | Date | Change | Warden win % | Notes |
|---|---|---|---|---|
| B-0 | 2026-11-13 | constants as first written (`melee.stalkerBonus` 1, round limit 16, bag four 1s / five 2s / three 3s) | 23.3 (300 games) | squad lost 68.7%, out of time 8.0% |
| B-1 | 2026-11-13 | round limit 16 → 18 | 23.7 (300) | no effect: the squad dies, it does not run out of time. Reverted |
| B-2 | 2026-11-13 | B-1 plus a softer bag (nine 1s, two 2s, one 3) | 33.3 (300) | helps, but makes most pings a single stalker. Reverted |
| B-3 | 2026-11-13 | B-2 with round limit 16 and alarm arrivals 3 → 2 | 33.0 (300) | alarm rate does nothing measurable. Reverted |
| B-4 | 2026-11-13 | soft bag, `melee.stalkerBonus` 1 → 0 | 56.0 (300) | the melee bonus is the lever: squad lost falls to 28.0% |
| **B-5** | 2026-11-13 | **adopted:** `melee.stalkerBonus` 0 with the original bag, round limit and arrivals | **36.9 (1,000)** | squad lost 52.7%, out of time 10.4%, average 12.2 rounds; 0 invariant violations, 0 stalls |
| B-6 | 2026-11-13 | measuring stick replaced: utility Warden policy (spec 40) in place of the M3 script, AI and constants unchanged | 42.8 vs regular (400), 94.5 vs recruit, 3.0 vs veteran, 100 vs random | the M3 Wardens lost to a *random* Molt 85% of games on the clock, so B-0..B-5 were measured with a broken stick. No constant changed |
| B-7 | 2026-11-13 | recruit: idle 0.35 → 0.15, wake radius 8 → 10 (AI only) | 94.5 → 73.0 vs recruit (400) | 60–80 target met; recruit Molt 27% |
| B-8 | 2026-11-13 | veteran: idle 0 → 0.2 of units per phase (AI only) | 3.0 → 24.0 vs veteran (400) | 20–40 target met; regular untouched at 42.8; ladder 73.0 / 42.8 / 24.0 |

After B-8 no mission number or `rules.json` constant was changed: B-5's `melee.stalkerBonus` 0 stands, and the Warden win rate against the regular Molt (42.8%, 400 games) is inside 35–55%. Time-outs are 0.0% against recruit and regular, 0.3% against veteran, 0.0% against random.

Rows B-0 to B-5 used the M3 scripted Wardens (`wardenPolicyV1`), which could not beat even a random Molt; B-6 on use the utility Wardens. Rows B-0 to B-2 were first run by the engine build, whose notes were lost to a container restart; every row above was
re-run on 2026-11-13. The scripted policies are blunt; re-measure with the M4 AI before tuning further.

### 13b. AI bench (2026-11-13, M4 and the Warden follow-up)

`npm run bench:ai -- --games 400` (spec 40): the utility Wardens against each Molt, seeds 1..400, invariants on, no rule constant changed.
Decision times are per decision on the cloud container (4 cores, 4 games at once).

| Molt | Warden win % | Molt win % | Time-outs | Avg rounds | Molt avg / max ms | Warden avg / max ms | s per game |
|---|---|---|---|---|---|---|---|
| random | 100.0 | 0.0 | 0.0% | 13.8 | 0.10 / 12 | 1.43 / 25 | 0.42 |
| recruit | 73.0 | 27.0 | 0.0% | 9.9 | 0.33 / 13 | 1.38 / 18 | 0.28 |
| regular (scripted, unchanged) | 42.8 | 57.3 | 0.0% | 8.9 | 0.37 / 16 | 1.24 / 18 | 0.28 |
| veteran | 24.0 | 76.0 | 0.3% | 9.5 | 0.51 / 31 | 1.42 / 30 | 0.44 |

0 invariant violations, 0 stalls, 0 Molt fallbacks in 1,600 games. All bench gates pass: Wardens beat random 100% (>= 90) with 0% time-outs (<= 5);
veteran Molt 76.0 >= regular 57.3 + 10; recruit Molt 27.0 <= regular - 10 and >= random 0.0 + 15; Warden average decision 1.4 ms.
The ladder holds (73.0 / 42.8 / 24.0, steps of 30 and 19 points) and all three bands of the section 13 targets are met (recruit 60-80, regular 40-60, veteran 20-40).

Before the Warden policy was replaced (same Molt code, M3 Wardens): random Molt 85% Molt wins, recruit 49%, regular 61%, veteran 99.8%, nearly all
of them on the clock, and the recruit-vs-random gate could not hold. That was the measuring stick, not the Molt.

**Corridor body-blocking.** Against the M3 Wardens, idle or hidden units parked in a one-wide corridor won most games on time (random 85%, veteran 68%).
Against Wardens that clear blockers (shoot what stands in the route, scorch, bring contacts round a corner into sight) the clock is not a factor: 0.0-0.3%
of results. Blocking by unseen pings is therefore not dominant for a competent squad; it only beats a squad that has no way through. If a person
turns out to be stopped by it, a rule to answer it would be: a Warden adjacent to a ping may probe it (1 AP, forced reveal P-7), which lets a squad that
cannot see round a corner clear a plugged corridor. Proposed only; not implemented.

## 15. The boarding run (client rules over the engine)

A run is the game's campaign: the missions of `src/data/run.json` in order, played by one squad. The engine knows nothing
of it beyond the `roster` option (E-0); `src/client/run.ts` carries the roster and the tally between missions.

- **R-1** A run is the listed missions in order, on the Warden seat, at one difficulty chosen on the first Briefing.
- **R-2** The squad that boards a mission is the Wardens alive at the end of the one before (the whole squad for the
  first). Plating is repaired between missions: every boarding Warden starts intact. Squad order is kept.
- **R-3** A lost mission ends the run. A won mission that leaves fewer than `run.minSquad` Wardens alive also ends it:
  the squad pulls out.
- **R-4** The run is complete when the last mission is won. Its tally (missions won, Wardens lost, Molt destroyed, rounds
  used) is the sum of its missions' debriefs.
- **R-5** Every mission's seed derives from the run's one seed and the mission's index, so a run replays from one number.

The Missions screen also offers any mission alone, on either seat (spec 50 "The Molt seat"); a single mission is not a run.

## 14. Rulings

From the coordinator's read of `src/engine/rules.ts` against this spec (2026-11-13); no rule errors were found.

- RULING: SC-1 | A closed door square may be targeted; the doorway burns but the door stays closed | SC-1 excludes only walls, terminals and the console | Confirmed
- RULING: P-2, P-6 | Path distance for the duct watch radius and for reveal placement does not pass closed doors | G-3 defines path distance through enterable squares | Confirmed
- RULING: M-4 | The flank penalty applies only when the stalker is the attacker | A Warden can only strike the square ahead (M-1) | Confirmed
- RULING: G-2 | A destroyed Warden stays in `units` with `alive: false`; its square is free and it blocks nothing | Keeps squad order and the debrief roster stable | Confirmed
- RULING: O-4 | Held CP are spent only by a watching Warden's lock, never by choice | C-3 gives held CP no other use | Confirmed
- RULING: P-7 | A ping revealed by force in the Warden phase keeps whatever AP it had; it is reset at the next Molt phase like any unit | T-4 | Confirmed

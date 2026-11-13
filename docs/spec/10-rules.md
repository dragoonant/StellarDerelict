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

Mission numbers (round limit, arrivals, the ping bag) live in the mission file (spec 11).

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

Fill in from `npm run sim` (spec 00). Target for the first mission: scripted Wardens beat scripted Molt in 35–55% of
1,000 games. Change one constant at a time and keep every row.

| Id | Date | Change | Warden win % | Notes |
|---|---|---|---|---|
| B-0 | 2026-11-13 | constants as first written (`melee.stalkerBonus` 1, round limit 16, bag four 1s / five 2s / three 3s) | 23.3 (300 games) | squad lost 68.7%, out of time 8.0% |
| B-1 | 2026-11-13 | round limit 16 → 18 | 23.7 (300) | no effect: the squad dies, it does not run out of time. Reverted |
| B-2 | 2026-11-13 | B-1 plus a softer bag (nine 1s, two 2s, one 3) | 33.3 (300) | helps, but makes most pings a single stalker. Reverted |
| B-3 | 2026-11-13 | B-2 with round limit 16 and alarm arrivals 3 → 2 | 33.0 (300) | alarm rate does nothing measurable. Reverted |
| B-4 | 2026-11-13 | soft bag, `melee.stalkerBonus` 1 → 0 | 56.0 (300) | the melee bonus is the lever: squad lost falls to 28.0% |
| **B-5** | 2026-11-13 | **adopted:** `melee.stalkerBonus` 0 with the original bag, round limit and arrivals | **36.9 (1,000)** | squad lost 52.7%, out of time 10.4%, average 12.2 rounds; 0 invariant violations, 0 stalls |

Rows B-0 to B-2 were first run by the engine build, whose notes were lost to a container restart; every row above was
re-run on 2026-11-13. The scripted policies are blunt; re-measure with the M4 AI before tuning further.

## 14. Rulings

(none yet)

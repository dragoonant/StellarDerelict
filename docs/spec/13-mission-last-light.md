# 13 — Mission 3: Last Light

Data: `src/data/missions/last-light.json` (the JSON wins on any disagreement with this page). Third and last cut of the
boarding run (spec 10 §15); also playable alone from the Missions screen, on either seat.

**Story.** The reactor deck is the last of the *Halcyon Drift* still warm, and the Molt nest closest to it. The
reactor's black box holds the final hours of the ship. Lantern Squad cuts in at the forward airlock, runs the spine
through two sealed bulkheads, and gets the box out before the swarm wakes in force.

**Objective words** (`objective`): item *black box*, place *reactor room*, exit *forward airlock*. The engine still calls
them core, console and airlock; every screen uses these words.

**Win.** Wardens: the carrier stands on an airlock square (V-4). Molt: no Warden alive, or round 18 ends (V-5).

## Map (25 × 19, x east from 0, y south from 0)

```
#########################     #  wall          A  airlock (start and exit)
#AAA#####################     .  floor         V  duct (Molt arrive)
#AAAD..................##     D  door          B  bulkhead door (can be sealed)
#AAA#.#######T.T######.##     T  terminal      X  console (holds the black box)
#####.########.#######.##
#####.########B#######.##
#####.########.#######.##
#####.########.#######.##
#####.V......#.#......V.#
#####.########.#######.##
#####.########B#######.##
#####.########.#######.##
#####.####.......#####.##
#####.####.......#####.##
#####.####.......#####.##
#####.####....X..#####.##
####T.####.......#####.##
#####V........V.......V##
#########################
```

- **North corridor** y = 2 from the airlock door `(4,2)` to the east column; **west column** x = 5 and **east column**
  x = 22 run from it down to the **south corridor** y = 17. Two dead-end stubs at y = 8 hold ducts at `(6,8)` and `(22,8)`.
- **Spine** x = 14 from `(14,3)` to `(14,11)` into the **reactor room** (x 10–16, y 12–16). Both spine bulkheads,
  `(14,5)` and `(14,10)`, **start sealed**. The spine has no side doors: the only way into the reactor room is down it,
  so the Molt reach the squad from behind, along the north corridor, or wait for the alarm.
- **Terminals**
  - *Reactor lock* `(13,3)`, used from `(14,3)` facing W (or `(13,2)` facing S): seals or unseals `(14,5)` and `(14,10)`.
    Two operations are needed before the room opens; the Tech pays no CP for either.
  - *Spine lights* `(15,3)`, used from `(14,3)` facing E: one use; lights the spine and the reactor room.
  - *South corridor purge* `(4,16)`, used from `(5,16)` facing W: one use; clears the south corridor and closes its three
    ducts `(5,17)`, `(14,17)`, `(22,17)` for good. Far from the route: a deliberate detour.
- **Ducts:** `(6,8)`, `(22,8)`, `(5,17)`, `(14,17)`, `(22,17)`.

## Forces

The squad is Lantern Squad as in spec 11 (same five members, same roles), starting on the airlock squares facing E:
Venn `(2,2)`, Brandt `(3,2)`, Okafor `(3,1)`, Riedel `(2,1)`, Sato `(3,3)`. In a boarding run only the survivors of
Cold Berth board (R-2), plating repaired.

Molt: two pings start on the ducts at `(6,8)` and `(22,8)`. Arrivals: 2 pings per round, **4** from the round after the
box is taken (V-2): the nest is close. Ping bag: three 1s, five 2s, four 3s (heavier than Dead Reckoning's).

## Design intent

Short route (about 11 squares to the lock, 12 down the spine, 23 back) but a thin one: the squad is a file in one-wide
corridors the whole way, the lock costs two operations, and once the alarm sounds four contacts a round pour in behind
it. The Warden policy's `aiHints`: `arms` at the spine mouth (`(13,2)` W, `(15,2)` E, `(12,2)` W, `(16,2)` E) while the
lock is worked; `core: []` (the escorts follow the operator down the spine in file, there is no room to hold slots); no
`staging` (there are no flank bulkheads to seal). An earlier draft gave the spine two side doors at y = 8 from the stubs:
stalkers came through them into the file's flanks and the AI squad won 1.7–28.5% however the numbers were set; the
doors were removed rather than the swarm softened (rows LL-0..LL-3).

## Balance record (`npm run sim -- --mission last-light`, utility Wardens vs the regular Molt, seeds 1..N)

| Id | Date | Change | Warden win % | Notes |
|---|---|---|---|---|
| LL-0 | 2026-11-14 | first draft: spine at x 13 unreachable from the north (a grid slip), side doors | 0.0 (300) | 98.7% out of time: the squad could not reach the spine |
| LL-1 | 2026-11-14 | spine moved to x 14, side doors `(13,8)` `(15,8)` listed on the lock | 1.7 (300) | squad lost 98.3%; the escorts held the arms slots while the operator went down the spine alone |
| LL-2 | 2026-11-14 | `core: []` (follow in file) | 25.0 (200) | core taken 79.5%; alarm 4 → 3 made no difference (24–25%: the ducts are clogged, arrivals are held over) |
| LL-3 | 2026-11-14 | a spine-door terminal for the flank stage, start pings far | 24.0–28.5 (200) | the side doors are the problem, not the numbers |
| **LL-4** | 2026-11-14 | **adopted:** side doors removed (walls), no flank terminal, arms at the spine mouth | **46.0 (200), 45.0 (1,000)** | core taken 88.0%, squad lost 55.0%, no time-outs, average 9.3 rounds, 0 invariant violations, 0 stalls; round limit 20 gave 43.5 (no gain), so 18 stands |
| LL-4r | 2026-11-14 | the same, short-handed as a run leaves it (R-2): `--roster venn,brandt,riedel,sato` / `venn,sato,riedel` | 26.7 / 40.3 (300) | four Wardens take the box 72% of games and get out 27%; three (Sergeant, Tech, Scorcher) 80% and 40%: the file is shorter and the box comes out faster |

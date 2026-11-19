# 11 — Mission 1: Dead Reckoning

Data: `src/data/missions/dead-reckoning.json` (the JSON wins on any disagreement with this page). First cut of the
boarding run (spec 10 §15); also playable alone, on either seat. Objective words: item *navigation core*, place
*archive*, exit *aft airlock*. Its `aiHints` are the M4 Warden policy's slots (spec 40 "Any mission").

**Story.** The survey tender *Halcyon Drift* went dark eleven years ago. Lantern Squad cuts in at the aft airlock to
pull its navigation core from the archive and carry it back out before the hull lets go.

**Win.** Wardens: the core carrier stands on an airlock square (V-4). Molt: no Warden alive, or round 16 ends (V-5).

## Map (29 × 19, x east from 0, y south from 0)

```
#############################     #  wall          A  airlock (start and exit)
#V......#####.X.#####......V#     .  floor         V  duct (Molt arrive)
#.#####.#####...#####.#####.#     D  door          B  bulkhead door (can be sealed)
#.#####.#####...#####.#####.#     T  terminal      X  console (holds the core)
#.#####.######B######.#####.#
#.#####.######.######.#####.#
#.........B.......B.........#
#.#####.######.######.#####.#
#.#####.#####T.######.#####.#
#.#####.######.######.#####.#
#.#####.######B#####T.#####.#
#.......######.######.......#
#######.######.######.#######
#AAA###.T#####.######.###...#
#AAA.D.................B...V#
#AAA###.######.######.###...#
#######.######.######.#######
#######V######T######V#######
#############################
```

- **Spine** (x = 14) runs from the south corridor up to the archive (rooms x 13–15, y 1–3). The archive bulkhead
  `(14,4)` **starts sealed**.
- **Terminals**
  - *Archive lock* `(13,8)`, used from `(14,8)` facing W: seals or unseals `(14,4)` and `(14,10)`. The squad must use it to reach the core.
  - *Flank bulkheads* `(8,13)`, used from `(7,13)` facing E or `(8,14)` facing N: seals or unseals `(10,6)`, `(18,6)`, `(23,14)`.
  - *East ring purge* `(20,10)`, used from `(21,10)` facing W: one use; clears the east ring (x = 27 for y 1–11, and y = 1 and y = 11 for x 22–26) and closes the duct at `(27,1)` for good.
  - *Spine lights* `(14,17)`, used from `(14,16)` facing S: one use; lights the y = 6 corridor and the whole spine.
- **Ducts:** `(1,1)`, `(27,1)`, `(27,14)`, `(7,17)`, `(21,17)`.

## Forces

| Warden | Role | Start | Notes |
|---|---|---|---|
| Sgt. Maro Venn | sergeant | (2,14) E | +1 CP while alive (C-1), melee +2 (M-2), repeater |
| Ilse Brandt | warden | (3,14) E | repeater |
| Teo Okafor | warden | (3,13) E | repeater |
| Kass Riedel | scorcher | (2,13) E | scorcher, 6 charges; no watch |
| Juno Sato | tech | (3,15) E | repeater; terminals cost no CP (SYS-1) |

Molt: two pings start on the ducts at `(1,1)` and `(27,1)`. Arrivals: 2 pings per round, 3 from the round after the
core is taken (V-2). Ping bag: four 1s, five 2s, three 3s.

## Design intent (for the AI and balance work)

The shortest route is about 20 squares each way, so a clean run is 10–11 rounds of 16. The squad must stop at the
archive lock, which is the moment the flanks close in from the y = 6 corridor; sealing `(10,6)` and `(18,6)` first costs
a detour south. The purge and the lights are optional detours that trade rounds for safety.

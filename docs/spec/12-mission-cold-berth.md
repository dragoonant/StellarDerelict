# 12 — Mission 2: Cold Berth

Data: `src/data/missions/cold-berth.json` (the JSON wins on any disagreement with this page). Second cut of the boarding
run (spec 10 §15); also playable alone from the Missions screen, on either seat.

**Story.** The berth deck is where the *Halcyon Drift*'s crew went to sleep and never woke. The manifest drive in the
berth control room says who they were and what they carried. Lantern Squad cuts in at the west airlock, works the lanes
between the berth blocks, and brings the drive out before the Molt close the galleries.

**Objective words** (`objective`): item *manifest drive*, place *berth control room*, exit *west airlock*.

**Win.** Wardens: the carrier stands on an airlock square (V-4). Molt: no Warden alive, or round 18 ends (V-5).

## Map (29 × 19, x east from 0, y south from 0)

```
#############################     #  wall          A  airlock (start and exit)
#V.........................V#     .  floor         V  duct (Molt arrive)
######B######T#####B#######.#     D  door          B  bulkhead door (can be sealed)
#####.................#####.#     T  terminal      X  console (holds the manifest drive)
#####.###.###.###.###.#####.#
#####.###.###.###.###.#####.#
#####.................#####.#
#####.###.###.###.###.T####.#
#AAA#.###.###.###.###.#...#.#
#AAAD.................B..X#V#
#AAA#.###.###.###.###.#...#.#
#####.###.###.###.###.#####.#
#####.###.###.###.###.#####.#
#####.###.###.###.###.T####.#
#####.###.###.###.###.#####.#
#####.................#####.#
######B######T#####B#######.#
#V.........................V#
#############################
```

- **Lanes.** Five north–south lanes (x = 5, 9, 13, 17, 21) and four east–west lanes (y = 3, 6, 9, 15) between the
  berth blocks; every lane is one square wide, so a Warden sees the whole of a straight lane and a contact must come
  down a parallel lane to get close unseen. The asymmetry (no lane at y = 12) is deliberate: the south half is quieter.
- **Galleries.** The north gallery y = 1 and the south gallery y = 17 run the full width; the **east corridor** x = 27
  joins them. Four **gallery bulkheads** `(6,2)`, `(19,2)`, `(6,16)`, `(19,16)` are the only ways from the galleries
  into the lanes (apart from the east corridor's own duct).
- **Berth control room** (x 23–25, y 8–10) behind the bulkhead `(22,9)`, which **starts sealed**; the console `(25,9)`
  is used from `(24,9)` facing E.
- **Terminals**
  - *Gallery bulkheads* `(13,2)`, used from `(13,3)` facing N or `(13,1)` facing S: seals or unseals the four gallery doors.
  - *Berth lock* `(22,7)`, used from `(21,7)` facing E: seals or unseals `(22,9)`. Two squares from the control room.
  - *East corridor purge* `(22,13)`, used from `(21,13)` facing E: one use; clears the east corridor x = 27 and closes
    its ducts `(27,1)`, `(27,9)`, `(27,17)` for good.
  - *Lane lights* `(13,16)`, used from `(13,15)` facing S: one use; lights every lane.
- **Ducts:** `(1,1)`, `(27,1)`, `(1,17)`, `(27,17)`, `(27,9)`.

## Forces

The squad is Lantern Squad as in spec 11 (same five, same roles), starting on the airlock squares facing E: Venn `(2,9)`,
Brandt `(3,9)`, Okafor `(3,8)`, Riedel `(2,8)`, Sato `(3,10)`. In a boarding run only the survivors of Dead Reckoning
board (R-2), plating repaired.

Molt: two pings start on the ducts at `(1,1)` and `(27,17)`. Arrivals: 2 pings per round, 3 from the round after the
drive is taken (V-2). Ping bag: four 1s, five 2s, three 3s (as Dead Reckoning).

## Design intent

The route is about 20 squares to the lock and 21 back, the same length as Dead Reckoning's, but the fight is different:
there is no single spine to hold. Contacts come down the lanes the squad is not looking along and reveal at a crossing
beside the file. Sealing the gallery bulkheads early (the Tech, 14 squares from the airlock) shuts three of the five
ducts out of the lanes until the Molt tear through; the purge is a long detour that closes the east corridor instead.

`aiHints`: `staging` around the gallery terminal's crossing (`(12,3)` W, `(14,3)` E, `(13,4)` S, `(11,3)` W), `arms` at
the junction below the lock (`(21,6)` N, `(20,9)` W, `(21,10)` S, `(19,9)` W; also used for the console stage, two
squares away), `deep` the airlock squares.

## Balance record (`npm run sim -- --mission cold-berth`, utility Wardens vs the regular Molt, seeds 1..N)

| Id | Date | Change | Warden win % | Notes |
|---|---|---|---|---|
| CB-0 | 2026-11-14 | first draft: an open hall (x 5–21, y 3–15) with four 2 × 2 berth pillars, lock in the north gallery | 0.0 (300) | drive taken 74%, squad lost 97%: stalkers flank the file from every side in open deck |
| CB-1 | 2026-11-14 | lanes instead of a hall: three north–south (x 5, 13, 21) and three east–west (y 3, 9, 15), lock beside the sealed door | 90.5 (200) | too safe: a contact cannot come down a lane a Warden looks along, and the ducts clog (arrivals 3/4: 90.0; heavier bag and a third start ping: 85.5) |
| CB-2 | 2026-11-14 | a dense lattice: five north–south, five east–west lanes | 25.5 (200) | too many crossings beside the file (arrivals 1/2: 65.0; 1/3: 61.5) |
| CB-3 | 2026-11-14 | five north–south, three east–west (y 3, 9, 15) | 74.0 (200) | arrivals 3/4 with three start pings: 77.0 (arrivals barely matter: the ducts clog); three by five lanes: 68.5 |
| **CB-4** | 2026-11-14 | **adopted:** five north–south, four east–west (y 3, 6, 9, 15), arrivals 2/3, Dead Reckoning's bag | **49.0 (200), 49.4 (1,000)** | drive taken 99.1%, squad lost 50.6%, no time-outs, average 10.5 rounds, 0 invariant violations, 0 stalls |
| CB-4r | 2026-11-14 | the same, short-handed as a run leaves it (R-2): `--roster venn,brandt,riedel,sato` | 39.3 (300) | four Wardens take the drive 97% of games and get out 39% |

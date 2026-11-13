import type { Seat, State, View, ViewUnit } from './types'

/** E-7: the Warden view drops ping stalker counts, the bag and the RNG; the Molt view drops only the RNG. */
export function view(state: State, seat: Seat): View {
  const { rng: _rng, bag, units, ...rest } = structuredClone(state)
  void _rng
  if (seat === 'molt') return { ...rest, units, bag }
  const vu: ViewUnit[] = units.map((u) => {
    if (u.kind !== 'ping') return u
    const { stalkers: _s, ...p } = u
    void _s
    return p
  })
  return { ...rest, units: vu }
}

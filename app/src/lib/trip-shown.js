// @ts-check
// When a dive's trip is shown as a trip (task 2026-11-12-67): the logbook
// draws a trip of one dive as that dive, so such a trip is no trip for the
// diver. The detail header ("Voyage : …"), the ⋮ item "Retirer du voyage"
// and the logbook selection's "Retirer du voyage" all follow this one rule,
// whether the trip was made by hand or by the automatic grouping.

/**
 * The dive's trip when the logbook shows it as a trip (two dives or more),
 * otherwise null.
 * @template {{ id: number }} T
 * @param {{ trip?: T|null }|null|undefined} dive
 * @param {{ trip?: { id: number }|null }[]} dives every dive of the logbook
 * @returns {T|null}
 */
export function shownTrip(dive, dives) {
  const trip = dive?.trip;
  if (!trip) return null;
  let count = 0;
  for (const d of dives) if (d.trip?.id === trip.id && ++count > 1) return trip;
  return null;
}

/**
 * After a rider's Impression / Variety score is saved, the step moves to the next rider who has none (after the one just saved, wrapping round).
 * Null when everybody has a score: then Submit is what is left. A rider who did not start is never in the list.
 */
export function nextUnscored(riderIds: string[], values: Record<string, number | null | undefined>, activeId: string, justSavedId: string): string | null {
  const scored = (id: string) => id === justSavedId || (values[id] !== null && values[id] !== undefined);
  const from = riderIds.indexOf(activeId);
  for (let step = 1; step <= riderIds.length; step++) {
    const id = riderIds[(from + step + riderIds.length) % riderIds.length];
    if (!scored(id)) return id;
  }
  return null;
}

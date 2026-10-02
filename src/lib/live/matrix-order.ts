/** How the head judge's score table is ordered (Console v2 §2). `rows` come from buildMatrix in the order the attempts were logged, oldest first. */
export type TableOrder = "newest" | "rider";

/**
 * "newest": the table as logged, newest on top, so the attempt that was just scored is the first row.
 * "rider": grouped by rider, riders in the order of the heat's seats, newest first inside each rider.
 * A rider who is not in `riderOrder` (a rider who was swapped out) goes last. Nothing is added or removed, and the input is not changed.
 */
export function orderRows<R extends { riderKey: string }>(rows: R[], mode: TableOrder, riderOrder: string[]): R[] {
  const newestFirst = [...rows].reverse();
  if (mode === "newest") return newestFirst;
  const rank = (id: string) => {
    const i = riderOrder.indexOf(id);
    return i < 0 ? riderOrder.length : i;
  };
  return newestFirst
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.riderKey) - rank(b.r.riderKey) || a.i - b.i)
    .map((x) => x.r);
}

export const TABLE_ORDER_KEY = "bigair.head.tableOrder";
export const readTableOrder = (storage: Pick<Storage, "getItem"> | null): TableOrder => {
  try {
    return storage?.getItem(TABLE_ORDER_KEY) === "rider" ? "rider" : "newest";
  } catch {
    return "newest";
  }
};
export const writeTableOrder = (storage: Pick<Storage, "setItem"> | null, order: TableOrder): void => {
  try {
    storage?.setItem(TABLE_ORDER_KEY, order);
  } catch {
    // not remembered; the table still works
  }
};

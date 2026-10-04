/** Reads every row of a query the database would otherwise cut at 1000: pages of 1000 in a stable order. `page(from, to)` runs the query for that range. */
export async function fetchAll<T = Record<string, unknown>>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

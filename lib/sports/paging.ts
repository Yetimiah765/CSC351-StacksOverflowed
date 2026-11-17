// Supabase's API returns at most this many rows per request, so a query that
// can return more must be read a page at a time; past it, the rest are
// silently dropped (bugs #1015 and #1060).
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Every row of a query, fetched PAGE_ROWS at a time until a page comes back
 * short. Order the query (e.g. by its id) so its pages never overlap or skip
 * a row.
 */
export async function allRows<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

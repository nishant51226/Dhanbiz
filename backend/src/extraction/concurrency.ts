/**
 * Run async work over `items` with at most `concurrency` in flight at once.
 */
export async function runWithConcurrencyLimit<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, Math.floor(concurrency));
  if (items.length === 0) return;
  let cursor = 0;
  const runWorker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]!);
    }
  };
  const nWorkers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: nWorkers }, () => runWorker()));
}

// One cache for every read command the console re-runs on the browser's
// behalf. Two callers with different needs share it rather than stacking two
// caches on the same path:
//
//   - Ordinary read commands take the default short TTL. They only need
//     concurrent and rapid-repeat calls to collapse into one subprocess.
//   - `status` and `readiness` pass a much longer TTL. Each costs ~4s, the Home
//     panel asks for both on every mount and idle poll, and landing on Home was
//     ~4s of disabled buttons. They also need `fresh` and `invalidate`, because
//     a lifecycle action changes what they report and a stale answer there is
//     worse than a slow one.
export function createReadCommandCache({ ttlMs = 2000, maxEntries = 128, clock = Date.now } = {}) {
  const entries = new Map();
  // Bumped by invalidate(). A collect that started before the bump sampled the
  // world as it was BEFORE whatever invalidated it -- a stop, say -- so its
  // result must not be stored, or Home reports "Running" for a full TTL after
  // the battlegroup is down. In-flight callers still receive it; they asked
  // before the change too.
  let generation = 0;

  function prune(now) {
    for (const [key, entry] of entries) {
      if (!entry.promise && entry.expiresAt <= now) entries.delete(key);
    }
    if (entries.size >= maxEntries) {
      for (const [key, entry] of entries) {
        if (!entry.promise) entries.delete(key);
        if (entries.size < maxEntries) break;
      }
    }
  }

  // Returns the value alongside when it was actually collected. `sampledAtMs`
  // is the time the command ran, not the time it was read, so a cache hit keeps
  // the original -- Home dates its reading from this and would otherwise show a
  // 15s-old status as current.
  async function runStamped(key, work, options = {}) {
    const entryTtl = Number.isFinite(options.ttlMs) ? Math.max(0, options.ttlMs) : ttlMs;
    const now = clock();
    const existing = entries.get(key);

    // A fresh read skips a stored value but still joins a collect already
    // running: that collect started after the caller asked, so it is new enough,
    // and starting a second subprocess is the load this cache exists to prevent.
    if (existing?.promise) return existing.promise;
    if (!options.fresh && existing && existing.expiresAt > now) {
      return { value: existing.value, sampledAtMs: existing.sampledAtMs, fromCache: true };
    }

    prune(now);
    const collectionGeneration = generation;
    const promise = Promise.resolve().then(work).then((value) => {
      const sampledAtMs = clock();
      const stamped = { value, sampledAtMs, fromCache: false };
      if (collectionGeneration === generation && entryTtl > 0) {
        entries.set(key, { value, sampledAtMs, expiresAt: sampledAtMs + entryTtl });
      } else if (entries.get(key)?.promise === promise) {
        entries.delete(key);
      }
      return stamped;
    }).catch((error) => {
      if (entries.get(key)?.promise === promise) entries.delete(key);
      throw error;
    });
    entries.set(key, { promise, expiresAt: Number.POSITIVE_INFINITY });
    return promise;
  }

  // The original contract, unchanged: the raw command result.
  async function run(key, work, options = {}) {
    const { value } = await runStamped(key, work, options);
    return value;
  }

  // Called after anything that changes what these commands would report.
  function invalidate() {
    generation += 1;
    for (const [key, entry] of entries) {
      if (!entry.promise) entries.delete(key);
    }
  }

  return { run, runStamped, invalidate };
}

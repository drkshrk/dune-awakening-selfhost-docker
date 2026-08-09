import { mapsApi } from "../../api/maps";
import { parseSietchRows } from "./sietchRows";

// `${partitionMap}:${partitionId}` -> the operator-chosen instance name
// ("Deep Desert PvE"). Two instances of one map are identical in a base's map
// column alone, so this is what actually identifies the row.
//
// Held at module scope because the panels that read it are lazy-loaded and
// remount on every tab switch, while resolving a name shells out to the runtime
// CLI -- two docker execs per partition map. Without the cache, every visit
// respawned them.
//
// Invalidated on write, not just by the clock: renaming a sietch happens on the
// Maps tab and changes nothing the Bases panel keys on, so a remount would
// otherwise keep serving the old label with no way for the operator to force a
// refresh. The TTL is only a backstop for changes made outside this console.
const TTL_MS = 5 * 60 * 1000;

let cache: { key: string; names: Map<string, string>; at: number } | null = null;

// Callers hold a list of partition maps; the cache key must not depend on the
/**
 * Creates a stable cache key from a collection of map names.
 *
 * @param maps - Map names whose order and duplicates do not affect the key
 * @returns A comma-separated key containing the unique map names in sorted order
 */
function cacheKey(maps: string[]) {
  return [...new Set(maps)].sort().join(",");
}

// Call after any sietch mutation. Also the reset hook for tests, whose module
/**
 * Clears the cached instance names.
 */
export function invalidateInstanceNames() {
  cache = null;
}

/**
 * Retrieves cached instance names for a matching, unexpired set of maps.
 *
 * @param maps - The partition maps used to identify the cached resolution
 * @returns The cached instance names, or `null` when no matching unexpired cache entry exists
 */
export function cachedInstanceNames(maps: string[]) {
  if (!cache || cache.key !== cacheKey(maps)) return null;
  return Date.now() - cache.at < TTL_MS ? cache.names : null;
}

// Resolves every map in parallel and returns null when nothing could be read,
// so callers keep whatever fallback they already show. Failures are swallowed
// on purpose: these endpoints are absent on a console-only install, and a
/**
 * Resolves display names for partitions across the specified maps.
 *
 * @param maps - The maps whose partition names should be resolved
 * @returns A map of map-and-partition keys to display names, or `null` when no names are resolved
 */
export async function resolveInstanceNames(maps: string[]) {
  const resolved = new Map<string, string>();
  await Promise.all(maps.map(async (map) => {
    try {
      const [table, ids] = await Promise.all([
        mapsApi.sietchDimensions(map, false),
        mapsApi.sietchDimensions(map, true)
      ]);
      // A non-zero exit still answers 200 with empty stdout, so a failed command
      // is indistinguishable from a map with no sietches unless the code is
      // checked. Treat it as unreadable and keep the fallback.
      if (table.exitCode || ids.exitCode) return;
      for (const row of parseSietchRows(table.stdout || "", ids.stdout || "")) {
        // Keyed by map as well as id, and only for ids that really came from
        // the --ids output: a row that fell back to its dimension index would
        // otherwise answer for another map's partition of the same number.
        if (row.displayName && row.partitionIdFromIds) {
          resolved.set(`${map}:${row.partitionId}`, row.displayName);
        }
      }
    } catch {
      // Leave this map on its caller's fallback.
    }
  }));
  if (!resolved.size) return null;
  cache = { key: cacheKey(maps), names: resolved, at: Date.now() };
  return resolved;
}

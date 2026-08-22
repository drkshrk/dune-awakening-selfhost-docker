import { runDockerLogs } from "../runner.js";

// The Deep Desert server logs its Coriolis world seed at startup, e.g.
// "LogCoriolis: Current Coriolis World Seed: 2". This is the same signal the
// user's private dune-spice-tools toolkit parses to key its position archive
// (cor-<seed>), so re-parsing it here keeps both sides in the same identity
// space without either side needing to write a pointer for the other to read.
const SEED_LINE = /Current Coriolis World Seed:\s*(\d+)/;

// The seed line only prints once at server startup, so the tail has to reach
// back far enough to survive whatever log volume accumulates before the next
// restart. Measured on dune2's own overmap container: ~740 lines across its
// entire uptime since the last restart (a few days) -- 10k gives a wide
// margin over that without meaningfully slowing the `docker logs` call. This
// keeps a short request-level timeout instead of the runner's 30s default,
// since a hung `docker logs` shouldn't stall the whole /api/map/markers
// response for that long.
export async function resolveCurrentSeed({ tail = 10000, timeoutMs = 5000, runLogs = runDockerLogs } = {}) {
  let result;
  try {
    result = await runLogs("overmap", { tail, timeoutMs, captureOutput: true });
  } catch {
    return null;
  }
  const combined = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  let match = null;
  for (const line of combined.split(/\r?\n/)) {
    const found = line.match(SEED_LINE);
    if (found) match = found;
  }
  if (!match) return null;
  return `cor-${match[1]}`;
}

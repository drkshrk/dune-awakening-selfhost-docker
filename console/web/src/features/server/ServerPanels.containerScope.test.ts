import { describe, expect, it } from "vitest";
import { getHomeServerState, summarizeContainers, summarizeHomeStatus } from "./ServerPanels";

// status.sh prints ten container rows. Only eight are battlegroup services:
// dune-orchestrator is the control plane and is always Up (it is what starts
// and stops the others), and dune-coriolis-coordinator is optional. Every
// fixture here includes both, which is what the older fixtures leave out.
const BATTLEGROUP = [
  "dune-postgres",
  "dune-rmq-admin",
  "dune-rmq-game",
  "dune-text-router",
  "dune-director",
  "dune-server-gateway",
  "dune-server-survival-1",
  "dune-server-overmap"
];

function statusText(options: {
  overall?: string;
  battlegroup: string;
  coordinator?: string;
  orchestrator?: string;
}) {
  const rows = BATTLEGROUP.map((name) => `${name.padEnd(26)} ${options.battlegroup}`);
  rows.push(`${"dune-coriolis-coordinator".padEnd(26)} ${options.coordinator ?? "Up 30 minutes"}`);
  rows.push(`${"dune-orchestrator".padEnd(26)} ${options.orchestrator ?? "Up 32 minutes"}`);
  return [
    "=== Dune status ===",
    ...(options.overall ? [`Overall:     ${options.overall}`] : []),
    "Title:       SteelHeart",
    "",
    "=== Containers ===",
    "SERVICE                    STATUS",
    ...rows,
    "",
    "=== Listeners ===",
    "CHECK                    PORT     STATUS",
    "Postgres localhost       15432/tcp OK",
    ""
  ].join("\n");
}

// Anything that is not a "READY:" line, so readyOverride cannot mask the row.
const NOT_READY = "=== Container checks ===\nNOT READY: one or more required checks failed.";

function healthRow(status: string, readiness: string, label: string) {
  const summary = summarizeHomeStatus(status, readiness, "", false);
  const row = summary.health.find((item) => item.label === label);
  if (!row) throw new Error(`no health row for ${label}`);
  return row;
}

// The user-visible bug. The coordinator is optional --
// DUNE_CORIOLIS_COORDINATOR_ENABLED=0 deletes the container outright, and
// start-all treats a failed start as non-fatal -- so its absence is a
// configuration choice, not a fault.
describe("Containers row with the coordinator switched off", () => {
  const status = statusText({ overall: "WARMING", battlegroup: "Up 20 minutes", coordinator: "missing" });

  it("reads OK rather than blaming an optional service that is meant to be off", () => {
    const row = healthRow(status, NOT_READY, "Containers");
    expect(row.value).toBe("OK");
    expect(row.status).toBe("Ready");
  });

  // Guards the fix from being "ignore every row": a real battlegroup container
  // going down must still be reported. Asserted on the summarizer rather than
  // the rendered row, because with core containers up and readiness not READY
  // the panel is legitimately in its boot-starting state, which relabels every
  // row "Getting Ready" whatever the underlying reading.
  it("still reports a battlegroup container that is actually down", () => {
    const broken = statusText({ overall: "ISSUE", battlegroup: "Up 20 minutes", coordinator: "missing" })
      .replace(/^dune-director\s+Up 20 minutes$/m, "dune-director              exited");
    expect(broken).toMatch(/dune-director\s+exited/);
    expect(summarizeContainers(broken)).toMatchObject({ label: "Needs Review", status: "WARN" });
  });

  it("reads OK when all eight are up and only the coordinator is absent", () => {
    expect(summarizeContainers(status)).toMatchObject({ label: "OK", status: "Ready" });
  });
});

describe("getHomeServerState with the real ten-row container table", () => {
  // The assertion that pins allContainersMissing. With the whole table scanned,
  // the always-Up orchestrator row made it unreachable, and only the
  // "Overall: STOPPED" line was holding the stopped verdict up.
  it("reads a stopped battlegroup as stopped without the Overall line", () => {
    const status = statusText({ battlegroup: "missing", coordinator: "missing" });
    expect(status).not.toMatch(/Overall:/);
    expect(getHomeServerState(status, "").stopped).toBe(true);
  });

  it("still reads it as stopped with the Overall line present", () => {
    const status = statusText({ overall: "STOPPED", battlegroup: "missing", coordinator: "missing" });
    expect(getHomeServerState(status, "").stopped).toBe(true);
  });

  // isHomeBootStarting returns early once it sees the eight are all down, which
  // stops a stale WARMING reading from being taken as "still booting" -- and
  // bootStarting suppresses the stopped verdict entirely. Counting the always-Up
  // orchestrator defeated that early return, so this reported not-stopped.
  it("is not booting when the eight are down, whatever the Overall line claims", () => {
    const status = statusText({ overall: "WARMING", battlegroup: "missing", coordinator: "missing" });
    expect(getHomeServerState(status, "").stopped).toBe(true);
  });

  // A crash-looping container is neither Up nor down, so the count of downed
  // battlegroup containers stops one short of the eight. Counting the absent
  // coordinator made up the difference and tripped the "everything is down, not
  // booting" early return on a battlegroup that is in fact still coming up.
  it("does not let an absent coordinator complete the count of downed containers", () => {
    const status = statusText({ overall: "WARMING", battlegroup: "missing", coordinator: "missing" })
      .replace(/^dune-postgres\s+missing$/m, "dune-postgres              Restarting (1) 5 seconds ago");
    expect(status).toMatch(/dune-postgres\s+Restarting/);
    expect(getHomeServerState(status, "").starting).toBe(true);
  });

  // The other direction: the orchestrator being Up is not evidence that the
  // battlegroup is up, and the eight being Up must not read as stopped.
  it("does not call a running battlegroup stopped when the coordinator is absent", () => {
    const status = statusText({ overall: "READY", battlegroup: "Up 20 minutes", coordinator: "missing" });
    const state = getHomeServerState(status, "READY: all checks passed");
    expect(state.stopped).toBe(false);
    expect(state.running).toBe(true);
  });
});

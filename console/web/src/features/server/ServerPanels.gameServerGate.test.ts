import { describe, expect, it } from "vitest";
import { GAME_SERVER_WARMUP_GRACE_MS, isHomeActionComplete, isHomeStartComplete } from "./ServerPanels";

// Real dune2 output captured 2026-08-31, trimmed to the sections
// summarizeHomeStatus reads. Only the Game servers STATE column varies.
function statusWith(survival: string, overmap: string) {
  return [
    "=== Dune status ===",
    "Overall:     READY",
    "Title:       Example Sietch",
    "Population:  0/120",
    "",
    "=== Containers ===",
    "SERVICE                    STATUS",
    ...[
      "dune-postgres",
      "dune-rmq-admin",
      "dune-rmq-game",
      "dune-text-router",
      "dune-director",
      "dune-server-gateway",
      "dune-server-survival-1",
      "dune-server-overmap",
      "dune-coriolis-coordinator",
      "dune-orchestrator"
    ].map((name) => `${name.padEnd(26)} Up 15 hours`),
    "",
    "=== Listeners ===",
    "CHECK                    PORT     STATUS",
    "Postgres localhost       15432/tcp OK",
    "Director                 11717/tcp OK",
    "",
    "=== Database ===",
    "World partitions: 32",
    "",
    "=== Game servers ===",
    "MAP          STATE        UPTIME",
    `Survival_1   ${survival.padEnd(12)} Up 7 minutes`,
    `Overmap      ${overmap.padEnd(12)} Up 7 minutes`,
    "",
    "=== RabbitMQ game connections ===",
    "RabbitMQ connection details: Checked by readiness",
    "",
    "=== Funcom/FLS summary ===",
    "Director heartbeat:       OK",
    "Population declaration:   OK",
    "Max capacity declaration: OK",
    "Gateway DB monitoring:    OK",
    ""
  ].join("\n");
}

const READINESS = [
  "OK container dune-postgres",
  "OK container dune-rmq-admin",
  "OK container dune-rmq-game",
  "OK container dune-text-router",
  "OK container dune-director",
  "OK container dune-server-gateway",
  "OK container dune-server-survival-1",
  "OK container dune-server-overmap",
  "OK world_partition rows: 32",
  "OK game server sg.* RMQ connections",
  "READY: all checks passed"
].join("\n");

const ALL_READY = statusWith("READY", "READY");
const ONE_WARMING = statusWith("WARMING", "READY");

describe("game servers gate a completed start", () => {
  it("completes immediately once every map is READY", () => {
    expect(isHomeActionComplete(ALL_READY, READINESS, 0)).toBe(true);
  });

  // The bug this closes: containers up and readiness operational, but a map
  // still warming. Readiness only proves the map's container is up, so it must
  // not stand in for the map being playable.
  it("does not complete while a map is still warming", () => {
    expect(isHomeActionComplete(ONE_WARMING, READINESS, 0)).toBe(false);
  });

  it("still does not complete just before the grace window expires", () => {
    expect(isHomeActionComplete(ONE_WARMING, READINESS, GAME_SERVER_WARMUP_GRACE_MS - 1)).toBe(false);
  });

  // The backstop. A map stuck WARMING must not pin the console in "Starting"
  // with its controls disabled forever.
  it("completes once the grace window has passed, even with a map warming", () => {
    expect(isHomeActionComplete(ONE_WARMING, READINESS, GAME_SERVER_WARMUP_GRACE_MS)).toBe(true);
  });

  // Callers with no notion of elapsed time (the Funcom token poll) must keep
  // their previous, lenient behaviour rather than being blocked indefinitely.
  it("stays lenient for callers that pass no elapsed time", () => {
    expect(isHomeActionComplete(ONE_WARMING, READINESS)).toBe(true);
  });

  // A map that has failed outright reports NOT RUNNING, not WARMING, so it
  // takes the WARN path instead of waiting out the grace window.
  it("does not hold the grace window open for a map that failed outright", () => {
    const failed = statusWith("NOT RUNNING", "READY");
    expect(isHomeActionComplete(failed, READINESS, 0)).toBe(true);
  });
});

// isHomeActionComplete ORs several independent signals, so it cannot pin this
// on its own -- dropping the maps back out of isHomeStartComplete leaves every
// isHomeActionComplete assertion passing. Asserted directly for that reason.
describe("isHomeStartComplete counts the maps", () => {
  it("is complete when every map is READY", () => {
    expect(isHomeStartComplete(ALL_READY, READINESS)).toBe(true);
  });

  it("is not complete while a map is still warming", () => {
    expect(isHomeStartComplete(ONE_WARMING, READINESS)).toBe(false);
  });

  it("is not complete when a map is not running at all", () => {
    expect(isHomeStartComplete(statusWith("NOT RUNNING", "READY"), READINESS)).toBe(false);
  });
});

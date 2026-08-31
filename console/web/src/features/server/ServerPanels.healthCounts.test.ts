import { describe, expect, it } from "vitest";
import { HOME_SUBSYSTEM_ROUTES, summarizeHomeStatus } from "./ServerPanels";

// Shaped after real dune2 output, 2026-08-31.
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

const MAPS: Array<[string, string]> = [
  ["Survival_1", "READY"],
  ["Survival_1#60", "READY"],
  ["Overmap", "READY"],
  ["SH_Arrakeen", "READY"],
  ["SH_HarkoVillage", "READY"],
  ["DeepDesert_1", "READY"],
  ["DeepDesert_1#59", "READY"]
];

function statusText(options: { downContainers?: number; maps?: Array<[string, string]>; badListeners?: number; flsWait?: number } = {}) {
  const down = options.downContainers ?? 0;
  const maps = options.maps ?? MAPS;
  const badListeners = options.badListeners ?? 0;
  const flsWait = options.flsWait ?? 0;
  const listeners = ["Postgres localhost       15432/tcp", "Director                 11717/tcp", "TextRouter               5059/tcp", "RabbitMQ game            31982/tcp"];
  const fls = ["Director heartbeat:      ", "Population declaration:  ", "Max capacity declaration:", "Gateway DB monitoring:   "];
  return [
    "=== Dune status ===",
    "Overall:     READY",
    "Title:       Example Sietch",
    "",
    "=== Containers ===",
    "SERVICE                    STATUS",
    ...BATTLEGROUP.map((name, i) => `${name.padEnd(26)} ${i < down ? "missing" : "Up 15 hours"}`),
    `${"dune-coriolis-coordinator".padEnd(26)} Up 15 hours`,
    `${"dune-orchestrator".padEnd(26)} Up 15 hours`,
    "",
    "=== Listeners ===",
    "CHECK                    PORT     STATUS",
    ...listeners.map((line, i) => `${line} ${i < badListeners ? "MISSING" : "OK"}`),
    "",
    "=== Database ===",
    "World partitions: 32",
    "",
    "=== Game servers ===",
    "MAP                      STATE         UPTIME",
    ...maps.map(([label, state]) => `${label.padEnd(24)} ${state.padEnd(13)} ${state === "READY" ? "Up 5 hours" : "Up 9 seconds"}`),
    `Note: ${maps.length} always-on map servers expected, starting 2 at a time.`,
    "",
    "=== RabbitMQ game connections ===",
    "RabbitMQ connection details: Checked by readiness",
    "",
    "=== Funcom/FLS summary ===",
    ...fls.map((line, i) => `${line} ${i < flsWait ? "WAIT" : "OK"}`),
    ""
  ].join("\n");
}

const READY_READINESS = [
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

function counts(status: string, readiness = READY_READINESS, runningAction: "start" | "stop" | "restart" | "" = "") {
  const summary = summarizeHomeStatus(status, readiness, "", false, runningAction);
  return Object.fromEntries(summary.health.map((item) => [item.label, item.detail]));
}

function values(status: string, readiness = READY_READINESS, runningAction: "start" | "stop" | "restart" | "" = "") {
  const summary = summarizeHomeStatus(status, readiness, "", false, runningAction);
  return Object.fromEntries(summary.health.map((item) => [item.label, item.value]));
}

describe("Readiness & Health rows carry an x-of-y count", () => {
  it("counts a fully healthy battlegroup", () => {
    expect(counts(statusText())).toMatchObject({
      Containers: "8 of 8",
      Listeners: "4 of 4",
      "Game Servers": "7 of 7",
      RabbitMQ: "2 of 2",
      "Funcom/FLS": "4 of 4"
    });
  });

  // The denominator is the expected eight, not the printed rows. A container
  // with no row at all is missing, and counting printed rows would report
  // "7 of 7" for exactly that case.
  it("keeps the container denominator at eight when rows are missing", () => {
    const missing = statusText().replace(/^dune-postgres.*$/m, "");
    expect(counts(missing).Containers).toBe("7 of 8");
  });

  it("counts a partially down battlegroup", () => {
    expect(counts(statusText({ downContainers: 2 })).Containers).toBe("6 of 8");
    expect(counts(statusText({ badListeners: 1 })).Listeners).toBe("3 of 4");
    expect(counts(statusText({ flsWait: 2 }))["Funcom/FLS"]).toBe("2 of 4");
  });

  // RabbitMQ is two brokers. The connections section only ever speaks about the
  // game broker, so the count is taken from the container table, which lists
  // both -- otherwise a downed admin broker is invisible here.
  it("counts both RabbitMQ brokers", () => {
    expect(counts(statusText()).RabbitMQ).toBe("2 of 2");
    // dune-rmq-admin is the second battlegroup container.
    expect(counts(statusText({ downContainers: 2 })).RabbitMQ).toBe("1 of 2");
    expect(counts(statusText({ downContainers: 3 })).RabbitMQ).toBe("0 of 2");
  });

  it("leaves RabbitMQ blank when there is no container table to read", () => {
    const noContainers = statusText().replace(/=== Containers ===[\s\S]*?\n\n/, "");
    expect(counts(noContainers).RabbitMQ).toBe("");
  });

  it("counts only the maps that are actually READY", () => {
    const warming: Array<[string, string]> = [
      ["Survival_1", "READY"],
      ["Survival_1#60", "READY"],
      ["Overmap", "READY"],
      ["SH_Arrakeen", "WARMING"],
      ["SH_HarkoVillage", "WAIT"],
      ["DeepDesert_1", "WARMING"],
      ["DeepDesert_1#59", "WARMING"]
    ];
    expect(counts(statusText({ maps: warming }))["Game Servers"]).toBe("3 of 7");
  });

  // The partition count is a property of the world, not a measure of how much
  // of this subsystem is ready, so the Database row carries nothing.
  it("shows nothing on the Database row", () => {
    expect(counts(statusText()).Database).toBe("");
  });

  // Funcom/FLS is the last section status.sh prints, so sectionLines runs to
  // end of output and takes the trailing tips with it. Counting those made a
  // healthy dune2 read "4 of 6". One of the real tips contains the word "fail",
  // so this also guards the failure check that has only ever passed by luck.
  it("does not count the trailing tips as FLS checks", () => {
    const withTips = [
      statusText(),
      "Tip: use 'dune ready' for pass/wait/fail readiness checks.",
      "Tip: use 'dune doctor' for troubleshooting suggestions."
    ].join("\n");
    expect(counts(withTips)["Funcom/FLS"]).toBe("4 of 4");
    expect(values(withTips)["Funcom/FLS"]).toBe("OK");
  });
});

// The counts are taken from the raw reading rather than the display override.
// readyOverride and transitionHomeHealthCard both carry an empty detail, so
// reading the count off them would blank it in the two states it matters most.
describe("counts survive the display overrides", () => {
  it("survives readyOverride on a healthy battlegroup", () => {
    // readyOverride is what rewrites every row to a bare "OK".
    expect(values(statusText())["Game Servers"]).toBe("OK");
    expect(counts(statusText())["Game Servers"]).toBe("7 of 7");
  });

  it("survives the transitional override mid-start", () => {
    const warming: Array<[string, string]> = MAPS.map(([label], i) =>
      [label, i < 3 ? "READY" : "WARMING"] as [string, string]
    );
    const status = statusText({ downContainers: 2, maps: warming });
    const readiness = "=== Container checks ===\nWARN container dune-director\nNOT READY: still starting";
    // The row itself reads "Getting Ready" -- the count is the only thing
    // telling an operator how far along the start actually is.
    expect(values(status, readiness, "start").Containers).toBe("Getting Ready");
    expect(counts(status, readiness, "start")).toMatchObject({
      Containers: "6 of 8",
      "Game Servers": "3 of 7"
    });
  });

  it("survives the stopped override", () => {
    const stopped = statusText({ downContainers: 8, maps: MAPS.map(([l]) => [l, "NOT RUNNING"] as [string, string]) })
      .replace("Overall:     READY", "Overall:     STOPPED");
    expect(counts(stopped, "")).toMatchObject({
      Containers: "0 of 8",
      "Game Servers": "0 of 7",
      RabbitMQ: "0 of 2",
      Database: ""
    });
  });
});

// summarizeHomeStatus is a view model AND the restart lifecycle's input.
// isHomeActionComplete matches value against /^OK$/, so the count had to go in
// detail; putting it in value would break start/restart completion detection.
describe("the count does not disturb the lifecycle contract", () => {
  it("leaves a healthy row's value as the bare OK", () => {
    for (const [label, value] of Object.entries(values(statusText()))) {
      expect(value, `${label} value`).toBe("OK");
    }
  });
});

// Every lookup keys on the row id, never the label. The label is display text
// and is expected to change; keying on it fails SILENTLY -- the route lookup
// fails closed so the row just stops being clickable, and
// isHomeActionComplete's find returns undefined so the warming-map path is
// permanently disabled with nothing failing.
describe("health rows are addressed by a stable id", () => {
  const rows = () => summarizeHomeStatus(statusText(), READY_READINESS, "", false).health;

  it("gives every row an id", () => {
    for (const row of rows()) expect(row.id, `${row.label} id`).toMatch(/^[a-z][a-z-]*$/);
  });

  it("uses ids that are unique", () => {
    const ids = rows().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Catches a new row added without a route, and an id renamed on one side
  // only -- both of which would otherwise only show up as a button count.
  it("has a route for every row id", () => {
    for (const row of rows()) {
      expect(Object.hasOwn(HOME_SUBSYSTEM_ROUTES, row.id), `no route for id "${row.id}" (${row.label})`).toBe(true);
    }
  });

  it("routes nothing that is not a row id", () => {
    const ids = new Set(rows().map((r) => r.id));
    for (const key of Object.keys(HOME_SUBSYSTEM_ROUTES)) {
      expect(ids.has(key), `route "${key}" matches no row`).toBe(true);
    }
  });
});

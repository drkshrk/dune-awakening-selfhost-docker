import test from "node:test";
import assert from "node:assert/strict";
import { buildDuneArgs, isReadOnlySql, validateServiceName } from "../src/runner.js";
import { redact } from "../src/redact.js";

test("validates known service names and aliases", () => {
  assert.equal(validateServiceName("gateway"), "gateway");
  assert.equal(validateServiceName("sgw"), "gateway");
  assert.equal(validateServiceName("dune-server-survival-1-43"), "dune-server-survival-1-43");
  assert.throws(() => validateServiceName("gateway; rm -rf /"));
});

test("builds allowlisted command arguments without shell interpolation", () => {
  assert.deepEqual(buildDuneArgs("status"), ["status"]);
  assert.deepEqual(buildDuneArgs("restartService", { service: "director" }), ["restart", "director"]);
  assert.deepEqual(buildDuneArgs("adminAddXp", { playerId: "FLS_TEST", amount: 1000 }), ["admin", "award-xp", "FLS_TEST", "1000"]);
  assert.deepEqual(buildDuneArgs("updateApply"), ["update", "--yes"]);
  assert.deepEqual(buildDuneArgs("selfUpdateApply"), ["self-update", "install", "latest"]);
  assert.deepEqual(buildDuneArgs("adminTeleport", { playerId: "FLS_TEST", x: 1, y: 2, z: 3, yaw: 90 }), ["admin", "teleport", "FLS_TEST", "1", "2", "3", "90"]);
  assert.throws(() => buildDuneArgs("adminAddXp", { playerId: "bad;id", amount: 1000 }));
  assert.throws(() => buildDuneArgs("backupRestore", { backup: "../dump.backup" }));
  assert.throws(() => buildDuneArgs("adminGiveItem", { playerId: "FLS_TEST", itemName: "", quantity: 1 }));
  assert.throws(() => buildDuneArgs("unknown"));
});

test("detects read-only SQL and requires explicit destructive allowance", () => {
  assert.equal(isReadOnlySql("select * from dune.player_state"), true);
  assert.equal(isReadOnlySql("with x as (select 1) select * from x"), true);
  assert.equal(isReadOnlySql("update dune.player_state set character_name = 'x'"), false);
  assert.deepEqual(buildDuneArgs("databaseQuery", { query: "select 1" }), ["database", "sql", "select 1"]);
  assert.throws(() => buildDuneArgs("databaseQuery", { query: "delete from dune.player_state" }));
  assert.deepEqual(buildDuneArgs("databaseQuery", { query: "delete from dune.player_state", allowDestructive: true }), ["database", "sql", "delete from dune.player_state"]);
  assert.throws(() => buildDuneArgs("databaseExport", { query: "delete from dune.player_state" }));
});

test("redacts token-like sensitive values", () => {
  const jwt = "eyJaaaaaaaaaaaaaaaaaaaaaaaa.eyJbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccc";
  const text = `ServiceAuthToken=secret ${jwt} password: hunter2 runtime/secrets/funcom-token.txt`;
  const output = redact(text);
  assert.match(output, /<redacted>/);
  assert.doesNotMatch(output, /hunter2/);
  assert.doesNotMatch(output, /eyJaaaaaaaa/);
});

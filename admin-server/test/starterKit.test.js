import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { enableStarterKit, grantEligibleStarterKits, grantStarterKit, runStarterKitAutoScan, saveStarterKitConfig, starterKitCapabilities, starterKitConfig, starterKitEligiblePlayers, validateStarterKitConfig } from "../src/starterKit.js";

test("starter kit is disabled by default and reports manual capability", () => {
  const config = tempConfig();
  try {
    assert.equal(starterKitConfig(config).enabled, false);
    const caps = starterKitCapabilities();
    assert.equal(caps.manualGrant, true);
    assert.equal(caps.bulkGrant, true);
    assert.equal(caps.automaticScanner, true);
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

test("starter kit config validation rejects unsafe items and bounds", () => {
  assert.deepEqual(validateStarterKitConfig({
    enabled: false,
    version: "starter-kit-v1",
    items: [{ itemName: "Water", quantity: 2, durability: 1 }],
    xp: 100
  }).items[0], { itemName: "Water", itemId: "", quantity: 2, durability: 1 });
  assert.equal(validateStarterKitConfig({ autoGrantEnabled: true, autoGrantIntervalSeconds: 60, grantWhen: "first_online" }).grantWhen, "first_online");
  assert.throws(() => validateStarterKitConfig({ version: "bad version with spaces" }), /Invalid Starter Kit version/);
  assert.throws(() => validateStarterKitConfig({ items: [{ itemName: "Bad\nName" }] }), /Invalid Starter Kit item name/);
  assert.throws(() => validateStarterKitConfig({ xp: -1 }), /xp/);
  assert.throws(() => validateStarterKitConfig({ autoGrantIntervalSeconds: 59 }), /autoGrantIntervalSeconds/);
  assert.throws(() => validateStarterKitConfig({ grantWhen: "always" }), /grantWhen/);
});

test("starter kit config writes and enable disable stay file-backed", () => {
  const config = tempConfig();
  try {
    const saved = saveStarterKitConfig(config, {
      enabled: false,
      version: "starter-kit-v2",
      items: [{ itemId: "WaterBottle_1", quantity: 1, durability: 1 }],
      xp: 10
    });
    assert.equal(saved.version, "starter-kit-v2");
    assert.equal(starterKitConfig(config).items[0].itemId, "WaterBottle_1");
    assert.equal(enableStarterKit(config, true).enabled, true);
    assert.equal(enableStarterKit(config, false).enabled, false);
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

test("starter kit eligibility skips missing action ids and already granted players", async () => {
  const config = tempConfig();
  try {
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [] });
    const granted = await grantStarterKit(config, "RedBlink#75570", { confirmation: "GRANT STARTER KIT" });
    assert.equal(granted.status, "granted");
    const result = starterKitEligiblePlayers(config, [
      { actor_id: 82, character_name: "RedBlink", action_player_id: "RedBlink#75570", online_status: "Online" },
      { actor_id: 83, character_name: "NoId", action_player_id: "", online_status: "Online" },
      { actor_id: 84, character_name: "New", action_player_id: "New#1", online_status: "Offline" }
    ]);
    assert.equal(result.rows.find((row) => row.character_name === "RedBlink").eligible, false);
    assert.match(result.rows.find((row) => row.character_name === "RedBlink").reason, /Already granted/);
    assert.equal(result.rows.find((row) => row.character_name === "NoId").eligible, false);
    assert.equal(result.rows.find((row) => row.character_name === "New").eligible, true);
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

test("starter kit repeat grants respect allowRepeatGrants", async () => {
  const config = tempConfig();
  try {
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [], allowRepeatGrants: false });
    await grantStarterKit(config, "RedBlink#75570", { confirmation: "GRANT STARTER KIT" });
    await assert.rejects(() => grantStarterKit(config, "RedBlink#75570", { confirmation: "GRANT STARTER KIT" }), /already granted/);
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [], allowRepeatGrants: true });
    const repeat = await grantStarterKit(config, "RedBlink#75570", { confirmation: "GRANT STARTER KIT" });
    assert.equal(repeat.status, "granted");
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

test("starter kit bulk grant returns per-player granted skipped and failed rows", async () => {
  const config = tempConfig();
  try {
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [] });
    await grantStarterKit(config, "Existing#1", { confirmation: "GRANT STARTER KIT" });
    const result = await grantEligibleStarterKits(config, [
      { actor_id: 1, character_name: "Existing", action_player_id: "Existing#1", online_status: "Online" },
      { actor_id: 2, character_name: "Missing", action_player_id: "", online_status: "Online" },
      { actor_id: 3, character_name: "New", action_player_id: "New#1", online_status: "Online" }
    ], { confirmation: "GRANT STARTER KIT TO ELIGIBLE PLAYERS" });
    assert.equal(result.granted, 1);
    assert.equal(result.skipped, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.results.find((row) => row.character_name === "New").playerId, "New#1");
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

test("starter kit auto scan only grants when enabled and players have action ids", async () => {
  const config = tempConfig();
  try {
    saveStarterKitConfig(config, { enabled: false, version: "starter-kit-v1", xp: 10, items: [], autoGrantEnabled: true });
    assert.equal((await runStarterKitAutoScan(config, [{ actor_id: 1, action_player_id: "A#1" }])).skipped, true);
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [], autoGrantEnabled: false });
    assert.equal((await runStarterKitAutoScan(config, [{ actor_id: 1, action_player_id: "A#1" }])).skipped, true);
    saveStarterKitConfig(config, { enabled: true, version: "starter-kit-v1", xp: 10, items: [], autoGrantEnabled: true });
    const result = await runStarterKitAutoScan(config, [
      { actor_id: 1, character_name: "A", action_player_id: "A#1", online_status: "Online" },
      { actor_id: 2, character_name: "B", action_player_id: "", online_status: "Online" }
    ]);
    assert.equal(result.granted, 1);
    const duplicate = await runStarterKitAutoScan(config, [{ actor_id: 1, character_name: "A", action_player_id: "A#1", online_status: "Online" }]);
    assert.equal(duplicate.granted, 0);
  } finally {
    rmSync(config.repoRoot, { recursive: true, force: true });
  }
});

function tempConfig() {
  const repoRoot = mkdtempSync(join(tmpdir(), "starter-kit-test-"));
  return {
    repoRoot,
    generatedDir: resolve(repoRoot, "runtime/generated"),
    mockMode: true
  };
}

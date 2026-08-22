import test from "node:test";
import assert from "node:assert/strict";
import { resolveCurrentSeed } from "../src/services/coriolisSeed.js";

test("resolveCurrentSeed parses the Coriolis world seed from log output", async () => {
  const runLogs = async () => ({ stdout: "LogCoriolis: Current Coriolis World Seed: 2\n", stderr: "" });
  assert.equal(await resolveCurrentSeed({ runLogs }), "cor-2");
});

test("resolveCurrentSeed uses the last matching line when several are present", async () => {
  const runLogs = async () => ({
    stdout: "Current Coriolis World Seed: 1\nsome other log line\nCurrent Coriolis World Seed: 5\n",
    stderr: ""
  });
  assert.equal(await resolveCurrentSeed({ runLogs }), "cor-5");
});

test("resolveCurrentSeed returns null when the container isn't running", async () => {
  const runLogs = async () => { throw new Error("docker logs failed with exit 1"); };
  assert.equal(await resolveCurrentSeed({ runLogs }), null);
});

test("resolveCurrentSeed returns null when the line isn't in the tailed window", async () => {
  const runLogs = async () => ({ stdout: "some unrelated log line\n", stderr: "" });
  assert.equal(await resolveCurrentSeed({ runLogs }), null);
});

test("resolveCurrentSeed passes a wide tail and a short timeout so a hung docker call can't stall the request", async () => {
  let seenOptions = null;
  const runLogs = async (service, options) => {
    seenOptions = options;
    return { stdout: "Current Coriolis World Seed: 3\n", stderr: "" };
  };
  await resolveCurrentSeed({ runLogs });
  assert.equal(seenOptions.tail, 10000);
  assert.equal(seenOptions.timeoutMs, 5000);
});

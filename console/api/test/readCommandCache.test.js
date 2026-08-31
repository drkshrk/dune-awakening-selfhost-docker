import test from "node:test";
import assert from "node:assert/strict";
import { createReadCommandCache } from "../src/services/readCommandCache.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("concurrent readers share one in-flight command and its result", async () => {
  const gate = deferred();
  const cache = createReadCommandCache();
  let runs = 0;
  const work = () => { runs += 1; return gate.promise; };

  const readers = [cache.run("ready", work), cache.run("ready", work), cache.run("ready", work)];
  gate.resolve({ stdout: "READY" });

  assert.deepEqual(await Promise.all(readers), [
    { stdout: "READY" },
    { stdout: "READY" },
    { stdout: "READY" }
  ]);
  assert.equal(runs, 1);
});

test("a short-lived result cache absorbs sequential browser refreshes", async () => {
  let now = 1000;
  let runs = 0;
  const cache = createReadCommandCache({ ttlMs: 2000, clock: () => now });
  const work = async () => ({ run: ++runs });

  assert.deepEqual(await cache.run("status", work), { run: 1 });
  now = 2999;
  assert.deepEqual(await cache.run("status", work), { run: 1 });
  now = 3000;
  assert.deepEqual(await cache.run("status", work), { run: 2 });
});

test("different command arguments never share a result", async () => {
  const cache = createReadCommandCache();
  let runs = 0;
  const work = async () => ++runs;

  assert.equal(await cache.run('["maps","one"]', work), 1);
  assert.equal(await cache.run('["maps","two"]', work), 2);
});

test("failed commands are not cached and can be retried", async () => {
  const cache = createReadCommandCache();
  let runs = 0;

  await assert.rejects(() => cache.run("ready", async () => {
    runs += 1;
    throw new Error("Docker is busy");
  }), /Docker is busy/);

  assert.equal(await cache.run("ready", async () => ++runs), 2);
});


// The behaviours below came from a second, separate cache that used to sit in
// front of `status` and `readiness`. Folding those two onto this cache is what
// removed the double-caching -- readiness was cached here AND there, so a
// `?fresh=1` read could still be served a stale inner entry. They are pinned
// here so the merge cannot quietly lose them.

function clockFrom(start = 1_000) {
  let current = start;
  return { now: () => current, tick(ms) { current += ms; } };
}

test("a per-call TTL overrides the default", async () => {
  const clock = clockFrom();
  const cache = createReadCommandCache({ ttlMs: 2_000, clock: clock.now });
  let runs = 0;
  const work = async () => ++runs;

  assert.equal(await cache.run("status", work, { ttlMs: 15_000 }), 1);
  clock.tick(5_000);
  // Past the 2s default, inside the 15s override.
  assert.equal(await cache.run("status", work, { ttlMs: 15_000 }), 1);
  assert.equal(runs, 1);

  clock.tick(11_000);
  assert.equal(await cache.run("status", work, { ttlMs: 15_000 }), 2);
});

test("fresh bypasses a stored entry", async () => {
  const clock = clockFrom();
  const cache = createReadCommandCache({ ttlMs: 60_000, clock: clock.now });
  let runs = 0;
  const work = async () => ++runs;

  assert.equal(await cache.run("status", work), 1);
  assert.equal(await cache.run("status", work), 1);
  assert.equal(await cache.run("status", work, { fresh: true }), 2);
});

test("a fresh read still joins a collect already in flight", async () => {
  const cache = createReadCommandCache({ ttlMs: 60_000 });
  const gate = deferred();
  let runs = 0;
  const work = async () => { runs += 1; await gate.promise; return runs; };

  const first = cache.run("status", work);
  const second = cache.run("status", work, { fresh: true });
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  // The point: a fresh read must not start a second ~4s subprocess on top of
  // one that already began after the caller asked.
  assert.equal(runs, 1);
});

test("invalidate forces the next read to re-run", async () => {
  const clock = clockFrom();
  const cache = createReadCommandCache({ ttlMs: 60_000, clock: clock.now });
  let runs = 0;
  const work = async () => ++runs;

  assert.equal(await cache.run("status", work), 1);
  cache.invalidate();
  assert.equal(await cache.run("status", work), 2);
});

test("invalidate discards a collect that started before it", async () => {
  const cache = createReadCommandCache({ ttlMs: 60_000 });
  const gate = deferred();
  let runs = 0;
  const work = async () => { runs += 1; await gate.promise; return runs; };

  const inFlight = cache.run("status", work);
  // A stop lands while the status collect is still running: that collect
  // sampled the world before the stop, so storing it would report "Running"
  // for a full TTL afterwards.
  cache.invalidate();
  gate.resolve();
  assert.equal(await inFlight, 1);

  assert.equal(await cache.run("status", async () => ++runs), 2);
});

test("a zero TTL disables caching entirely", async () => {
  const cache = createReadCommandCache({ ttlMs: 60_000 });
  let runs = 0;
  const work = async () => ++runs;

  assert.equal(await cache.run("status", work, { ttlMs: 0 }), 1);
  assert.equal(await cache.run("status", work, { ttlMs: 0 }), 2);
});

test("sampledAt is when the command ran, not when the cache was read", async () => {
  const clock = clockFrom();
  const cache = createReadCommandCache({ ttlMs: 60_000, clock: clock.now });

  const first = await cache.runStamped("status", async () => "out");
  assert.equal(first.fromCache, false);

  clock.tick(9_000);
  const second = await cache.runStamped("status", async () => "other");
  assert.equal(second.value, "out");
  assert.equal(second.fromCache, true);
  // Home dates its reading from this; taking the read time would show a
  // nine-second-old status as current.
  assert.equal(second.sampledAtMs, first.sampledAtMs);
});

test("different commands cache independently", async () => {
  const cache = createReadCommandCache({ ttlMs: 60_000 });
  let status = 0;
  let readiness = 0;

  assert.equal(await cache.run("status", async () => ++status), 1);
  assert.equal(await cache.run("readiness", async () => ++readiness), 1);
  assert.equal(await cache.run("status", async () => ++status), 1);
  assert.equal(status, 1);
  assert.equal(readiness, 1);
});

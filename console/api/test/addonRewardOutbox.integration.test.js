// The scheduled reward reader executes addon-written SQL (the outbox view) on
// a timer with nobody watching. These tests run hostile views against a real
// Postgres to prove the database, not the reader's own checks, stops them.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db.js";
import { readOutboxRows } from "../src/addonRewardOutbox.js";

const HOST = process.env.DUNE_DB_HOST || "";
const skip = HOST ? false : "no DUNE_DB_HOST — needs the containerised Postgres";

const db = HOST
  ? createDb({
      host: HOST,
      port: Number(process.env.DUNE_DB_PORT || 5432),
      database: process.env.DUNE_DB_NAME || "dune",
      user: process.env.DUNE_DB_USER || "dune",
      password: process.env.DUNE_DB_PASSWORD || "dune"
    })
  : null;

const SCHEMA = "rwdoutbox_it";
const COLUMNS = `id::bigint, ('r:' || id)::text as request_id, '9001'::text as player_id, 'item'::text as reward_type,
                 'IronOre'::text as item_id, 5 as amount, 0 as quality`;

test("scheduled reward reader against real Postgres", { skip }, async (t) => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.query(`create schema ${SCHEMA}`);
  await db.query(`create table ${SCHEMA}.queue (id bigint primary key, created_at timestamptz not null)`);
  await db.query(`insert into ${SCHEMA}.queue values (1, now() - interval '5 minutes'), (2, now() - interval '5 minutes'), (3, now())`);
  await db.query(`create table ${SCHEMA}.victim (id int primary key, amount bigint)`);
  await db.query(`insert into ${SCHEMA}.victim values (1, 100)`);
  // The shape a mutation would take: a writing function called from a SELECT.
  await db.query(`
    create function ${SCHEMA}.pay_out() returns int language sql volatile as $$
      update ${SCHEMA}.victim set amount = amount + 1000 where id = 1 returning 1;
    $$`);
  const victimAmount = async () => Number((await db.query(`select amount from ${SCHEMA}.victim where id = 1`)).rows[0].amount);

  t.after(async () => {
    await db.query(`drop schema if exists ${SCHEMA} cascade`);
    await db.close?.();
  });

  await t.test("a well-formed view returns rows past the watermark that are at least a minute old", async () => {
    await db.query(`create or replace view ${SCHEMA}.outbox as select ${COLUMNS}, created_at from ${SCHEMA}.queue`);
    const rows = await readOutboxRows(db, { schema: SCHEMA, view: "outbox" }, "0", 10);
    assert.deepEqual(rows.map((r) => r.id), ["1", "2"], "row 3 is too new");
    assert.deepEqual((await readOutboxRows(db, { schema: SCHEMA, view: "outbox" }, "1", 10)).map((r) => r.id), ["2"]);
    assert.equal(rows[0].request_id, "r:1");
    assert.equal(rows[0].amount, "5");
  });

  await t.test("a view that writes is refused by Postgres and changes nothing", async () => {
    await db.query(`create or replace view ${SCHEMA}.evil_outbox as select ${COLUMNS}, created_at, ${SCHEMA}.pay_out() as payload from ${SCHEMA}.queue`);
    const before = await victimAmount();
    await assert.rejects(readOutboxRows(db, { schema: SCHEMA, view: "evil_outbox" }, "0", 10), /read-only transaction/);
    assert.equal(await victimAmount(), before);
  });

  await t.test("a view that stalls is cancelled by the statement timeout", async () => {
    await db.query(`create or replace view ${SCHEMA}.slow_outbox as select ${COLUMNS}, created_at from ${SCHEMA}.queue where pg_sleep(30) is not null`);
    const started = Date.now();
    await assert.rejects(readOutboxRows(db, { schema: SCHEMA, view: "slow_outbox" }, "0", 10), /statement timeout/);
    assert.ok(Date.now() - started < 15_000, "the reader must give up long before the stalled query finishes");
  });

  await t.test("the pool connection is clean afterwards", async () => {
    // A failed read must not leave the pooled connection read-only or with
    // a changed search_path for the next console query.
    await db.query(`update ${SCHEMA}.victim set amount = amount where id = 1`);
    const path = (await db.query("show search_path")).rows[0].search_path;
    assert.doesNotMatch(path, /^pg_catalog, pg_temp$/);
  });

  await t.test("a missing view is reported, not guessed at", async () => {
    await assert.rejects(readOutboxRows(db, { schema: SCHEMA, view: "no_such_view" }, "0", 10), /was not found/);
  });

  await t.test("an installed dblink makes the reader refuse", async (st) => {
    try {
      await db.query("create extension if not exists dblink");
    } catch {
      st.skip("this database role cannot create extensions");
      return;
    }
    try {
      await assert.rejects(readOutboxRows(db, { schema: SCHEMA, view: "outbox" }, "0", 10), /dblink is installed/);
    } finally {
      await db.query("drop extension if exists dblink");
    }
  });
});

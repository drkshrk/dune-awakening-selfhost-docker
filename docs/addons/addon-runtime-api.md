# Addon Runtime API

**Status:** Current | **Last Updated:** September 2026

The runtime API gives UI addons typed player data, addon-owned storage, durable
reward delivery, and private player messages without granting direct access to
the Console REST API or requiring writes to Funcom's game tables.

Every call uses the iframe bridge:

```js
const result = await window.DuneAddon.request("players.summary.list");
```

## Permissions

| Permission | Capability |
| --- | --- |
| `players:read` | Player summaries, identities, and supported progression data |
| `files:addon-data` | Private persistent JSON storage scoped to the addon ID |
| `rewards:grant` | Item, game XP, Intel, currency, and Building Sets rewards |
| `rewards:schedule` | Let the Console queue rewards from the addon's declared outbox view on a schedule, even when nobody has the addon open |
| `players:message` | Queue a private in-game message for one player |

Installing or updating an addon never approves a new permission automatically.
The server owner must approve every requested permission.

## Players

### `players.summary.list`

Requires `players:read`. Returns `{ capabilities, rows }`. Each row includes:

- `playerId`: the preferred ID to send back to reward and message actions
- `name`, `status`, `map`, `lastSeen`, and `level`
- `faction` and `guild` when supported
- `actorId`, `controllerId`, `accountId`, `flsId`, and `funcomId` for correlation

`leadership.players.list` remains supported and returns the same summary shape.

### `players.progression.get`

Requires `players:read`.

```js
const progression = await bridge("players.progression.get", { playerId });
```

The response reports capabilities separately for `level`, `faction`, `story`,
`sideQuests`, `exploration`, and `achievements`. Unsupported categories remain
explicitly unsupported. Story and side-quest data use the Console's verified
Journey interpretation; addons should not reproduce game-schema SQL.

## Addon-owned storage

Requires `files:addon-data`. Keys may contain letters, numbers, dots, colons,
underscores, and hyphens. Each value can contain up to 256 KiB of JSON; one
addon can store up to 2,000 keys or 8 MiB total.

```js
await bridge("addon.storage.put", {
  key: "season.active",
  value: { id: "arrakis-rising", tiers: [] },
  expectedVersion: null
});

const entry = await bridge("addon.storage.get", { key: "season.active" });
const keys = await bridge("addon.storage.list", { prefix: "player." });

await bridge("addon.storage.put", {
  key: "season.active",
  value: nextSeason,
  expectedVersion: entry.version
});

await bridge("addon.storage.delete", {
  key: "season.active",
  expectedVersion: entry.version
});
```

`expectedVersion: null` creates only when absent. A numeric `expectedVersion`
provides compare-and-swap protection and returns HTTP 409 if another request
changed the value. Omitting it performs an unconditional write. Updates retain
this data; uninstalling the addon removes it.

## Rewards

Requires `rewards:grant`. `requestId` is the addon's permanent idempotency key
for one delivery. Use a deterministic value such as
`season:<season>:player:<player>:tier:<tier>:reward:<index>`.

```js
await bridge("rewards.deliver", {
  requestId: "season:s1:player:p1:tier:3:reward:0",
  playerId,
  type: "item",
  itemId: "WaterBottle_1",
  amount: 2,
  quality: 0
});
```

Supported payloads:

| `type` | Additional fields |
| --- | --- |
| `item` | `itemId`, `amount` (1-1000), optional `quality` (0-5) |
| `xp` | `amount` |
| `intel` | `amount` |
| `currency` | `currencyId`, `amount` |
| `building-unlock` | `itemId` from the verified Building Sets catalog |

Currency reward IDs are stable across supported game database generations: `0` grants Solaris, while `1` grants the secondary wallet currency (`House Credit` on current servers and `Scrip` on older servers). The core translates these IDs to the database type used by the installed game version, so addons must not write wallet rows directly.

Item and XP rewards wait for the player to be online. Intel waits until the
player is offline because the live game process can overwrite an online
database edit. Currency uses the Console's supported database mutation.
Building Sets use the same verified ownership and delivery path as the Players
page.

The first request creates a durable record before attempting delivery. A retry
with identical details returns the same record and never repeats a completed
delivery. Reusing a request ID with different details is rejected. Offline
deliveries remain `pending` and the Console retries them in the background.
If the Console stops during an in-flight operation, the record becomes
`uncertain` and is not automatically retried, preventing a possible duplicate.

Read delivery state with:

```js
await bridge("rewards.status", { requestId });
await bridge("rewards.list", { status: "pending", limit: 100 });
```

Possible states are `pending`, `processing`, `delivered`, `failed`, and
`uncertain`.

### Delivery record retention

Once an hour the Console removes delivered and failed records older than
`DUNE_ADDON_DELIVERY_RETENTION_DAYS` (default 30, 1-3650). Pending and
uncertain records are never removed. A `requestId` is protected against a
repeat only while its record exists, so an addon must not resubmit a reward
it has already had delivered after that window; keep your own record of what
you have sent. The per-addon limit of 100,000 records counts retained records
only.

## Scheduled reward delivery

Addon JavaScript only runs while its page is open. An addon that tracks
eligibility in its own database schema (for example with a trigger) can
instead declare a **reward outbox**: a view of rewards it owes. With the
owner's approval, the Console reads that view on a schedule and queues each
row exactly as if the addon had called `rewards.deliver`. No addon code runs
on the server; the Console only reads the view.

### Manifest field

```json
{
  "permissions": ["rewards:grant", "database:read", "rewards:schedule"],
  "rewardOutbox": {
    "schema": "my_addon",
    "view": "reward_outbox",
    "maxPerHour": 200
  }
}
```

`schema` and `view` must each match `^[a-z][a-z0-9_]{0,62}$`. The schema may
not be `dune`, `public`, `ext`, `information_schema` or `dune_runtime`, or
start with `pg_` or `console_`: use a schema the addon owns. `maxPerHour` is
clamped to 1-1000 and defaults to 200. An invalid `rewardOutbox` makes the
manifest invalid.

### View contract

The view must expose these columns (other columns are ignored):

| Column | Meaning |
| --- | --- |
| `id` | `bigint`, strictly increasing; the Console's position in the outbox |
| `request_id` | the reward's permanent `requestId` |
| `player_id` | as for `rewards.deliver` |
| `reward_type` | as `type` for `rewards.deliver` |
| `item_id` | as `itemId` |
| `amount` | integer |
| `quality` | integer |
| `created_at` | `timestamptz` |

Only rows at least 60 seconds old are read, so a row from a transaction that
commits late is not skipped past. Rows must not change once visible.

### Bridge actions

Both require `rewards:grant`.

`rewards.schedule.get` returns the schedule status:

```json
{
  "supported": true,
  "configured": true,
  "disabledByServer": false,
  "enabled": true,
  "intervalMinutes": 5,
  "watermark": "12345",
  "nextRunAt": "2026-09-26T10:15:00.000Z",
  "lastRunAt": "2026-09-26T10:10:00.000Z",
  "lastRunStatus": "ok",
  "lastRunDetail": "12 handed to the delivery queue, 0 rejected.",
  "breakerTripped": false,
  "breakerDetail": "",
  "maxPerHour": 200,
  "usedThisHour": 47
}
```

`configured` is whether the manifest declares a `rewardOutbox`.
`disabledByServer` reports the server kill switch. `watermark` is the highest
outbox `id` already queued (`null` before the first run). `lastRunStatus` is
`ok`, `stopped` (a retryable error; the next run resumes from the watermark),
`breaker`, or `error`.

`rewards.schedule.set` accepts `enabled`, `intervalMinutes` (1-60) and
`startAfterId`, and returns the same status. Enabling (or saving while
enabled) also requires `database:read` and `rewards:schedule` to be approved
and a declared `rewardOutbox`; disabling needs only `rewards:grant`.
`startAfterId` tells the Console which rows the page already handed over. It
can move the watermark forward but never back; a lower value is ignored,
because re-reading old rows could repeat rewards whose delivery records have
been pruned.

### How a run works

Due schedules are checked by the Console's background loop every 10 seconds.
A run:

1. Re-checks that the addon is installed, enabled and runnable, declares a
   `rewardOutbox`, and has `rewards:grant`, `database:read` and
   `rewards:schedule` approved. Otherwise the run records `error` and nothing
   is read.
2. Refuses to run while the `dblink` or `postgres_fdw` extension is installed.
3. Confirms the view exists in the declared schema.
4. Reads at most 50 rows with `id` above the watermark, in `id` order, in a
   `READ ONLY` transaction with a 5 second statement timeout and `search_path`
   set to `pg_catalog, pg_temp`.
5. Validates each row like `rewards.deliver`, and additionally requires item
   rewards to name an item in `runtime/data/admin-items.json`.
6. Queues valid rows in the delivery queue. They are delivered by the
   background delivery tick, which waits for the player to be online.
7. Skips a row that can never be accepted (for example an unknown item or an
   out-of-range amount), audits it as `addons.scheduled-rewards.skip`, and
   moves past it. Any other error stops the run without moving past the row.
8. Audits the run as `addons.scheduled-rewards`.

### Safeguards

- **Read-only.** The view is SQL the addon wrote, so it is read in a
  `READ ONLY` transaction: Postgres refuses any write, including a writing
  function called from the view.
- **Time-boxed.** A 5 second statement timeout cancels a stalled view.
- **Pinned name resolution.** `search_path` is `pg_catalog, pg_temp` for the
  read, so a function or operator in another schema cannot shadow a built-in.
- **No escape hatches.** `dblink` and `postgres_fdw` can open a second,
  writable connection from inside a read-only one, so runs refuse while either
  is installed.
- **Hourly budget.** More than `maxPerHour` rewards within an hour of the
  first one trips a breaker: the schedule is disabled with `lastRunStatus`
  `breaker` until someone re-enables it, which clears the breaker.
- **Approval on every run.** Disabling or uninstalling the addon, or revoking
  any of the three permissions, stops the schedule at its next run.
- **No backlog storms.** After a Console restart, an overdue schedule is
  re-armed one interval later instead of running immediately.

Schedule state is kept in `runtime/addons/jobs/<addonId>/reward-outbox.json`
and removed when the addon is uninstalled.

Set `DUNE_ADDON_SCHEDULED_REWARDS=0` to stop every addon reward schedule.
Schedules can still be viewed and saved, but none run.

## Private player messages

Requires `players:message`. Messages use the same persistent offline queue and
idempotency rules as rewards.

```js
await bridge("players.message.send", {
  requestId: "season:s1:player:p1:tier:3:message",
  playerId,
  message: "You unlocked Battle Pass Tier 3."
});
```

Use `players.message.status` and `players.message.list` to inspect message
delivery. Messages remain pending until the player is online.

## Execution model

Addon JavaScript still runs only while its UI iframe is open. Once an addon has
submitted a reward or message, the core owns its queue and continues processing
it after the iframe closes or the Console restarts. Addons which declare a
reward outbox can have the console read it on a schedule (see Scheduled reward
delivery), and rewards from scheduled reads are queued and processed the same
way. Eligibility scans and season-rule evaluation remain the addon's
responsibility; third-party JavaScript is not executed as an unrestricted
server process.

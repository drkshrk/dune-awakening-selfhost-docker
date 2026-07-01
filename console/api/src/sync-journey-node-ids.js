// src/sync-journey-node-ids.js
//
// Maintenance script: scans dune.journey_story_node for any DA_MQ* node IDs
// that aren't yet present in runtime/data/journey-tags.json, and adds them
// as empty-tag placeholder entries so the journey UI can discover and nest
// them via journeyParentId/journeyDepth on next server restart.
//
// Usage:
//   node src/sync-journey-node-ids.js            # apply changes
//   node src/sync-journey-node-ids.js --dry-run   # report only, no write
//   node src/sync-journey-node-ids.js --prefix DA_MQ_FindTheFremen
//
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/db.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prefixArgIndex = args.indexOf("--prefix");
const prefix = prefixArgIndex >= 0 && args[prefixArgIndex + 1] ? args[prefixArgIndex + 1] : "DA_MQ";

// Resolve relative to this file's own location (console/api/src/) rather
// than process.cwd() or DUNE_DOCKER_DIR, so this works the same whether it's
// run via `npm run` from the repo root, from console/api/, directly with
// `node`, or inside the container. Repo root is 3 levels up from this file:
// console/api/src/<this file> -> console/api -> console -> repo root.
// Set DUNE_DOCKER_DIR to override (e.g. if this script is copied elsewhere).
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.DUNE_DOCKER_DIR || resolve(scriptDir, "..", "..", "..");

async function main() {
  const journeyTagsPath = resolve(repoRoot, "runtime", "data", "journey-tags.json");
  console.log(`Resolved repo root:   ${repoRoot}`);
  console.log(`journey-tags.json at: ${journeyTagsPath}`);

  if (!existsSync(journeyTagsPath)) {
    throw new Error(`journey-tags.json not found at ${journeyTagsPath}. Set DUNE_DOCKER_DIR to your repo root to override.`);
  }

  const raw = readFileSync(journeyTagsPath, "utf8");
  const data = JSON.parse(raw);
  data.journey_node_tags = data.journey_node_tags || {};

  const existingIds = new Set(Object.keys(data.journey_node_tags));

  // createDb's config param is unused internally (it reads DB connection
  // details straight from process.env via discoverDbConfig), so no config
  // object is needed here.
  const db = createDb();
  let dbNodeIds;
  try {
    const result = await db.query(
      `select distinct story_node_id
       from dune.journey_story_node
       where story_node_id like $1
       order by story_node_id`,
      [`${prefix}%`]
    );
    dbNodeIds = result.rows.map((row) => row.story_node_id).filter(Boolean);
  } finally {
    await db.close();
  }

  const missing = dbNodeIds.filter((id) => !existingIds.has(id));

  console.log(`Prefix:              ${prefix}%`);
  console.log(`Node IDs in DB:      ${dbNodeIds.length}`);
  console.log(`Already in catalog:  ${dbNodeIds.length - missing.length}`);
  console.log(`Missing from catalog: ${missing.length}`);
  for (const id of missing) console.log(`  + ${id}`);

  if (!missing.length) {
    console.log("Nothing to add. journey-tags.json is already up to date for this prefix.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run: no changes written. Re-run without --dry-run to apply.");
    return;
  }

  for (const id of missing) {
    data.journey_node_tags[id] = [];
  }

  const backupPath = `${journeyTagsPath}.bak-${Date.now()}`;
  copyFileSync(journeyTagsPath, backupPath);
  writeFileSync(journeyTagsPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log(`\nBackup written to: ${backupPath}`);
  console.log(`Added ${missing.length} node ID(s) to journey-tags.json.`);
  console.log("Restart the console API for the change to take effect (journey-tags.json is loaded once at boot).");
}

main().catch((error) => {
  console.error("sync-journey-node-ids failed:", error.message || error);
  process.exitCode = 1;
});
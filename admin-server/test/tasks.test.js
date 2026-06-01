import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskManager } from "../src/tasks.js";

test("task manager creates and completes allowlisted dune tasks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "arrakis-task-"));
  const duneScript = join(dir, "dune");
  writeFileSync(duneScript, "#!/usr/bin/env bash\necho task:$*\n", { mode: 0o700 });
  chmodSync(duneScript, 0o700);

  const manager = new TaskManager({
    duneScript,
    repoRoot: dir,
    taskRetention: 20,
    commandTimeoutMs: 5000
  });

  const created = manager.create("server", "status", {});
  assert.equal(created.status, "queued");

  const task = await waitForTask(manager, created.id);
  assert.equal(task.status, "succeeded");
  assert.equal(task.exitCode, 0);
  assert.match(task.logLines.map((line) => line.line).join("\n"), /task:status/);
});

function waitForTask(manager, id) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 3000;
    const timer = setInterval(() => {
      const task = manager.get(id);
      if (task && ["succeeded", "failed", "cancelled"].includes(task.status)) {
        clearInterval(timer);
        resolve(task);
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("task did not finish"));
      }
    }, 20);
  });
}

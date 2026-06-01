import { existsSync, statSync, readFileSync } from "node:fs";
import { arch, freemem, platform, release, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

const ports = [15432, 31982, 31983, 32573, 5059, 7777, 7778, 7888, 7889, 11717];

export async function preflight(config) {
  const checks = [];
  checks.push(check("Operating system", "info", `${platform()} ${release()}`));
  checks.push(check("Architecture", arch() === "x64" ? "pass" : "warn", arch()));
  checks.push(cpuFlags());
  checks.push(check("RAM", totalmem() >= 16 * 1024 ** 3 ? "pass" : "warn", `${gb(totalmem())} GiB total, ${gb(freemem())} GiB free`));
  checks.push(diskCheck(config.repoRoot));
  checks.push(commandCheck("Docker CLI", "docker", ["--version"]));
  checks.push(commandCheck("Docker Compose", "docker", ["compose", "version"]));
  checks.push(commandCheck("Docker daemon", "docker", ["info"]));
  checks.push(fileCheck("Runtime directory", config.repoRoot));
  checks.push(fileCheck("docker-compose.yml", resolve(config.repoRoot, "docker-compose.yml")));
  checks.push(fileCheck("dune command", config.duneScript));
  checks.push(fileCheck(".env", resolve(config.repoRoot, ".env"), true));
  checks.push(fileCheck("Funcom token", resolve(config.secretsDir, "funcom-token.txt"), true));
  checks.push(fileCheck("Generated runtime files", config.generatedDir, true));
  checks.push(fileCheck("Backup directory", resolve(config.repoRoot, "runtime/backups/db"), true));
  checks.push(...await Promise.all(ports.map(portCheck)));
  return { checks, summary: summarize(checks) };
}

function check(name, status, message, detail = "") {
  return { name, status, message, detail };
}

function summarize(checks) {
  return {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length
  };
}

function commandCheck(name, cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
    return check(name, "pass", out.split(/\r?\n/)[0]);
  } catch (error) {
    return check(name, "fail", "Not available or not reachable", String(error.message || error));
  }
}

function fileCheck(name, path, optional = false) {
  if (existsSync(path)) return check(name, "pass", path);
  return check(name, optional ? "warn" : "fail", `Missing: ${path}`);
}

function diskCheck(path) {
  try {
    const st = statSync(path);
    return check("Disk path", st.isDirectory() ? "pass" : "warn", path);
  } catch {
    return check("Disk path", "fail", path);
  }
}

function cpuFlags() {
  try {
    const text = readFileSync("/proc/cpuinfo", "utf8").toLowerCase();
    const avx = text.includes(" avx ");
    const avx2 = text.includes(" avx2 ");
    return check("CPU AVX/AVX2", avx && avx2 ? "pass" : "warn", `AVX=${avx ? "yes" : "no"}, AVX2=${avx2 ? "yes" : "no"}`);
  } catch {
    return check("CPU AVX/AVX2", "warn", "Could not read /proc/cpuinfo");
  }
}

async function portCheck(port) {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", () => resolveCheck(check(`Port ${port}`, "warn", "Already in use or unavailable")));
    server.once("listening", () => server.close(() => resolveCheck(check(`Port ${port}`, "pass", "Available"))));
    server.listen(port, "0.0.0.0");
  });
}

function gb(bytes) {
  return (bytes / 1024 ** 3).toFixed(1);
}

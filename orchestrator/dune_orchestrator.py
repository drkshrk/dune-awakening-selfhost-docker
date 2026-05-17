#!/usr/bin/env python3
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

DUNE_ROOT = pathlib.Path(os.environ.get("DUNE_ROOT", "/srv/dune"))
SERVER_DIR = pathlib.Path(os.environ.get("DUNE_SERVER_DIR", "/srv/dune/server"))
STEAM_DIR = pathlib.Path(os.environ.get("DUNE_STEAM_DIR", "/srv/dune/steam"))
GENERATED_DIR = pathlib.Path(os.environ.get("DUNE_GENERATED_DIR", "/srv/dune/generated"))
STEAM_APP_ID = os.environ.get("STEAM_APP_ID", "3104830")
SERVER_TITLE = os.environ.get("SERVER_TITLE", "My Dune Server")
SERVER_REGION = os.environ.get("SERVER_REGION", "Europe Test")

def run(cmd, check=True, user=None):
    printable = " ".join(str(x) for x in cmd)
    print(f"[dune] $ {printable}", flush=True)

    if user:
        cmd = ["runuser", "-u", user, "--"] + [str(x) for x in cmd]
    else:
        cmd = [str(x) for x in cmd]

    return subprocess.run(cmd, check=check)

def resolve_server_ip():
    value = os.environ.get("SERVER_IP", "auto").strip()

    if value and value.lower() != "auto":
        return value

    urls = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
    ]

    for url in urls:
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                ip = r.read().decode("utf-8").strip()
                if ip:
                    return ip
        except Exception:
            pass

    return "UNKNOWN"

def ensure_dirs():
    for p in [DUNE_ROOT, SERVER_DIR, STEAM_DIR, GENERATED_DIR, DUNE_ROOT / "cache"]:
        p.mkdir(parents=True, exist_ok=True)

    pathlib.Path("/home/dune/.steam").mkdir(parents=True, exist_ok=True)

    run(["chown", "-R", "dune:dune", str(DUNE_ROOT)], check=False)
    run(["chown", "-R", "dune:dune", "/home/dune"], check=False)

def ensure_steamcmd():
    ensure_dirs()

    steamcmd = STEAM_DIR / "steamcmd.sh"

    if steamcmd.exists():
        print("[dune] SteamCMD already installed.", flush=True)
        return

    print("[dune] Installing SteamCMD...", flush=True)

    tmp = pathlib.Path("/tmp/steamcmd_linux.tar.gz")

    run([
        "curl",
        "-fsSL",
        "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz",
        "-o",
        str(tmp),
    ])

    run(["tar", "-xzf", str(tmp), "-C", str(STEAM_DIR)])
    tmp.unlink(missing_ok=True)

    run(["chown", "-R", "dune:dune", str(STEAM_DIR), "/home/dune/.steam"])
    run(["ln", "-sfn", str(STEAM_DIR), "/home/dune/.steam/root"], user="dune")
    run(["ln", "-sfn", str(STEAM_DIR), "/home/dune/.steam/steam"], user="dune")

def download():
    ensure_steamcmd()

    print(f"[dune] Downloading/updating Steam app {STEAM_APP_ID}", flush=True)
    print(f"[dune] Target directory: {SERVER_DIR}", flush=True)

    run([
        "env",
        "HOME=/home/dune",
        str(STEAM_DIR / "steamcmd.sh"),
        "+@ShutdownOnFailedCommand", "1",
        "+@NoPromptForPassword", "1",
        "+force_install_dir", str(SERVER_DIR),
        "+login", "anonymous",
        "+app_update", STEAM_APP_ID, "validate",
        "+logoff",
        "+quit",
    ], user="dune")

    print("[dune] Download finished.", flush=True)

def status():
    print("Dune Docker Orchestrator MVP")
    print(f"SERVER_IP={resolve_server_ip()}")
    print(f"SERVER_TITLE={SERVER_TITLE}")
    print(f"SERVER_REGION={SERVER_REGION}")
    print(f"STEAM_APP_ID={STEAM_APP_ID}")
    print(f"DUNE_ROOT={DUNE_ROOT}")
    print(f"SERVER_DIR={SERVER_DIR}")
    print(f"STEAM_DIR={STEAM_DIR}")
    print("")

    run(["docker", "version"], check=False)
    print("")
    run(["docker", "ps"], check=False)

def daemon():
    print("Dune Docker Orchestrator MVP daemon is running.", flush=True)
    print("Use: docker compose exec orchestrator dune status", flush=True)
    while True:
        time.sleep(3600)

def help_text():
    print("""
Usage:
  dune help       Show this help
  dune daemon     Keep the orchestrator container running
  dune status     Verify Docker access and runtime config
  dune download   Download/update Dune server files with SteamCMD
""".strip())

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "status":
        status()
    elif cmd == "daemon":
        daemon()
    elif cmd == "download":
        download()
    else:
        help_text()

if __name__ == "__main__":
    main()

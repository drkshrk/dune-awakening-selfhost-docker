import { useCallback, useEffect, useRef } from "react";
import { fetchConsoleAuthState } from "../api/client";

const RELOAD_COOLDOWN_KEY = "dune-console:stale-build-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 120_000;

type StaleBuildStorage = Pick<Storage, "getItem" | "setItem">;

export type StaleBuildWatcherOptions = {
  enabled?: boolean;
  intervalMs?: number;
  // Injection points keep this testable with fake timers, matching the
  // pattern LazyTabBoundary uses for the same reason.
  fetchVersion?: () => Promise<string | null>;
  reload?: () => void;
  storage?: StaleBuildStorage | null;
  now?: () => number;
  // Poll again as soon as this changes, without disturbing the baseline. App
  // passes the auth flag, so signing in re-checks immediately instead of
  // waiting out the rest of the 2-minute interval.
  recheckToken?: unknown;
};

async function defaultFetchVersion(): Promise<string | null> {
  const state = await fetchConsoleAuthState();
  const version = typeof state?.config?.version === "string" ? state.config.version.trim() : "";
  const buildId = typeof state?.config?.buildId === "string" ? state.config.buildId.trim() : "";
  if (!version && !buildId) return null;
  // Keep the release version in the identity so official upgrades still
  // trigger a reload even when they contain no frontend changes. The build
  // ID additionally catches rebuilt frontend assets within the same version.
  return `${version || "dev"}:${buildId || version}`;
}

function browserStorage(): StaleBuildStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserReload() {
  window.location.reload();
}

// Once loaded, a browser tab has no way to know the server's files changed
// underneath it -- there is no push, and nothing else in this app watches
// for a build change on an already-open, idle tab (LazyTabBoundary only
// reacts when a lazy chunk it tries to load is already gone, and the
// Updates panel's own reload flow only runs in the tab that triggered the
// update). This closes that gap: poll the running console version and
// reload automatically the first time it changes, so a tab left open
// during someone else's console update or a same-version rebuild recovers
// on its own instead of running stale code indefinitely.
//
// The baseline lives in a ref rather than inside the interval effect so an
// out-of-band recheck (see recheckToken) compares against the version this tab
// started with, instead of resetting the comparison to whatever the server
// reports at that moment -- which would make the recheck useless.
//
// Known limit: this detects a tab that goes stale while open, not one that
// LOADED stale. The first poll records whatever the server reports, so a tab
// already running behind has nothing to compare against. index.html is served
// no-cache and the assets are content-hashed, so a fresh load gets current code
// and that case should not arise.
export function useStaleBuildWatcher(options: StaleBuildWatcherOptions = {}) {
  const {
    enabled = true,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    fetchVersion = defaultFetchVersion,
    reload = browserReload,
    storage = browserStorage(),
    now = Date.now,
    recheckToken
  } = options;

  const baselineRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  // The recheck below can fire at the same moment as an interval tick. Both
  // would await the same fetch, both read an unset cooldown marker, and both
  // call reload(). Harmless in a browser -- reload navigates away -- but it
  // defeats the cooldown that exists to stop a reload loop against a flapping
  // deploy, so only let one poll be in flight.
  const inFlightRef = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await runPoll();
    } finally {
      inFlightRef.current = false;
    }

    async function runPoll() {
    const version = await fetchVersion().catch(() => null);
    if (cancelledRef.current || !version) return;
    if (baselineRef.current === null) {
      baselineRef.current = version;
      return;
    }
    if (version === baselineRef.current) return;

    // Without a durable cooldown marker, don't risk an uncontrolled reload
    // loop against a flapping deploy -- same fail-closed choice
    // LazyTabBoundary makes when storage is unavailable.
    if (!storage) return;
    try {
      const lastAttempt = Number(storage.getItem(RELOAD_COOLDOWN_KEY) || 0);
      const elapsed = now() - lastAttempt;
      if (Number.isFinite(lastAttempt) && lastAttempt > 0 && elapsed >= 0 && elapsed < RELOAD_COOLDOWN_MS) return;
      storage.setItem(RELOAD_COOLDOWN_KEY, String(now()));
    } catch {
      return;
    }
    reload();
    }
  }, [enabled, fetchVersion, reload, storage, now]);

  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;
    void poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs, poll]);

  // Signing in is exactly when someone is about to read fresh data, and it is
  // the point the 2-minute cadence was most likely to be mid-window at.
  useEffect(() => {
    if (!enabled || !recheckToken) return;
    void poll();
  }, [enabled, recheckToken, poll]);
}

export const staleBuildWatcherInternals = Object.freeze({ RELOAD_COOLDOWN_KEY, RELOAD_COOLDOWN_MS, DEFAULT_POLL_INTERVAL_MS });

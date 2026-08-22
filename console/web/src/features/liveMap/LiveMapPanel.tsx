import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { liveMapApi, type LiveMapConfig, type LiveMapMarker, type LiveMapPartition } from "../../api/liveMap";
import type { Task } from "../../api/setup";
import { DataTable } from "../../components/common/DataTable";
import { KeyValueGrid, TechnicalDetails } from "../../components/common/DisplayPrimitives";
import { firstDefined, formatUiSentence, titleCase } from "../../lib/display";
import { friendlyInlineError } from "../players/playerAdminUtils";

// Layer keys whose visibility is capability-gated -- hidden from the legend
// entirely when the backend reports no data source for them (missing
// archive, table not present, etc). Player/vehicle/base/storage are not
// gated this way; they've always just shown with a zero count instead.
const GATED_LAYER_KEYS = new Set(["spice", "spice_active", "flour_sand", "ore", "scrap", "flora", "poi", "hazard", "enemy"]);

// Categories that expand into individual sub-types (e.g. Ores & Metals ->
// RhyoliteOre/AzuriteOre/...; Active Spice Blows -> Small/Medium/Large).
// Sub-type lists are derived dynamically from whatever `subtype` values are
// actually present in the loaded markers -- not curated -- so a new
// game-added resource type shows up with zero maintenance.
const EXPANDABLE_KEYS = new Set(["spice", "spice_active", "ore", "scrap", "flora", "poi", "hazard", "enemy"]);
// Zoom was capped at 100% (1 map-pixel-unit == 1 CSS pixel), too tight for
// precise marker/teleport placement.
const MAX_LIVE_MAP_ZOOM = 4;
// Minimum zoom is exactly the "contain" fit (the whole map visible, no
// scrollbar) -- 1 means no extra shrink past that; see liveMapMinimumZoom.
const MIN_ZOOM_FIT_FACTOR = 1;
const SPICE_TIER_TYPES = new Set(["spice", "spice_active"]);

// Optional third tier within an expanded category's sublist -- a function
// from subtype name to { group, label } (label is what renders instead of
// the raw subtype -- e.g. stripping a group's own name back off so it
// isn't repeated). Returning null leaves that subtype rendered flat,
// alongside the parent category's other ungrouped items -- "ore" groups
// every subtype (all Ore/Pickup), "poi" only groups the House
// Representative/Trainer subsets and leaves Cave/TradingPost/etc. flat.
const SUBGROUP_RESOLVERS: Record<string, (subtype: string) => { group: string; label: string } | null> = {
  ore: (subtype) => ({ group: subtype.endsWith("Pickup") ? "Pickup" : "Ore", label: subtype }),
  scrap: (subtype) => {
    if (subtype.endsWith("Wreckage")) return { group: "Wreckage", label: subtype };
    if (subtype.endsWith("Part")) return { group: "Part", label: subtype };
    return null;
  },
  poi: (subtype) => {
    if (subtype.startsWith("HouseRepresentative")) return { group: "House Representative", label: subtype.slice("HouseRepresentative".length) };
    if (subtype.startsWith("Trainer")) return { group: "Trainer", label: subtype.slice("Trainer".length) };
    return null;
  }
};
const SUBGROUP_ORDER = ["Ore", "Pickup", "Wreckage", "Part"];

type LegendItem =
  | { header: string }
  | { key: string }
  | { placeholder: string; label: string; note: string };

// Static layout for the Layers legend: existing live-actor types stay
// ungrouped at top, then themed clusters matching the naming/grouping of
// https://lafamilia-gaming.eu/livemap. Sandworms has no live data source at
// all (no persistent actor rows, only 5 historical Shai-Hulud events ever
// logged) so it renders as a disabled placeholder, not a real filter.
const LEGEND_LAYOUT: LegendItem[] = [
  { key: "player" }, { key: "vehicle" }, { key: "base" }, { key: "storage" },
  { header: "Spice & Resources" },
  { key: "spice" }, { key: "spice_active" }, { key: "flour_sand" },
  { key: "ore" }, { key: "scrap" }, { key: "flora" },
  { header: "Wildlife" },
  { placeholder: "sandworm", label: "Sandworms", note: "(no live source yet)" },
  { header: "World" },
  { key: "poi" }, { key: "hazard" }, { key: "enemy" }
];

type HomeTaskResult = { status: "running" | "succeeded" | "failed" | "stopped"; title: string; message?: string; details?: string };
type ConfirmAction = (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; details?: { label: string; value: string; tone?: "danger" | "success" | "accent" }[] }) => Promise<boolean>;
type LiveMapPanelProps = {
  onError: (text: string) => void;
  confirmAction: ConfirmAction;
  waitForTask: (task: Task) => Promise<Task>;
  taskTechnicalDetails: (task: Task) => string;
};

function formatResultTitle(value: unknown, pending = false) {
  return formatUiSentence(value, pending);
}

function formatResultMessage(value: unknown) {
  return formatUiSentence(value, false);
}

// HTML checkboxes have no declarative `indeterminate` prop -- it has to be
// set imperatively on the DOM node.
function IndeterminateCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

function HomeTaskResultCard({ result }: { result: HomeTaskResult }) {
  const pending = result.status === "running";
  return <div className={`result-panel home-task-result result-${result.status === "succeeded" || result.status === "stopped" ? "ok" : result.status === "failed" ? "fail" : "running"}`} aria-live="polite">
    <strong className={pending ? "loading-dots" : ""}>{formatResultTitle(result.title, pending)}</strong>
    {result.message && <p>{formatResultMessage(result.message)}</p>}
    {result.details && <TechnicalDetails title="Technical details" text={result.details} />}
  </div>;
}

export function LiveMapPanel({ onError, confirmAction, waitForTask, taskTechnicalDetails }: LiveMapPanelProps) {
  const [mapKey, setMapKey] = useState("HaggaBasin");
  const [mapConfig, setMapConfig] = useState<LiveMapConfig | null>(null);
  const [maps, setMaps] = useState<Record<string, LiveMapConfig>>({});
  const [partitions, setPartitions] = useState<LiveMapPartition[]>([]);
  const [partitionId, setPartitionId] = useState("");
  const [markers, setMarkers] = useState<LiveMapMarker[]>([]);
  const [overlays, setOverlays] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<LiveMapMarker | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean>>({
    player: true, vehicle: true, base: true, storage: true,
    spice: true, spice_active: true, flour_sand: true, ore: true, scrap: true, flora: true,
    poi: true, hazard: true
  });
  const [coriolisSeed, setCoriolisSeed] = useState("");
  const [subtypeFilters, setSubtypeFilters] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, Record<string, boolean>>>({});
  // Section headers (Spice & Resources / Wildlife / World) default to
  // expanded -- unlike category/sub-group expand state, which defaults to
  // collapsed -- so nothing vanishes on first load. A missing entry means
  // "expanded", not "collapsed".
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [zoom, setZoom] = useState(0.16);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const [playerDrag, setPlayerDrag] = useState<{ marker: LiveMapMarker; point: LiveMapPoint; startX: number; startY: number } | null>(null);
  const [playerTeleportPreview, setPlayerTeleportPreview] = useState<{ marker: LiveMapMarker; point: LiveMapPoint } | null>(null);
  const [teleportResult, setTeleportResult] = useState<HomeTaskResult | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchorRef = useRef<{ mapX: number; mapY: number; viewportX: number; viewportY: number } | null>(null);
  const liveMapDraggingPlayerRef = useRef(false);
  const pendingPlayerTeleportsRef = useRef<Record<string, { x: number; y: number; z: number; partitionId: number; expiresAt: number }>>({});
  async function load() {
    if (liveMapDraggingPlayerRef.current) return;
    onError("");
    setLoading(true);
    try {
      const result = await liveMapApi.markers(mapKey);
      const rows = result.rows || [];
      setMarkers(applyPendingPlayerTeleports(rows));
      // Merge newly-seen subtypes in (default visible) -- never clobber a
      // subtype the user has already toggled off.
      setSubtypeFilters((prev) => {
        const next: Record<string, Record<string, boolean>> = {};
        for (const key of Object.keys(prev)) next[key] = { ...prev[key] };
        for (const marker of rows) {
          const type = String(marker.type);
          const subtype = typeof marker.subtype === "string" ? marker.subtype : null;
          if (!EXPANDABLE_KEYS.has(type) || !subtype) continue;
          if (!next[type]) next[type] = {};
          if (!(subtype in next[type])) next[type][subtype] = true;
        }
        return next;
      });
      setOverlays(result.overlays || {});
      setCapabilities(result.capabilities || {});
      setMapConfig(result.map || null);
      setMaps(result.maps || {});
      setPartitions(result.partitions || []);
      setCoriolisSeed(result.coriolisSeed || "");
      if (!partitionId && result.map?.defaultPartitionId) setPartitionId(String(result.map.defaultPartitionId));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [mapKey]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, mapKey, partitionId]);
  const activeMap = mapConfig || maps[mapKey];
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    function handleWheel(event: WheelEvent) {
      const currentFrame = frameRef.current;
      const canvas = canvasRef.current;
      if (!currentFrame || !canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const isInsideCanvas =
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom;
      if (!isInsideCanvas) return;
      event.preventDefault();
      setZoomAround(zoom * (event.deltaY < 0 ? 1.12 : 0.88), { clientX: event.clientX, clientY: event.clientY });
    }
    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [zoom, activeMap?.key]);
  useEffect(() => {
    function syncMinimumZoom() {
      const min = liveMapMinimumZoom(activeMap, frameRef.current);
      setZoom((current) => current < min ? min : current);
    }
    const id = window.requestAnimationFrame(syncMinimumZoom);
    window.addEventListener("resize", syncMinimumZoom);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", syncMinimumZoom);
    };
  }, [activeMap?.key]);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const anchor = zoomAnchorRef.current;
    if (!frame) return;
    if (!anchor) return;
    frame.scrollLeft = anchor.mapX * zoom - anchor.viewportX;
    frame.scrollTop = anchor.mapY * zoom - anchor.viewportY;
    zoomAnchorRef.current = null;
  }, [zoom, activeMap?.key]);
  useEffect(() => {
    if (!activeMap) return undefined;
    return scheduleFitLiveMapView();
  }, [activeMap?.key]);
  const mapOptions = Object.values(maps);
  const partitionOptions = partitions.filter((row) => row.map === (activeMap?.actorMap || activeMap?.key));
  // Partition-filtered but not yet subtype-filtered -- the base population
  // subtype counts are measured against, so a sub-item's own count doesn't
  // change/disappear just because the user unchecked it.
  const partitionFiltered = markers
    // Static-pool spice and POI markers have no partition_id at all (they're
    // not tied to a specific live dimension), so a marker without one should
    // never be dropped by the partition filter. spice_active markers do
    // carry a real partition_id and filter normally.
    .filter((marker) => !partitionId || marker.partition_id == null || String(marker.partition_id) === partitionId);
  const topLevelVisible = partitionFiltered.filter((marker) => filters[String(marker.type)] !== false);
  const visible = topLevelVisible.filter((marker) => !marker.subtype || subtypeFilters[String(marker.type)]?.[marker.subtype] !== false);
  const plotted = visible.filter((marker) => Number.isFinite(Number(marker.x)) && Number.isFinite(Number(marker.y)));
  const displayRows = visible.map((marker) => ({ ...marker, display_name: friendlyMarkerName(marker), raw_name: marker.name || marker.id }));
  const markerCounts = countMarkers(visible);
  const subtypeCounts = countBySubtype(topLevelVisible);
  const inBounds = activeMap ? plotted.map((marker) => ({ marker, point: worldToLiveMapPoint(marker, activeMap) })).filter((item) => item.point?.inBounds) as { marker: LiveMapMarker; point: LiveMapPoint }[] : [];
  const targetPoint = target && activeMap ? worldToLiveMapPoint({ x: target.x, y: target.y }, activeMap) : null;
  const minimumZoom = liveMapMinimumZoom(activeMap, frameRef.current);
  const zoomMinPercent = Math.round(minimumZoom * 100);
  const zoomMaxPercent = Math.round(MAX_LIVE_MAP_ZOOM * 100);
  const zoomValuePercent = Math.round(zoom * 100);
  const zoomProgressPercent = Math.max(0, Math.min(100, ((zoomValuePercent - zoomMinPercent) / Math.max(1, zoomMaxPercent - zoomMinPercent)) * 100));
  const zoomDisplayPercent = Math.round(zoomProgressPercent);
  function chooseMap(nextKey: string) {
    const nextMap = maps[nextKey];
    setMapKey(nextKey);
    setPartitionId(nextMap?.defaultPartitionId ? String(nextMap.defaultPartitionId) : "");
    setSelected(null);
    setTarget(null);
    setPlayerTeleportPreview(null);
    liveMapDraggingPlayerRef.current = false;
  }
  function centerMarker(marker: LiveMapMarker) {
    if (!activeMap || !frameRef.current) return;
    const point = worldToLiveMapPoint(marker, activeMap);
    if (!point) return;
    setSelected(marker);
    requestAnimationFrame(() => {
      if (!frameRef.current) return;
      frameRef.current.scrollLeft = Math.max(0, point.px * zoom - frameRef.current.clientWidth / 2);
      frameRef.current.scrollTop = Math.max(0, point.py * zoom - frameRef.current.clientHeight / 2);
    });
  }
  function centerLiveMapView(zoomForCenter = zoom) {
    const frame = frameRef.current;
    const map = activeMap;
    if (!frame || !map) return;
    const width = map.width * zoomForCenter;
    const height = map.height * zoomForCenter;
    frame.scrollLeft = Math.max(0, (width - frame.clientWidth) / 2);
    frame.scrollTop = Math.max(0, (height - frame.clientHeight) / 2);
  }
  function scheduleFitLiveMapView() {
    const handles: number[] = [];
    const run = (attempt = 0) => {
      const frame = frameRef.current;
      if (!activeMap || !frame) return;
      if ((frame.clientWidth === 0 || frame.clientHeight === 0) && attempt < 8) {
        handles.push(window.requestAnimationFrame(() => run(attempt + 1)));
        return;
      }
      const next = liveMapMinimumZoom(activeMap, frame);
      zoomAnchorRef.current = null;
      setZoom(next);
      handles.push(window.requestAnimationFrame(() => centerLiveMapView(next)));
      handles.push(window.setTimeout(() => centerLiveMapView(next), 80));
    };
    handles.push(window.requestAnimationFrame(() => run()));
    return () => {
      for (const handle of handles) {
        window.cancelAnimationFrame(handle);
        window.clearTimeout(handle);
      }
    };
  }
  function fitLiveMapView() {
    const next = liveMapMinimumZoom(activeMap, frameRef.current);
    zoomAnchorRef.current = null;
    setZoom(next);
    requestAnimationFrame(() => centerLiveMapView(next));
  }
  function handleMapDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!activeMap || !canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".live-map-marker")) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / zoom;
    const py = (event.clientY - rect.top) / zoom;
    const world = liveMapPixelsToWorld(px, py, activeMap);
    if (!world) return;
    setTarget(world);
  }
  function setZoomAround(nextZoom: number, anchor?: { clientX: number; clientY: number }) {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const oldZoom = zoom;
    const next = clampLiveMapZoom(nextZoom, liveMapMinimumZoom(activeMap, frame));
    if (!frame) {
      setZoom(next);
      return;
    }
    if (next === oldZoom) {
      zoomAnchorRef.current = null;
      return;
    }
    const canvasRect = canvas?.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const anchorViewportX = anchor ? anchor.clientX - frameRect.left : frame.clientWidth / 2;
    const anchorViewportY = anchor ? anchor.clientY - frameRect.top : frame.clientHeight / 2;
    const anchorMapX = anchor && canvasRect ? (anchor.clientX - canvasRect.left) / oldZoom : (frame.scrollLeft + frame.clientWidth / 2) / oldZoom;
    const anchorMapY = anchor && canvasRect ? (anchor.clientY - canvasRect.top) / oldZoom : (frame.scrollTop + frame.clientHeight / 2) / oldZoom;
    zoomAnchorRef.current = { mapX: anchorMapX, mapY: anchorMapY, viewportX: anchorViewportX, viewportY: anchorViewportY };
    setZoom(next);
  }
  function playerMarkerId(marker: LiveMapMarker) {
    return String(firstDefined(marker.action_player_id, marker.fls_id, marker.funcom_id, marker.account_id, marker.id) || "");
  }
  function applyPendingPlayerTeleports(rows: LiveMapMarker[]) {
    const now = Date.now();
    return rows.map((marker) => {
      if (String(marker.type || "").toLowerCase() !== "player") return marker;
      const markerId = playerMarkerId(marker);
      const pending = markerId ? pendingPlayerTeleportsRef.current[markerId] : null;
      if (!pending) return marker;
      if (pending.expiresAt <= now) {
        delete pendingPlayerTeleportsRef.current[markerId];
        return marker;
      }
      const currentX = Number(marker.x);
      const currentY = Number(marker.y);
      const currentPartition = Number(marker.partition_id || 0);
      const caughtUp = Number.isFinite(currentX) && Number.isFinite(currentY) && Math.hypot(currentX - pending.x, currentY - pending.y) < 100 && (!pending.partitionId || currentPartition === pending.partitionId);
      if (caughtUp) delete pendingPlayerTeleportsRef.current[markerId];
      return {
        ...marker,
        x: pending.x,
        y: pending.y,
        z: pending.z,
        partition_id: pending.partitionId || marker.partition_id
      };
    });
  }
  function liveMapPointerPoint(event: MouseEvent | React.MouseEvent) {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      px: (event.clientX - rect.left) / zoom,
      py: (event.clientY - rect.top) / zoom,
      inBounds: true
    };
  }
  async function confirmPlayerDragTeleport(marker: LiveMapMarker, point: LiveMapPoint) {
    if (!activeMap) return;
    const world = liveMapPixelsToWorld(point.px, point.py, activeMap);
    const playerId = playerMarkerId(marker);
    if (!world || !playerId) {
      setPlayerTeleportPreview(null);
      liveMapDraggingPlayerRef.current = false;
      setTeleportResult({ status: "failed", title: "Teleport Failed", message: "This player marker does not include a usable admin player ID." });
      return;
    }
    const online = liveMapPlayerStatus(marker) === "online";
    const playerName = friendlyMarkerName(marker);
    const confirmed = await confirmAction("Move this player to the selected map location?", {
      title: `Teleport ${playerName}?`,
      confirmLabel: "Teleport",
      details: [
        { label: "Player", value: playerName, tone: online ? "success" : "danger" },
        { label: "Status", value: online ? "Online" : "Offline", tone: online ? "success" : "danger" },
        { label: "Location", value: `X ${Math.round(world.x)}, Y ${Math.round(world.y)}, Z 5000`, tone: "accent" }
      ]
    });
    if (!confirmed) {
      setPlayerTeleportPreview(null);
      liveMapDraggingPlayerRef.current = false;
      return;
    }
    setTeleportResult({ status: "running", title: "Teleporting Player" });
    try {
      const teleportPosition = { x: Math.round(world.x), y: Math.round(world.y), z: 5000, partitionId: Number(marker.partition_id || partitionId || 0) };
      const response = await liveMapApi.teleportPlayer({ playerId, ...teleportPosition, yaw: 0, online });
      if (response.task) {
        const final = await waitForTask(response.task);
        if (final.status !== "succeeded") throw new Error(taskTechnicalDetails(final) || final.errorMessage || final.progressMessage || "Teleport failed.");
        setTeleportResult({ status: "succeeded", title: "Teleport Sent", message: `${playerName} was teleported to the selected location.` });
      } else if (response.supported === false) {
        setPlayerTeleportPreview(null);
        liveMapDraggingPlayerRef.current = false;
        setTeleportResult({ status: "failed", title: "Offline Teleport Not Available", message: response.reason || "Offline teleport is not supported by this database." });
        return;
      } else {
        setTeleportResult({ status: "succeeded", title: "Respawn Location Saved", message: response.message || `${playerName}'s respawn location was saved.` });
      }
      pendingPlayerTeleportsRef.current[playerId] = { ...teleportPosition, expiresAt: Date.now() + 20000 };
      setMarkers((current) => applyPendingPlayerTeleports(current));
      setSelected((current) => current && playerMarkerId(current) === playerId ? applyPendingPlayerTeleports([current])[0] : current);
      liveMapDraggingPlayerRef.current = false;
      await load();
      setPlayerTeleportPreview(null);
    } catch (error) {
      setPlayerTeleportPreview(null);
      liveMapDraggingPlayerRef.current = false;
      setTeleportResult({ status: "failed", title: "Teleport Failed", message: friendlyInlineError(error) });
    }
  }
  useEffect(() => {
    if (!playerDrag) return undefined;
    function move(event: MouseEvent) {
      const point = liveMapPointerPoint(event);
      if (!point) return;
      setPlayerDrag((current) => current ? { ...current, point } : current);
    }
    function up(event: MouseEvent) {
      const current = playerDrag;
      if (!current) return;
      liveMapDraggingPlayerRef.current = false;
      setPlayerDrag(null);
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      const point = liveMapPointerPoint(event) || current.point;
      if (distance < 6) return;
      liveMapDraggingPlayerRef.current = true;
      setPlayerTeleportPreview({ marker: current.marker, point });
      void confirmPlayerDragTeleport(current.marker, point);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up, { once: true });
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [playerDrag, zoom, activeMap?.key]);
  useEffect(() => {
    if (!teleportResult || teleportResult.status === "running") return;
    const id = window.setTimeout(() => setTeleportResult(null), 10400);
    return () => window.clearTimeout(id);
  }, [teleportResult?.status, teleportResult?.title]);
  return <section className="panel">
    <div className="panel-title">
      <div><h2>Live Map</h2><p className="muted">Live world markers, player teleport, partition filtering, zoom, pan, and coordinate selection.</p></div>
      <div className="action-row"><button className={`switch-toggle live-map-auto-toggle ${autoRefresh ? "enabled" : "disabled"}`} onClick={() => setAutoRefresh(!autoRefresh)}><span className="switch-label">Auto-Refresh</span><strong className="switch-state">{autoRefresh ? "ON" : "OFF"}</strong></button></div>
    </div>
    <div className="live-map-layout">
      <aside className="live-map-sidebar">
        <section className="action-section">
          <h4>Map View</h4>
          <div className="live-map-map-buttons">{mapOptions.map((option) => <button key={option.key} className={option.key === mapKey ? "active" : ""} onClick={() => chooseMap(option.key)}>{option.label}</button>)}</div>
          <label className="compact-select">Partition<select value={partitionId} onChange={(event) => setPartitionId(event.target.value)}><option value="">All Partitions</option>{partitionOptions.map((row) => <option key={`${row.map}-${row.partition_id}`} value={String(row.partition_id)}>{row.name || `Partition ${row.partition_id}`} ({row.marker_count})</option>)}</select></label>
          <div className="key-value-grid live-map-stats">
            <div className="key-value-item"><span>Visible</span><strong>{visible.length}</strong></div>
            <div className="key-value-item"><span>In Bounds</span><strong>{inBounds.length}</strong></div>
            <div className="key-value-item"><span>Zoom</span><strong>{zoomDisplayPercent}%</strong></div>
            {coriolisSeed && <div className="key-value-item"><span>Coriolis Seed</span><strong>{coriolisSeedNumber(coriolisSeed)}</strong></div>}
          </div>
        </section>
        <section className="action-section">
          <h4>Layers</h4>
          <div className="live-map-layer-list">{(() => {
            let currentSection = "";
            return LEGEND_LAYOUT.map((item, index) => {
            if ("header" in item) {
              const sectionName = item.header;
              currentSection = sectionName;
              const sectionExpanded = expandedSections[sectionName] !== false;
              return <button key={`header-${index}`} type="button" className="live-map-layer-group-header live-map-layer-group-header-toggle" onClick={() => setExpandedSections({ ...expandedSections, [sectionName]: !sectionExpanded })}>
                <span className="live-map-layer-expand" aria-hidden="true">{sectionExpanded ? "−" : "+"}</span>
                {sectionName}
              </button>;
            }
            if (expandedSections[currentSection] === false) return null;
            const indent = (node: React.ReactNode, keyValue: React.Key) =>
              currentSection ? <div key={keyValue} className="live-map-layer-section-item">{node}</div> : node;
            // Rows with no chevron (Flour Sand, Sandworms) still need to
            // reserve the same width a sibling's expand button occupies --
            // otherwise their label starts to the left of every expandable
            // sibling's label under the same section header.
            const chevronSpacer = currentSection ? <span className="live-map-layer-expand-spacer" aria-hidden="true" /> : null;
            if ("placeholder" in item) return indent(<label className="checkbox-row live-map-layer live-map-layer-disabled">{chevronSpacer}<span className="live-map-layer-label">{item.label}</span><span className="muted">{item.note}</span><input type="checkbox" disabled /></label>, item.placeholder);
            const key = item.key;
            if (GATED_LAYER_KEYS.has(key) && capabilities[key] === false) return null;
            const subtypes = EXPANDABLE_KEYS.has(key) ? Object.keys(subtypeFilters[key] || {}).sort() : [];
            if (subtypes.length === 0) {
              return indent(<label className="checkbox-row live-map-layer">{chevronSpacer}<span className="live-map-layer-label">{friendlyMarkerType(key)}</span><span className="muted">{markerCounts[key] || 0}</span><span className={`live-map-legend-dot marker-${key}`} /><input type="checkbox" checked={filters[key]} onChange={() => setFilters({ ...filters, [key]: !filters[key] })} /></label>, key);
            }
            const checkedCount = subtypes.filter((subtype) => subtypeFilters[key][subtype] !== false).length;
            const allChecked = checkedCount === subtypes.length;
            const noneChecked = checkedCount === 0;
            const expanded = Boolean(expandedGroups[key]);
            function toggleParent() {
              const nextValue = !allChecked;
              setFilters((prevFilters) => ({ ...prevFilters, [key]: nextValue }));
              setSubtypeFilters((prev) => ({ ...prev, [key]: Object.fromEntries(subtypes.map((subtype) => [subtype, nextValue])) }));
            }
            return indent(<div className="live-map-layer-group">
              <label className="checkbox-row live-map-layer">
                <button type="button" className="live-map-layer-expand" aria-label={expanded ? "Collapse" : "Expand"} onClick={() => setExpandedGroups({ ...expandedGroups, [key]: !expanded })}>{expanded ? "−" : "+"}</button>
                <span className="live-map-layer-label">{friendlyMarkerType(key)}</span>
                <span className="muted">{markerCounts[key] || 0}</span>
                <IndeterminateCheckbox checked={allChecked} indeterminate={!allChecked && !noneChecked} onChange={toggleParent} />
              </label>
              {expanded && <div className="live-map-layer-sublist">{(() => {
                const renderSubtypeRow = (subtype: string, label: string = subtype) => {
                  const checked = subtypeFilters[key][subtype] !== false;
                  return <label key={subtype} className="checkbox-row live-map-layer live-map-layer-sub">
                    <span className="live-map-layer-label">{label}</span>
                    <span className="muted">{subtypeCounts[key]?.[subtype] || 0}</span>
                    <span className={`live-map-legend-dot marker-${key} subtype-${subtype.toLowerCase()}`} />
                    <input type="checkbox" checked={checked} onChange={() => {
                      const nextSubtypeState = { ...subtypeFilters[key], [subtype]: !checked };
                      setSubtypeFilters({ ...subtypeFilters, [key]: nextSubtypeState });
                      setFilters((prevFilters) => ({ ...prevFilters, [key]: Object.values(nextSubtypeState).some(Boolean) }));
                    }} />
                  </label>;
                };
                const resolveSubgroup = SUBGROUP_RESOLVERS[key];
                if (!resolveSubgroup) return subtypes.map((subtype) => renderSubtypeRow(subtype));

                const ungrouped: string[] = [];
                const subtypesByGroup = new Map<string, { subtype: string; label: string }[]>();
                for (const subtype of subtypes) {
                  const resolved = resolveSubgroup(subtype);
                  if (!resolved) { ungrouped.push(subtype); continue; }
                  if (!subtypesByGroup.has(resolved.group)) subtypesByGroup.set(resolved.group, []);
                  subtypesByGroup.get(resolved.group)!.push({ subtype, label: resolved.label });
                }
                const groupNames = [...subtypesByGroup.keys()].sort((a, b) => {
                  const orderA = SUBGROUP_ORDER.indexOf(a);
                  const orderB = SUBGROUP_ORDER.indexOf(b);
                  if (orderA === -1 && orderB === -1) return a.localeCompare(b);
                  if (orderA === -1) return 1;
                  if (orderB === -1) return -1;
                  return orderA - orderB;
                });
                const groupBlocks = groupNames.map((group) => {
                  const groupItems = subtypesByGroup.get(group)!;
                  const groupSubtypes = groupItems.map((item) => item.subtype);
                  const groupCheckedCount = groupSubtypes.filter((subtype) => subtypeFilters[key][subtype] !== false).length;
                  const groupAllChecked = groupCheckedCount === groupSubtypes.length;
                  const groupNoneChecked = groupCheckedCount === 0;
                  const groupCount = groupSubtypes.reduce((sum, subtype) => sum + (subtypeCounts[key]?.[subtype] || 0), 0);
                  const groupExpanded = Boolean(expandedSubgroups[key]?.[group]);
                  return <div key={group} className="live-map-layer-subgroup-block">
                    <label className="checkbox-row live-map-layer live-map-layer-subgroup">
                      <button type="button" className="live-map-layer-expand" aria-label={groupExpanded ? "Collapse" : "Expand"} onClick={() => setExpandedSubgroups({ ...expandedSubgroups, [key]: { ...expandedSubgroups[key], [group]: !groupExpanded } })}>{groupExpanded ? "−" : "+"}</button>
                      <span className="live-map-layer-label">{group}</span>
                      <span className="muted">{groupCount}</span>
                      <IndeterminateCheckbox checked={groupAllChecked} indeterminate={!groupAllChecked && !groupNoneChecked} onChange={() => {
                        const nextValue = !groupAllChecked;
                        const nextSubtypeState = { ...subtypeFilters[key], ...Object.fromEntries(groupSubtypes.map((subtype) => [subtype, nextValue])) };
                        setSubtypeFilters({ ...subtypeFilters, [key]: nextSubtypeState });
                        setFilters((prevFilters) => ({ ...prevFilters, [key]: Object.values(nextSubtypeState).some(Boolean) }));
                      }} />
                    </label>
                    {groupExpanded && groupItems.map(({ subtype, label }) => renderSubtypeRow(subtype, label))}
                  </div>;
                });
                return [...ungrouped.map((subtype) => renderSubtypeRow(subtype)), ...groupBlocks];
              })()}</div>}
            </div>, key);
            });
          })()}</div>
        </section>
        <section className="action-section">
          <h4>Coordinates</h4>
          {target ? <KeyValueGrid items={[["X", target.x.toFixed(0)], ["Y", target.y.toFixed(0)], ["Partition", partitionId || "All"]]} /> : <p className="muted">Double-click the map to pick world coordinates.</p>}
        </section>
      </aside>
      <div className="live-map-main">
        <div className="live-map-toolbar">
          <button onClick={() => setZoomAround(zoom * 1.18)}>Zoom In</button>
          <button onClick={() => setZoomAround(zoom * 0.84)}>Zoom Out</button>
          <button onClick={fitLiveMapView}>Fit Map</button>
          <label>Zoom<input className="live-map-zoom-range" type="range" min={zoomMinPercent} max={zoomMaxPercent} value={zoomValuePercent} style={{ "--zoom-progress": `${zoomProgressPercent}%` } as React.CSSProperties} onChange={(event) => setZoomAround(Number(event.target.value) / 100)} /></label>
          <span className="muted">Drag to Pan. Mouse Wheel Zooms.</span>
        </div>
        {teleportResult && <HomeTaskResultCard result={teleportResult} />}
        <div className={`live-map-frame ${drag ? "dragging" : ""} ${playerDrag ? "dragging-player" : ""}`} ref={frameRef}
          onDoubleClick={handleMapDoubleClick}
          onMouseDown={(event) => { if ((event.target as HTMLElement).closest(".live-map-marker")) return; setDrag({ x: event.clientX, y: event.clientY, left: frameRef.current?.scrollLeft || 0, top: frameRef.current?.scrollTop || 0 }); }}
          onMouseMove={(event) => { if (!drag || !frameRef.current) return; frameRef.current.scrollLeft = drag.left - (event.clientX - drag.x); frameRef.current.scrollTop = drag.top - (event.clientY - drag.y); }}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}>
          {activeMap ? <div className="live-map-canvas" ref={canvasRef} style={{ width: Math.floor(activeMap.width * zoom), height: Math.floor(activeMap.height * zoom) }}>
            {activeMap.image ? <img className="live-map-image" src={activeMap.image} alt={activeMap.label} draggable={false} /> : <div className="live-map-placeholder">{activeMap.label}</div>}
            <div className="live-map-marker-layer">
              {targetPoint && <span className="live-map-target" style={{ left: `${targetPoint.px * zoom}px`, top: `${targetPoint.py * zoom}px` }} />}
              {inBounds.map(({ marker, point }, index) => {
                const playerStatus = liveMapPlayerStatus(marker);
                const markerSelected = Boolean(selected && String(selected.type) === String(marker.type) && String(selected.id) === String(marker.id));
                const isPlayer = String(marker.type).toLowerCase() === "player";
                const isDraggingThisPlayer = Boolean(playerDrag && String(playerDrag.marker.id) === String(marker.id) && String(playerDrag.marker.type) === String(marker.type));
                const isPreviewingThisPlayer = Boolean(playerTeleportPreview && String(playerTeleportPreview.marker.id) === String(marker.id) && String(playerTeleportPreview.marker.type) === String(marker.type));
                const renderPoint = isDraggingThisPlayer ? playerDrag!.point : isPreviewingThisPlayer ? playerTeleportPreview!.point : point;
                const spiceSizeClass = SPICE_TIER_TYPES.has(String(marker.type)) && typeof marker.subtype === "string" ? `spice-size-${marker.subtype.toLowerCase()}` : "";
                const subtypeClass = typeof marker.subtype === "string" ? `subtype-${marker.subtype.toLowerCase()}` : "";
                return <button key={`${marker.type}-${marker.id}-${index}`} className={`live-map-marker marker-${marker.type} ${spiceSizeClass} ${subtypeClass} ${playerStatus} ${isDraggingThisPlayer ? "dragging" : ""} ${isPreviewingThisPlayer ? "teleport-preview" : ""}`} title={`${friendlyMarkerType(String(marker.type))}: ${friendlyMarkerName(marker)}`} onMouseDown={(event) => {
                  if (!isPlayer) return;
                  event.stopPropagation();
                  event.preventDefault();
                  liveMapDraggingPlayerRef.current = true;
                  setPlayerDrag({ marker, point, startX: event.clientX, startY: event.clientY });
                }} onClick={(event) => { event.stopPropagation(); setSelected(marker); }} style={{ left: `${renderPoint.px * zoom}px`, top: `${renderPoint.py * zoom}px` }}>
                  {markerSelected && String(marker.type).toLowerCase() === "player" && <span className={`live-map-player-status ${playerStatus}`}>{playerStatus === "online" ? "Online" : "Offline"}</span>}
                </button>;
              })}
            </div>
          </div> : <div className="empty">Loading map configuration...</div>}
        </div>
      </div>
    </div>
    {Object.entries(overlays).filter(([, reason]) => reason).map(([key, reason]) => <p className="danger-note" key={key}>{key}: {reason}</p>)}
    {selected && <section className="drawer"><div className="panel-title"><h3>{friendlyMarkerName(selected)}</h3><button onClick={() => setSelected(null)}>Close</button></div><KeyValueGrid items={[
      ["Type", selected.type],
      ["Name", friendlyMarkerName(selected)],
      ["ID", selected.id],
      ["Map", selected.map],
      ["Partition", selected.partition_id],
      ["X", selected.x],
      ["Y", selected.y],
      ["Z", selected.z]
    ]} /><TechnicalDetails title="Marker technical details" text={JSON.stringify(selected, null, 2)} /></section>}
    {displayRows.length > 0 && <DataTable rows={displayRows.map((row) => ({ ...row, type: friendlyMarkerType(String(row.type)) })) as Record<string, unknown>[]} columns={["type", "display_name", "map", "partition_id", "x", "y", "z"]} />}
  </section>;
}

type LiveMapPoint = { px: number; py: number; inBounds: boolean };

function worldToLiveMapPoint(marker: Pick<LiveMapMarker, "x" | "y">, config: LiveMapConfig): LiveMapPoint | null {
  const x = Number(marker.x);
  const y = Number(marker.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (config.maxX === config.minX || config.maxY === config.minY) return null;
  const px = ((x - config.minX) / (config.maxX - config.minX)) * config.width;
  let py = ((y - config.minY) / (config.maxY - config.minY)) * config.height;
  if (config.flipY) py = config.height - py;
  return {
    px,
    py,
    inBounds: px >= 0 && px <= config.width && py >= 0 && py <= config.height
  };
}

function liveMapPixelsToWorld(px: number, py: number, config: LiveMapConfig) {
  if (!Number.isFinite(px) || !Number.isFinite(py) || config.width === 0 || config.height === 0) return null;
  let normalizedY = py / config.height;
  if (config.flipY) normalizedY = 1 - normalizedY;
  return {
    x: config.minX + (px / config.width) * (config.maxX - config.minX),
    y: config.minY + normalizedY * (config.maxY - config.minY)
  };
}

function liveMapMinimumZoom(config: LiveMapConfig | null | undefined, frame: HTMLElement | null) {
  if (!config || !frame) return 0.16;
  // Math.min, not Math.max -- this needs to be a "contain" fit (the whole
  // map visible, letterboxed on the shorter axis) so the fully-zoomed-out
  // view never overflows the frame and forces a scrollbar. Math.max would
  // "cover" the frame instead, cropping whichever axis has the smaller
  // required ratio.
  const fitRatio = Math.min(frame.clientWidth / config.width, frame.clientHeight / config.height);
  return Math.max(0.02, fitRatio * MIN_ZOOM_FIT_FACTOR);
}

function clampLiveMapZoom(value: number, minimum = 0.16) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(MAX_LIVE_MAP_ZOOM, value));
}

function countMarkers(markers: LiveMapMarker[]) {
  return markers.reduce<Record<string, number>>((acc, marker) => {
    const key = String(marker.type || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countBySubtype(markers: LiveMapMarker[]) {
  return markers.reduce<Record<string, Record<string, number>>>((acc, marker) => {
    if (!marker.subtype) return acc;
    const type = String(marker.type || "unknown");
    if (!acc[type]) acc[type] = {};
    acc[type][marker.subtype] = (acc[type][marker.subtype] || 0) + 1;
    return acc;
  }, {});
}

function friendlyMarkerName(marker: LiveMapMarker) {
  const raw = String(marker.name || marker.id || marker.type || "Marker");
  const normalized = raw.toLowerCase();
  if (/ornithopter.*light|light.*ornithopter/.test(normalized)) return "Light Ornithopter";
  if (/ornithopter.*medium|medium.*ornithopter/.test(normalized)) return "Medium Ornithopter";
  if (/ornithopter.*transport|transport.*ornithopter/.test(normalized)) return "Transport Ornithopter";
  if (/sandbike/.test(normalized)) return "Sandbike";
  if (/buggy/.test(normalized)) return "Buggy";
  if (/tank/.test(normalized)) return "Tank";
  if (/sandcrawler/.test(normalized)) return "Sandcrawler";
  if (/treadwheel/.test(normalized)) return "Treadwheel";
  return raw.replace(/^\/Game\/.*\//, "").replace(/^BP_/, "").replace(/_C$/, "").replaceAll("_", " ");
}

function coriolisSeedNumber(coriolisSeed: string) {
  const match = coriolisSeed.match(/^cor-(\d+)$/);
  return match ? match[1] : coriolisSeed;
}

function friendlyMarkerType(type: string) {
  return {
    player: "Player",
    vehicle: "Vehicle",
    base: "Base",
    storage: "Storage",
    service: "Service",
    spice: "Static Spice Spawns",
    spice_active: "Active Spice Blows",
    flour_sand: "Flour Sand",
    ore: "Ores & Metals",
    scrap: "Scrap & Wrecks",
    flora: "Plants & Fibers",
    poi: "Places, Caves & POIs",
    hazard: "Hazard Zones",
    enemy: "Enemy Camp/Outpost"
  }[type.toLowerCase()] || titleCase(type.replaceAll("_", " "));
}

function liveMapPlayerStatus(marker: LiveMapMarker) {
  if (String(marker.type || "").toLowerCase() !== "player") return String(marker.online_status || "").toLowerCase();
  return String(marker.online_status || "").toLowerCase() === "online" ? "online" : "offline";
}

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Activity, Archive, Database, FileText, Gift, Home, Map, PackagePlus, Play, RefreshCw, Server, Settings, Shield, ShoppingCart, Users } from "lucide-react";
import { api, post, setCsrfToken } from "./api/client";
import { serverApi } from "./api/server";
import { playersApi } from "./api/players";
import { logsApi } from "./api/logs";
import { backupsApi } from "./api/backups";
import { databaseApi } from "./api/database";
import { mapsApi } from "./api/maps";
import { updatesApi } from "./api/updates";
import { worldDataApi } from "./api/worldData";
import { adminApi } from "./api/admin";
import { marketApi } from "./api/market";
import { starterKitApi, type StarterKitConfig } from "./api/starterKit";
import { setupApi, type Task } from "./api/setup";
import { liveMapApi, type LiveMapMarker } from "./api/liveMap";
import { SetupWizard } from "./components/SetupWizard";
import { TaskProgress } from "./components/TaskProgress";
import { LogViewer } from "./components/LogViewer";
import { BackupRestorePanel } from "./components/BackupRestorePanel";
import { PortChecklist } from "./components/PortChecklist";
import { ReadinessTimeline } from "./components/ReadinessTimeline";

type Tab = "Home" | "Setup" | "Server Control" | "Services" | "Players" | "Admin Tools" | "Live Map" | "Maps" | "Market" | "Starter Kit" | "Database" | "Storage" | "Bases" | "Blueprints" | "Backups" | "Logs" | "Updates" | "Settings";
type HomeLoadResult = { statusLoaded: boolean; readinessLoaded: boolean; statusError: string; readinessError: string };

const nav: { tab: Tab; icon: React.ReactNode }[] = [
  { tab: "Home", icon: <Home size={18} /> },
  { tab: "Setup", icon: <Shield size={18} /> },
  { tab: "Server Control", icon: <Server size={18} /> },
  { tab: "Services", icon: <Activity size={18} /> },
  { tab: "Players", icon: <Users size={18} /> },
  { tab: "Admin Tools", icon: <PackagePlus size={18} /> },
  { tab: "Live Map", icon: <Map size={18} /> },
  { tab: "Maps", icon: <Map size={18} /> },
  { tab: "Market", icon: <ShoppingCart size={18} /> },
  { tab: "Starter Kit", icon: <Gift size={18} /> },
  { tab: "Database", icon: <Database size={18} /> },
  { tab: "Storage", icon: <Archive size={18} /> },
  { tab: "Bases", icon: <Server size={18} /> },
  { tab: "Blueprints", icon: <FileText size={18} /> },
  { tab: "Backups", icon: <Archive size={18} /> },
  { tab: "Logs", icon: <FileText size={18} /> },
  { tab: "Updates", icon: <RefreshCw size={18} /> },
  { tab: "Settings", icon: <Settings size={18} /> }
];

const RESTARTABLE_SERVICES = [
  { value: "gateway", label: "Gateway" },
  { value: "director", label: "Director" },
  { value: "text-router", label: "Text Router" },
  { value: "survival-1", label: "Survival 1" },
  { value: "overmap", label: "Overmap" },
  { value: "rmq-admin", label: "RabbitMQ Admin" },
  { value: "rmq-game", label: "RabbitMQ Game" },
  { value: "postgres", label: "Postgres" }
];

const SERVICE_LABELS: Record<string, string> = {
  postgres: "Postgres",
  "rmq-admin": "RabbitMQ Admin",
  "rmq-game": "RabbitMQ Game",
  "text-router": "Text Router",
  director: "Dune Director",
  gateway: "Gateway",
  survival: "Survival",
  "survival-1": "Survival 1",
  overmap: "Overmap",
  orchestrator: "Orchestrator",
  autoscaler: "Autoscaler",
  "dune-postgres": "Postgres",
  "dune-rmq-admin": "RabbitMQ Admin",
  "dune-rmq-game": "RabbitMQ Game",
  "dune-text-router": "Text Router",
  "dune-director": "Dune Director",
  "dune-server-gateway": "Gateway",
  "dune-server-survival-1": "Survival 1",
  "dune-server-overmap": "Overmap",
  "dune-orchestrator": "Orchestrator",
  "dune-autoscaler": "Autoscaler"
};

export function App() {
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("Home");
  const [status, setStatus] = useState("");
  const [readiness, setReadiness] = useState("");
  const [ports, setPorts] = useState("");
  const [doctor, setDoctor] = useState("");
  const [services, setServices] = useState("");
  const [selectedLogService, setSelectedLogService] = useState("gateway");
  const [logs, setLogs] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ authenticated: boolean; csrfToken: string | null }>("/api/auth/state").then((state) => {
      setAuth(state.authenticated);
      setCsrfToken(state.csrfToken);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (task && isTerminalTask(task.status)) setTask(null);
  }, [tab]);

  async function login() {
    const result = await post<{ authenticated: boolean; csrfToken: string }>("/api/auth/login", { password });
    setCsrfToken(result.csrfToken);
    setAuth(result.authenticated);
  }

  async function safe(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  if (!auth) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <h1>Arrakis Server Console</h1>
          <p>Sign in with the local admin password from <code>runtime/secrets/admin-web-password.txt</code>.</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" />
          <button onClick={() => safe(login)}>Sign In</button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Arrakis Server Console</h1>
        <nav>{nav.map((item) => <button key={item.tab} className={tab === item.tab ? "active" : ""} onClick={() => setTab(item.tab)}>{item.icon}{item.tab}</button>)}</nav>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <strong>{tab}</strong>
            <span>Docker-native control for RedBlink Dune self-hosting</span>
          </div>
          <button onClick={() => safe(async () => setStatus((await serverApi.status()).stdout))}><Activity size={16} /> Refresh</button>
        </header>
        {error && <div className="error-banner">{error}</div>}
        {tab === "Home" && <HomePanel status={status} readiness={readiness} setTask={setTask} onLoad={async () => {
          setError("");
          const [nextStatus, nextReadiness] = await Promise.allSettled([serverApi.status(), serverApi.readiness()]);
          const result: HomeLoadResult = { statusLoaded: false, readinessLoaded: false, statusError: "", readinessError: "" };
          if (nextStatus.status === "fulfilled") {
            setStatus(nextStatus.value.stdout);
            result.statusLoaded = true;
          } else {
            result.statusError = nextStatus.reason instanceof Error ? nextStatus.reason.message : String(nextStatus.reason);
          }
          if (nextReadiness.status === "fulfilled") {
            setReadiness(nextReadiness.value.stdout);
            result.readinessLoaded = true;
          } else {
            setReadiness("");
            result.readinessError = nextReadiness.reason instanceof Error ? nextReadiness.reason.message : String(nextReadiness.reason);
          }
          return result;
        }} />}
        {tab === "Setup" && <SetupWizard />}
        {tab === "Server Control" && <ServerPanel setTask={setTask} setStatus={setStatus} setReadiness={setReadiness} setPorts={setPorts} setDoctor={setDoctor} ports={ports} readiness={readiness} doctor={doctor} onError={setError} />}
        {tab === "Services" && <ServicesPanel services={services} setServices={setServices} setTask={setTask} openLogs={(service) => { setSelectedLogService(service); setTab("Logs"); }} onError={setError} />}
        {tab === "Players" && <PlayersPanel setTask={setTask} onError={setError} />}
        {tab === "Admin Tools" && <AdminToolsPanel setTask={setTask} onError={setError} />}
        {tab === "Live Map" && <LiveMapPanel onError={setError} />}
        {tab === "Maps" && <MapsPanel setTask={setTask} onError={setError} />}
        {tab === "Market" && <MarketPanel onError={setError} />}
        {tab === "Starter Kit" && <StarterKitPanel onError={setError} />}
        {tab === "Database" && <DatabasePanel setTask={setTask} />}
        {tab === "Storage" && <StoragePanel onError={setError} />}
        {tab === "Bases" && <WorldListPanel title="Bases" load={worldDataApi.bases} exportUrl={(id) => worldDataApi.baseExportUrl(id)} exportLabel="Export Blueprint JSON" blockedText="Base import and delete remain blocked until ownership, position, entity ID remapping, and full object graph deletion rules are verified." onError={setError} />}
        {tab === "Blueprints" && <WorldListPanel title="Blueprints" load={worldDataApi.blueprints} exportUrl={(id) => worldDataApi.blueprintExportUrl(id)} exportLabel="Export Full JSON" blockedText="Blueprint import, clone, and delete remain blocked until offline-player inventory ownership, blueprint item stat wiring, and ID remapping rules are verified." onError={setError} />}
        {tab === "Backups" && <BackupsPanel setTask={setTask} onError={setError} />}
        {tab === "Logs" && <LogsPanel selectedService={selectedLogService} setSelectedService={setSelectedLogService} text={logs} setText={setLogs} onError={setError} />}
        {tab === "Updates" && <UpdatesPanel setTask={setTask} />}
        {tab === "Settings" && <SettingsPanel />}
        <TaskProgress task={task} onDismiss={() => setTask(null)} />
      </main>
    </div>
  );
}

function HomePanel({ status, readiness, setTask, onLoad }: { status: string; readiness: string; setTask: (task: Task) => void; onLoad: () => Promise<HomeLoadResult> }) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [readinessWarning, setReadinessWarning] = useState("");
  const [hasLoaded, setHasLoaded] = useState(Boolean(status || readiness));

  async function refresh(isActive = () => true) {
    setLoading(true);
    setLocalError("");
    setReadinessWarning("");
    try {
      const result = await onLoad();
      if (!isActive()) return;
      if (result.statusLoaded || result.readinessLoaded) {
        setHasLoaded(true);
        if (!result.readinessLoaded && result.readinessError) setReadinessWarning(result.readinessError);
        if (!result.statusLoaded && result.statusError) setLocalError(result.statusError);
      } else {
        setLocalError(result.statusError || result.readinessError || "Server status and readiness checks failed.");
      }
    } catch (error) {
      if (isActive()) setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      if (isActive()) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    refresh(() => active);
    return () => { active = false; };
  }, []);

  if (loading && !hasLoaded) {
    return <section className="grid">
      <article className="hero-panel wide loading-panel">
        <span className="spinner" aria-hidden="true" />
        <div>
          <h2>Checking server status...</h2>
          <p>Checking readiness...</p>
          <p>This can take a few seconds while Docker and Dune health checks run.</p>
        </div>
      </article>
    </section>;
  }

  if (localError && !hasLoaded) {
    return <section className="grid">
      <article className="hero-panel wide">
        <h2>Server status unavailable</h2>
        <p className="error">{localError}</p>
        <button onClick={() => refresh()}>Retry Status Check</button>
      </article>
    </section>;
  }

  return (
    <section className="grid">
      <article className="hero-panel">
        <h2>Server Overview</h2>
        <p>Use this dashboard for setup, service health, logs, backups, updates, and player admin actions.</p>
        <div className="action-row">
          <button disabled={loading} onClick={() => refresh()}>{loading ? "Refreshing..." : "Refresh Status"}</button>
          <button onClick={async () => setTask((await serverApi.start()).task)}><Play size={16} /> Start</button>
          <button onClick={async () => window.confirm("Stop the Dune server stack?") && setTask((await serverApi.stop()).task)}>Stop</button>
          <button onClick={async () => window.confirm("Restart the Dune server stack?") && setTask((await serverApi.restart()).task)}>Restart</button>
        </div>
        {localError && <p className="error">{localError}</p>}
      </article>
      <HomeHealthCards status={status} readiness={readiness} readinessWarning={readinessWarning} loading={loading} />
      {readinessWarning && <article className="panel wide warning-panel">
        <h3>Readiness check warning</h3>
        <p>Dune readiness can fail while the stack is still starting or partially unavailable. Server status loaded, so the web admin is still connected.</p>
        <TechnicalDetails title="Advanced readiness error" text={readinessWarning} />
      </article>}
      <TechnicalDetails className="wide advanced-debug" title="Advanced diagnostics" text={formatTechnicalText([
        ["dune status", status || "Status has not been loaded."],
        ["dune ready", readiness || readinessWarning || "Readiness has not been loaded."]
      ])} />
    </section>
  );
}

function ServerPanel(props: { setTask: (task: Task) => void; setStatus: (text: string) => void; setReadiness: (text: string) => void; setPorts: (text: string) => void; setDoctor: (text: string) => void; ports: string; readiness: string; doctor: string; onError: (text: string) => void }) {
  const [service, setService] = useState(RESTARTABLE_SERVICES[0].value);
  async function run(action: () => Promise<unknown>) {
    props.onError("");
    try { await action(); } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  }
  useEffect(() => {
    run(async () => {
      props.setStatus((await serverApi.status()).stdout);
      props.setReadiness((await serverApi.readiness()).stdout);
      props.setPorts((await serverApi.ports()).stdout);
      props.setDoctor((await serverApi.doctor()).stdout);
    });
  }, []);
  return (
    <section className="panel">
      <h2>Server Controls</h2>
      <div className="action-row">
        <button onClick={() => run(async () => props.setTask((await serverApi.start()).task))}><Play size={16} /> Start</button>
        <button onClick={() => run(async () => { if (window.confirm("Stop the Dune server stack?")) props.setTask((await serverApi.stop()).task); })}>Stop</button>
        <button onClick={() => run(async () => { if (window.confirm("Restart the Dune server stack?")) props.setTask((await serverApi.restart()).task); })}>Restart</button>
        <button onClick={() => run(async () => props.setReadiness((await serverApi.readiness()).stdout))}>Readiness</button>
        <button onClick={() => run(async () => props.setPorts((await serverApi.ports()).stdout))}>Ports</button>
        <button onClick={() => run(async () => props.setDoctor((await serverApi.doctor()).stdout))}>Doctor</button>
      </div>
      <div className="action-row">
        <label className="compact-select">Restart service<select value={service} onChange={(event) => setService(event.target.value)}>
          {RESTARTABLE_SERVICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        <button onClick={() => run(async () => { if (window.confirm(`Restart ${friendlyServiceName(service)}?`)) props.setTask((await serverApi.restartService(service)).task); })}>Restart Service</button>
      </div>
      <section className="action-section">
        <h4>Scheduled Restarts, Server Title, and Redeploy</h4>
        <p>These controls are planned for Phase 12B. The CLI has server title support and database backup scheduling, but web exposure needs dedicated routes, audit entries, and restart/confirmation design before it is safe to ship.</p>
      </section>
      <ReadinessTimeline text={props.readiness} />
      <PortChecklist text={props.ports} />
      <DoctorSummary text={props.doctor} />
    </section>
  );
}

function ServicesPanel({ services, setServices, setTask, openLogs, onError }: { services: string; setServices: (text: string) => void; setTask: (task: Task) => void; openLogs: (service: string) => void; onError: (text: string) => void }) {
  const rows = parseServiceRows(services);
  async function load() {
    onError("");
    try { setServices((await serverApi.services()).stdout); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  async function restart(service: string) {
    onError("");
    try {
      if (window.confirm(`Restart ${service}?`)) setTask((await serverApi.restartService(service)).task);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="panel">
      <div className="panel-title"><h2>Services</h2><button onClick={load}>Refresh Services</button></div>
      {rows.length === 0 ? <div className="empty">{services ? "No services parsed from the current Docker output." : "Services are loading or unavailable."}</div> : <div className="service-table">
        {rows.map((row) => <article className="service-card" key={row.name}>
          <div><strong>{friendlyServiceName(row.name)}</strong><span>{row.status}</span><span>{row.ports}</span></div>
          <div className="service-actions">
            {serviceActionName(row.name, "restart") && <button onClick={() => restart(serviceActionName(row.name, "restart") || row.name)}>Restart</button>}
            <button onClick={() => openLogs(serviceActionName(row.name, "logs") || row.name)}>Logs</button>
          </div>
        </article>)}
      </div>}
    </section>
  );
}

function AdminToolsPanel({ setTask, onError }: { setTask: (task: Task) => void; onError: (text: string) => void }) {
  const [playerId, setPlayerId] = useState("");
  const [players, setPlayers] = useState<Record<string, unknown>[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemId, setItemId] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState("");
  const [liveToolSummary, setLiveToolSummary] = useState("");
  const [liveToolDetails, setLiveToolDetails] = useState("");
  const [xp, setXp] = useState("1000");
  const [message, setMessage] = useState("");
  const [broadcastDuration, setBroadcastDuration] = useState("30");
  const [history, setHistory] = useState("");
  async function run(action: () => Promise<unknown>) {
    onError("");
    try { await action(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  function showLiveToolResult(result: unknown) {
    setLiveToolSummary(formatLiveToolResult(result));
    setLiveToolDetails(JSON.stringify(result, null, 2));
  }
  useEffect(() => {
    playersApi.list().then((result) => setPlayers(result.rows || [])).catch(() => undefined);
  }, []);
  function selectPlayer(value: string) {
    setSelectedPlayer(value);
    const row = players.find((player) => String(player.actor_id || player.player_pawn_id || player.action_player_id) === value);
    setPlayerId(String(row?.action_player_id || row?.funcom_id || row?.fls_id || row?.account_id || ""));
  }
  return (
    <section className="panel">
      <h2>Admin Tools</h2>
      <div className="action-section">
        <h4>Quick Player Actions</h4>
        <p>Select a known player to populate the Admin action ID. Use advanced manual entry only if a player is not listed.</p>
        <div className="action-line">
          <label className="wide-field">Player<select value={selectedPlayer} onChange={(event) => selectPlayer(event.target.value)}>
            <option value="">Select player</option>
            {players.map((player) => <option key={String(player.actor_id || player.player_pawn_id || player.action_player_id)} value={String(player.actor_id || player.player_pawn_id || player.action_player_id)}>
              {String(player.character_name || "Unknown")} - {String(player.online_status || "unknown")} - admin {String(player.action_player_id || "missing")}
            </option>)}
          </select></label>
        </div>
        <details className="technical-details"><summary>Advanced manual player ID</summary><label>Player FLS/Admin ID<input value={playerId} onChange={(event) => setPlayerId(event.target.value)} /></label></details>
      </div>
      <div className="two-col">
        <label>Item Name<input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ornithopter part" /></label>
        <button onClick={() => run(async () => window.confirm(`Give 1 x ${itemName} to ${playerId}?`) && setTask((await playersApi.giveItem(playerId, { itemName, quantity: 1, durability: 1 })).task))}>Give Item</button>
        <label>Raw Item ID<input value={itemId} onChange={(event) => setItemId(event.target.value)} placeholder="ItemTemplate_5" /></label>
        <button onClick={() => run(async () => window.confirm(`Give item id ${itemId} to ${playerId}?`) && setTask((await playersApi.giveItemId(playerId, { itemId, quantity: 1, durability: 1 })).task))}>Give Item by ID</button>
        <label>XP Amount<input value={xp} onChange={(event) => setXp(event.target.value)} /></label>
        <button onClick={() => run(async () => window.confirm(`Add ${xp} XP to ${playerId}?`) && setTask((await playersApi.addXp(playerId, Number(xp))).task))}>Add XP</button>
        <button onClick={() => run(async () => window.confirm(`Refill water for ${playerId}?`) && setTask((await playersApi.refillWater(playerId)).task))}>Refill Water</button>
        <button onClick={() => run(async () => window.confirm(`Give Scout Ornithopter Mk6 parts to ${playerId}?`) && setTask((await playersApi.giveTemplate(playerId)).task))}>Give Multiple Items</button>
        <button className="danger" onClick={() => run(async () => window.confirm(`Kick ${playerId} from the server?`) && setTask((await playersApi.kick(playerId)).task))}>Kick Player</button>
      </div>
      <h3>Catalogs</h3>
      <div className="action-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items, vehicles, or skill modules" />
        <button onClick={() => run(async () => setCatalog((await adminApi.itemSearch(search)).stdout))}>Item Search</button>
        <button onClick={() => run(async () => setCatalog((await adminApi.itemList()).stdout))}>Item List</button>
        <button onClick={() => run(async () => setCatalog((await adminApi.vehicles(search)).stdout))}>Vehicle List</button>
        <button onClick={() => run(async () => setCatalog((await adminApi.skillModules(search)).stdout))}>Skill Module List</button>
      </div>
      <div className="result-panel">
        <strong>Catalog Results</strong>
        <pre className="mini-output">{catalog || "Use the catalog tools to find item names, raw item IDs, vehicles, and skill modules."}</pre>
      </div>
      <h3>Global Live Tools</h3>
      <p className="danger-note">Experimental: RabbitMQ publish works, but in-game display is not working/verified on the live server.</p>
      <div className="action-line">
        <button className="danger" onClick={() => run(async () => window.confirm("Kick every online player? This publishes PlayerId='*'.") && setTask((await adminApi.kickAllOnline("KICK ALL ONLINE PLAYERS")).task))}>Kick All Online Players</button>
      </div>
      <div className="action-line broadcast-line">
        <label className="broadcast-message">Broadcast Message<input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Broadcast or whisper message" /></label>
        <label className="inline-field">Duration seconds<input type="number" min="1" max="3600" value={broadcastDuration} onChange={(event) => setBroadcastDuration(event.target.value)} /></label>
        <button onClick={() => run(async () => showLiveToolResult(await adminApi.broadcast(message, Number(broadcastDuration || 30))))}>Broadcast Publish Test</button>
      </div>
      <div className="action-line">
        <button className="danger" onClick={() => run(async () => { if (window.confirm("Send shutdown broadcast publish test? In-game visibility is unverified.")) showLiveToolResult(await adminApi.shutdownBroadcast({ confirmation: "SHUTDOWN BROADCAST", delayMinutes: 15, shutdownType: "Restart" })); })}>Shutdown Broadcast Publish Test</button>
        <button onClick={() => run(async () => showLiveToolResult(await adminApi.whisper(playerId, message)))}>Whisper</button>
      </div>
      <div className="result-panel">
        <strong>Global Live Tool Result</strong>
        <p>{liveToolSummary || "Broadcast, shutdown broadcast, and whisper results appear here. Broadcast publish success does not prove in-game display."}</p>
        {liveToolDetails && <TechnicalDetails text={liveToolDetails} />}
      </div>
      <h3>Command History</h3>
      <button onClick={() => run(async () => setHistory((await adminApi.history()).stdout))}>Refresh Command History</button>
      <DataTable rows={parseHistoryRows(history)} columns={["time", "action", "target", "status", "summary"]} />
      {!history && <div className="empty">History comes from runtime/generated/admin-command-history.tsv.</div>}
      {history && <TechnicalDetails title="Advanced history output" text={history} />}
    </section>
  );
}

function PlayersPanel({ setTask, onError }: { setTask: (task: Task) => void; onError: (text: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState("inventory");
  async function load(online = false) {
    onError("");
    try {
      const result = online ? await playersApi.online() : await playersApi.list(q);
      setRows(result.rows || []);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  async function open(row: Record<string, unknown>) {
    const id = String(row.actor_id || row.player_pawn_id || row.id || "");
    setSelected(row);
    setDetail(await playersApi.profile(id));
  }
  useEffect(() => {
    load(false);
  }, []);
  const dbPlayerId = selected ? String(selected.actor_id || selected.player_pawn_id || selected.id || "") : "";
  const actionPlayerId = selected ? String(selected.action_player_id || selected.funcom_id || selected.fls_id || selected.account_id || "") : "";
  return (
    <section className="panel">
      <div className="panel-title"><h2>Players</h2><div className="action-row"><button onClick={() => load(false)}>Refresh Players</button><button onClick={() => load(true)}>Online Only</button></div></div>
      <div className="action-row"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search character, FLS ID, account id, or actor id" /><button onClick={() => load(false)}>Search</button></div>
      <DataTable rows={rows} columns={["actor_id", "character_name", "account_id", "action_player_id", "online_status", "map", "fls_id"]} onRowClick={open} />
      {selected && <section className="drawer">
        <div className="panel-title"><h3>{String(selected.character_name || selected.actor_id)}</h3><button onClick={() => setSelected(null)}>Close</button></div>
        <div className="two-col">
          <p><strong>DB actor/player ID:</strong> {dbPlayerId || "missing"}</p>
          <p><strong>Admin action ID:</strong> {actionPlayerId || "missing"}</p>
        </div>
        <PlayerSummary detail={detail} fallback={selected} dbPlayerId={dbPlayerId} actionPlayerId={actionPlayerId} />
        <PlayerCapabilities capabilities={(detail?.capabilities as Record<string, unknown> | undefined) || {}} />
        <TechnicalDetails title="Advanced player data" text={JSON.stringify(detail, null, 2)} />
        <div className="action-row">{["inventory", "currency", "factions", "specs", "position", "progression", "events", "stats", "history"].map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
        <PlayerDetailTab playerId={dbPlayerId} tab={tab} onError={onError} />
        <PlayerActions dbPlayerId={dbPlayerId} actionPlayerId={actionPlayerId} setTask={setTask} onError={onError} onRefresh={() => open(selected)} />
      </section>}
    </section>
  );
}

function PlayerActions({ dbPlayerId, actionPlayerId, setTask, onError, onRefresh }: { dbPlayerId: string; actionPlayerId: string; setTask: (task: Task) => void; onError: (text: string) => void; onRefresh: () => void }) {
  const [itemName, setItemName] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [multiItems, setMultiItems] = useState("");
  const [xp, setXp] = useState("1000");
  const [points, setPoints] = useState("0");
  const [module, setModule] = useState("");
  const [level, setLevel] = useState("1");
  const [coords, setCoords] = useState({ x: "", y: "", z: "", yaw: "0" });
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleTemplate, setVehicleTemplate] = useState("");
  const [vehicleCatalog, setVehicleCatalog] = useState<Record<string, string[]>>({});
  const [currency, setCurrency] = useState({ currencyId: "0", amount: "1" });
  const [faction, setFaction] = useState({ factionId: "1", amount: "1" });
  const [refuelVehicleId, setRefuelVehicleId] = useState("");
  const [result, setResult] = useState("");
  const [resultDetails, setResultDetails] = useState("");
  async function run(action: () => Promise<unknown>) {
    onError("");
    setResult("");
    setResultDetails("");
    try { await action(); } catch (error) { const text = error instanceof Error ? error.message : String(error); setResult(text); onError(text); }
  }
  async function runTask(action: () => Promise<{ task: Task }>) {
    const response = await action();
    const final = await waitForTask(response.task, setTask);
    if (final.status === "succeeded") onRefresh();
    else throw new Error(final.errorMessage || final.progressMessage || `Task ${final.status}`);
  }
  async function runDirect(action: () => Promise<unknown>) {
    const response = await action();
    setResult(formatMutationResult(response));
    setResultDetails(JSON.stringify(response, null, 2));
    onRefresh();
  }
  function parsedMultiItems() {
    return multiItems.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [nameOrId, qty = "1", durability = "1"] = line.split(",").map((part) => part.trim());
      const item = /^[A-Za-z0-9_./:-]{16,}$/.test(nameOrId) ? { itemId: nameOrId } : { itemName: nameOrId };
      return { ...item, quantity: Number(qty), durability: Number(durability) };
    });
  }
  async function useCurrentPosition() {
    const data = await playersApi.position(dbPlayerId);
    const position = (data.position || data) as Record<string, unknown>;
    const x = firstDefined(position.x, position.X, position.location_x, position.pos_x);
    const y = firstDefined(position.y, position.Y, position.location_y, position.pos_y);
    const z = firstDefined(position.z, position.Z, position.location_z, position.pos_z);
    const yaw = firstDefined(position.yaw, position.Yaw, position.rotation_yaw, position.rot_yaw, 0);
    if (x === undefined || y === undefined || z === undefined) throw new Error("Current position is not available from the detected player position schema.");
    setCoords({ x: String(x), y: String(y), z: String(z), yaw: String(yaw ?? 0) });
    setResult("Teleport coordinates filled from the selected player's current DB position. Yaw defaults to 0 when unavailable.");
  }
  useEffect(() => {
    adminApi.structuredVehicles().then((response) => {
      const parsed = Object.fromEntries((response.vehicles || []).map((vehicle) => [vehicle.id || vehicle.name, vehicle.templates || []]).filter(([id]) => id));
      setVehicleCatalog(parsed);
      const firstVehicle = Object.keys(parsed)[0] || "";
      if (firstVehicle && !vehicleId) {
        setVehicleId(firstVehicle);
        setVehicleTemplate(parsed[firstVehicle]?.[0] || "");
      }
    }).catch(() => {
      adminApi.vehicles("").then((response) => {
        const parsed = parseVehicleCatalog(response.stdout || "");
        setVehicleCatalog(parsed);
      }).catch(() => undefined);
    });
  }, []);
  const vehicleIds = Object.keys(vehicleCatalog);
  const selectedTemplates = vehicleCatalog[vehicleId] || [];
  const canRunCliAction = Boolean(actionPlayerId);
  const cliDisabledReason = "This player row is missing a Funcom/FLS admin action ID. CLI-backed actions are disabled to avoid sending the DB actor ID to dune admin.";
  return <section className="action-panel">
    <h3>Player Actions</h3>
    {!canRunCliAction && <p className="danger-note">{cliDisabledReason}</p>}
    {result && <div className="result-panel"><strong>Action Result</strong><p>{result}</p>{resultDetails && <TechnicalDetails text={resultDetails} />}</div>}
    <div className="action-sections">
      <section className="action-section">
        <h4>Give Items</h4>
        <p>Use item names for common grants, or raw item IDs from the catalog.</p>
        <div className="actions-grid">
          <label>Item Name<input value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
          <label>Quantity<input value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Give ${quantity} x ${itemName} to player ${actionPlayerId}?`)) await runTask(() => playersApi.giveItem(actionPlayerId, { itemName, quantity: Number(quantity), durability: 1 })); })}>Give Item</button>
          <label>Raw Item ID<input value={itemId} onChange={(event) => setItemId(event.target.value)} /></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Give raw item id ${itemId} to player ${actionPlayerId}?`)) await runTask(() => playersApi.giveItemId(actionPlayerId, { itemId, quantity: Number(quantity), durability: 1 })); })}>Give Item by ID</button>
        </div>
        <label>Multiple Items<textarea value={multiItems} onChange={(event) => setMultiItems(event.target.value)} placeholder="One item per line: name or raw id, quantity, durability" rows={4} /></label>
        <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { const items = parsedMultiItems(); if (window.confirm(`Give ${items.length} item entries to player ${actionPlayerId}?`)) await runDirect(() => playersApi.giveItems(actionPlayerId, items)); })}>Give Multiple Items</button>
      </section>

      <section className="action-section">
        <h4>XP / Skills</h4>
        <div className="action-line">
          <label>XP Amount<input value={xp} onChange={(event) => setXp(event.target.value)} /></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Add ${xp} XP to player ${actionPlayerId}?`)) await runTask(() => playersApi.addXp(actionPlayerId, Number(xp))); })}>Add XP</button>
        </div>
        <div className="action-line">
          <label>Skill Points<input value={points} onChange={(event) => setPoints(event.target.value)} /></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Set player ${actionPlayerId} to ${points} unspent skill points?`)) await runTask(() => playersApi.setSkillPoints(actionPlayerId, Number(points))); })}>Set Skill Points</button>
        </div>
        <div className="action-line">
          <label>Skill Module<input value={module} onChange={(event) => setModule(event.target.value)} /></label>
          <label>Level<input value={level} onChange={(event) => setLevel(event.target.value)} /></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Set ${module} to level ${level} for player ${actionPlayerId}?`)) await runTask(() => playersApi.setSkillModule(actionPlayerId, { module, level: Number(level) })); })}>Set Skill Module</button>
        </div>
      </section>

      <section className="action-section">
        <h4>Survival</h4>
        <p>Refill Water uses the live admin CLI and was verified in-game.</p>
        <div className="action-line">
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Refill water for player ${actionPlayerId}?`)) await runTask(() => playersApi.refillWater(actionPlayerId)); })}>Refill Water</button>
        </div>
      </section>

      <section className="action-section">
        <h4>Movement / Vehicles</h4>
        <p>Use current position only to copy known coordinates; edit X/Y/Z before teleporting if needed. Yaw defaults to 0 when unavailable.</p>
        <div className="action-line">
          <label>X<input value={coords.x} onChange={(event) => setCoords({ ...coords, x: event.target.value })} /></label>
          <label>Y<input value={coords.y} onChange={(event) => setCoords({ ...coords, y: event.target.value })} /></label>
          <label>Z<input value={coords.z} onChange={(event) => setCoords({ ...coords, z: event.target.value })} /></label>
          <label>Yaw<input value={coords.yaw} onChange={(event) => setCoords({ ...coords, yaw: event.target.value })} /></label>
          <button onClick={() => run(useCurrentPosition)}>Use Current Position</button>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Teleport player ${actionPlayerId} to X=${coords.x} Y=${coords.y} Z=${coords.z}?`)) await runTask(() => playersApi.teleport(actionPlayerId, { x: Number(coords.x), y: Number(coords.y), z: Number(coords.z), yaw: Number(coords.yaw) })); })}>Teleport</button>
        </div>
        <div className="action-line">
          <label>Vehicle<select value={vehicleId} onChange={(event) => { const nextVehicle = event.target.value; setVehicleId(nextVehicle); setVehicleTemplate(vehicleCatalog[nextVehicle]?.[0] || ""); }}>
            {vehicleIds.length === 0 && <option value="">Manual vehicle ID</option>}
            {vehicleIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select></label>
          <label>Template<select value={vehicleTemplate} onChange={(event) => setVehicleTemplate(event.target.value)}>
            {selectedTemplates.length === 0 && <option value="">Manual template</option>}
            {selectedTemplates.map((template) => <option key={template} value={template}>{template}</option>)}
          </select></label>
          <button disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => {
            const knownTemplates = Object.values(vehicleCatalog).flat();
            if (knownTemplates.includes(vehicleId) && !vehicleCatalog[vehicleId]) throw new Error(`${vehicleId} is a vehicle template, not a vehicle ID. Choose a vehicle such as Sandbike, then choose ${vehicleId} as the template.`);
            if (window.confirm(`Spawn ${vehicleId}/${vehicleTemplate} in front of player ${actionPlayerId}?`)) await runTask(() => playersApi.spawnVehicle(actionPlayerId, { vehicleId, template: vehicleTemplate, offset: 400 }));
          })}>Spawn Vehicle</button>
        </div>
        <details>
          <summary>Advanced manual override</summary>
          <div className="actions-grid">
            <label>Manual Vehicle ID<input value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} placeholder="Sandbike" /></label>
            <label>Manual Template<input value={vehicleTemplate} onChange={(event) => setVehicleTemplate(event.target.value)} placeholder="T1_ExtraSeat" /></label>
          </div>
        </details>
      </section>

      <section className="action-section">
        <h4>Currency / Factions</h4>
        <p>These direct DB mutations create a backup first and use the DB player ID.</p>
        <div className="action-line">
          <label>Currency ID<input value={currency.currencyId} onChange={(event) => setCurrency({ ...currency, currencyId: event.target.value })} /></label>
          <label>Currency Amount<input value={currency.amount} onChange={(event) => setCurrency({ ...currency, amount: event.target.value })} /></label>
          <button onClick={() => run(async () => { if (window.confirm(`Add ${currency.amount} currency ${currency.currencyId || "Solaris"} to DB player ${dbPlayerId}? A backup will be created first.`)) await runDirect(() => playersApi.addCurrency(dbPlayerId, { currencyId: Number(currency.currencyId || 0), amount: Number(currency.amount), confirmation: "ADD CURRENCY" })); })}>Add Currency</button>
        </div>
        <div className="action-line">
          <label>Faction ID<input value={faction.factionId} onChange={(event) => setFaction({ ...faction, factionId: event.target.value })} /></label>
          <label>Reputation Amount<input value={faction.amount} onChange={(event) => setFaction({ ...faction, amount: event.target.value })} /></label>
          <button onClick={() => run(async () => { if (window.confirm(`Add ${faction.amount} reputation for faction ${faction.factionId} to DB player ${dbPlayerId}? A backup will be created first.`)) await runDirect(() => playersApi.addFactionReputation(dbPlayerId, { factionId: Number(faction.factionId), amount: Number(faction.amount), confirmation: "ADD FACTION REPUTATION" })); })}>Add Faction Reputation</button>
        </div>
      </section>

      <section className="action-section">
        <h4>Repair / Refuel</h4>
        <p>Offline DB-backed repair/refuel actions create a backup first.</p>
        <div className="action-line">
          <button onClick={() => run(async () => { if (window.confirm(`Repair gear for offline DB player ${dbPlayerId}? A backup will be created first.`)) await runDirect(() => playersApi.repairGear(dbPlayerId, "REPAIR GEAR")); })}>Repair Gear</button>
        </div>
        <div className="action-line">
          <label>Refuel Vehicle Actor ID<input value={refuelVehicleId} onChange={(event) => setRefuelVehicleId(event.target.value)} /></label>
          <button onClick={() => run(async () => { if (window.confirm(`Refuel vehicle ${refuelVehicleId} owned by DB player ${dbPlayerId}? A backup will be created first.`)) await runDirect(() => playersApi.refuelVehicle(dbPlayerId, { vehicleId: refuelVehicleId, confirmation: "REFUEL VEHICLE" })); })}>Refuel Vehicle</button>
        </div>
      </section>

      <section className="action-section danger-section">
        <h4>Dangerous Actions</h4>
        <p>These live CLI actions are destructive or disruptive and still require backend confirmation phrases.</p>
        <div className="action-row">
          <button className="danger" disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Kick player ${actionPlayerId}?`)) await runTask(() => playersApi.kick(actionPlayerId)); })}>Kick Player</button>
          <button className="danger" disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Clean inventory for player ${actionPlayerId}? This removes carried items.`)) await runTask(() => playersApi.cleanInventory(actionPlayerId, "CLEAN INVENTORY")); })}>Clean Inventory</button>
          <button className="danger" disabled={!canRunCliAction} title={!canRunCliAction ? cliDisabledReason : undefined} onClick={() => run(async () => { if (window.confirm(`Reset progression for player ${actionPlayerId}?`)) await runTask(() => playersApi.resetProgression(actionPlayerId, "RESET PROGRESSION")); })}>Reset Progression</button>
        </div>
      </section>
    </div>
  </section>;
}

async function waitForTask(task: Task, setTask: (task: Task) => void) {
  let current = task;
  setTask(current);
  for (let i = 0; i < 180 && !["succeeded", "failed", "cancelled"].includes(current.status); i += 1) {
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 1000));
    current = (await setupApi.task(current.id)).task;
    setTask(current);
  }
  return current;
}

function PlayerDetailTab({ playerId, tab, onError }: { playerId: string; tab: string; onError: (text: string) => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [messageDetails, setMessageDetails] = useState("");
  async function loadTab() {
    const loaders: Record<string, () => Promise<Record<string, unknown>>> = {
      inventory: () => playersApi.inventory(playerId),
      currency: () => playersApi.currency(playerId),
      factions: () => playersApi.factions(playerId),
      specs: () => playersApi.specs(playerId),
      position: () => playersApi.position(playerId),
      progression: () => playersApi.progression(playerId),
      events: () => playersApi.events(playerId),
      stats: () => playersApi.stats(playerId),
      history: () => playersApi.history(playerId)
    };
    setData(null);
    setMessage("");
    await loaders[tab]?.().then(setData).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  }
  useEffect(() => {
    loadTab();
  }, [playerId, tab]);
  async function deleteItem(row: Record<string, unknown>) {
    const itemId = String(row.id || "");
    if (!window.confirm(`Delete item ${itemId} (${String(row.template_id || "")}) from player ${playerId}? A database backup will be created first.`)) return;
    try {
      const response = await playersApi.deleteInventoryItem(playerId, itemId, "DELETE ITEM");
      setMessage(formatMutationResult(response));
      setMessageDetails(JSON.stringify(response, null, 2));
      await loadTab();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      setMessageDetails("");
      onError(text);
    }
  }
  const rows = Array.isArray(data?.rows) ? data.rows as Record<string, unknown>[] : data?.position ? [data.position as Record<string, unknown>] : [];
  return <div>{data?.reason ? <p className="danger-note">{String(data.reason)}</p> : null}{message && <div className="result-panel"><strong>Mutation Result</strong><p>{message}</p>{messageDetails && <TechnicalDetails text={messageDetails} />}</div>}<DataTable rows={rows} action={tab === "inventory" ? (row) => <button className="danger" onClick={(event) => { event.stopPropagation(); deleteItem(row); }}>Delete Item</button> : undefined} /></div>;
}

function LogsPanel({ selectedService, setSelectedService, text, setText, onError }: { selectedService: string; setSelectedService: (service: string) => void; text: string; setText: Dispatch<SetStateAction<string>>; onError: (text: string) => void }) {
  const [services, setServices] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    logsApi.services().then((result) => setServices(result.services)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!streaming) return;
    const source = new EventSource(logsApi.streamUrl(selectedService), { withCredentials: true });
    source.onmessage = (event) => {
      if (paused) return;
      const data = JSON.parse(event.data) as { line: string };
      setText((current) => `${current}${data.line}`);
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [streaming, paused, selectedService]);
  const shown = filter ? text.split(/\r?\n/).filter((line) => line.toLowerCase().includes(filter.toLowerCase())).join("\n") : text;
  return (
    <section className="panel">
      <h2>Logs</h2>
      <div className="action-row">
        <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
          {services.map((service) => <option key={service} value={service}>{friendlyServiceName(service)}</option>)}
        </select>
        <button onClick={async () => { onError(""); try { setText((await logsApi.get(selectedService)).stdout); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } }}>Refresh Logs</button>
        <button onClick={() => setStreaming(!streaming)}>{streaming ? "Stop Stream" : "Live Stream"}</button>
        <button onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
        <a className="button-link" href={logsApi.downloadUrl(selectedService)}>Download</a>
      </div>
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search logs" />
      <LogViewer text={shown} />
    </section>
  );
}

function DatabasePanel({ setTask }: { setTask: (task: Task) => void }) {
  const [schema, setSchema] = useState("dune");
  const [tables, setTables] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{ columns?: { name: string }[]; rows?: Record<string, unknown>[] } | null>(null);
  const [columns, setColumns] = useState<Record<string, unknown>[]>([]);
  const [count, setCount] = useState("");
  const [sql, setSql] = useState("select * from dune.player_state limit 25");
  const [confirmation, setConfirmation] = useState("");
  const [queryResult, setQueryResult] = useState<{ columns?: { name: string }[]; rows?: Record<string, unknown>[] } | null>(null);
  const [search, setSearch] = useState("");
  const [searchRows, setSearchRows] = useState<Record<string, unknown>[]>([]);
  async function loadTables() { setTables(await databaseApi.tables(schema)); }
  useEffect(() => {
    loadTables().catch(() => undefined);
  }, []);
  async function open(table: string) {
    setSelected(table);
    const [nextPreview, nextColumns, nextCount] = await Promise.all([
      databaseApi.preview(schema, table, 50, 0),
      databaseApi.columns(schema, table),
      databaseApi.count(schema, table)
    ]);
    setPreview(nextPreview);
    setColumns(nextColumns);
    setCount(String(nextCount.count));
  }
  return <section className="panel">
    <h2>Database Browser</h2>
    <div className="action-row"><input value={schema} onChange={(event) => setSchema(event.target.value)} /><button onClick={loadTables}>Refresh Tables</button><button onClick={async () => setQueryResult(await databaseApi.status() as never)}>Status</button></div>
    <DataTable rows={tables} columns={["schema", "name", "estimated_rows"]} onRowClick={(row) => open(String(row.name))} />
    <h3>{selected ? `${schema}.${selected} (${count} rows)` : "Table Preview"}</h3>
    <DataTable rows={columns} />
    <DataTable rows={preview?.rows || []} columns={preview?.columns?.map((column) => column.name)} />
    <h3>Search Columns</h3>
    <div className="action-row"><input value={search} onChange={(event) => setSearch(event.target.value)} /><button onClick={async () => setSearchRows(await databaseApi.search(search))}>Search</button></div>
    <DataTable rows={searchRows} />
    <h3>Advanced SQL Console</h3>
    <textarea value={sql} onChange={(event) => setSql(event.target.value)} rows={5} />
    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RUN DESTRUCTIVE SQL for write queries" />
    <div className="action-row"><button onClick={async () => setQueryResult(await databaseApi.query(sql, confirmation))}>Run Query</button><button onClick={async () => setQueryResult(await databaseApi.export(sql))}>Export Query JSON</button><BackupRestorePanel onTask={setTask} /></div>
    <DataTable rows={queryResult?.rows || []} columns={queryResult?.columns?.map((column) => column.name)} />
  </section>;
}

function MarketPanel({ onError }: { onError: (text: string) => void }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState("items");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<void>) {
    onError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      onError(text);
    }
  }

  function clearResult(nextView: string) {
    setView(nextView);
    setRows([]);
    setStats(null);
    setInfo(null);
  }

  async function load(nextView = view) {
    clearResult(nextView);

    if (nextView === "items") {
      const result = await marketApi.items(q);
      setRows(result.rows || []);
    } else if (nextView === "listings") {
      const result = await marketApi.listings(q);
      setRows(result.rows || []);
    } else if (nextView === "sales") {
      const result = await marketApi.sales();
      setRows(result.rows || []);
    } else if (nextView === "catalog") {
      const result = await marketApi.catalog(q);
      setRows(result.rows || []);
    } else if (nextView === "categories") {
      const result = await marketApi.categories();
      setRows((result.categories || []).map((category) => ({ category })));
    } else if (nextView === "stats") {
      const result = await marketApi.stats();
      setStats(result.stats || {});
    }
  }

  async function loadCapabilities() {
    clearResult("capabilities");
    setInfo(await marketApi.capabilities());
  }

  async function loadAutomationStatus() {
    clearResult("automation");
    setInfo(await marketApi.automationStatus());
  }

  useEffect(() => {
    run(() => load("items"));
  }, []);

  const title = view === "capabilities"
    ? "Market Capabilities"
    : view === "automation"
      ? "Market Automation Status"
      : `Market ${view.charAt(0).toUpperCase()}${view.slice(1)}`;
  const marketEmptyText = view === "items" || view === "listings" || view === "sales"
    ? "No market item rows found. This can be normal if no exchange listings or sales exist yet. Use Catalog for item definitions; Market Items/Listings/Sales are live exchange data."
    : "No rows.";

  return <section className="panel">
    <div className="panel-title">
      <h2>Market</h2>
      <button onClick={() => run(loadCapabilities)}>Refresh Capabilities</button>
    </div>

    <div className="action-row">
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Template id, item name, or category" />
      <button className={view === "items" ? "active" : ""} onClick={() => run(() => load("items"))}>Items</button>
      <button className={view === "listings" ? "active" : ""} onClick={() => run(() => load("listings"))}>Listings</button>
      <button className={view === "sales" ? "active" : ""} onClick={() => run(() => load("sales"))}>Sales</button>
      <button className={view === "stats" ? "active" : ""} onClick={() => run(() => load("stats"))}>Stats</button>
      <button className={view === "categories" ? "active" : ""} onClick={() => run(() => load("categories"))}>Categories</button>
      <button className={view === "catalog" ? "active" : ""} onClick={() => run(() => load("catalog"))}>Catalog</button>
    </div>

    <div className="action-row">
      <button className={view === "automation" ? "active" : ""} onClick={() => run(loadAutomationStatus)}>Automation Status</button>
      <button disabled onClick={() => undefined}>Start Automation</button>
      <button disabled onClick={() => undefined}>Stop Automation</button>
      <button disabled onClick={() => undefined}>Run Once</button>
      <button disabled onClick={() => undefined}>Cleanup</button>
    </div>
    <p className="danger-note">Market automation remains blocked: no RedBlink-compatible market-bot runtime or CLI wrapper is available. Catalog and categories are definitions; Items/Listings/Sales are live exchange data.</p>

    {message && <p className="danger-note">{message}</p>}

    <h3>{title}</h3>
    {info && <MarketCapabilitySummary info={info} />}
    {stats && <MarketStats stats={stats} />}
    {!info && !stats && (rows.length ? <DataTable rows={rows} /> : <div className="empty">{marketEmptyText}</div>)}
  </section>;
}

function StarterKitPanel({ onError }: { onError: (text: string) => void }) {
  const [config, setConfig] = useState<StarterKitConfig>({ enabled: false, version: "starter-kit-v1", items: [], xp: 0, allowRepeatGrants: false, autoGrantEnabled: false, autoGrantIntervalSeconds: 60, grantWhen: "first_seen" });
  const [itemsText, setItemsText] = useState("");
  const [players, setPlayers] = useState<Record<string, unknown>[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [manualPlayerId, setManualPlayerId] = useState("");
  const [grantId, setGrantId] = useState("");
  const [eligible, setEligible] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [output, setOutput] = useState("");
  const [technicalOutput, setTechnicalOutput] = useState("");
  async function run(action: () => Promise<void>) {
    onError("");
    setOutput("");
    setTechnicalOutput("");
    try { await action(); } catch (error) { const text = error instanceof Error ? error.message : String(error); setOutput(text); onError(text); }
  }
  async function load() {
    const next = await starterKitApi.config();
    setConfig(next);
    setItemsText(next.items.map((item) => `${item.itemId || item.itemName || ""},${item.quantity},${item.durability}`).join("\n"));
    setHistory((await starterKitApi.history()).rows || []);
    setPlayers((await playersApi.list()).rows || []);
  }
  useEffect(() => {
    run(load);
  }, []);
  function nextConfig(): StarterKitConfig {
    return {
      ...config,
      items: itemsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [nameOrId, qty = "1", durability = "1"] = line.split(",").map((part) => part.trim());
        const item = /^[A-Za-z0-9_./:-]{16,}$/.test(nameOrId) ? { itemId: nameOrId } : { itemName: nameOrId };
        return { ...item, quantity: Number(qty), durability: Number(durability) };
      })
    };
  }
  const starterItemCount = config.items?.length || 0;
  const selected = players.find((player) => String(player.actor_id || player.player_pawn_id || "") === selectedPlayer) || null;
  const grantPlayerId = manualPlayerId.trim() || String(selected?.action_player_id || "");
  const selectedLabel = selected ? `${selected.character_name || "Unknown"} (${selected.online_status || "unknown"}) - actor ${selected.actor_id || "-"} - admin ${selected.action_player_id || "-"}` : "";
  const eligibleCount = eligible.filter((row) => row.eligible).length;
  return <section className="panel">
    <div className="panel-title"><h2>Starter Kit</h2><button onClick={() => run(load)}>Refresh Starter Kit</button></div>
    <div className="action-sections">
      <section className="action-section">
        <h4>Starter Kit Status</h4>
        <p>{config.enabled ? "Starter Kit is enabled." : "Starter Kit is disabled."}</p>
        <p>{starterItemCount ? `${starterItemCount} starter item${starterItemCount === 1 ? "" : "s"} configured.` : "No starter items configured."}</p>
        <p>{config.autoGrantEnabled ? `Auto-grant scans every ${config.autoGrantIntervalSeconds} seconds when enabled.` : "Auto-grant is off by default."}</p>
      </section>

      <section className="action-section">
        <h4>Starter Kit Configuration</h4>
        <p>Use exact item names from Admin Tools {"->"} Item Search. Example: Plant Fiber, not fiber.</p>
        <div className="action-line">
          <label>Version<input value={config.version} onChange={(event) => setConfig({ ...config, version: event.target.value })} /></label>
          <label>XP<input type="number" min="0" value={String(config.xp)} onChange={(event) => setConfig({ ...config, xp: Number(event.target.value) })} /></label>
          <label className="checkbox-line"><input type="checkbox" checked={config.allowRepeatGrants} onChange={(event) => setConfig({ ...config, allowRepeatGrants: event.target.checked })} /> <span>Allow repeat manual grants</span></label>
        </div>
        <p>One item per line: item name or raw item ID, quantity, durability.</p>
        <label>Starter Items<textarea value={itemsText} onChange={(event) => setItemsText(event.target.value)} placeholder="Plant Fiber,10,1&#10;cup of water,1,1" /></label>
        <div className="action-line">
          <button onClick={() => run(async () => { if (window.confirm("Save Starter Kit config?")) { const saved = await starterKitApi.saveConfig(nextConfig(), "SAVE STARTER KIT"); setConfig(saved); setItemsText(saved.items.map((item) => `${item.itemId || item.itemName || ""},${item.quantity},${item.durability}`).join("\n")); setOutput("Starter Kit config saved."); } })}>Save Config</button>
          <button onClick={() => run(async () => { if (window.confirm("Enable Starter Kit config? Manual grants remain confirmation-gated.")) setConfig(await starterKitApi.enable("ENABLE STARTER KIT")); })}>Enable</button>
          <button className="danger" onClick={() => run(async () => { if (window.confirm("Disable Starter Kit?")) setConfig(await starterKitApi.disable("DISABLE STARTER KIT")); })}>Disable</button>
        </div>
      </section>

      <section className="action-section">
        <h4>Manual Grant</h4>
        <p>Select a player from the current player list. Grants use the Admin action ID, not the DB actor ID.</p>
        <div className="action-line">
          <label className="wide-field">Player<select value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)}>
            <option value="">Select player</option>
            {players.map((player) => <option key={String(player.actor_id || player.player_pawn_id || player.action_player_id)} value={String(player.actor_id || player.player_pawn_id || "")}>
              {String(player.character_name || "Unknown")} - {String(player.online_status || "unknown")} - actor {String(player.actor_id || "-")} - admin {String(player.action_player_id || "missing")}
            </option>)}
          </select></label>
          <button disabled={!grantPlayerId} onClick={() => run(async () => { if (window.confirm(`Grant Starter Kit to ${selectedLabel || grantPlayerId}?`)) showGrantResult(await starterKitApi.grant(grantPlayerId, "GRANT STARTER KIT")); })}>Grant Starter Kit</button>
        </div>
        {selected && !selected.action_player_id && <p className="danger-note">Selected player has no Admin action ID, so CLI-backed grants are disabled.</p>}
        <details>
          <summary>Advanced manual player ID override</summary>
          <label>Admin action ID<input value={manualPlayerId} onChange={(event) => setManualPlayerId(event.target.value)} placeholder="RedBlink#75570" /></label>
        </details>
      </section>

      <section className="action-section">
        <h4>Auto Grant</h4>
        <p>Auto-grant is disabled by default. It only runs when Starter Kit is enabled and Auto Grant is enabled.</p>
        <div className="action-line">
          <label className="checkbox-line"><input type="checkbox" checked={config.autoGrantEnabled} onChange={(event) => setConfig({ ...config, autoGrantEnabled: event.target.checked })} /> <span>Enable auto-grant for future players</span></label>
          <label>Interval seconds<input type="number" min="60" max="3600" value={String(config.autoGrantIntervalSeconds)} onChange={(event) => setConfig({ ...config, autoGrantIntervalSeconds: Number(event.target.value) })} /></label>
          <label>Grant when<select value={config.grantWhen} onChange={(event) => setConfig({ ...config, grantWhen: event.target.value as StarterKitConfig["grantWhen"] })}><option value="first_seen">First seen</option><option value="first_online">First online</option></select></label>
          <button onClick={() => run(async () => { const result = await starterKitApi.eligible(); setEligible(result.rows || []); })}>Preview Eligible Players</button>
          <button className="danger" disabled={!eligibleCount} onClick={() => run(async () => { const phrase = window.prompt("Type GRANT STARTER KIT TO ELIGIBLE PLAYERS to bulk grant."); if (phrase) showGrantResult(await starterKitApi.grantEligible(phrase)); setHistory((await starterKitApi.history()).rows || []); })}>Grant to Eligible Players</button>
          <button onClick={() => run(async () => showGrantResult(await starterKitApi.run("RUN STARTER KIT SCAN")))}>Run Auto Scan Now</button>
        </div>
        {eligible.length > 0 && <DataTable rows={eligible} />}
      </section>

      <section className="action-section">
        <h4>Grant History</h4>
        <div className="action-line">
          <input value={grantId} onChange={(event) => setGrantId(event.target.value)} placeholder="Failed grant id" />
          <button onClick={() => run(async () => { if (window.confirm(`Retry Starter Kit grant ${grantId}?`)) showGrantResult(await starterKitApi.retry(grantId, "RETRY STARTER KIT")); })}>Retry Failed Grant</button>
          <button onClick={() => run(async () => setHistory((await starterKitApi.history()).rows || []))}>Refresh History</button>
        </div>
        <DataTable rows={history} columns={["timestamp", "character_name", "action_player_id", "source", "version", "status", "summary"]} />
      </section>
    </div>
    {output && <div className="result-panel"><strong>Starter Kit Result</strong><pre className="mini-output concise-output">{output}</pre></div>}
    {technicalOutput && <TechnicalDetails text={technicalOutput} />}
    <details>
      <summary>Raw Starter Kit JSON</summary>
      <pre className="mini-output">{JSON.stringify(config, null, 2)}</pre>
    </details>
  </section>;

  function showGrantResult(result: Record<string, unknown>) {
    setOutput(formatStarterKitGrantResult(result));
    setTechnicalOutput(JSON.stringify(result, null, 2));
  }
}

function formatStarterKitGrantResult(result: Record<string, unknown>) {
  if (Array.isArray(result.results) && result.results.some((row) => row && typeof row === "object" && "status" in row)) {
    const rows = result.results as Record<string, unknown>[];
    const lines = [
      `Starter Kit bulk grant finished: ${result.granted || 0} granted, ${result.skipped || 0} skipped, ${result.failed || 0} failed.`
    ];
    rows.slice(0, 20).forEach((row) => {
      const name = row.character_name || row.action_player_id || row.playerId || "Unknown player";
      lines.push(`${String(row.status || "unknown").toUpperCase()}: ${name} - ${row.summary || row.reason || ""}`);
    });
    return lines.join("\n");
  }
  const status = String(result.status || (result.ok ? "granted" : "failed"));
  const heading = status === "granted" ? "Starter Kit grant completed." :
    status === "partial_failed" ? "Starter Kit grant partially completed." :
      status === "skipped" ? "Starter Kit grant skipped." : "Starter Kit grant failed.";
  const lines = [heading, String(result.summary || "")].filter(Boolean);
  if (Array.isArray(result.results)) {
    for (const action of result.results as Record<string, unknown>[]) {
      if (action.ok) lines.push(`OK: ${describeStarterKitAction(action)} granted`);
      else lines.push(`FAIL: ${describeStarterKitAction(action)} failed: ${action.error || "unknown error"}${action.item ? " (use Admin Tools -> Item Search for exact item names)" : ""}`);
    }
  }
  return lines.join("\n");
}

function describeStarterKitAction(action: Record<string, unknown>) {
  const item = action.item as Record<string, unknown> | undefined;
  if (item) return `${item.itemName || item.itemId || "Item"} x${item.quantity || 1}`;
  if (action.operation === "adminAddXp") return `${action.amount || 0} XP`;
  return String(action.operation || "Starter Kit action");
}

function StoragePanel({ onError }: { onError: (text: string) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [itemName, setItemName] = useState("");
  const [canGiveItem, setCanGiveItem] = useState(false);
  const [storageResult, setStorageResult] = useState("Give Item to Storage creates a DB backup first and runs only when the backend verifies the storage schema.");
  async function load() {
    onError("");
    try {
      const result = await worldDataApi.storage();
      setRows(result.rows || []);
      setCanGiveItem(Boolean(result.capabilities?.storageGiveItem));
      if (!result.capabilities?.storageGiveItem) setStorageResult("Storage give-item is unsupported until this database exposes compatible dune.inventories and dune.items insert columns.");
    } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  async function open(row: Record<string, unknown>) {
    setSelected(row);
    setItems((await worldDataApi.storageItems(String(row.id))).rows || []);
  }
  async function giveStorageItem() {
    if (!selected) return;
    onError("");
    try {
      if (!window.confirm(`Give 1 x ${itemName} to storage ${String(selected.id)}? A database backup will be created first.`)) return;
      const response = await worldDataApi.storageGiveItem(String(selected.id), { itemName, quantity: 1, confirmation: "GIVE ITEM TO STORAGE" });
      setStorageResult(JSON.stringify(response, null, 2));
      setItems((await worldDataApi.storageItems(String(selected.id))).rows || []);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setStorageResult(text);
      onError(text);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return <section className="panel"><div className="panel-title"><h2>Storage</h2><button onClick={load}>Refresh Storage</button></div><p className="danger-note">{storageResult}</p><DataTable rows={rows} onRowClick={open} />{selected && <section className="drawer"><h3>Storage {String(selected.id)}</h3><div className="action-row"><a className="button-link" href={worldDataApi.storageExportUrl(String(selected.id))}>Export JSON</a><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Item name" /><button disabled={!canGiveItem} onClick={giveStorageItem}>Give Item to Storage</button></div><DataTable rows={items} /></section>}</section>;
}

function WorldListPanel({ title, load, exportUrl, exportLabel = "Export", blockedText = "", onError }: { title: string; load: () => Promise<{ rows: Record<string, unknown>[]; reason?: string }>; exportUrl: (id: string) => string; exportLabel?: string; blockedText?: string; onError: (text: string) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [reason, setReason] = useState("");
  async function refresh() {
    onError("");
    try {
      const result = await load();
      setRows(result.rows || []);
      setReason(result.reason || "");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  return <section className="panel"><div className="panel-title"><h2>{title}</h2><button onClick={refresh}>Refresh {title}</button></div>{reason && <p className="danger-note">{reason}</p>}{blockedText && <p className="danger-note">{blockedText}</p>}<DataTable rows={rows} action={(row) => <a className="button-link" href={exportUrl(String(row.id))}>{exportLabel}</a>} /></section>;
}

function BackupsPanel({ setTask, onError }: { setTask: (task: Task) => void; onError: (text: string) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  async function run(action: () => Promise<void>) {
    onError("");
    try { await action(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  async function refresh() {
    const result = await backupsApi.list();
    setText(result.stdout || "");
    setRows(parseBackupRows(result.stdout || ""));
  }
  useEffect(() => {
    run(refresh);
  }, []);
  return (
    <section className="panel">
      <div className="panel-title"><h2>Backups</h2><div className="action-row"><button onClick={() => run(refresh)}>Refresh Backups</button><button onClick={() => run(async () => setTask((await backupsApi.create()).task))}>Create Backup</button></div></div>
      {rows.length ? <DataTable rows={rows} columns={["name", "created", "type", "source"]} action={(row) => <div className="service-actions">
        <button className="danger" onClick={(event) => { event.stopPropagation(); run(async () => { if (window.confirm(`Restore backup ${String(row.name)}? This changes database state.`)) setTask((await backupsApi.restore(String(row.name))).task); }); }}>Restore</button>
        <button className="danger" onClick={(event) => { event.stopPropagation(); run(async () => { if (window.confirm(`Delete backup ${String(row.name)}?`)) setTask((await backupsApi.delete(String(row.name))).task); }); }}>Delete</button>
      </div>} /> : <div className="empty">No database backups found yet.</div>}
      <section className="action-section">
        <h4>Automation and Remote Imports</h4>
        <p>Automatic backups and remote SSH import are planned for Phase 12E. Existing CLI support needs dedicated web routes, secret handling, progress output, and audit coverage before it is exposed here.</p>
      </section>
      <TechnicalDetails title="Advanced backup output" text={text || "Backups have not been loaded yet."} />
    </section>
  );
}

function LiveMapPanel({ onError }: { onError: (text: string) => void }) {
  const [map, setMap] = useState("");
  const [markers, setMarkers] = useState<LiveMapMarker[]>([]);
  const [overlays, setOverlays] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<LiveMapMarker | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean>>({ player: true, vehicle: true, base: true, storage: true, service: true });
  const [autoRefresh, setAutoRefresh] = useState(false);
  async function load() {
    onError("");
    try {
      const result = await liveMapApi.markers(map);
      setMarkers(result.rows || []);
      setOverlays(result.overlays || {});
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, map]);
  const visible = markers.filter((marker) => filters[String(marker.type)] !== false);
  const plotted = visible.filter((marker) => Number.isFinite(Number(marker.x)) && Number.isFinite(Number(marker.y)));
  const displayRows = visible.map((marker) => ({ ...marker, display_name: friendlyMarkerName(marker), raw_name: marker.name || marker.id }));
  const bounds = markerBounds(plotted);
  return <section className="panel">
    <div className="panel-title"><h2>Live Map</h2><div className="action-row"><button onClick={load}>Refresh</button><label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto-refresh</label></div></div>
    <div className="action-row"><input value={map} onChange={(event) => setMap(event.target.value)} placeholder="Optional map filter, e.g. Survival_1" />{Object.keys(filters).map((key) => <label key={key}><input type="checkbox" checked={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.checked })} /> {key}</label>)}</div>
    {Object.entries(overlays).filter(([, reason]) => reason).map(([key, reason]) => <p className="danger-note" key={key}>{key}: {reason}</p>)}
    <div style={{ position: "relative", height: 420, border: "1px solid var(--border)", background: "#10151d", overflow: "hidden" }}>
      {plotted.length === 0 && <div className="empty">No plottable markers. Raw marker rows are shown below when available.</div>}
      {plotted.map((marker, index) => {
        const point = markerPoint(marker, bounds);
        return <button key={`${marker.type}-${marker.id}-${index}`} title={`${marker.type}: ${friendlyMarkerName(marker)}`} onClick={() => setSelected(marker)} style={{ position: "absolute", left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%, -50%)", width: 12, height: 12, borderRadius: "50%", border: "1px solid white", background: markerColor(String(marker.type)), cursor: "pointer" }} />;
      })}
    </div>
    <p className="danger-note">Coordinates use raw Dune world positions from actor transforms. Exact image/world calibration is not verified, so this plot is for relative position and inspection.</p>
    {selected && <section className="drawer"><div className="panel-title"><h3>{friendlyMarkerName(selected)}</h3><button onClick={() => setSelected(null)}>Close</button></div><KeyValueGrid items={[
      ["Type", selected.type],
      ["Name", friendlyMarkerName(selected)],
      ["ID", selected.id],
      ["Map", selected.map],
      ["X", selected.x],
      ["Y", selected.y],
      ["Z", selected.z]
    ]} /><TechnicalDetails title="Marker technical details" text={JSON.stringify(selected, null, 2)} /></section>}
    <DataTable rows={displayRows as Record<string, unknown>[]} columns={["type", "display_name", "map", "x", "y", "z", "raw_name"]} />
  </section>;
}

function MapsPanel({ setTask, onError }: { setTask: (task: Task) => void; onError: (text: string) => void }) {
  const [text, setText] = useState("");
  const [map, setMap] = useState("");
  const [mode, setMode] = useState("dynamic");
  const [target, setTarget] = useState("");
  const [memory, setMemory] = useState("8g");
  const [partitionId, setPartitionId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [count, setCount] = useState("1");
  async function run(action: () => Promise<unknown>) {
    onError("");
    try { await action(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  async function runTask(action: () => Promise<{ task: Task }>) {
    const response = await action();
    setTask(response.task);
  }
  useEffect(() => {
    run(async () => setText(JSON.stringify(await mapsApi.status(), null, 2)));
  }, []);
  return <section className="panel">
    <h2>Maps & Sietches</h2>
    <div className="action-row">
      <button onClick={() => run(async () => setText((await mapsApi.maps()).stdout))}>Maps</button>
      <button onClick={() => run(async () => setText((await mapsApi.mode(map)).stdout))}>Map Mode</button>
      <button onClick={() => run(async () => setText(JSON.stringify(await mapsApi.status(), null, 2)))}>Map Status</button>
      <button onClick={() => run(async () => setText((await mapsApi.autoscaler()).stdout))}>Autoscaler</button>
      <button onClick={() => run(async () => setText((await mapsApi.memory()).stdout))}>Memory</button>
      <button onClick={() => run(async () => setText((await mapsApi.sietches()).stdout))}>Sietches</button>
      <button onClick={() => run(async () => setText((await mapsApi.deepdesert()).stdout))}>Deep Desert</button>
    </div>
    <div className="two-col">
      <label>Map<input value={map} onChange={(event) => setMap(event.target.value)} placeholder="DeepDesert_1" /></label>
      <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="dynamic">dynamic</option><option value="always-on">always-on</option></select></label>
      <button onClick={() => run(async () => { if (window.confirm(`Set ${map} to ${mode}? This can spawn or affect map services.`)) await runTask(() => mapsApi.setMode({ map, mode, confirmation: "SET MAP MODE" })); })}>Set Map Mode</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm("Reconcile all always-on maps now?")) await runTask(() => mapsApi.reconcile("RECONCILE MAPS")); })}>Reconcile Maps</button>
      <label>Spawn/Despawn Target<input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Map name or partition id" /></label>
      <button onClick={() => run(async () => { if (window.confirm(`Spawn ${target}?`)) await runTask(() => mapsApi.spawn(target, "SPAWN MAP")); })}>Spawn</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm(`Despawn ${target}?`)) await runTask(() => mapsApi.despawn(target, "DESPAWN MAP")); })}>Despawn</button>
      <button onClick={() => run(async () => { if (window.confirm("Start autoscaler?")) await runTask(() => mapsApi.autoscalerAction("start", "AUTOSCALER CHANGE")); })}>Start Autoscaler</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm("Stop autoscaler?")) await runTask(() => mapsApi.autoscalerAction("stop", "AUTOSCALER CHANGE")); })}>Stop Autoscaler</button>
      <button onClick={() => run(async () => { if (window.confirm("Restart autoscaler?")) await runTask(() => mapsApi.autoscalerAction("restart", "AUTOSCALER CHANGE")); })}>Restart Autoscaler</button>
      <label>Memory<input value={memory} onChange={(event) => setMemory(event.target.value)} placeholder="8g" /></label>
      <button onClick={() => run(async () => { if (window.confirm(`Set memory for ${map || "default"} to ${memory}? Running maps may need restart.`)) await runTask(() => mapsApi.setMemory({ map: map || "default", memory, confirmation: "SET MAP MEMORY" })); })}>Set Memory</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm(`Remove memory override for ${map || "default"}?`)) await runTask(() => mapsApi.unsetMemory({ map: map || "default", confirmation: "UNSET MAP MEMORY" })); })}>Unset Memory</button>
      <label>Dimension Count<input value={count} onChange={(event) => setCount(event.target.value)} /></label>
      <button onClick={() => run(async () => runTask(() => mapsApi.updateSietches({ action: "set-max", map, count: Number(count) })))}>Set Max Sietches</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm(`Set active dimensions for ${map} to ${count}? This reconciles services.`)) await runTask(() => mapsApi.updateSietches({ action: "set-active", map, count: Number(count), confirmation: "UPDATE SIETCHES" })); })}>Set Active Sietches</button>
      <label>Partition ID<input value={partitionId} onChange={(event) => setPartitionId(event.target.value)} /></label>
      <label>Display Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <button onClick={() => run(async () => { if (window.confirm(`Update display name for partition ${partitionId}?`)) await runTask(() => mapsApi.updateSietches({ action: "set-display", partitionId, displayName, confirmation: "UPDATE SIETCHES" })); })}>Set Sietch Display</button>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="danger" onClick={() => run(async () => { if (window.confirm(`Update password for partition ${partitionId}? Running services may need restart.`)) await runTask(() => mapsApi.updateSietches({ action: "set-password", partitionId, password, confirmation: "UPDATE SIETCHES" })); })}>Set Sietch Password</button>
      <button onClick={() => run(async () => runTask(() => mapsApi.updateSietches({ action: "sync" })))}>Sync Sietches</button>
      <button onClick={() => run(async () => runTask(() => mapsApi.updateSietches({ action: "validate" })))}>Validate Sietches</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm(`Reconcile sietches for ${map}?`)) await runTask(() => mapsApi.updateSietches({ action: "reconcile", map, confirmation: "UPDATE SIETCHES" })); })}>Reconcile Sietches</button>
      <button onClick={() => run(async () => { if (window.confirm("Enable Dual Deep Desert?")) await runTask(() => mapsApi.updateDeepdesert({ action: "enable", confirmation: "UPDATE DEEP DESERT" })); })}>Enable Dual Deep Desert</button>
      <button className="danger" onClick={() => run(async () => { if (window.confirm("Disable Dual Deep Desert?")) await runTask(() => mapsApi.updateDeepdesert({ action: "disable", confirmation: "UPDATE DEEP DESERT" })); })}>Disable Dual Deep Desert</button>
      <button onClick={() => run(async () => runTask(() => mapsApi.updateDeepdesert({ action: "repair", confirmation: "UPDATE DEEP DESERT" })))}>Repair Deep Desert</button>
      <button onClick={() => run(async () => { if (window.confirm("Bootstrap Dual Deep Desert?")) await runTask(() => mapsApi.updateDeepdesert({ action: "bootstrap", confirmation: "UPDATE DEEP DESERT" })); })}>Bootstrap Deep Desert</button>
    </div>
    <p className="danger-note">Map mode, spawn/despawn, autoscaler, active Sietch dimensions, passwords, and Deep Desert changes can affect live services and require backend confirmation.</p>
    <MapCommandSummary text={text} />
  </section>;
}

function markerBounds(markers: LiveMapMarker[]) {
  const xs = markers.map((marker) => Number(marker.x)).filter(Number.isFinite);
  const ys = markers.map((marker) => Number(marker.y)).filter(Number.isFinite);
  return {
    minX: xs.length ? Math.min(...xs) : 0,
    maxX: xs.length ? Math.max(...xs) : 1,
    minY: ys.length ? Math.min(...ys) : 0,
    maxY: ys.length ? Math.max(...ys) : 1
  };
}

function markerPoint(marker: LiveMapMarker, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  return {
    x: 5 + ((Number(marker.x) - bounds.minX) / spanX) * 90,
    y: 95 - ((Number(marker.y) - bounds.minY) / spanY) * 90
  };
}

function markerColor(type: string) {
  return { player: "#3b82f6", vehicle: "#22c55e", base: "#f59e0b", storage: "#a855f7", service: "#e5e7eb" }[type] || "#e5e7eb";
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

function UpdatesPanel({ setTask }: { setTask: (task: Task) => void }) {
  return <section className="panel"><h2>Updates</h2><div className="action-row"><button onClick={async () => setTask((await updatesApi.checkGame()).task)}>Check Game Update</button><button onClick={async () => window.confirm("Apply the game server update now?") && setTask((await updatesApi.applyGame()).task)}>Apply Game Update</button><button onClick={async () => setTask((await updatesApi.checkStack()).task)}>Check Stack Update</button><button onClick={async () => window.confirm("Apply the latest RedBlink stack update now?") && setTask((await updatesApi.applyStack()).task)}>Apply Stack Update</button></div></section>;
}

function SettingsPanel() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  async function refresh() {
    setSettings(await api<Record<string, unknown>>("/api/settings"));
  }
  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);
  return <section className="panel">
    <div className="panel-title"><h2>Settings</h2><button onClick={refresh}>Refresh Runtime Settings</button></div>
    <RuntimeSettingsSummary settings={settings} />
  </section>;
}

function HomeHealthCards({ status, readiness, readinessWarning, loading }: { status: string; readiness: string; readinessWarning: string; loading: boolean }) {
  const summary = summarizeHomeStatus(status, readiness, readinessWarning, loading);
  return <div className="home-health wide">
    <section className="dashboard-band">
      <h3>Server Identity</h3>
      <div className="health-grid">
        {summary.identity.map((item) => <article className="status-card" key={item.label}>
          <div className="status-card-title"><span>{item.label}</span><StatusPill value={item.status} /></div>
          <strong>{item.value}</strong>
        </article>)}
      </div>
    </section>
    <section className="dashboard-band">
      <h3>Readiness and Health</h3>
      <div className="health-grid health-grid-compact">
        {summary.health.map((item) => <article className="status-card" key={item.label}>
          <div className="status-card-title"><span>{item.label}</span><StatusPill value={item.status} /></div>
          <strong>{item.value}</strong>
        </article>)}
      </div>
    </section>
  </div>;
}

function DoctorSummary({ text }: { text: string }) {
  const status = inferStatus(text || "");
  const issues = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /warn|fail|error|missing|not ready/i.test(line)).slice(0, 6);
  return <section className="action-section">
    <div className="panel-title"><h4>Doctor Diagnostics</h4><StatusPill value={text ? status : "Unknown"} /></div>
    {text ? <p>{issues.length ? `${issues.length} warning or failure line${issues.length === 1 ? "" : "s"} detected.` : "No obvious warning lines detected in the latest doctor output."}</p> : <p>Run Doctor to show diagnostics.</p>}
    {issues.length > 0 && <div className="check-grid">{issues.map((issue, index) => <article className="check-card" key={`${issue}-${index}`}><div><strong>Diagnostic warning</strong><p>{issue}</p></div><StatusPill value="Warning" /></article>)}</div>}
    <TechnicalDetails title="Advanced doctor output" text={text || "Run Doctor to show diagnostics."} />
  </section>;
}

function PlayerSummary({ detail, fallback, dbPlayerId, actionPlayerId }: { detail: Record<string, unknown> | null; fallback: Record<string, unknown>; dbPlayerId: string; actionPlayerId: string }) {
  const player = ((detail?.player as Record<string, unknown> | undefined) || fallback) as Record<string, unknown>;
  return <section className="action-section">
    <h4>Player Summary</h4>
    <KeyValueGrid items={[
      ["Character", firstDefined(player.character_name, player.name, fallback.character_name)],
      ["Online status", firstDefined(player.online_status, fallback.online_status)],
      ["Map", firstDefined(player.map, player.world, fallback.map)],
      ["DB actor/player ID", dbPlayerId || "missing"],
      ["Admin action ID", actionPlayerId || "missing"],
      ["Account ID", firstDefined(player.account_id, fallback.account_id)],
      ["Funcom/FLS ID", firstDefined(player.funcom_id, player.fls_id, fallback.funcom_id, fallback.fls_id)],
      ["Controller ID", firstDefined(player.player_controller_id, fallback.player_controller_id)]
    ]} />
  </section>;
}

function PlayerCapabilities({ capabilities }: { capabilities: Record<string, unknown> }) {
  const keys = ["inventory", "currency", "factions", "specs", "progression", "events", "stats", "history"];
  return <section className="action-section">
    <h4>Detected Capabilities</h4>
    <div className="badge-row">
      {keys.map((key) => {
        const value = capabilities[key];
        const label = value === true ? "Available" : value === false ? "Unavailable" : value === undefined ? "Unknown" : String(value);
        return <span className={`badge ${value === true ? "badge-pass" : value === false ? "badge-fail" : "badge-info"}`} key={key}>{key}: {label}</span>;
      })}
    </div>
  </section>;
}

function MarketCapabilitySummary({ info }: { info: Record<string, unknown> }) {
  const supported = firstDefined(info.supported, info.ok, info.available);
  const reason = firstDefined(info.reason, info.message, info.error, "Market automation remains blocked unless a compatible RedBlink market-bot runtime is added.");
  return <section className="warning-panel action-section">
    <div className="panel-title"><h4>Market Capability Status</h4><StatusPill value={supported === true ? "Ready" : "Blocked"} /></div>
    <p>{String(reason)}</p>
    <KeyValueGrid items={Object.entries(info).filter(([key]) => !["reason", "message", "error"].includes(key)).slice(0, 8)} />
    <TechnicalDetails text={JSON.stringify(info, null, 2)} />
  </section>;
}

function MarketStats({ stats }: { stats: Record<string, unknown> }) {
  return <section className="action-section">
    <h4>Market Stats</h4>
    <KeyValueGrid items={Object.entries(stats)} />
    <TechnicalDetails text={JSON.stringify(stats, null, 2)} />
  </section>;
}

function RuntimeSettingsSummary({ settings }: { settings: Record<string, unknown> | null }) {
  const config = (settings?.config as Record<string, unknown> | undefined) || {};
  const files = (settings?.files as Record<string, unknown> | undefined) || {};
  return <div className="action-sections">
    <section className="action-section">
      <h4>Runtime Configuration</h4>
      <KeyValueGrid items={[
        ["App name", firstDefined(config.appName, config.app_name, "Arrakis Server Console")],
        ["Repo root", config.repoRoot],
        ["Auth", config.authEnabled === false ? "Disabled" : "Enabled"],
        ["Secure cookies", booleanLabel(config.secureCookies)],
        ["Host bootstrap", booleanLabel(config.allowHostBootstrap)],
        ["Mock mode", booleanLabel(config.mockMode)],
        ["Runtime path", config.runtimePath],
        ["Task retention", config.taskRetention]
      ]} />
    </section>
    <section className="action-section">
      <h4>Files Checklist</h4>
      <div className="check-grid">{Object.entries(files).map(([key, value]) => <article className="check-card" key={key}><div><strong>{key}</strong><p>{value ? "Found" : "Missing"}</p></div><StatusPill value={value ? "Ready" : "Warning"} /></article>)}</div>
      {!Object.keys(files).length && <p>Runtime file checks have not loaded yet.</p>}
    </section>
  </div>;
}

function MapCommandSummary({ text }: { text: string }) {
  const parsed = parseJsonMaybe(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    return <section className="result-panel">
      <strong>Map Status Summary</strong>
      <KeyValueGrid items={Object.entries(record).map(([key, value]) => [key, summarizeValue(value)])} />
      <TechnicalDetails text={text} />
    </section>;
  }
  const status = text ? inferStatus(text) : "Unknown";
  return <section className="result-panel">
    <div className="panel-title"><strong>Map Command Result</strong><StatusPill value={status} /></div>
    <p>{text ? summarizeCommandText(text) : "Map, autoscaler, memory, Sietch, or Deep Desert state is loading or unavailable."}</p>
    <TechnicalDetails text={text || "No map command output loaded yet."} />
  </section>;
}

function KeyValueGrid({ items }: { items: [string, unknown][] }) {
  const visible = items.filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!visible.length) return <div className="empty">No summary values available.</div>;
  return <div className="key-value-grid">{visible.map(([key, value]) => <div className="key-value-item" key={key}>
    <span>{key}</span>
    <strong>{formatCell(value)}</strong>
  </div>)}</div>;
}

function StatusPill({ value }: { value: unknown }) {
  const text = String(value || "Unknown");
  const normalized = normalizeStatus(text);
  return <span className={`badge badge-${normalized}`}>{text}</span>;
}

function TechnicalDetails({ text, title = "Technical details", className = "" }: { text: string; title?: string; className?: string }) {
  return <details className={`technical-details ${className}`.trim()}><summary>{title}</summary><pre className="mini-output">{text}</pre></details>;
}

function OutputPanel({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return <section className="panel"><h2>{title}</h2><button onClick={onAction}>{action}</button><TechnicalDetails text={text} /></section>;
}

function DataTable({ rows, columns, onRowClick, action }: { rows: Record<string, unknown>[]; columns?: string[]; onRowClick?: (row: Record<string, unknown>) => void; action?: (row: Record<string, unknown>) => React.ReactNode }) {
  const cols = columns?.length ? columns : Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
  if (!rows.length) return <div className="empty">No rows.</div>;
  return <div className="table-wrap"><table><thead><tr>{cols.map((col) => <th key={col}>{col}</th>)}{action && <th>Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} onClick={() => onRowClick?.(row)} className={onRowClick ? "clickable" : ""}>{cols.map((col) => <td key={col}>{formatCell(row[col])}</td>)}{action && <td>{action(row)}</td>}</tr>)}</tbody></table></div>;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatTechnicalText(sections: [string, string][]) {
  return sections.map(([title, text]) => `# ${title}\n${text}`).join("\n\n");
}

function summarizeHomeStatus(status: string, readiness: string, readinessWarning: string, loading: boolean) {
  const overall = findLineValue(status, ["overall"]) || (readiness ? "Readiness checked" : readinessWarning ? "Status loaded, readiness warning" : status ? "Status loaded" : loading ? "Checking" : "Unknown");
  const containers = summarizeSection(status, "Containers");
  const listeners = summarizeSection(status, "Listeners");
  const database = summarizeSection(status, "Database");
  const games = summarizeSection(status, "Game servers");
  const rabbit = summarizeSection(status, "RabbitMQ game connections");
  const fls = summarizeSection(status, "Funcom/FLS summary");
  return {
    identity: [
      { label: "Overall", value: overall, status: inferStatus(overall) },
      { label: "Title", value: findLineValue(status, ["title", "server title", "SERVER_TITLE"]) || "Unknown", status: "Info" },
      { label: "Region", value: findLineValue(status, ["region", "SERVER_REGION"]) || "Unknown", status: "Info" },
      { label: "Mode", value: findLineValue(status, ["mode", "server mode"]) || "Unknown", status: "Info" },
      { label: "Server IP", value: findLineValue(status, ["server ip", "ip", "SERVER_IP"]) || "Unknown", status: "Info" },
      { label: "Battlegroup", value: findLineValue(status, ["battlegroup", "battlegroup id"]) || "Unknown", status: "Info" },
      { label: "Population", value: findLineValue(status, ["population", "players"]) || "Unknown", status: inferStatus(findLineValue(status, ["population", "players"]) || "Unknown") }
    ],
    health: [
      { label: "Containers", value: containers.label, status: containers.status },
      { label: "Listeners", value: listeners.label, status: listeners.status },
      { label: "Database", value: database.label, status: database.status },
      { label: "Game servers", value: readinessWarning ? "Readiness check failed" : games.label, status: readinessWarning ? "Warning" : games.status },
      { label: "RabbitMQ", value: rabbit.label, status: rabbit.status },
      { label: "Funcom/FLS", value: fls.label, status: fls.status }
    ]
  };
}

function findLineValue(text: string, keys: string[]) {
  for (const rawLine of stripAnsi(text).split(/\r?\n/)) {
    const line = stripAnsi(rawLine).trim();
    for (const key of keys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(`^\\s*${escaped}\\s*[:=]\\s*(.+)$`, "i"));
      if (match) return match[1].trim();
    }
  }
  return "";
}

function summarizeSection(text: string, section: string) {
  const lines = sectionLines(text, section).filter((line) => !/^service\s+status$/i.test(line) && !/^check\s+port\s+status$/i.test(line));
  if (!lines.length) return { label: "Unknown", status: "Unknown" };
  const bad = lines.filter((line) => /missing|stopped|not running|error|fail|wait|warming|0$/i.test(line));
  if (bad.length) return { label: `${bad.length} attention needed`, status: /error|fail|missing|stopped|not running/i.test(bad.join("\n")) ? "Failed" : "Warning" };
  return { label: "Ready", status: "Ready" };
}

function sectionLines(text: string, section: string) {
  const lines = stripAnsi(text).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `=== ${section.toLowerCase()} ===`);
  if (start < 0) return [];
  const result: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^=== .+ ===$/.test(line.trim())) break;
    if (line.trim()) result.push(line.trim());
  }
  return result;
}

function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function summarizeSubsystem(text: string, keywords: string[]) {
  const lines = text.split(/\r?\n/).filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)));
  if (!lines.length) return "Unknown";
  return inferStatus(lines.join("\n"));
}

function inferStatus(text: string) {
  if (!text) return "Unknown";
  if (/failed|failure|error|fatal|unhealthy|down|missing|cannot|could not/i.test(text)) return "Failed";
  if (/warning|warn|not ready|starting|waiting|partial|unavailable/i.test(text)) return "Warning";
  if (/ready|ok|healthy|running|listening|up|succeeded|success|checked|found/i.test(text)) return "Ready";
  return "Unknown";
}

function normalizeStatus(value: string) {
  if (/ready|ok|healthy|running|up|succeeded|success|checked|found|available|enabled/i.test(value)) return "pass";
  if (/failed|failure|error|fatal|unhealthy|down|missing|blocked|disabled/i.test(value)) return "fail";
  if (/warning|warn|not ready|starting|waiting|partial|unverified|experimental|unavailable|checking/i.test(value)) return "warn";
  return "info";
}

function formatLiveToolResult(result: unknown) {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  if (record.supported === false) return `Unsupported: ${String(record.reason || record.error || "This live tool is not available.")}`;
  if (record.ok === false) return `Failed: ${String(record.error || record.stderr || "The live tool did not complete.")}`;
  const note = String(record.note || "");
  if (/broadcast/i.test(note) || /publish=ok/i.test(String(record.stdout || ""))) {
    return note || "RabbitMQ publish succeeded, but in-game display has not been verified.";
  }
  if (record.ok === true) return "Live tool request completed. Review technical details if troubleshooting is needed.";
  return summarizeCommandText(JSON.stringify(record || result));
}

function formatMutationResult(result: unknown) {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  if (record.supported === false) return `Unsupported: ${String(record.reason || record.error || "This action is not available.")}`;
  if (record.ok === false) return `Failed: ${String(record.error || record.reason || "The action did not complete.")}`;
  if (record.summary) return String(record.summary);
  if (record.status) return `Action status: ${String(record.status)}`;
  if (record.backup) return "Action completed after creating a database backup.";
  if (record.ok === true) return "Action completed.";
  return summarizeCommandText(JSON.stringify(record || result));
}

function summarizeCommandText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "No output.";
  const important = lines.filter((line) => /ok|ready|warning|error|failed|success|blocked|unsupported|publish/i.test(line));
  return (important[0] || lines[0]).slice(0, 240);
}

function parseJsonMaybe(text: string) {
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function summarizeValue(value: unknown) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("exitCode" in record) return `exit ${String(record.exitCode)}`;
    if ("stdout" in record) return summarizeCommandText(String(record.stdout || record.stderr || ""));
    return Array.isArray(value) ? `${value.length} rows` : `${Object.keys(record).length} fields`;
  }
  return value;
}

function booleanLabel(value: unknown) {
  if (value === true) return "Enabled";
  if (value === false) return "Disabled";
  return value ?? "Unknown";
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function parseVehicleCatalog(text: string) {
  const catalog: Record<string, string[]> = {};
  let currentVehicle = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^vehicle/i.test(line) || /^templates?$/i.test(line)) continue;
    if (/^actor:/i.test(line)) continue;
    if (/^templates?:/i.test(line) && currentVehicle) {
      catalog[currentVehicle] = uniqueValues((catalog[currentVehicle] || []).concat(splitTemplateList(line.replace(/^templates?\s*:?/i, ""))));
      continue;
    }
    const colon = line.match(/^([A-Za-z][A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (colon) {
      currentVehicle = colon[1];
      catalog[currentVehicle] = uniqueValues((catalog[currentVehicle] || []).concat(splitTemplateList(colon[2])));
      continue;
    }
    const bullet = line.match(/^[-*]\s*(.+)$/);
    if (bullet && currentVehicle) {
      catalog[currentVehicle] = uniqueValues((catalog[currentVehicle] || []).concat(splitTemplateList(bullet[1])));
      continue;
    }
    if (/^[A-Za-z][A-Za-z0-9_-]+$/.test(line)) {
      if (!currentVehicle || /^[A-Z][a-z]/.test(line)) {
        currentVehicle = line;
        catalog[currentVehicle] ||= [];
      } else if (currentVehicle) {
        catalog[currentVehicle] = uniqueValues((catalog[currentVehicle] || []).concat(line));
      }
    }
  }
  return Object.fromEntries(Object.entries(catalog).filter(([vehicle]) => vehicle));
}

function splitTemplateList(text: string) {
  return text.split(/[,\s]+/).map((part) => part.trim()).filter((part) => /^[A-Za-z0-9_.:-]+$/.test(part));
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseServiceRows(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^names\s+/i.test(line)).map((line) => {
    const [name, ...rest] = line.split(/\s{2,}|\t/).filter(Boolean);
    return { name, status: rest[0] || "", ports: rest.slice(1).join(" ") };
  }).filter((row) => row.name);
}

function parseBackupRows(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const name = line.match(/([A-Za-z0-9_.-]+(?:\.backup|\.dump|\.sql))/)?.[1];
    if (!name) return null;
    const created = name.match(/(\d{8}-\d{6})/)?.[1] || "";
    const type = name.endsWith(".backup") ? "official backup" : name.endsWith(".dump") ? "dump" : "sql";
    const source = name.includes("__") ? name.split("__")[0].replace(/^dune-db-/, "") : name.split("-")[0];
    return { name, created, type, source };
  }).filter(Boolean) as Record<string, unknown>[];
}

function parseHistoryRows(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^time\s+/i.test(line)).map((line) => {
    const parts = line.split(/\t/);
    if (parts.length >= 6) {
      return {
        time: parts[0],
        action: parts[1],
        target: parts[2],
        status: parts[5],
        summary: parts.slice(3, 5).concat(parts.slice(6)).filter(Boolean).join(" ")
      };
    }
    const loose = line.split(/\s{2,}/).filter(Boolean);
    return {
      time: loose[0] || "",
      action: loose[1] || "",
      target: loose[2] || "",
      status: loose[5] || "",
      summary: loose.slice(3).join(" ")
    };
  }).filter((row) => row.action || row.summary);
}

function friendlyServiceName(name: string) {
  return SERVICE_LABELS[name] || SERVICE_LABELS[name.replace(/^dune-/, "")] || name.replace(/^dune-server-/, "").replace(/^dune-/, "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function serviceActionName(name: string, action: "logs" | "restart") {
  const normalized: Record<string, string> = {
    "dune-postgres": "postgres",
    "dune-rmq-admin": "rmq-admin",
    "dune-rmq-game": "rmq-game",
    "dune-text-router": "text-router",
    "dune-director": "director",
    "dune-server-gateway": "gateway",
    "dune-server-survival-1": "survival-1",
    "dune-server-overmap": "overmap",
    "dune-orchestrator": "orchestrator",
    "dune-autoscaler": "autoscaler"
  };
  const value = normalized[name] || name;
  if (action === "logs") return value;
  return ["text-router", "director", "gateway", "survival", "survival-1", "overmap"].includes(value) ? value : null;
}

function isTerminalTask(status: string) {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

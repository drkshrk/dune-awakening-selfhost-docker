import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Activity, Archive, Database, FileText, Home, Map, PackagePlus, Play, RefreshCw, Server, Settings, Shield, Users } from "lucide-react";
import { api, post, setCsrfToken } from "./api/client";
import { serverApi } from "./api/server";
import { playersApi } from "./api/players";
import { logsApi } from "./api/logs";
import { backupsApi } from "./api/backups";
import { mapsApi } from "./api/maps";
import { updatesApi } from "./api/updates";
import type { Task } from "./api/setup";
import { SetupWizard } from "./components/SetupWizard";
import { TaskProgress } from "./components/TaskProgress";
import { LogViewer } from "./components/LogViewer";
import { BackupRestorePanel } from "./components/BackupRestorePanel";
import { PortChecklist } from "./components/PortChecklist";
import { ReadinessTimeline } from "./components/ReadinessTimeline";
import { ServiceHealthCard } from "./components/ServiceHealthCard";

type Tab = "Home" | "Setup" | "Server Control" | "Services" | "Players" | "Admin Tools" | "Maps" | "Database" | "Backups" | "Logs" | "Updates" | "Settings";

const nav: { tab: Tab; icon: React.ReactNode }[] = [
  { tab: "Home", icon: <Home size={18} /> },
  { tab: "Setup", icon: <Shield size={18} /> },
  { tab: "Server Control", icon: <Server size={18} /> },
  { tab: "Services", icon: <Activity size={18} /> },
  { tab: "Players", icon: <Users size={18} /> },
  { tab: "Admin Tools", icon: <PackagePlus size={18} /> },
  { tab: "Maps", icon: <Map size={18} /> },
  { tab: "Database", icon: <Database size={18} /> },
  { tab: "Backups", icon: <Archive size={18} /> },
  { tab: "Logs", icon: <FileText size={18} /> },
  { tab: "Updates", icon: <RefreshCw size={18} /> },
  { tab: "Settings", icon: <Settings size={18} /> }
];

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
  const [players, setPlayers] = useState("");
  const [logs, setLogs] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ authenticated: boolean; csrfToken: string | null }>("/api/auth/state").then((state) => {
      setAuth(state.authenticated);
      setCsrfToken(state.csrfToken);
    }).catch(() => undefined);
  }, []);

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
        {tab === "Home" && <HomePanel status={status} readiness={readiness} setTask={setTask} onLoad={() => safe(async () => {
          setStatus((await serverApi.status()).stdout);
          setReadiness((await serverApi.readiness()).stdout);
        })} />}
        {tab === "Setup" && <SetupWizard />}
        {tab === "Server Control" && <ServerPanel setTask={setTask} setStatus={setStatus} setReadiness={setReadiness} setPorts={setPorts} setDoctor={setDoctor} ports={ports} readiness={readiness} doctor={doctor} onError={setError} />}
        {tab === "Services" && <ServicesPanel services={services} setServices={setServices} setTask={setTask} openLogs={(service) => { setSelectedLogService(service); setTab("Logs"); }} onError={setError} />}
        {tab === "Players" && <OutputPanel title="Players" text={players} action="Load Players" onAction={() => safe(async () => setPlayers((await playersApi.list()).stdout))} />}
        {tab === "Admin Tools" && <AdminToolsPanel setTask={setTask} />}
        {tab === "Maps" && <MapsPanel />}
        {tab === "Database" && <DatabasePanel setTask={setTask} />}
        {tab === "Backups" && <BackupsPanel setTask={setTask} onError={setError} />}
        {tab === "Logs" && <LogsPanel selectedService={selectedLogService} setSelectedService={setSelectedLogService} text={logs} setText={setLogs} onError={setError} />}
        {tab === "Updates" && <UpdatesPanel setTask={setTask} />}
        {tab === "Settings" && <SettingsPanel />}
        <TaskProgress task={task} />
      </main>
    </div>
  );
}

function HomePanel({ status, readiness, setTask, onLoad }: { status: string; readiness: string; setTask: (task: Task) => void; onLoad: () => void }) {
  return (
    <section className="grid">
      <article className="hero-panel">
        <h2>Server Overview</h2>
        <p>Use this dashboard for setup, service health, logs, backups, updates, and player admin actions.</p>
        <div className="action-row">
          <button onClick={onLoad}>Load Status</button>
          <button onClick={async () => setTask((await serverApi.start()).task)}><Play size={16} /> Start</button>
          <button onClick={async () => window.confirm("Stop the Dune server stack?") && setTask((await serverApi.stop()).task)}>Stop</button>
          <button onClick={async () => window.confirm("Restart the Dune server stack?") && setTask((await serverApi.restart()).task)}>Restart</button>
        </div>
      </article>
      <ServiceHealthCard name="Runtime" status={status ? "checked" : "unknown"} />
      <ServiceHealthCard name="Readiness" status={readiness ? "checked" : "unknown"} />
      <pre className="mini-output wide">{status || "Status has not been loaded."}</pre>
    </section>
  );
}

function ServerPanel(props: { setTask: (task: Task) => void; setStatus: (text: string) => void; setReadiness: (text: string) => void; setPorts: (text: string) => void; setDoctor: (text: string) => void; ports: string; readiness: string; doctor: string; onError: (text: string) => void }) {
  const [service, setService] = useState("gateway");
  async function run(action: () => Promise<void>) {
    props.onError("");
    try { await action(); } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  }
  return (
    <section className="panel">
      <h2>Server Controls</h2>
      <div className="action-row">
        <button onClick={() => run(async () => props.setTask((await serverApi.start()).task))}><Play size={16} /> Start</button>
        <button onClick={() => run(async () => { if (window.confirm("Stop the Dune server stack?")) props.setTask((await serverApi.stop()).task); })}>Stop</button>
        <button onClick={() => run(async () => { if (window.confirm("Restart the Dune server stack?")) props.setTask((await serverApi.restart()).task); })}>Restart</button>
        <button onClick={() => run(async () => props.setStatus((await serverApi.services()).stdout))}>Services</button>
        <button onClick={() => run(async () => props.setReadiness((await serverApi.readiness()).stdout))}>Readiness</button>
        <button onClick={() => run(async () => props.setPorts((await serverApi.ports()).stdout))}>Ports</button>
        <button onClick={() => run(async () => props.setDoctor((await serverApi.doctor()).stdout))}>Doctor</button>
      </div>
      <div className="action-row">
        <input value={service} onChange={(event) => setService(event.target.value)} aria-label="Service name" />
        <button onClick={() => run(async () => { if (window.confirm(`Restart ${service}?`)) props.setTask((await serverApi.restartService(service)).task); })}>Restart Service</button>
      </div>
      <ReadinessTimeline text={props.readiness} />
      <PortChecklist text={props.ports} />
      <pre className="mini-output">{props.doctor || "Run Doctor to show diagnostics."}</pre>
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
  return (
    <section className="panel">
      <div className="panel-title"><h2>Services</h2><button onClick={load}>Load Services</button></div>
      {rows.length === 0 ? <pre className="mini-output">{services || "Load services to show Docker containers."}</pre> : <div className="service-table">
        {rows.map((row) => <article className="service-card" key={row.name}>
          <div><strong>{row.name}</strong><span>{row.status}</span><span>{row.ports}</span></div>
          <div className="service-actions">
            {serviceActionName(row.name, "restart") && <button onClick={() => restart(serviceActionName(row.name, "restart") || row.name)}>Restart</button>}
            <button onClick={() => openLogs(serviceActionName(row.name, "logs") || row.name)}>Logs</button>
          </div>
        </article>)}
      </div>}
    </section>
  );
}

function AdminToolsPanel({ setTask }: { setTask: (task: Task) => void }) {
  const [playerId, setPlayerId] = useState("");
  const [itemName, setItemName] = useState("");
  const [xp, setXp] = useState("1000");
  return (
    <section className="panel">
      <h2>Admin Tools</h2>
      <label>Player FLS ID<input value={playerId} onChange={(event) => setPlayerId(event.target.value)} /></label>
      <div className="two-col">
        <label>Item Name<input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ornithopter part" /></label>
        <button onClick={async () => window.confirm("Give this item to the selected player?") && setTask((await playersApi.giveItem(playerId, { itemName, quantity: 1, durability: 1 })).task)}>Give Item</button>
        <label>XP Amount<input value={xp} onChange={(event) => setXp(event.target.value)} /></label>
        <button onClick={async () => window.confirm("Add XP to the selected player?") && setTask((await playersApi.addXp(playerId, Number(xp))).task)}>Add XP</button>
        <button onClick={async () => window.confirm("Refill water for the selected player?") && setTask((await playersApi.refillWater(playerId)).task)}>Refill Water</button>
        <button className="danger" onClick={async () => window.confirm("Kick this player from the server?") && setTask((await playersApi.kick(playerId)).task)}>Kick Player</button>
      </div>
    </section>
  );
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
          {services.map((service) => <option key={service} value={service}>{service}</option>)}
        </select>
        <input value={selectedService} onChange={(event) => setSelectedService(event.target.value)} />
        <button onClick={async () => { onError(""); try { setText((await logsApi.get(selectedService)).stdout); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } }}>Load Logs</button>
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
  const [text, setText] = useState("");
  return <section className="panel"><h2>Database and Backups</h2><BackupRestorePanel onTask={setTask} /><button onClick={async () => setText((await backupsApi.list()).stdout)}>List Backups</button><pre className="mini-output">{text}</pre></section>;
}

function BackupsPanel({ setTask, onError }: { setTask: (task: Task) => void; onError: (text: string) => void }) {
  const [text, setText] = useState("");
  const [backup, setBackup] = useState("");
  async function run(action: () => Promise<void>) {
    onError("");
    try { await action(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  return (
    <section className="panel">
      <h2>Backups</h2>
      <div className="action-row">
        <button onClick={() => run(async () => setText((await backupsApi.list()).stdout))}>List Backups</button>
        <button onClick={() => run(async () => setTask((await backupsApi.create()).task))}>Create Backup</button>
      </div>
      <label>Backup file name<input value={backup} onChange={(event) => setBackup(event.target.value)} placeholder="dune-db-....backup" /></label>
      <div className="action-row">
        <button className="danger" onClick={() => run(async () => { if (window.confirm(`Restore backup ${backup}? This changes database state.`)) setTask((await backupsApi.restore(backup)).task); })}>Restore Backup</button>
        <button className="danger" onClick={() => run(async () => { if (window.confirm(`Delete backup ${backup}?`)) setTask((await backupsApi.delete(backup)).task); })}>Delete Backup</button>
      </div>
      <pre className="mini-output">{text || "List backups to see available files."}</pre>
    </section>
  );
}

function MapsPanel() {
  const [text, setText] = useState("");
  return <section className="panel"><h2>Maps</h2><div className="action-row"><button onClick={async () => setText((await mapsApi.maps()).stdout)}>Maps</button><button onClick={async () => setText((await mapsApi.sietches()).stdout)}>Sietches</button><button onClick={async () => setText((await mapsApi.deepdesert()).stdout)}>Deep Desert</button></div><pre className="mini-output">{text}</pre></section>;
}

function UpdatesPanel({ setTask }: { setTask: (task: Task) => void }) {
  return <section className="panel"><h2>Updates</h2><div className="action-row"><button onClick={async () => setTask((await updatesApi.checkGame()).task)}>Check Game Update</button><button onClick={async () => window.confirm("Apply the game server update now?") && setTask((await updatesApi.applyGame()).task)}>Apply Game Update</button><button onClick={async () => setTask((await updatesApi.checkStack()).task)}>Check Stack Update</button><button onClick={async () => window.confirm("Apply the latest RedBlink stack update now?") && setTask((await updatesApi.applyStack()).task)}>Apply Stack Update</button></div></section>;
}

function SettingsPanel() {
  const [text, setText] = useState("");
  return <section className="panel"><h2>Settings</h2><button onClick={async () => setText(JSON.stringify(await api("/api/settings"), null, 2))}>Load Runtime Settings</button><pre className="mini-output">{text}</pre></section>;
}

function OutputPanel({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return <section className="panel"><h2>{title}</h2><button onClick={onAction}>{action}</button><pre className="mini-output">{text}</pre></section>;
}

function parseServiceRows(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^names\s+/i.test(line)).map((line) => {
    const [name, ...rest] = line.split(/\s{2,}|\t/).filter(Boolean);
    return { name, status: rest[0] || "", ports: rest.slice(1).join(" ") };
  }).filter((row) => row.name);
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

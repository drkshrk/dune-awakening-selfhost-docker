import { useEffect, useState } from "react";
import { Activity, Database, FileText, Home, Map, PackagePlus, Play, RefreshCw, Server, Settings, Shield, Users } from "lucide-react";
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

type Tab = "Home" | "Setup" | "Server" | "Players" | "Admin Tools" | "Maps" | "Database" | "Logs" | "Updates" | "Settings";

const nav: { tab: Tab; icon: React.ReactNode }[] = [
  { tab: "Home", icon: <Home size={18} /> },
  { tab: "Setup", icon: <Shield size={18} /> },
  { tab: "Server", icon: <Server size={18} /> },
  { tab: "Players", icon: <Users size={18} /> },
  { tab: "Admin Tools", icon: <PackagePlus size={18} /> },
  { tab: "Maps", icon: <Map size={18} /> },
  { tab: "Database", icon: <Database size={18} /> },
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
        {tab === "Home" && <HomePanel status={status} readiness={readiness} onLoad={() => safe(async () => {
          setStatus((await serverApi.status()).stdout);
          setReadiness((await serverApi.readiness()).stdout);
        })} />}
        {tab === "Setup" && <SetupWizard />}
        {tab === "Server" && <ServerPanel setTask={setTask} setStatus={setStatus} setReadiness={setReadiness} setPorts={setPorts} ports={ports} readiness={readiness} />}
        {tab === "Players" && <OutputPanel title="Players" text={players} action="Load Players" onAction={() => safe(async () => setPlayers((await playersApi.list()).stdout))} />}
        {tab === "Admin Tools" && <AdminToolsPanel setTask={setTask} />}
        {tab === "Maps" && <MapsPanel />}
        {tab === "Database" && <DatabasePanel setTask={setTask} />}
        {tab === "Logs" && <LogsPanel text={logs} setText={setLogs} />}
        {tab === "Updates" && <UpdatesPanel setTask={setTask} />}
        {tab === "Settings" && <SettingsPanel />}
        <TaskProgress task={task} />
      </main>
    </div>
  );
}

function HomePanel({ status, readiness, onLoad }: { status: string; readiness: string; onLoad: () => void }) {
  return (
    <section className="grid">
      <article className="hero-panel">
        <h2>Server Overview</h2>
        <p>Use this dashboard for setup, service health, logs, backups, updates, and player admin actions.</p>
        <button onClick={onLoad}>Load Status</button>
      </article>
      <ServiceHealthCard name="Runtime" status={status ? "checked" : "unknown"} />
      <ServiceHealthCard name="Readiness" status={readiness ? "checked" : "unknown"} />
      <pre className="mini-output wide">{status || "Status has not been loaded."}</pre>
    </section>
  );
}

function ServerPanel(props: { setTask: (task: Task) => void; setStatus: (text: string) => void; setReadiness: (text: string) => void; setPorts: (text: string) => void; ports: string; readiness: string }) {
  return (
    <section className="panel">
      <h2>Server Controls</h2>
      <div className="action-row">
        <button onClick={async () => props.setTask((await serverApi.start()).task)}><Play size={16} /> Start</button>
        <button onClick={async () => window.confirm("Stop the Dune server stack?") && props.setTask((await serverApi.stop()).task)}>Stop</button>
        <button onClick={async () => window.confirm("Restart the Dune server stack?") && props.setTask((await serverApi.restart()).task)}>Restart</button>
        <button onClick={async () => props.setStatus((await serverApi.services()).stdout)}>Services</button>
        <button onClick={async () => props.setReadiness((await serverApi.readiness()).stdout)}>Readiness</button>
        <button onClick={async () => props.setPorts((await serverApi.ports()).stdout)}>Ports</button>
      </div>
      <ReadinessTimeline text={props.readiness} />
      <PortChecklist text={props.ports} />
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

function LogsPanel({ text, setText }: { text: string; setText: (text: string) => void }) {
  const [service, setService] = useState("gateway");
  return (
    <section className="panel">
      <h2>Logs</h2>
      <div className="action-row"><input value={service} onChange={(event) => setService(event.target.value)} /><button onClick={async () => setText((await logsApi.get(service)).stdout)}>Load Logs</button></div>
      <LogViewer text={text} />
    </section>
  );
}

function DatabasePanel({ setTask }: { setTask: (task: Task) => void }) {
  const [text, setText] = useState("");
  return <section className="panel"><h2>Database and Backups</h2><BackupRestorePanel onTask={setTask} /><button onClick={async () => setText((await backupsApi.list()).stdout)}>List Backups</button><pre className="mini-output">{text}</pre></section>;
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

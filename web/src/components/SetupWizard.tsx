import { useState } from "react";
import { setupApi, type Check, type Task } from "../api/setup";
import { PreflightCheckCard } from "./PreflightCheckCard";
import { SecretInput } from "./SecretInput";
import { TaskProgress } from "./TaskProgress";
import { CommandPreview } from "./CommandPreview";

const steps = ["Welcome", "Host Check", "Docker Setup", "Runtime Location", "Server Identity", "Funcom Token", "Ports", "Review", "Install", "Finish"];

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<Check[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [token, setToken] = useState("");
  const [config, setConfig] = useState({ SERVER_TITLE: "My Dune Server", SERVER_REGION: "Europe Test", SERVER_IP: "auto", SERVER_PROVIDER: "dune-docker", STEAM_APP_ID: "4754530" });

  async function runPreflight() {
    const result = await setupApi.preflight();
    setChecks(result.checks);
  }

  async function saveConfig() {
    await setupApi.writeConfig(config);
    if (token) await setupApi.saveToken(token);
  }

  async function init() {
    await saveConfig();
    const result = await setupApi.init();
    setTask(result.task);
  }

  return (
    <section className="wizard">
      <div className="stepper">
        {steps.map((label, index) => <button key={label} className={index === step ? "active" : ""} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}
      </div>
      <div className="panel">
        {step === 0 && <>
          <h2>Welcome to Arrakis Server Console</h2>
          <p>This browser interface sets up and controls the RedBlink Docker-native Dune: Awakening server stack. It is an unofficial community self-hosting tool.</p>
          <ul className="requirements">
            <li>Linux host with Docker Engine and Compose plugin</li>
            <li>Funcom self-host token</li>
            <li>AVX/AVX2-capable CPU, enough RAM, disk space, and open game ports</li>
          </ul>
        </>}
        {step === 1 && <>
          <h2>Host Check</h2>
          <button onClick={runPreflight}>Run Checks</button>
          <div className="check-grid">{checks.map((check) => <PreflightCheckCard key={check.name} check={check} />)}</div>
        </>}
        {step === 2 && <>
          <h2>Docker Setup</h2>
          <p>If Docker is missing, install it manually or start the backend with host bootstrap enabled.</p>
          <CommandPreview>sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin</CommandPreview>
        </>}
        {step === 3 && <>
          <h2>Runtime Location</h2>
          <p>The backend is using the repository path configured by <code>DUNE_DOCKER_DIR</code> or its working directory.</p>
        </>}
        {step === 4 && <>
          <h2>Server Identity</h2>
          {Object.entries(config).map(([key, value]) => <label key={key}>{key}<input value={value} onChange={(event) => setConfig({ ...config, [key]: event.target.value })} /></label>)}
        </>}
        {step === 5 && <>
          <h2>Funcom Token</h2>
          <p>The token is stored at <code>runtime/secrets/funcom-token.txt</code> with restrictive permissions and redacted from logs.</p>
          <SecretInput value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" />
        </>}
        {step === 6 && <>
          <h2>Ports and Firewall</h2>
          <p>Required ports include 7777/udp, 7778/udp, 7888/udp, 7889/udp, 31982/tcp, 31983/tcp, and internal admin ports.</p>
        </>}
        {step === 7 && <>
          <h2>Review</h2>
          <pre className="mini-output">{JSON.stringify(config, null, 2)}</pre>
          <p className="danger-note">Initial setup can initialize or reset local world state. Review before continuing.</p>
        </>}
        {step === 8 && <>
          <h2>Install / Initialize / Start</h2>
          <button onClick={init}>Run Existing Dune Init</button>
          <TaskProgress task={task} />
        </>}
        {step === 9 && <>
          <h2>Finish</h2>
          <p>Open the dashboard, check readiness, view logs, create a backup, or manage players.</p>
        </>}
        <div className="wizard-controls">
          <button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          <button disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}

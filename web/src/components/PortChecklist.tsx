export function PortChecklist({ text }: { text: string }) {
  const rows = parsePorts(text);
  return <section className="action-section">
    <h4>Ports / Listeners</h4>
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Port</th><th>Protocol</th><th>Status</th><th>Details</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}><td>{row.name}</td><td>{row.port}</td><td>{row.protocol}</td><td><span className={`badge badge-${row.kind}`}>{row.status}</span></td><td>{row.detail}</td></tr>)}</tbody></table></div> : <p>Run port checks to see listener status.</p>}
    <details className="technical-details"><summary>Advanced port output</summary><pre className="mini-output">{text || "Run port checks to see listener status."}</pre></details>
  </section>;
}

function parsePorts(text: string) {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => /\d{2,5}/.test(line)).slice(0, 40).map((line) => {
    const portToken = line.match(/\b(\d{2,5})(?:\/(udp|tcp))?\b/i);
    const port = portToken?.[1] || "";
    const protocol = (portToken?.[2] || line.match(/\b(udp|tcp)\b/i)?.[1] || "").toUpperCase();
    const status = /fail|closed|missing|error|down/i.test(line) ? "Failed" : /warn|not ready|waiting/i.test(line) ? "Warning" : /open|listen|listening|ok|ready|up/i.test(line) ? "Ready" : "Checked";
    const beforePort = portToken ? line.slice(0, portToken.index).trim() : line;
    const name = friendlyPortName(beforePort || line, port, protocol);
    const key = `${name}-${port}-${protocol}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { name, port, protocol, status, detail: status === "Ready" ? "Listening" : line, kind: status === "Failed" ? "fail" : status === "Warning" ? "warn" : "pass" };
  }).filter(Boolean) as { name: string; port: string; protocol: string; status: string; detail: string; kind: string }[];
}

function friendlyPortName(raw: string, port: string, protocol: string) {
  const normalized = raw.replace(/^ok\s+/i, "").replace(/\blistening\b.*$/i, "").replace(/[:=-]/g, " ").trim().toLowerCase();
  const byPort: Record<string, string> = {
    "15432/tcp": "Postgres Local",
    "32573/tcp": "RabbitMQ Admin",
    "31982/tcp": "RabbitMQ Game",
    "31983/tcp": "RabbitMQ Game HTTP",
    "5059/tcp": "Text Router",
    "11717/tcp": "Director"
  };
  const known = byPort[`${port}/${protocol.toLowerCase()}`];
  if (known) return known;
  if (/overmap.*client/.test(normalized)) return "Overmap Clients";
  if (/survival.*client/.test(normalized)) return "Survival 1 Clients";
  if (/survival.*s2s|survival.*igw/.test(normalized)) return "Survival 1 IGW";
  if (/overmap.*s2s|overmap.*igw/.test(normalized)) return "Overmap IGW";
  if (/rabbit.*game.*http/.test(normalized)) return "RabbitMQ Game HTTP";
  if (/rabbit.*game/.test(normalized)) return "RabbitMQ Game";
  if (/rabbit.*admin/.test(normalized)) return "RabbitMQ Admin";
  if (/postgres/.test(normalized)) return "Postgres Local";
  if (/director/.test(normalized)) return "Director";
  return raw.replace(/\s+/g, " ").trim() || "Listener";
}

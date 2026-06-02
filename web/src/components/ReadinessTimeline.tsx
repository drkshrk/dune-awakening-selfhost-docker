export function ReadinessTimeline({ text }: { text: string }) {
  const checks = parseChecks(text);
  const groups = groupChecks(checks);
  return <section className="action-section">
    <h4>Readiness Checklist</h4>
    {checks.length ? <div className="readiness-groups">{Object.entries(groups).map(([group, rows]) => rows.length ? <section className="readiness-group" key={group}>
      <h5>{group}</h5>
      <div className="check-grid">{rows.map((check, index) => <article className="check-card" key={`${check.name}-${index}`}>
        <div><strong>{check.name}</strong><p>{check.detail}</p></div>
        <span className={`badge badge-${check.kind}`}>{check.status}</span>
      </article>)}</div>
    </section> : null)}</div> : <p>Readiness has not been checked yet.</p>}
    <details className="technical-details"><summary>Advanced readiness output</summary><pre className="mini-output">{text || "Readiness has not been checked yet."}</pre></details>
  </section>;
}

function parseChecks(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 18).map((line) => {
    const status = /fail|error|not ready|missing|down/i.test(line) ? "Failed" : /warn|waiting|starting|partial/i.test(line) ? "Warning" : /ok|ready|healthy|running|up|pass|found/i.test(line) ? "Ready" : "Checked";
    return {
      name: line.split(/[:|-]/)[0]?.trim() || "Readiness check",
      detail: line,
      status,
      kind: status === "Ready" || status === "Checked" ? "pass" : status === "Failed" ? "fail" : "warn"
    };
  });
}

function groupChecks(checks: ReturnType<typeof parseChecks>) {
  return checks.reduce<Record<string, typeof checks>>((groups, check) => {
    const text = `${check.name} ${check.detail}`.toLowerCase();
    const group = /container|docker|compose|running/.test(text) ? "Container Checks" :
      /listener|port|tcp|udp|listen/.test(text) ? "Listener Checks" :
        /database|postgres|partition|world/.test(text) ? "Database Checks" :
          /server|gateway|director|survival|overmap|map/.test(text) ? "Game Server Checks" :
            /rabbit|rmq|fls|funcom|heartbeat|population/.test(text) ? "RabbitMQ / FLS Checks" :
              "Other Checks";
    groups[group] ||= [];
    groups[group].push(check);
    return groups;
  }, {
    "Container Checks": [],
    "Listener Checks": [],
    "Database Checks": [],
    "Game Server Checks": [],
    "RabbitMQ / FLS Checks": [],
    "Other Checks": []
  });
}

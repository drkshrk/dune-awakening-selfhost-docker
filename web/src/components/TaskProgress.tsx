import type { Task } from "../api/setup";
import { StatusBadge } from "./StatusBadge";

export function TaskProgress({ task }: { task: Task | null }) {
  if (!task) return <div className="empty">No task is running.</div>;
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{task.operation}</h3>
        <StatusBadge status={task.status} />
      </div>
      <p>{task.progressMessage || task.currentStep}</p>
      <pre className="log-box">{task.logLines.slice(-80).map((line) => line.line).join("\n")}</pre>
    </section>
  );
}

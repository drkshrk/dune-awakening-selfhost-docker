import type { Task } from "../api/setup";
import { StatusBadge } from "./StatusBadge";
import { useEffect, useState } from "react";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

export function TaskProgress({ task, onDismiss }: { task: Task | null; onDismiss?: () => void }) {
  const [liveTask, setLiveTask] = useState<Task | null>(task);

  useEffect(() => {
    setLiveTask(task);
    if (!task || terminalStatuses.has(task.status)) return;
    const source = new EventSource(`/api/setup/tasks/${encodeURIComponent(task.id)}/stream`, { withCredentials: true });
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Task;
      setLiveTask(next);
      if (terminalStatuses.has(next.status)) source.close();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [task?.id]);

  useEffect(() => {
    if (liveTask?.status !== "succeeded" || !onDismiss) return;
    const id = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(id);
  }, [liveTask?.id, liveTask?.status, onDismiss]);

  if (!liveTask) return null;
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{liveTask.operation}</h3>
        <div className="action-row">
          <StatusBadge status={liveTask.status} />
          {terminalStatuses.has(liveTask.status) && <button onClick={onDismiss}>Dismiss</button>}
        </div>
      </div>
      <p>{liveTask.progressMessage || liveTask.currentStep}</p>
      {liveTask.errorMessage && <p className="error">{liveTask.errorMessage}</p>}
      <pre className="log-box">{liveTask.logLines.slice(-120).map((line) => line.line).join("\n")}</pre>
    </section>
  );
}

import type { Task } from "../api/setup";
import { StatusBadge } from "./StatusBadge";
import { useEffect, useState } from "react";

export function TaskProgress({ task }: { task: Task | null }) {
  const [liveTask, setLiveTask] = useState<Task | null>(task);

  useEffect(() => {
    setLiveTask(task);
    if (!task || ["succeeded", "failed", "cancelled"].includes(task.status)) return;
    const source = new EventSource(`/api/setup/tasks/${encodeURIComponent(task.id)}/stream`, { withCredentials: true });
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Task;
      setLiveTask(next);
      if (["succeeded", "failed", "cancelled"].includes(next.status)) source.close();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [task?.id]);

  if (!liveTask) return <div className="empty">No task is running.</div>;
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{liveTask.operation}</h3>
        <StatusBadge status={liveTask.status} />
      </div>
      <p>{liveTask.progressMessage || liveTask.currentStep}</p>
      {liveTask.errorMessage && <p className="error">{liveTask.errorMessage}</p>}
      <pre className="log-box">{liveTask.logLines.slice(-120).map((line) => line.line).join("\n")}</pre>
    </section>
  );
}

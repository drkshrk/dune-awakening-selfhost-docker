import { backupsApi } from "../api/backups";
import type { Task } from "../api/setup";

export function BackupRestorePanel({ onTask }: { onTask: (task: Task) => void }) {
  return (
    <div className="action-row">
      <button onClick={async () => onTask((await backupsApi.create()).task)}>Create Backup</button>
      <button className="danger" disabled>Restore Backup</button>
    </div>
  );
}

import { api, post } from "./client";
import type { Task } from "./setup";

export const backupsApi = {
  list: () => api<{ stdout: string }>("/api/backups"),
  create: () => post<{ task: Task }>("/api/backups/create"),
  restore: (backup: string) => post<{ task: Task }>("/api/backups/restore", { backup }),
  delete: (backup: string) => api<{ task: Task }>(`/api/backups/${encodeURIComponent(backup)}`, { method: "DELETE" })
};

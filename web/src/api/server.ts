import { api, post } from "./client";
import type { Task } from "./setup";

export const serverApi = {
  status: () => api<{ stdout: string }>("/api/server/status"),
  readiness: () => api<{ stdout: string }>("/api/server/readiness"),
  ports: () => api<{ stdout: string }>("/api/server/ports"),
  services: () => api<{ stdout: string }>("/api/server/services"),
  start: () => post<{ task: Task }>("/api/server/start"),
  stop: () => post<{ task: Task }>("/api/server/stop"),
  restart: () => post<{ task: Task }>("/api/server/restart"),
  restartService: (service: string) => post<{ task: Task }>("/api/server/restart-service", { service })
};

import { api } from "./client";

export const logsApi = {
  services: () => api<{ services: string[] }>("/api/logs/services"),
  get: (service: string) => api<{ stdout: string }>(`/api/logs/${encodeURIComponent(service)}`)
};

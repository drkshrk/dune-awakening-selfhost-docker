import { api, post } from "./client";

export const settingsApi = {
  get: () => api("/api/settings"),
  save: (body: Record<string, string>) => post("/api/settings", body)
};

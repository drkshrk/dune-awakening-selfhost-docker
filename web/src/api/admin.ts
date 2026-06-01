import { api } from "./client";

export const adminApi = {
  history: () => api<{ stdout: string }>("/api/admin/history")
};

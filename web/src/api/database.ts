import { api, post } from "./client";

export const databaseApi = {
  tables: () => api<{ stdout: string }>("/api/database/tables"),
  table: (name: string) => api<{ stdout: string }>(`/api/database/table/${encodeURIComponent(name)}`),
  query: (sql: string) => post("/api/database/query", { sql })
};

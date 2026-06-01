import { api, post } from "./client";

export const mapsApi = {
  maps: () => api<{ stdout: string }>("/api/maps"),
  sietches: () => api<{ stdout: string }>("/api/sietches"),
  deepdesert: () => api<{ stdout: string }>("/api/deepdesert"),
  updateMaps: (body: unknown) => post("/api/maps/update", body),
  updateSietches: (body: unknown) => post("/api/sietches/update", body),
  updateDeepdesert: (body: unknown) => post("/api/deepdesert/update", body)
};

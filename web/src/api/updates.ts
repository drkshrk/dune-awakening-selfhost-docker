import { post } from "./client";
import type { Task } from "./setup";

export const updatesApi = {
  checkGame: () => post<{ task: Task }>("/api/updates/check-game"),
  applyGame: () => post<{ task: Task }>("/api/updates/apply-game"),
  checkStack: () => post<{ task: Task }>("/api/updates/check-stack"),
  applyStack: () => post<{ task: Task }>("/api/updates/apply-stack")
};

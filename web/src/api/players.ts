import { api, post } from "./client";
import type { Task } from "./setup";

export const playersApi = {
  list: () => api<{ stdout: string }>("/api/players"),
  giveItem: (playerId: string, body: { itemName: string; quantity: number; durability: number }) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/give-item`, body),
  addXp: (playerId: string, amount: number) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/add-xp`, { amount }),
  refillWater: (playerId: string) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/refill-water`),
  kick: (playerId: string) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/kick`)
};

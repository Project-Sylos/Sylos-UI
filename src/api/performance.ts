import { apiFetch } from "./client";

export type DuckDBMemorySettings = {
  memoryLimitGB: number;
  auto: boolean;
  effectiveGB: number;
  autoSuggestedGB: number;
  minGB: number;
  maxGB: number;
};

export const DUCKDB_MEMORY_PRESETS = [0, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const;

export async function fetchDuckDBMemorySettings(): Promise<DuckDBMemorySettings> {
  const response = await apiFetch(`/api/performance/duckdb-memory`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to load DuckDB memory settings (${response.status})`);
  }
  return response.json();
}

export async function saveDuckDBMemorySettings(
  memoryLimitGB: number
): Promise<DuckDBMemorySettings> {
  const response = await apiFetch(`/api/performance/duckdb-memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryLimitGB }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to save DuckDB memory settings (${response.status})`);
  }
  return response.json();
}

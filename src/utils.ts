import type { ThinkingLevelMap } from "@earendil-works/pi-ai/compat";

/** Reasoning efforts the ai& API can accept on the wire (`reasoning_effort`). */
export type AmpersandEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export function nonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Maps pi's thinking levels onto the wire `reasoning_effort` values a model
 * accepts (`GET /v1/models` `reasoning_efforts`). ai& never offers `minimal`,
 * and reasoning models without a disable switch (no `none` effort) report no
 * "off" either. `max` follows the ai& ladder: max, then xhigh, then high.
 */
export function thinkingLevelMapFor(efforts: readonly string[]): ThinkingLevelMap {
  const has = (effort: string) => efforts.includes(effort);
  return {
    off: has("none") ? "none" : null,
    minimal: has("minimal") ? "minimal" : null,
    low: has("low") ? "low" : null,
    medium: has("medium") ? "medium" : null,
    high: has("high") ? "high" : null,
    xhigh: has("xhigh") ? "xhigh" : null,
    max: has("max") ? "max" : has("xhigh") ? "xhigh" : has("high") ? "high" : null,
  };
}

export function isAmpersandEffort(value: unknown): value is AmpersandEffort {
  return typeof value === "string"
    && (["none", "low", "medium", "high", "xhigh", "max"] as const).includes(value as AmpersandEffort);
}

/** Unofficial display name fallback for ids the catalog does not name. */
export function displayName(id: string): string {
  return id.includes("/") ? displayName(id.slice(id.indexOf("/") + 1)) : id
    .split(/[-_.]/)
    .map((part) => /[a-z]/.test(part)
      ? part.charAt(0).toUpperCase() + part.slice(1)
      : part.toUpperCase())
    .join(" ");
}

import { fetchWithRetry } from "./models.ts";

/** ai& serves account balance outside the versioned API. */
export const AMPERSAND_BALANCE_URL = "https://api.aiand.com/billing/balance";

/** Account balance as reported by `GET /billing/balance`. */
export interface AmpersandBalance {
  credits?: number;
  currency?: "usd" | "jpy";
  /** `null` means pay-as-you-go; a number is a remaining daily request allowance. */
  usableRequests?: number | null;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Normalize the balance payload; both `balance` and `credits` keys are accepted. */
export function parseBalance(payload: unknown): AmpersandBalance | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const raw = payload as Record<string, unknown>;
  const credits = finiteNumber(raw.balance ?? raw.credits);
  const currency = raw.currency === "usd" || raw.currency === "jpy" ? raw.currency : undefined;
  const usableRequests = raw.usable_requests === null ? null : finiteNumber(raw.usable_requests);
  if (credits === undefined && usableRequests === undefined) return undefined;
  return {
    ...(credits === undefined ? {} : { credits }),
    ...(currency === undefined ? {} : { currency }),
    ...(usableRequests === undefined ? {} : { usableRequests }),
  };
}

export async function fetchBalance(apiKey: string, signal?: AbortSignal): Promise<AmpersandBalance> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetchWithRetry(
    AMPERSAND_BALANCE_URL,
    {
      headers: {
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
    signal,
  );
  if (!response.ok) throw new Error(`ai& /billing/balance returned HTTP ${response.status}`);

  const balance = parseBalance(await response.json());
  if (!balance) throw new Error("ai& /billing/balance returned invalid data");
  return balance;
}

export function formatBalance(balance: AmpersandBalance): string {
  if (balance.credits !== undefined) {
    const amount = balance.currency === "jpy"
      ? `¥${balance.credits.toLocaleString("ja-JP")}`
      : `$${balance.credits.toFixed(2)}`;
    const unit = balance.currency === "jpy" ? "JPY" : "USD";
    return `${amount} ${unit} credits`;
  }
  if (balance.usableRequests !== undefined) {
    return balance.usableRequests === null
      ? "pay-as-you-go account"
      : `${balance.usableRequests.toLocaleString("en-US")} requests remaining today`;
  }
  return "unknown";
}

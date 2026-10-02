/**
 * Billing client — plan availability, entitlements and checkout.
 *
 * The server owns everything sensitive: the client only ever receives
 * a hosted Lemon Squeezy checkout URL from an authenticated call, and
 * access is granted server-side after webhook verification.
 */

import { API_URL } from "./config";
import { apiFetch } from "./api";

export type BillingPlan = "lifetime" | "monthly";

export interface BillingPlansInfo {
  configured: boolean;
  lifetime: {
    limit: number;
    claimed: number | null;
    remaining: number | null;
  };
}

export interface Entitlements {
  lifetime: { active: boolean; since: string | null };
  subscription: { active: boolean; status: string; renewsAt: string | null } | null;
}

/** Public plan info; null when the API is unreachable (local-only mode). */
export async function fetchBillingPlans(): Promise<BillingPlansInfo | null> {
  try {
    const res = await fetch(`${API_URL}/api/billing/config`);
    if (!res.ok) return null;
    return (await res.json()) as BillingPlansInfo;
  } catch {
    return null;
  }
}

/** Start checkout for a signed-in user; resolves to the Lemon Squeezy URL. */
export function startCheckout(plan: BillingPlan): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/api/billing/checkout", { method: "POST", body: { plan } });
}

export function fetchEntitlements(): Promise<Entitlements> {
  return apiFetch<Entitlements>("/api/billing/entitlements");
}

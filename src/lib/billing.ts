/**
 * Billing client — plan availability, entitlements and checkout.
 *
 * The server owns everything sensitive: the client only ever receives
 * a hosted Lemon Squeezy checkout URL from an authenticated call, and
 * paid access is granted server-side after webhook verification.
 */

import { API_URL, IS_EXTENSION } from "./config";
import { apiFetch } from "./api";
import { getAuthState } from "./auth";

export const UPGRADE_URL = `${IS_EXTENSION ? API_URL : ""}/?pricing=1#pricing`;

export type BillingPlan = "lifetime" | "monthly";

export interface BillingPlansInfo {
  configured: boolean;
  missingVariables?: string[];
  lifetime: {
    limit: number;
    claimed: number | null;
    remaining: number | null;
  };
}

export interface Entitlements {
  plan: "free" | "monthly" | "lifetime";
  limits: { characters: number | null; episodes: number | null; prompts: number | null; bulkScenes: number | null };
  usage: { characters: number; episodes: number; prompts: number };
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

export async function checkBulkImport(count: number): Promise<void> {
  if (getAuthState().status !== "signed-in") return;
  const ent = await fetchEntitlements();
  if (ent.limits.bulkScenes !== null && count > ent.limits.bulkScenes) {
    throw new Error(`Free plan allows ${ent.limits.bulkScenes} scenes per bulk import. Select fewer scenes or upgrade from the account menu.`);
  }
}

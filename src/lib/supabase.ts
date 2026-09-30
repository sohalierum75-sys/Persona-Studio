/**
 * Supabase client — SAFE for browser and extension bundles.
 * Contains only the public anon key (enforced via RLS, not secret).
 *
 * DO NOT put service_role key or DB password here.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// These are set in .env.local / .env (VITE_ prefix = bundled into client)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn(
    "[Persona Studio] Supabase not configured. " +
    "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local"
  );
}

/** Whether Supabase is configured — gates all cloud operations */
export const SUPABASE_CONFIGURED =
  !!SUPABASE_URL && !!SUPABASE_ANON &&
  !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON.includes("YOUR_");

/** Detect extension context (service worker or content script) */
export const IS_EXTENSION = typeof chrome !== "undefined" && !!chrome?.runtime?.id;

/**
 * Custom storage adapter for Chrome extensions.
 * Uses chrome.storage.local which is isolated per extension,
 * persists across service-worker restarts, and is never
 * accessible from web pages.
 */
const chromeStorage = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(typeof result[key] === "string" ? result[key] : null);
      });
    }),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    }),
  removeItem: (key: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    }),
};

export const supabase = SUPABASE_CONFIGURED
  ? createClient<Database>(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: {
        // Use chrome.storage.local in extension, localStorage in web app
        storage: IS_EXTENSION ? chromeStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: !IS_EXTENSION,
        flowType: "pkce",
      },
    })
  : null;

export type SupabaseClient = typeof supabase;

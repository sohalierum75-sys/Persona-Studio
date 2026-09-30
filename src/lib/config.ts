/**
 * Client configuration — safe for browser and extension bundles.
 * Contains only public values: the API base URL.
 * Secrets (JWT secret, Google client secret, DB credentials) stay on the server.
 */

export const API_URL = (() => {
  const raw = (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:3210";
  return raw.replace(/\/$/, "");
})();

/**
 * Whether cloud sync is configured. Set VITE_API_URL="" (empty) in .env.local
 * to force local-only mode (no sign-in screen, no sync UI).
 */
export const API_CONFIGURED = API_URL.length > 0;

/** Detect extension context (side panel / service worker) */
export const IS_EXTENSION = typeof chrome !== "undefined" && !!chrome?.runtime?.id;

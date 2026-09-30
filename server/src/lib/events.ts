// ============================================================
// Change-notification hub — Server-Sent Events for active clients
// ============================================================
import type { Response } from "express";

interface SseClient {
  userId: string;
  res: Response;
}

const clients = new Set<SseClient>();

export function addClient(userId: string, res: Response): void {
  const client: SseClient = { userId, res };
  clients.add(client);
  res.on("close", () => clients.delete(client));
}

/** Notify all of a user's connected clients that records changed. */
export function broadcastChange(userId: string, kinds: string[]): void {
  const payload = JSON.stringify({ changed: true, kinds, at: new Date().toISOString() });
  for (const c of clients) {
    if (c.userId !== userId) continue;
    try {
      c.res.write(`event: change\ndata: ${payload}\n\n`);
    } catch {
      clients.delete(c);
    }
  }
}

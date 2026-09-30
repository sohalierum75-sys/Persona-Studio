// ============================================================
// SSE events route — realtime change notifications
// ============================================================
import { Router, Request, Response } from "express";
import { requireAuthFlexible, type AuthedRequest } from "../lib/sessions.js";
import { addClient } from "../lib/events.js";

export const eventsRouter = Router();

eventsRouter.get("/", (req: Request, res: Response) => {
  requireAuthFlexible(req, res, () => {
    const auth = (req as AuthedRequest).authUser;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    addClient(auth.id, res);

    // Heartbeat keeps proxies from closing the stream
    const beat = setInterval(() => {
      try { res.write(`: hb ${Date.now()}\n\n`); } catch { clearInterval(beat); }
    }, 25_000);
    req.on("close", () => clearInterval(beat));
  });
});

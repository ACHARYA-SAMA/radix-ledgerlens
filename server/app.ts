import express from "express";
import { LedgerService, ServiceError } from "./service.ts";
import { requireAuth, type VerifyToken } from "./auth.ts";
export function createApp(service: LedgerService, publicBaseUrl?: string, verifyToken?: VerifyToken) {
  const publicUrl = publicBaseUrl ? new URL(publicBaseUrl) : null;
  const publicHost = publicUrl?.protocol === "https:" ? publicUrl.hostname : null;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["localhost", "127.0.0.1", "[::1]", publicHost].includes(req.hostname)) {
      res.status(403).json({ error: "This host is not configured for this instance." });
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !== (req.hostname === publicHost ? publicUrl!.origin : `${req.protocol}://${req.get("host")}`)
    ) {
      res.status(403).json({ error: "Cross-origin access is not allowed." });
      return;
    }
    next();
  });
  if (verifyToken) {
    const guard = requireAuth(verifyToken);
    app.use("/api", (req, res, next) => {
      if (req.method === "GET" && /^\/share\/[^/]+$/.test(req.path)) return next();
      guard(req, res, next);
    });
  }
  const route =
    (
      fn: (req: express.Request, res: express.Response) => unknown,
    ): express.RequestHandler =>
    (req, res, next) => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };
  app.get("/api/state", (_req, res) => res.json(service.state()));
  app.post("/api/sync", (_req, res) => {
    void service.sync();
    res.status(202).json(service.state());
  });
  app.post(
    "/api/transactions/:id/review",
    route((req, res) =>
      res.json(service.review(String(req.params.id), req.body)),
    ),
  );
  app.post(
    "/api/alerts/:id",
    route((req, res) =>
      res.json(service.acknowledge(String(req.params.id), req.body.status)),
    ),
  );
  app.post(
    "/api/transactions/:id/share",
    route((req, res) =>
      res.status(201).json(service.share(String(req.params.id))),
    ),
  );
  app.get(
    "/api/share/:token",
    route(async (req, res) => {
      const tx = await service.resolveShare(String(req.params.token));
      res
        .status(tx ? 200 : 404)
        .json(tx ?? { error: "Shared transaction unavailable." });
    }),
  );
  app.post(
    "/api/voice/extract",
    route(async (req, res) =>
      res.json(await service.extractNote(req.body.transcript)),
    ),
  );
  app.post(
    "/api/voice",
    route((req, res) => res.status(201).json(service.addNote(req.body))),
  );
  app.post(
    "/api/voice/:id/match",
    route((req, res) =>
      res.json(
        service.matchNote(String(req.params.id), req.body.transactionId),
      ),
    ),
  );
  app.post(
    "/api/ask",
    route((req, res) => res.json(service.ask(req.body.query))),
  );
  app.get("/api/chat", (_req, res) =>
    res.json(service.store.all("chat").reverse()),
  );
  app.get(
    "/api/transactions/:id/trace",
    route((req, res) => {
      const tx = service.transaction(String(req.params.id));
      const events = tx.trace ?? [];
      res.set({
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      });
      res.flushHeaders();
      const start = Math.max(0, Number(req.get("last-event-id")) || 0);
      let index = start;
      const timer = setInterval(() => {
        if (index >= events.length) {
          res.write("event: done\ndata: {}\n\n");
          clearInterval(timer);
          res.end();
          return;
        }
        res.write(
          `id: ${index + 1}\nevent: step\ndata: ${JSON.stringify({ ...events[index], index, replay: true })}\n\n`,
        );
        index++;
      }, 450);
      req.on("close", () => clearInterval(timer));
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint unavailable." }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = error instanceof ServiceError ? error.status : 500;
      res
        .status(status)
        .json({
          error: error instanceof Error ? error.message : "Request failed",
        });
    },
  );
  return app;
}

import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.ts";
import { LedgerService } from "./service.ts";
import { createVoiceApp } from "../server.ts";
import { createServer as createHttpServer } from "node:http";
import { createSupabaseVerifier, requireAuth } from "./auth.ts";
const service = new LedgerService();
const verifyToken = createSupabaseVerifier();
const app = createApp(service, process.env.PUBLIC_BASE_URL, verifyToken);
app.get("/health", (_req, res) => res.json({ ok: true }));
const voiceGuard = requireAuth(verifyToken);
app.use("/voice", voiceGuard);
app.use("/audio", voiceGuard);
app.use(createVoiceApp(service));
const server = createHttpServer(app);
const production = process.argv.includes("--production");
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === "true" ? false : { server },
    },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get("*", async (req, res, next) => {
    try {
      const html = await readFile(resolve("index.html"), "utf8");
      res
        .type("html")
        .send(await vite.transformIndexHtml(req.originalUrl, html));
    } catch (error) {
      next(error);
    }
  });
}
const port = Number(process.env.PORT) || 3005;
const host = production ? "0.0.0.0" : "127.0.0.1";
server.listen(port, host, () =>
  console.log(`LedgerLens ready at http://${host}:${port}`),
);
void service.initialize().catch((error) => {
  service.syncStatus = {
    running: false,
    message: "Account Aggregator (AA) Bank Sync connection needs attention",
    error: error.message,
  };
});
const stop = () => {
  server.close(() => {
    service.store.close();
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

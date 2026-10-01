import "dotenv/config";
import express from "express";
import { randomBytes } from "node:crypto";
import { ServiceError, type LedgerService } from "./server/service.ts";
import { formatForSpeech } from "./shared/formatForSpeech.ts";

// Mounted by server/index.ts; this module never starts a separate listener.
export function createVoiceApp(ledger: Pick<LedgerService, "ask">) {
  const app = express();
  const audioCache = new Map<string, Buffer>();
  // Bounded cache and text reuse keep repeated calls inexpensive.
  const textCache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string | null>>();
  async function synthesize(text: string): Promise<string | null> {
    text = formatForSpeech(text);
    const cached = textCache.get(text);
    if (cached && audioCache.has(cached)) {
      console.info("[voice] ElevenLabs cache hit: reusing previously successful audio.");
      return `/audio/${cached}`;
    }
    const pending = inFlight.get(text);
    if (pending) return pending;
    const request = (async () => {
      try {
        const key = process.env.ELEVENLABS_API_KEY?.trim();
        const voice = process.env.ELEVENLABS_VOICE_ID?.trim();
        if (!key || !voice) throw new Error("ElevenLabs configuration missing");
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
          signal: AbortSignal.timeout(20_000),
        });
        console.info(`[voice] ElevenLabs response: HTTP ${response.status}`);
        if (response.status !== 200) {
          const body = await response.text();
          // Preserve the provider's diagnostic body, redacting credentials if echoed.
          let diagnostic = body;
          for (const secret of [key, process.env.NGROK_AUTHTOKEN]) {
            if (secret) diagnostic = diagnostic.split(secret).join("[REDACTED]");
          }
          console.error(`[voice] ElevenLabs failed: HTTP ${response.status}; error body: ${diagnostic}`);
          throw new Error(`ElevenLabs HTTP ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) throw new Error("ElevenLabs returned empty audio");
        console.info(`[voice] ElevenLabs succeeded (HTTP 200): ${buffer.length} audio bytes.`);
        console.info(`[ElevenLabs] Generated ${buffer.length} bytes of MP3 audio`);
        const id = randomBytes(12).toString("hex");
        if (audioCache.size >= 32) {
          const oldest = audioCache.keys().next().value!;
          audioCache.delete(oldest);
          for (const [phrase, clip] of textCache) if (clip === oldest) textCache.delete(phrase);
        }
        audioCache.set(id, buffer);
        textCache.set(text, id);
        return `/audio/${id}`;
      } catch (error) {
        console.warn("[voice] ElevenLabs unavailable:", (error as Error).name, (error as Error).message);
        return null;
      }
    })();
    inFlight.set(text, request);
    try { return await request; } finally { inFlight.delete(text); }
  }
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  app.use(express.urlencoded({ extended: false, limit: "8kb" }));
  app.use("/voice", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/voice/greeting", async (_req, res) => {
    const text = formatForSpeech("You're through to Radix Ledger Lens. Ask me about cash flow on a date, spending, your cash position, or the review queue.");
    res.json({ text, audioUrl: await synthesize(text) });
  });
  app.post("/voice/process", async (req, res) => {
    const heard = req.body?.speechResult;
    if (typeof heard !== "string" || !heard.trim() || heard.length > 1_000) {
      console.log("[VOICE PROCESS] speechResult: invalid; intent: no match");
      res.status(400).json({ error: "speechResult must be a non-empty string of up to 1000 characters." });
      return;
    }
    try {
      const answer = formatForSpeech(ledger.ask(heard).answer);
      console.info(`[voice] Answered from imported analytics: ${JSON.stringify(heard)}`);
      res.json({ text: answer, intent: "analytics", audioUrl: await synthesize(answer) });
    } catch (error) {
      console.error("[voice] Imported analytics answer failed:", error);
      res.status(error instanceof ServiceError ? error.status : 500).json({ error: "Could not answer from imported statements. Please try again." });
    }
  });
  app.post("/voice/speak", async (req, res) => {
    const raw = req.body?.text;
    if (typeof raw !== "string" || !raw.trim() || raw.length > 4_000) {
      res.status(400).json({ error: "text must be a non-empty string of up to 4000 characters." });
      return;
    }
    const text = formatForSpeech(raw);
    res.json({ text, audioUrl: await synthesize(text) });
  });
  app.get("/audio/:id", (req, res) => {
    const audio = audioCache.get(req.params.id);
    if (!audio) { res.status(404).json({ error: "Audio clip expired or was not found." }); return; }
    res.setHeader("Cache-Control", "no-store");
    res.type("audio/mpeg").send(audio);
  });
  const onError: express.ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: "Invalid voice request." });
  };
  app.use(onError);
  return app;
}


import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceCall, type VoiceEnvironment } from "../src/lib/voiceCall.ts";

function harness(audioUrl: string | null = "/audio/test") {
  const states: string[] = [], errors: string[] = [], exchanges: string[] = [], requests: string[] = [];
  const recognitions: any[] = [], audios: any[] = [];
  class Recognition {
    onresult: any; onend: any; onerror: any; aborted = false;
    constructor() { recognitions.push(this); }
    start() {}
    abort() { this.aborted = true; this.onend?.(); }
  }
  const environment = {
    isSecureContext: true, Recognition,
    fetch: async (url: string, init: any) => {
      requests.push(url);
      return Response.json({ text: init?.body ? "142.9 lakh rupees. Anything else?" : "Welcome", audioUrl });
    },
    createAudio: () => {
      const audio = { onended: null, onerror: null, play: async () => {}, pause() { this.paused = true; }, paused: false };
      audios.push(audio); return audio;
    },
  } as unknown as VoiceEnvironment;
  const call = new VoiceCall({ onStatus: (s) => states.push(s), onError: (s) => { if (s) errors.push(s); }, onAnswer: (q) => exchanges.push(q), onTranscript: () => {} }, environment);
  return { call, environment, states, errors, exchanges, requests, recognitions, audios };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("missing MP3 ends the call with a visible error and never starts recognition", async () => {
  const h = harness(null);
  h.call.start(); await flush();
  assert.equal(h.states.at(-1), "error");
  assert.match(h.errors.at(-1)!, /ElevenLabs|audio/i);
  assert.equal(h.audios.length, 0);
  assert.equal(h.recognitions.length, 0);
});

test("call greets, waits for playback, answers speech, listens again, and hangs up", async () => {
  const h = harness();
  h.call.start(); await flush();
  assert.equal(h.recognitions.length, 0);
  h.audios[0].onended(); await flush();
  const mic = h.recognitions[0];
  assert.equal(mic.lang, "en-IN"); assert.equal(mic.continuous, false); assert.equal(mic.interimResults, false);
  mic.onresult({ results: [[{ transcript: "cash balance" }]] });
  mic.onend(); await flush();
  assert.deepEqual(h.requests, ["/voice/greeting", "/voice/process"]);
  assert.deepEqual(h.exchanges, ["cash balance"]);
  assert.equal(h.recognitions.length, 1);
  h.audios[1].onended(); await flush();
  assert.equal(h.recognitions.length, 2);
  h.call.stop();
  assert.equal(h.recognitions[1].aborted, true);
  assert.equal(h.states.at(-1), "idle");
  assert.deepEqual(h.errors, []);
});

test("failed MP3 playback ends the call without starting recognition", async () => {
  const h = harness("/audio/broken");
  h.call.start(); await flush();
  h.audios[0].onerror(); await flush();
  assert.equal(h.states.at(-1), "error");
  assert.match(h.errors.at(-1)!, /audio/i);
  assert.equal(h.recognitions.length, 0);
});

test("hangup cancels pending fetch and ignores its late response", async () => {
  const h = harness();
  let release!: (response: Response) => void;
  let signal!: AbortSignal;
  h.environment.fetch = ((_url: unknown, init: RequestInit) => {
    signal = init.signal!;
    return new Promise<Response>((resolve) => { release = resolve; });
  }) as typeof fetch;
  h.call.start(); h.call.stop();
  assert.equal(signal.aborted, true);
  release(Response.json({ text: "late", audioUrl: "/audio/late" })); await flush();
  assert.equal(h.audios.length, 0); assert.equal(h.recognitions.length, 0);
  assert.equal(h.states.at(-1), "idle");
});

test("permission denial, HTTP failure, and unsupported browsers show errors", async () => {
  const h = harness();
  h.call.start(); await flush(); h.audios[0].onended(); await flush();
  h.recognitions[0].onerror({ error: "not-allowed" }); await flush();
  assert.match(h.errors[0], /permission/i); assert.equal(h.states.at(-1), "error");
  assert.equal(h.recognitions[0].aborted, true);
  const failed = harness();
  failed.environment.fetch = (async () => new Response("failed", { status: 502 })) as typeof fetch;
  failed.call.start(); await flush();
  assert.match(failed.errors[0], /502/); assert.equal(failed.states.at(-1), "error");
  const unsupported = harness(); unsupported.environment.Recognition = undefined;
  unsupported.call.start(); await flush();
  assert.match(unsupported.errors[0], /Chrome|Edge/); assert.equal(unsupported.requests.length, 0);
});

test("hangup stops active MP3 without restarting recognition", async () => {
  const h = harness(); h.call.start(); await flush();
  const lateEnd = h.audios[0].onended;
  h.call.stop(); lateEnd?.(); await flush();
  assert.equal(h.audios[0].paused, true);
  assert.equal(h.recognitions.length, 0);
});

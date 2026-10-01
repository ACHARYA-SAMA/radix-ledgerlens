import { test } from "node:test";
import assert from "node:assert/strict";
import { playVoiceAudio, requestVoiceAudio } from "../src/lib/voiceAudio.ts";

test("typed and replayed answers request backend MP3 and play it", async (t) => {
  const requests: Array<{ url: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalAudio = globalThis.Audio;
  let clip: { src: string; onended: (() => void) | null; onerror: (() => void) | null; paused: boolean } | undefined;
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), text: JSON.parse(String(init?.body)).text });
    return Response.json({ text: "spoken answer", audioUrl: "/audio/clip123" });
  }) as typeof fetch;
  globalThis.Audio = class {
    src: string; onended: (() => void) | null = null; onerror: (() => void) | null = null; paused = false;
    constructor(url: string) { this.src = url; clip = this; }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  } as unknown as typeof Audio;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.Audio = originalAudio; });
  const raw = "27 overdue invoices (₹48,16,276.13). Status comes from Nova’s fixed dataset date.";
  const url = await requestVoiceAudio(raw);
  assert.deepEqual(requests, [{ url: "/voice/speak", text: raw }]);
  const playback = playVoiceAudio(url);
  assert.equal(clip!.src, "/audio/clip123");
  clip!.onended!();
  await playback;
  assert.equal(clip!.paused, true);
});

test("unavailable backend audio and playback errors reject visibly", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalAudio = globalThis.Audio;
  globalThis.fetch = (async () => Response.json({ text: "answer", audioUrl: null })) as typeof fetch;
  await assert.rejects(requestVoiceAudio("answer"), /ElevenLabs audio is unavailable/);
  let clip: { onerror: (() => void) | null } | undefined;
  globalThis.Audio = class {
    onended = null; onerror: (() => void) | null = null;
    constructor(_url: string) { clip = this; }
    play() { return Promise.resolve(); }
    pause() {}
  } as unknown as typeof Audio;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.Audio = originalAudio; });
  const playback = playVoiceAudio("/audio/test");
  clip!.onerror!();
  await assert.rejects(playback, /MP3 could not be played/);
});

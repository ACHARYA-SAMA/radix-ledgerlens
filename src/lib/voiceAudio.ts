/** Fetch ElevenLabs speech through the local server. No browser voice engine is used. */
import { authHeaders, supabase } from "./supabase.ts";
import { readJsonResponse } from "./readJsonResponse.ts";
export async function requestVoiceAudio(text: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text }),
    signal,
  });
  const result = await readJsonResponse<{ audioUrl?: unknown; error?: string }>(response, "/voice/speak");
  if (!response.ok) throw new Error(result.error ?? `ElevenLabs speech request failed (HTTP ${response.status}).`);
  if (typeof result.audioUrl !== "string" || !/^\/audio\/[a-zA-Z0-9_-]+$/.test(result.audioUrl)) {
    throw new Error("ElevenLabs audio is unavailable. Check the server log and try again.");
  }
  return result.audioUrl;
}

export function playVoiceAudio(url: string, signal?: AbortSignal): Promise<void> {
  if (!supabase) return playClip(url, signal);
  return playProtectedAudio(url, signal);
}

async function playProtectedAudio(url: string, signal?: AbortSignal): Promise<void> {
  const headers = await authHeaders();
  let playableUrl = url;
  if (headers.Authorization) {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) throw new Error(`ElevenLabs MP3 could not be loaded (HTTP ${response.status}).`);
    playableUrl = URL.createObjectURL(await response.blob());
  }
  try { await playClip(playableUrl, signal); }
  finally { if (playableUrl !== url) URL.revokeObjectURL(playableUrl); }
}

function playClip(url: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const clip = new Audio(url);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      clip.onended = clip.onerror = null;
      clip.pause();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new DOMException("Playback cancelled", "AbortError"));
    clip.onended = () => finish();
    clip.onerror = () => finish(new Error("ElevenLabs MP3 could not be played. Check your browser audio settings."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { void clip.play().catch(() => finish(new Error("ElevenLabs MP3 playback was blocked. Allow audio for this site and try again."))); }
    catch { finish(new Error("ElevenLabs MP3 playback could not start.")); }
  });
}

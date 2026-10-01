import { authHeaders } from "./supabase.ts";
import { readJsonResponse } from "./readJsonResponse.ts";

export type CallStatus = "idle" | "connecting" | "speaking" | "listening" | "thinking" | "error";
interface VoiceReply { text: string; audioUrl: string | null; intent?: string }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
export interface VoiceEnvironment {
  isSecureContext: boolean;
  Recognition?: new () => Recognition;
  fetch: typeof fetch;
  createAudio: (url: string) => HTMLAudioElement;
  prepareAudioUrl?: (url: string, signal: AbortSignal) => Promise<{ url: string; release: () => void }>;
}
interface CallCallbacks {
  onStatus: (status: CallStatus) => void;
  onError: (message: string) => void;
  onTranscript: (text: string) => void;
  onAnswer: (question: string, answer: string) => void;
}
function browserEnvironment(): VoiceEnvironment {
  const speechWindow = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return {
    isSecureContext: window.isSecureContext,
    Recognition: speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition,
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => window.fetch(url, {
      ...init, headers: { ...(await authHeaders()), ...init?.headers },
    })) as typeof fetch,
    createAudio: (url) => new Audio(url),
    prepareAudioUrl: async (url, signal) => {
      const response = await window.fetch(url, { headers: await authHeaders(), signal });
      if (!response.ok) throw new Error(`ElevenLabs MP3 could not be loaded (HTTP ${response.status}).`);
      const objectUrl = URL.createObjectURL(await response.blob());
      return { url: objectUrl, release: () => URL.revokeObjectURL(objectUrl) };
    },
  };
}

/** One call owns all playback, recognition and requests. Cancellation invalidates late callbacks. */
export class VoiceCall {
  private callbacks: CallCallbacks;
  private environment: VoiceEnvironment;
  private session: AbortController | null = null;
  constructor(callbacks: CallCallbacks, environment = browserEnvironment()) {
    this.callbacks = callbacks;
    this.environment = environment;
  }
  start() {
    if (this.session) return;
    const session = new AbortController();
    this.session = session;
    this.callbacks.onError("");
    this.callbacks.onStatus("connecting");
    void this.run(session).catch((error: Error) => {
      if (this.session !== session || session.signal.aborted) return;
      this.stop();
      this.callbacks.onError(error.name === "TimeoutError" ? "The voice server took too long. Please call again." : error.message);
      this.callbacks.onStatus("error");
    });
  }
  stop() {
    this.session?.abort();
    this.session = null;
    this.callbacks.onStatus("idle");
  }
  private async request(path: string, signal: AbortSignal, speechResult?: string): Promise<VoiceReply> {
    const response = await this.environment.fetch(path, {
      method: speechResult === undefined ? "GET" : "POST",
      headers: speechResult === undefined ? undefined : { "Content-Type": "application/json" },
      body: speechResult === undefined ? undefined : JSON.stringify({ speechResult }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
    });
    signal.throwIfAborted();
    const reply = await readJsonResponse<VoiceReply & { error?: string }>(response, path);
    if (!response.ok) throw new Error(reply.error ?? `Voice request failed (HTTP ${response.status}). Please call again.`);
    if (typeof reply.text !== "string" || !reply.text || (reply.audioUrl !== null && (typeof reply.audioUrl !== "string" || !/^\/audio\/[a-zA-Z0-9_-]+$/.test(reply.audioUrl)))) {
      throw new Error("The voice server returned an invalid response. Please call again.");
    }
    signal.throwIfAborted();
    return reply;
  }
  private async run(session: AbortController) {
    const signal = session.signal;
    if (!this.environment.isSecureContext) throw new Error("Microphone access needs HTTPS or localhost. Open the HTTPS demo link.");
    if (!this.environment.Recognition) throw new Error("Speech recognition is unavailable. Open this call in Chrome or Edge, or type below.");
    let reply = await this.request("/voice/greeting", signal);
    while (!signal.aborted) {
      this.callbacks.onStatus("speaking");
      await this.speak(reply, signal);
      signal.throwIfAborted();
      let transcript = "";
      while (!transcript) {
        this.callbacks.onStatus("listening");
        transcript = await this.listen(signal);
        signal.throwIfAborted();
        // Silence is normal. Avoid rapid restart if a browser ends recognition immediately.
        if (!transcript) await this.waitForRetry(signal);
      }
      this.callbacks.onTranscript(transcript);
      this.callbacks.onStatus("thinking");
      reply = await this.request("/voice/process", signal, transcript);
      signal.throwIfAborted();
      this.callbacks.onAnswer(transcript, reply.text);
    }
  }
  private async speak(reply: VoiceReply, signal: AbortSignal) {
    if (!reply.audioUrl) throw new Error("ElevenLabs audio is unavailable. Check the server log and call again.");
    await this.playAudio(reply.audioUrl, signal);
  }
  private playAudio(url: string, signal: AbortSignal) {
    if (this.environment.prepareAudioUrl) {
      return this.environment.prepareAudioUrl(url, signal).then(async (prepared) => {
        try { await this.playPreparedAudio(prepared.url, signal); }
        finally { prepared.release(); }
      });
    }
    return this.playPreparedAudio(url, signal);
  }
  private playPreparedAudio(url: string, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const audio = this.environment.createAudio(url);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        audio.onended = audio.onerror = null;
        audio.pause();
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new DOMException("Call ended", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Audio playback timed out")), 30_000);
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("Audio playback failed"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { void audio.play().catch(() => finish(new Error("Audio playback was blocked"))); }
      catch { finish(new Error("Audio playback could not start")); }
    });
  }
  private listen(signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const recognition = new this.environment.Recognition!();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.continuous = false;
      let transcript = "";
      const finish = (error?: Error) => {
        signal.removeEventListener("abort", abort);
        recognition.onresult = recognition.onerror = recognition.onend = null;
        try { recognition.abort(); } catch { /* Already stopped. */ }
        error ? reject(error) : resolve(transcript);
      };
      const abort = () => finish(new DOMException("Call ended", "AbortError"));
      recognition.onresult = (event) => { transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim(); };
      // Wait for onend so the microphone is closed before answer audio starts.
      recognition.onend = () => finish();
      recognition.onerror = (event) => {
        if (event.error === "no-speech") return;
        const message = ["not-allowed", "service-not-allowed"].includes(event.error)
          ? "Microphone permission was denied. Allow microphone access in your browser, then call again."
          : event.error === "audio-capture"
            ? "No microphone is available. Connect a microphone and call again."
            : `Speech recognition failed (${event.error}). Check your connection and call again.`;
        finish(new Error(message));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { recognition.start(); } catch { finish(new Error("Could not start the microphone. Check permissions and call again.")); }
    });
  }
  private waitForRetry(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Call ended", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 300);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}

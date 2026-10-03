import type { AppState } from "../types/finance.ts";

/** Fetch-based SSE keeps the Supabase bearer token out of URLs and public EventSource connections. */
export async function streamMemory(headers: Record<string, string>, signal: AbortSignal, onUpdate: (state: AppState) => void, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/live-stream", { headers, signal });
  if (!response.ok || !response.body) throw new Error("Live memory stream unavailable; authenticated polling remains active.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) !== -1) {
        const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
        const lines = frame.split("\n");
        if (!lines.some(l => l === "event: update" || l === "event: memory")) continue;
        const payload = JSON.parse(lines.filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n"));
        if (payload.state && Array.isArray(payload.state.transactions)) onUpdate(payload.state);
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

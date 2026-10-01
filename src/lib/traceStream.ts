export type TraceStep = { index: number; [key: string]: unknown };

/** Read the protected SSE replay with the same bearer headers used by other API calls. */
export async function streamTrace(
  path: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  onStep: (step: TraceStep) => void,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(path, { headers, signal });
  if (!response.ok) {
    const body = await response.text();
    let message = `Trace replay failed (HTTP ${response.status}).`;
    try { message = JSON.parse(body).error || message; } catch { /* Keep the status message. */ }
    throw new Error(message);
  }
  if (!response.body) throw new Error("Trace replay returned no event stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;
  const consume = (frame: string) => {
    let event = "";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (event === "done") { finished = true; return; }
    if (event !== "step") return;
    const step = JSON.parse(data.join("\n")) as TraceStep;
    if (!Number.isInteger(step.index) || step.index < 0) throw new Error("Trace replay returned an invalid step.");
    onStep(step);
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (finished) break;
      }
    }
    if (!finished && !signal.aborted) throw new Error("Trace replay ended before its final step.");
  } finally {
    reader.releaseLock();
  }
}

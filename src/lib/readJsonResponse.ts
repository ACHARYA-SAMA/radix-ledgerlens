/** Keep tunnel or server HTML errors out of JSON.parse and present a useful message. */
export async function readJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const body = await response.text();
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("json")) {
    if (/ERR_NGROK_725|network bandwidth limit/i.test(body)) {
      throw new Error("The ngrok public tunnel has reached its monthly bandwidth limit (ERR_NGROK_725). Open LedgerLens at http://127.0.0.1:3005 or use a new public tunnel.");
    }
    if (/ERR_NGROK_/i.test(body)) {
      throw new Error(`The ngrok public tunnel is unavailable (HTTP ${response.status}). Open LedgerLens at http://127.0.0.1:3005 or check the tunnel.`);
    }
    const kind = type.includes("html") || /^\s*</.test(body) ? "an HTML page" : "a non-JSON response";
    throw new Error(`LedgerLens received ${kind} from ${endpoint} (HTTP ${response.status}). Check the app server or public tunnel.`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`LedgerLens received invalid JSON from ${endpoint} (HTTP ${response.status}).`);
  }
}

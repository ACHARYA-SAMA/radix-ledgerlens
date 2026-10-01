import { authHeaders, supabase } from "./supabase.ts";
import { readJsonResponse } from "./readJsonResponse.ts";
import { authenticatedFetch } from "./authenticatedFetch.ts";

let refreshPromise: Promise<boolean> | null = null;
const refreshSession = () => {
  if (!supabase) return Promise.resolve(false);
  refreshPromise ??= supabase.auth.refreshSession()
    .then(({ data, error }) => !error && Boolean(data.session?.access_token))
    .catch(() => false)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
};

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, {
    headers: authHeaders,
    refresh: refreshSession,
    expire: async () => {
      try { await supabase?.auth.signOut({ scope: "local" }); } catch { /* Show the 401 below. */ }
    },
  });
  const data = await readJsonResponse<T & { error?: string }>(response, `/api${path}`);
  if (!response.ok) {
    throw Error(data.error ?? "Request failed");
  }
  return data;
}

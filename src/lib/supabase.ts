import { createClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const url = env?.VITE_SUPABASE_URL?.trim();
const key = env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env?.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".ngrok-free.dev"))
    headers["ngrok-skip-browser-warning"] = "1";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

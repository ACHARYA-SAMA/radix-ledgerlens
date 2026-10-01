import { createClient } from "@supabase/supabase-js";
import type { RequestHandler } from "express";

export type VerifyToken = (token: string) => Promise<boolean>;

export function createSupabaseVerifier(): VerifyToken {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    console.warn("[auth] Supabase URL or publishable key is missing; protected routes will reject requests.");
    return async () => false;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if ([400, 401, 403].includes(error.status ?? 0)) return false;
      throw error;
    }
    return Boolean(data.user);
  };
}

export function requireAuth(verifyToken: VerifyToken): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
    if (!match) { res.status(401).json({ error: "Please sign in to continue." }); return; }
    try {
      if (!await verifyToken(match[1])) { res.status(401).json({ error: "Your session has expired. Please sign in again." }); return; }
      next();
    } catch (error) {
      console.error("[auth] Token verification failed:", error);
      res.status(503).json({ error: "Sign-in verification is temporarily unavailable." });
    }
  };
}

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "../App";
import LoginCard from "./LoginCard";
import FloatingMoney from "./FloatingMoney";
import { CrowdCanvas } from "./CrowdCanvas";
import { supabase } from "../lib/supabase";
import ResetPassword from "./ResetPassword";
import { isMobileRoute } from "../lib/publicRoute.ts";

export default function AuthGate() {
  const [mobile, setMobile] = useState(isMobileRoute);
  useEffect(() => { const route = () => setMobile(isMobileRoute()); window.addEventListener("hashchange", route); window.addEventListener("popstate", route); return () => { window.removeEventListener("hashchange", route); window.removeEventListener("popstate", route); }; }, []);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  if (mobile || /^\/share\/[^/]+$/.test(window.location.pathname)) return <App />;
  if (window.location.pathname === "/reset-password") return <ResetPassword />;
  if (session === undefined) return <div className="min-h-screen bg-white" />;
  if (session) return <App key={session.user.id} />;
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-white text-black cursor-default selection:bg-black selection:text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", '--font-sans': "'Space Grotesk', sans-serif" } as React.CSSProperties}>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} scale={1} />
      </div>
      <FloatingMoney />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4" data-login-card>
        <LoginCard initialMode={window.location.pathname === '/signup' ? 'signup' : 'signin'} />
      </div>
    </div>
  );
}

/* Repository touch marker. */
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return <div className="min-h-screen bg-white flex items-center justify-center p-4 text-black">
    <form className="w-full max-w-[420px] rounded-3xl border border-black/10 bg-white p-8 shadow-2xl" onSubmit={async (event) => {
      event.preventDefault();
      if (!supabase) { setError("Supabase is not configured."); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) setError(updateError.message);
      else { setDone(true); await supabase.auth.signOut(); }
    }}>
      <h1 className="text-2xl font-semibold">Reset password</h1>
      {done ? <p className="mt-4 text-sm">Password updated. <a className="underline" href="/login">Sign in</a> with your new password.</p> : <>
        <p className="mt-2 text-sm text-black/60">Enter a new password for your account.</p>
        <label htmlFor="new-password" className="mt-6 block text-xs uppercase text-black/60">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black" />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="mt-6 h-12 w-full rounded-xl bg-black text-white">Update password</button>
      </>}
    </form>
  </div>;
}

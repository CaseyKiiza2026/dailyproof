"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [visible, setVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ username: string; available: boolean } | null>(null);
  const usernameCheckId = useRef(0);

  const usernameFormatValid = USERNAME_PATTERN.test(username);

  useEffect(() => {
    if (mode !== "signup" || !usernameFormatValid) return;

    const requestId = ++usernameCheckId.current;

    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (usernameCheckId.current !== requestId) return;
      setCheckResult({ username, available: !data });
    }, 500);

    return () => clearTimeout(timeout);
  }, [username, mode, usernameFormatValid]);

  const usernameStatus: UsernameStatus =
    mode !== "signup" || username.length === 0
      ? "idle"
      : !usernameFormatValid
        ? "invalid"
        : checkResult?.username === username
          ? checkResult.available
            ? "available"
            : "taken"
          : "checking";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
      if (usernameStatus === "invalid" || username.length === 0) {
        setError("Choose a username: 3-20 characters, lowercase letters, numbers, and underscores only.");
        return;
      }
      if (usernameStatus === "taken") {
        setError("That username is already taken.");
        return;
      }
      if (usernameStatus === "checking") {
        setError("Still checking username availability.");
        return;
      }
    }

    setLoading(true);
    const supabase = createClient();

    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { username } } });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center"><Logo /></div>
        <div className="mt-6 text-center"><h1 className="text-3xl font-black tracking-[-0.05em]">Prove it. Every day.</h1><p className="mt-2 text-sm text-white/35">Turn habits into visible proof of consistency.</p></div>
        <section className="proof-panel mt-8 p-5 sm:p-6">
          <div className="flex rounded-full border border-white/[0.08] bg-white/[0.025] p-1">{(["login","signup"] as const).map((item) => <button onClick={() => { setMode(item); setError(null); setUsername(""); }} key={item} className={`proof-focus flex-1 rounded-full py-2.5 text-sm font-bold capitalize ${mode === item ? "bg-white/[0.08]" : "text-white/35"}`}>{item === "signup" ? "Sign up" : "Login"}</button>)}</div>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/50">Username</span>
                <input required type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jethro" className="proof-focus h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.025] px-4 text-sm outline-none placeholder:text-white/20" />
                {usernameStatus === "checking" && <p className="mt-1.5 text-xs font-semibold text-white/35">Checking availability…</p>}
                {usernameStatus === "available" && <p className="mt-1.5 text-xs font-semibold text-proof-green">✓ Available</p>}
                {usernameStatus === "taken" && <p className="mt-1.5 text-xs font-semibold text-proof-red">✗ Already taken</p>}
                {usernameStatus === "invalid" && <p className="mt-1.5 text-xs font-semibold text-proof-red">✗ 3-20 characters: lowercase letters, numbers, underscores only</p>}
              </label>
            )}
            <label className="block"><span className="mb-2 block text-xs font-semibold text-white/50">Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="proof-focus h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.025] px-4 text-sm outline-none placeholder:text-white/20" /></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-white/50">Password</span><span className="relative block"><input required type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="proof-focus h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.025] px-4 pr-12 text-sm outline-none placeholder:text-white/20" /><button type="button" onClick={() => setVisible(!visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30">{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            {mode === "signup" && <label className="block"><span className="mb-2 block text-xs font-semibold text-white/50">Confirm password</span><input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="proof-focus h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.025] px-4 text-sm outline-none placeholder:text-white/20" /></label>}
            {error && <p className="text-xs font-semibold text-proof-red">{error}</p>}
            <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-proof-green text-sm font-black text-black shadow-proof-button disabled:opacity-60">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <>{mode === "login" ? "Enter DailyProof" : "Create account"}<ArrowRight size={17} /></>}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

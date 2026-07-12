import { Bell, ChevronRight, Lock, Moon, Settings2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const settings = [
  { label: "Account settings", sub: "Username, email and profile", icon: Settings2 },
  { label: "Privacy", sub: "Public profile and friend visibility", icon: Lock },
  { label: "Notifications", sub: "Check-ins, streaks and friend activity", icon: Bell },
  { label: "Appearance", sub: "Dark base theme and Proof Aura", icon: Moon }
];

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id, username").eq("id", user.id).single();
    username = profile?.username ?? null;
  }
  const initials = username ? username.slice(0, 2).toUpperCase() : "";

  return (
    <div className="space-y-6">
      <section className="proof-panel p-6 text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-proof-green/35 bg-proof-green/10 text-2xl font-black text-proof-green shadow-proof-glow">{initials}</div><h1 className="mt-4 text-2xl font-black">{username ?? "Unknown"}</h1><p className="mt-1 text-sm text-white/35">@{username ?? "unknown"} · Building proof daily.</p><div className="mx-auto mt-5 flex max-w-sm justify-center gap-8 border-t border-white/[0.07] pt-5"><div><p className="text-xl font-black">21</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Streak</p></div><div><p className="text-xl font-black">78%</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Score</p></div><div><p className="text-xl font-black">4</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Friends</p></div></div></section>
      <section className="proof-panel overflow-hidden">{settings.map(({ label, sub, icon: Icon }) => <button className="proof-focus flex w-full items-center gap-3 border-b border-white/[0.06] px-5 py-4 text-left last:border-0 hover:bg-white/[0.025]" key={label}><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/55"><Icon size={18} /></span><span className="flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-white/30">{sub}</span></span><ChevronRight size={16} className="text-white/25" /></button>)}</section>
      <section className="proof-panel flex items-center gap-3 p-5"><ShieldCheck className="text-proof-green" /><div><p className="text-sm font-bold">Proof Aura ready</p><p className="mt-1 text-xs text-white/35">Your interface can intensify as your streak grows.</p></div></section>
    </div>
  );
}

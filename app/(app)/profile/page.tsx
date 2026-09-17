import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, CalendarDays, RadioTower, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrivacySettings } from "@/components/profile/privacy-settings";

const settings = [
  { label: "Year", sub: "Your habit history", icon: CalendarDays, href: "/year" },
  { label: "Notifications", sub: "Reminders, nudges and delivery settings", icon: Bell, href: "/notifications" },
  { label: "Feed", sub: "Activity from your circle", icon: RadioTower, href: "/feed" }
];

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [profileResult, summaryResult, friendsResult] = await Promise.all([
    supabase.from("profiles").select("id, username").eq("id", user.id).single(),
    supabase.rpc("get_friend_day_summary", { p_target_user_id: user.id }),
    supabase.from("friendships").select("id", {count:"exact",head:true}).eq("status","accepted").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
  ]);
  const username = profileResult.data?.username ?? null;
  const summary = summaryResult.data;
  const friendCount = friendsResult.count;
  const initials = username ? username.slice(0, 2).toUpperCase() : "";

  return (
    <div className="space-y-6">
      <PrivacySettings />
      <section className="proof-panel p-6 text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-proof-green/35 bg-proof-green/10 text-2xl font-black text-proof-green shadow-proof-glow">{initials}</div><h1 className="mt-4 text-2xl font-black">{username ?? "Unknown"}</h1><p className="mt-1 text-sm text-white/35">@{username ?? "unknown"} · Building proof daily.</p><div className="mx-auto mt-5 flex max-w-sm justify-center gap-8 border-t border-white/[0.07] pt-5"><div><p className="text-xl font-black">{summary?.streak ?? "—"}</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Streak</p></div><div><p className="text-xl font-black">{summary ? `${summary.completion}%` : "—"}</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Score</p></div><div><p className="text-xl font-black">{friendCount ?? "—"}</p><p className="text-[10px] uppercase tracking-[.1em] text-white/30">Friends</p></div></div></section>
      <section className="proof-panel overflow-hidden">{settings.map(({ label, sub, icon: Icon, href }) => <Link href={href} className="proof-focus flex w-full items-center gap-3 border-b border-white/[0.06] px-5 py-4 text-left last:border-0 hover:bg-white/[0.025]" key={label}><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/55"><Icon size={18} /></span><span className="flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-white/30">{sub}</span></span><ChevronRight size={16} className="text-white/25" /></Link>)}</section>
      <section className="proof-panel flex items-center gap-3 p-5"><ShieldCheck className="text-proof-green" /><div><p className="text-sm font-bold">Proof Aura ready</p><p className="mt-1 text-xs text-white/35">Your interface can intensify as your streak grows.</p></div></section>
    </div>
  );
}

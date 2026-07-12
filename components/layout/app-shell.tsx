"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Grid2X2, LogOut, Plus, RadioTower, UserRound, UsersRound } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2X2 },
  { href: "/year", label: "Year", icon: CalendarDays },
  { href: "/feed", label: "Feed", icon: RadioTower },
  { href: "/friends", label: "Friends", icon: UsersRound },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadingProfile(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("id, username").eq("id", user.id).single();
      setUsername(profile?.username ?? null);
      setLoadingProfile(false);
    }

    loadProfile();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const initials = username ? username.slice(0, 2).toUpperCase() : "";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-white/[0.07] bg-black/35 px-5 py-7 backdrop-blur-xl lg:flex lg:flex-col">
        <Logo />
        <nav className="mt-12 space-y-2">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? "bg-proof-green/10 text-proof-green shadow-[inset_0_0_0_1px_rgba(37,216,111,.16)]" : "text-white/45 hover:bg-white/[0.035] hover:text-white"}`}
              >
                <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto proof-panel p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-proof-green/80 to-emerald-900 text-xs font-black text-black">
              {loadingProfile ? <span className="h-3 w-3 animate-pulse rounded-full bg-black/30" /> : initials}
            </div>
            <div className="min-w-0 flex-1">
              {loadingProfile ? (
                <div className="space-y-1.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                  <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.06]" />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-bold">{username ?? "Unknown"}</p>
                  <p className="truncate text-xs text-white/35">21 day streak</p>
                </>
              )}
            </div>
            <button aria-label="Log out" onClick={handleLogout} className="proof-focus grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/35 hover:bg-white/[0.05] hover:text-white">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 pb-28 lg:col-start-2 lg:pb-12">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-10 lg:py-9">{children}</div>
      </main>

      <nav className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-24px)] max-w-[560px] -translate-x-1/2 items-center justify-around rounded-[28px] border border-white/[0.10] bg-[#090c0a]/90 px-3 py-2 shadow-[0_22px_90px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl lg:hidden">
        {navigation.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`flex w-16 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold ${active ? "text-proof-green" : "text-white/35"}`}>
              <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
        <button aria-label="Quick check-in" className="proof-focus -my-6 grid h-[62px] w-[62px] place-items-center rounded-full border border-proof-green/60 bg-gradient-to-b from-proof-green to-proof-green2 text-black shadow-proof-button">
          <Plus size={31} strokeWidth={2.1} />
        </button>
        {navigation.slice(2, 3).map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`flex w-16 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold ${active ? "text-proof-green" : "text-white/35"}`}>
              <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
        <Link href="/profile" className={`flex w-16 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold ${pathname === "/profile" ? "text-proof-green" : "text-white/35"}`}>
          <UserRound size={19} strokeWidth={pathname === "/profile" ? 2.4 : 1.8} />
          Profile
        </Link>
      </nav>
    </div>
  );
}

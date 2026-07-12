import { Search, UserPlus, UsersRound } from "lucide-react";
import { friendRows } from "@/lib/mock-data";

export default function FriendsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><p className="proof-kicker">Accountability circle</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Friends</h1></div><button className="proof-pill h-11 px-4 text-sm font-bold text-proof-green"><UserPlus size={17} className="mr-2" />Add</button></header>
      <label className="proof-panel flex items-center gap-3 px-4 py-3"><Search size={17} className="text-white/30" /><input className="w-full bg-transparent text-sm outline-none placeholder:text-white/25" placeholder="Search friends or username" /></label>
      <section className="proof-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-4"><UsersRound size={18} className="text-proof-green" /><h2 className="font-bold">Your circle</h2></div>
        {friendRows.map((friend) => <div key={friend.handle} className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0"><div className="grid h-11 w-11 place-items-center rounded-full border border-proof-green/25 bg-proof-green/10 text-xs font-black text-proof-green">{friend.initials}</div><div className="min-w-0 flex-1"><p className="font-bold">{friend.name}</p><p className="text-xs text-white/30">{friend.handle}</p></div><div className="text-right"><p className="text-sm font-black text-proof-green">{friend.score}%</p><p className="text-[10px] text-white/30">{friend.streak} day streak</p></div></div>)}
      </section>
      <section className="proof-panel p-5"><p className="proof-kicker">Shared template</p><h2 className="mt-3 text-xl font-black">ML Grind</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/40">Four focused habits for people shipping skills, not collecting tutorials.</p><button className="mt-5 rounded-full bg-proof-green px-5 py-2.5 text-sm font-black text-black shadow-proof-button">Copy template</button></section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Bell, Flame } from "lucide-react";
import { FeedCard } from "@/components/feed/feed-card";
import { feedItems } from "@/lib/mock-data";

export default function FeedPage() {
  const [tab, setTab] = useState("All");
  const tabs = ["All", "Habits", "Milestones", "Mentions"];
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Accountability Feed</h1>
        <button className="proof-pill h-11 w-11"><Bell size={18} /></button>
      </header>

      <section className="proof-panel overflow-hidden p-5">
        <div className="grid grid-cols-[1fr_1.6fr_1fr] items-end gap-4">
          <div><p className="text-xs text-white/35">Your streak</p><p className="mt-1 text-3xl font-black">21</p><p className="text-xs text-white/30">days</p></div>
          <div className="flex h-16 items-end justify-center gap-2">{[38,46,43,53,62,70,78].map((height, index) => <span key={index} style={{ height }} className="w-3 rounded-full bg-gradient-to-t from-emerald-900 to-proof-green" />)}</div>
          <div className="text-right"><p className="text-xs text-white/35">Best</p><p className="mt-1 text-3xl font-black">32</p><p className="text-xs text-white/30">days</p></div>
        </div>
      </section>

      <div className="flex overflow-x-auto rounded-full border border-white/[0.08] bg-white/[0.025] p-1">
        {tabs.map((item) => <button onClick={() => setTab(item)} key={item} className={`proof-focus min-w-[100px] flex-1 rounded-full px-4 py-2 text-xs font-semibold transition ${tab === item ? "bg-white/[0.08] text-white" : "text-white/35"}`}>{item}</button>)}
      </div>

      <section className="space-y-3">{feedItems.map((item) => <FeedCard key={item.id} item={item} />)}</section>

      <section className="proof-panel p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Top Streaks</h2><span className="proof-pill px-3 py-1.5 text-[10px] text-white/50">This month</span></div>
        <div className="mt-5 space-y-4">{[["Jethro",21],["Sarah",18],["David",16]].map(([name, value], index) => <div className="grid grid-cols-[24px_70px_1fr_30px] items-center gap-2 text-xs" key={String(name)}><span className="text-white/30">{index+1}</span><span className="font-semibold">{name}</span><div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-proof-green" style={{ width: `${Number(value)*4}%` }} /></div><span className="text-right text-white/45">{value}</span></div>)}</div>
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-proof-green"><Flame size={13} /> Friends make streaks harder to break.</p>
      </section>
    </div>
  );
}

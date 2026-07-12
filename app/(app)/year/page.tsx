import { Flame, Grid2X2, Plus, Search } from "lucide-react";
import { YearHeatmap } from "@/components/year/year-heatmap";

export default function YearPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-5xl font-black tracking-[-0.06em] sm:text-6xl">2026</h1>
        <div className="flex overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.025]">
          {[Grid2X2, Search, Plus].map((Icon, index) => <button key={index} className={`proof-focus grid h-12 w-12 place-items-center border-r border-white/[0.07] last:border-0 ${index === 0 ? "bg-proof-green/[0.08] text-proof-green" : "text-white/65"}`}><Icon size={19} /></button>)}
        </div>
      </header>

      <section className="proof-panel overflow-hidden p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-8">
          <div><p className="text-sm text-white/40">Year to date</p><p className="mt-3 text-5xl font-black tracking-[-0.06em]">191 <span className="text-sm font-normal tracking-normal text-white/30">days tracked</span></p></div>
          <div className="text-right"><p className="text-sm text-white/40">Best streak</p><p className="mt-3 text-5xl font-black tracking-[-0.06em]">32 <span className="text-sm font-normal tracking-normal text-white/30">days</span></p></div>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-5 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-proof-green"><Flame size={20} className="fill-orange-500 text-orange-500" />21 day current streak</span>
          <span className="text-white/25">•</span>
          <span className="text-white/35">78% completion</span>
        </div>
      </section>

      <YearHeatmap />
    </div>
  );
}

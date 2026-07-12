"use client";

import { useMemo, useState } from "react";

const palette = ["bg-white/[0.05]", "bg-emerald-950", "bg-emerald-800", "bg-emerald-600", "bg-proof-green"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

function seededValue(index: number): number | "missed" | "vacation" | "rest" {
  const n = Math.abs(Math.sin(index * 12.9898) * 43758.5453);
  const chance = n - Math.floor(n);
  if (index % 41 === 0) return "missed";
  if (index % 67 === 0) return "vacation";
  if (index % 53 === 0) return "rest";
  return Math.min(4, Math.floor(chance * 5));
}

export function YearHeatmap() {
  const [mode, setMode] = useState<"monthly" | "weekly">("monthly");
  const cells = useMemo(() => Array.from({ length: mode === "monthly" ? 28 * 7 : 16 * 7 }, (_, index) => seededValue(index)), [mode]);
  const columns = mode === "monthly" ? 28 : 16;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <p className="proof-kicker">Daily score</p>
        <button className="proof-pill h-10 border-proof-green/25 px-4 text-sm font-semibold text-proof-green">Today ↓</button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[700px]">
          <div className="mb-3 grid pl-8 text-xs font-medium text-white/45" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0,1fr))` }}>
            {months.map((month) => <span key={month}>{month}</span>)}
          </div>
          <div className="flex gap-3">
            <div className="grid grid-rows-7 gap-[5px] py-[1px] text-[10px] text-white/35">
              {['M','T','W','T','F','S','S'].map((day, index) => <span className="grid h-[18px] place-items-center" key={`${day}-${index}`}>{day}</span>)}
            </div>
            <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${columns}, 18px)`, gridTemplateRows: "repeat(7,18px)", gridAutoFlow: "column" }}>
              {cells.map((cell, index) => {
                const cellClass = typeof cell === "number" ? palette[cell] : cell === "missed" ? "bg-proof-red/75" : cell === "rest" ? "bg-proof-amber/80" : "bg-proof-violet/75";
                return <button title={`Day ${index + 1}`} key={index} className={`proof-focus rounded-[5px] border border-white/[0.045] transition hover:scale-110 ${cellClass}`} />;
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-1.5 text-[10px] text-white/35">
        <span className="mr-1">Less</span>
        {palette.map((color, index) => <span key={index} className={`h-3.5 w-3.5 rounded-[4px] border border-white/[0.04] ${color}`} />)}
        <span className="ml-1">More</span>
      </div>

      <div className="mx-auto mt-8 flex w-full max-w-[380px] rounded-full border border-white/[0.09] bg-white/[0.025] p-1">
        {(["monthly", "weekly"] as const).map((item) => (
          <button key={item} onClick={() => setMode(item)} className={`proof-focus flex-1 rounded-full py-3 text-sm font-bold capitalize transition ${mode === item ? "border border-proof-green/35 bg-proof-green/[0.08] text-white shadow-[0_0_28px_rgba(37,216,111,.10)]" : "text-white/32"}`}>{item}</button>
        ))}
      </div>
    </section>
  );
}

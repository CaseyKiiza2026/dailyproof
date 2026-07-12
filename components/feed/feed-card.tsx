import { Check, Flame, Sparkles } from "lucide-react";
import { FeedItem } from "@/lib/types";

export function FeedCard({ item }: { item: FeedItem }) {
  const rest = item.type === "rest";
  return (
    <article className="proof-panel flex items-center gap-3 p-3.5 transition hover:border-white/[0.14] hover:bg-white/[0.035]">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-xs font-black ${rest ? "border-proof-violet/35 bg-proof-violet/15 text-purple-200" : "border-proof-green/35 bg-proof-green/15 text-proof-green"}`}>{item.initials}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/45"><span className="font-semibold text-white/65">{item.name}</span> {item.verb}</p>
        <p className="mt-0.5 truncate text-sm font-extrabold text-white">{item.target}</p>
        <p className="mt-2 text-[10px] text-white/28">{item.time}</p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <span className={`grid h-8 w-8 place-items-center rounded-full ${rest ? "bg-proof-violet text-white" : "bg-proof-green text-black"}`}>{rest ? <Sparkles size={15} /> : <Check size={17} strokeWidth={3} />}</span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${rest ? "border-proof-violet/25 bg-proof-violet/10 text-purple-300" : "border-proof-green/25 bg-proof-green/10 text-proof-green"}`}><Flame size={11} />{item.badge}</span>
      </div>
    </article>
  );
}

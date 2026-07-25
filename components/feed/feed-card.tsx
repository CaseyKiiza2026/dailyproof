import { Check, Clock, Trophy, X } from "lucide-react";
import { FeedEvent, StreakTier } from "@/lib/types";
import { formatRelativeTime } from "@/lib/dates";

const TIER_COLOR: Record<StreakTier, string> = {
  base: "#687280",
  spark: "#2F8F5B",
  ember: "#B87A2A",
  flame: "#9F2F2F",
  blaze: "#D6A62C",
  inferno: "#D65A31",
  legend: "#8B6FD6",
  mythic: "#D6A62C"
};

const TIER_LABEL: Record<StreakTier, string> = {
  base: "Base",
  spark: "Spark",
  ember: "Ember",
  flame: "Flame",
  blaze: "Blaze",
  inferno: "Inferno",
  legend: "Legend",
  mythic: "Mythic"
};

function initialsOf(username: string) {
  return username.slice(0, 2).toUpperCase();
}

export function FeedCard({ item }: { item: FeedEvent }) {
  const time = formatRelativeTime(item.createdAt);

  if (item.eventType === "milestone" && item.tierName) {
    const color = TIER_COLOR[item.tierName];
    return (
      <article
        className="proof-panel flex items-center gap-3 p-3.5 transition hover:border-white/[0.14] hover:bg-white/[0.035]"
        style={{ boxShadow: `0 0 0 1px ${color}33, 0 10px 30px ${color}1a` }}
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border text-xs font-black"
          style={{ borderColor: `${color}59`, background: `${color}26`, color }}
        >
          {initialsOf(item.username)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/45">
            <span className="font-semibold text-white/65">@{item.username}</span> reached a new tier
          </p>
          <p className="mt-0.5 truncate text-sm font-extrabold text-white">{TIER_LABEL[item.tierName]} tier</p>
          <p className="mt-2 text-[10px] text-white/28">{time}</p>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: color }}>
          <Trophy size={15} className="text-black" />
        </span>
      </article>
    );
  }

  const complete = item.status === "complete";
  return (
    <article className="proof-panel flex items-center gap-3 p-3.5 transition hover:border-white/[0.14] hover:bg-white/[0.035]">
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-xs font-black ${
          complete ? "border-proof-green/35 bg-proof-green/15 text-proof-green" : "border-proof-red/35 bg-proof-red/15 text-proof-red"
        }`}
      >
        {initialsOf(item.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/45">
          <span className="font-semibold text-white/65">@{item.username}</span> {complete ? "completed" : "missed"}
        </p>
        <p className="mt-0.5 truncate text-sm font-extrabold text-white">{item.habitName}</p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-white/28">
          <span>{time}</span>
          {item.loggedLate && (
            <span className="inline-flex items-center gap-1 text-white/35" title="Logged the next day, not in real time">
              <Clock size={10} /> logged late
            </span>
          )}
        </div>
      </div>
      <span
        className={`grid h-8 w-8 place-items-center rounded-full ${complete ? "bg-proof-green text-black" : "bg-proof-red text-white"}`}
      >
        {complete ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}
      </span>
    </article>
  );
}

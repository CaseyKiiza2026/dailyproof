"use client";

import { useUserClock } from "@/components/layout/user-clock";

import { useMemo, useState } from "react";
import { Bell, Flame } from "lucide-react";
import { FeedCard } from "@/components/feed/feed-card";
import { DailySummaryCard } from "@/components/feed/daily-summary-card";
import { useFeedData } from "@/lib/hooks/use-feed-data";
import { useDailySummaries } from "@/lib/hooks/use-daily-summaries";
import { useFriendsData } from "@/lib/hooks/use-friends-data";
import { useHabitsData } from "@/lib/hooks/use-habits-data";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";
import { useLeaderboard } from "@/lib/hooks/use-leaderboard";
import { parseDateKey, dateKeyRange, monthDateKeys } from "@/lib/dates";
import { shiftDateKey } from "@/lib/timezone";
import { classifyDate, completionRatio } from "@/lib/stats";
import { DailySummary, FeedEvent } from "@/lib/types";

const TABS = ["All", "Daily", "Milestones"] as const;
type Tab = (typeof TABS)[number];

type TimelineItem = { kind: "daily"; data: DailySummary; sortKey: string } | { kind: "milestone"; data: FeedEvent; sortKey: string };

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("All");
  const feed = useFeedData();
  const { todayDate: realNow, now, today: todayKey } = useUserClock();
  const minute = Math.floor(now.getTime() / 60000);
  const { summaries, loading: summariesLoading, error: summariesError } = useDailySummaries(feed.events, minute, feed.ready);
  const friends = useFriendsData();
  const { habits, earliestLogDate, error: habitsError, ready: habitsReady } = useHabitsData();

  const monthlyDateKeys = useMemo(
    () => monthDateKeys(realNow.getFullYear(), realNow.getMonth(), realNow.getDate()),
    [realNow]
  );
  const streakDateKeys = useMemo(() => {
    const start = earliestLogDate ? parseDateKey(earliestLogDate) : realNow;
    return dateKeyRange(start, realNow);
  }, [earliestLogDate, realNow]);
  const stats = useHabitStats(habits, monthlyDateKeys, streakDateKeys);

  // Last 7 days' completion intensity, reusing the same classifyDate/
  // completionRatio the Year heatmap uses — not a separate calculation.
  const last7Days = useMemo(() => dateKeyRange(parseDateKey(shiftDateKey(todayKey, -6)), realNow), [todayKey, realNow]);
  const sparkline = last7Days.map((dateKey) => {
    const type = classifyDate(habits, dateKey);
    const ratio = type === "success" || type === "fail" ? completionRatio(habits, dateKey) : 0;
    return 16 + Math.round(ratio * 64);
  });

  const { entries: leaderboard, loading: leaderboardLoading, error: leaderboardError } = useLeaderboard(
    friends.userId,
    "you", // never rendered — the page always labels its own entry "You"
    habitsReady ? stats.currentStreak : null,
    friends.acceptedFriends,
    feed.events
  );

  const milestoneEvents = feed.events.filter((event) => event.eventType === "milestone");

  const timeline: TimelineItem[] = [
    ...summaries.map((s): TimelineItem => ({ kind: "daily", data: s, sortKey: s.lastActivityAt })),
    ...milestoneEvents.map((e): TimelineItem => ({ kind: "milestone", data: e, sortKey: e.createdAt }))
  ].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

  const visibleTimeline = timeline.filter((item) => {
    if (tab === "Daily") return item.kind === "daily";
    if (tab === "Milestones") return item.kind === "milestone";
    return true;
  });

  const loading = feed.loading || summariesLoading;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Accountability Feed</h1>
        <button className="proof-pill h-11 w-11">
          <Bell size={18} />
        </button>
      </header>

      {habitsError&&<p role="alert" className="text-proof-red">{habitsError}</p>}
      <section className="proof-panel overflow-hidden p-5">
        <div className="grid grid-cols-[1fr_1.6fr_1fr] items-end gap-4">
          <div>
            <p className="text-xs text-white/35">Your streak</p>
            <p className="mt-1 text-3xl font-black">{habitsReady ? stats.currentStreak : <span className="text-xs">{habitsError ? "Unavailable" : "Loading..."}</span>}</p>
            <p className="text-xs text-white/30">days</p>
          </div>
          <div className="flex h-16 items-end justify-center gap-2">
            {habitsReady && sparkline.map((height, index) => (
              <span key={index} style={{ height }} className="w-3 rounded-full bg-gradient-to-t from-emerald-900 to-proof-green" />
            ))}
          </div>
          <div className="text-right">
            <p className="text-xs text-white/35">Best</p>
            <p className="mt-1 text-3xl font-black">{habitsReady ? stats.bestStreak : <span className="text-xs">{habitsError ? "Unavailable" : "Loading..."}</span>}</p>
            <p className="text-xs text-white/30">days</p>
          </div>
        </div>
      </section>

      <div className="flex overflow-x-auto rounded-full border border-white/[0.08] bg-white/[0.025] p-1">
        {TABS.map((item) => (
          <button
            onClick={() => setTab(item)}
            key={item}
            className={`proof-focus min-w-[100px] flex-1 rounded-full px-4 py-2 text-xs font-semibold transition ${
              tab === item ? "bg-white/[0.08] text-white" : "text-white/35"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="space-y-3">
        {feed.error&&<p role="alert" className="text-sm text-proof-red">{feed.error}</p>}
        {friends.error&&<p role="alert" className="text-sm text-proof-red">{friends.error}</p>}
        {summariesError && <p role="alert" className="text-sm text-proof-red">{summariesError}</p>}
        {(loading || friends.loading) && visibleTimeline.length === 0 && !feed.error && !summariesError ? (
          <p className="min-h-[240px] px-1 py-6 text-center text-sm text-white/35">Loading feed…</p>
        ) : visibleTimeline.length === 0 && (feed.error || summariesError || friends.error) ? null : visibleTimeline.length === 0 ? (
          <p className="proof-panel px-5 py-10 text-center text-sm text-white/35">
            Nothing here yet. {friends.acceptedFriends.length === 0 ? "Add a friend to start seeing real check-ins." : "Log a habit to get things moving."}
          </p>
        ) : (
          visibleTimeline.map((item) =>
            item.kind === "daily" ? (
              <DailySummaryCard key={`${item.data.userId}-${item.data.logDate}`} summary={item.data} now={now} />
            ) : (
              <FeedCard key={item.data.id} item={item.data} />
            )
          )
        )}
      </section>

      <section className="proof-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Top Streaks</h2>
          <span className="proof-pill px-3 py-1.5 text-[10px] text-white/50">Current streak</span>
        </div>
        {leaderboardError&&<p role="alert" className="mt-3 text-sm text-proof-red">{leaderboardError}</p>}
        {leaderboardLoading && leaderboard.length === 0 ? (
          <p className="mt-5 min-h-[120px] text-xs text-white/35">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            {leaderboard.map((entry, index) => (
              <div className="grid grid-cols-[24px_100px_1fr_30px] items-center gap-2 text-xs" key={entry.userId}>
                <span className="text-white/30">{index + 1}</span>
                <span className="truncate font-semibold">{entry.isSelf ? "You" : `@${entry.username}`}</span>
                <div className="h-1.5 rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-proof-green"
                    style={{ width: `${Math.min(100, entry.streak * 4)}%` }}
                  />
                </div>
                <span className="text-right text-white/45">{entry.streak}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-proof-green">
          <Flame size={13} /> Friends make streaks harder to break.
        </p>
      </section>
    </div>
  );
}

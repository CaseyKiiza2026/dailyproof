"use client";

import { useEffect, useRef } from "react";
import { Bed, Check, ChevronDown, Circle, LockKeyhole, Plane, Star, X } from "lucide-react";
import { formatDateKey } from "@/lib/dates";
import { Habit, HabitStatus } from "@/lib/types";
import type { useDashboardHabits } from "@/lib/hooks/use-dashboard-habits";
import { HabitRowMenu } from "@/components/dashboard/habit-row-menu";

const statuses = {
  complete: { label: "Complete", icon: Check, style: "border-proof-green/30 bg-proof-green/10 text-proof-green" },
  missed: { label: "Missed", icon: X, style: "border-proof-red/30 bg-proof-red/10 text-proof-red" },
  rest: { label: "Rest", icon: Bed, style: "border-proof-amber/30 bg-proof-amber/10 text-proof-amber" },
  vacation: { label: "Vacation", icon: Plane, style: "border-proof-violet/30 bg-proof-violet/10 text-proof-violet" },
  empty: { label: "Empty", icon: Circle, style: "border-white/[0.12] bg-white/[0.035] text-white/65" }
};

interface MobileHabitListProps {
  presentation?: "grid" | "list";
  dashboard: ReturnType<typeof useDashboardHabits>;
  habits: Habit[];
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onCreate: () => void;
}

// A day-focused presentation of the existing month grid. All dates, schedules,
// permissions and writes still come from the same Dashboard hook.
export function MobileHabitList({ presentation = "list", dashboard, habits, onEdit, onDelete, onCreate }: MobileHabitListProps) {
  const { viewYear, viewMonth, selectedDay, daysInMonth, setSelectedDay, loading, pendingCells } = dashboard;
  const scroller = useRef<HTMLDivElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const selectedDate = new Date(viewYear, viewMonth, selectedDay);
  const dateKey = formatDateKey(selectedDate);
  const dateLabel = selectedDate.toLocaleDateString("en", { weekday: "short", month: "long", day: "numeric" });
  const editable = dashboard.isEditableDate(selectedDay);
  const hasHabits = dashboard.habits.length > 0;

  useEffect(() => {
    const strip = scroller.current;
    const button = selectedButton.current;
    if (!strip || !button) return;
    const centerSelection = () => {
      if (strip.clientWidth === 0) return;
      const offset = button.getBoundingClientRect().left - strip.getBoundingClientRect().left;
      const identityWidth = presentation === "grid" ? 160 : 0;
      strip.scrollLeft += offset - identityWidth - (strip.clientWidth - identityWidth - button.clientWidth) / 2;
    };
    centerSelection();
    const observer = new ResizeObserver(centerSelection);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [selectedDay, viewMonth, viewYear, loading, hasHabits, presentation]);

  if (!loading && dashboard.habits.length === 0) {
    return <div className="px-4 py-8 text-center sm:hidden">
      <p className="text-base font-bold">No habits yet</p>
      <p className="mt-2 text-sm leading-6 text-white/55">Add your first habit, or start with a curated set.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button onClick={dashboard.handleSeedStarterHabits} disabled={dashboard.seeding} className="proof-focus min-h-11 rounded-full bg-proof-green px-4 text-sm font-bold text-black disabled:opacity-60">{dashboard.seeding ? "Adding…" : "Add starter habits"}</button>
        <button onClick={onCreate} className="proof-pill proof-focus min-h-11 px-4 text-sm font-semibold">Add habit</button>
      </div>
    </div>;
  }

  if (presentation === "grid") {
    const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
    const columns = { gridTemplateColumns: `160px repeat(${daysInMonth}, 44px)` };
    return <div className="min-w-0 sm:hidden" aria-label="Mobile habit grid">
      <p className="border-b border-white/[0.07] px-4 py-3 text-sm font-semibold text-white/80">{dateLabel}</p>
      <div ref={scroller} className="overflow-x-auto [scrollbar-width:thin]" tabIndex={0} aria-label="Habit history, scroll horizontally for dates">
        <div className="grid w-max items-center border-b border-white/[0.07]" style={columns}>
          <span className="sticky left-0 z-10 self-stretch bg-[#0a0d0b] px-3 py-4 text-sm text-white/55">Habit</span>
          {days.map((day) => <button key={day} ref={day === selectedDay ? selectedButton : undefined}
            aria-label={new Date(viewYear, viewMonth, day).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}
            className={`proof-focus flex h-14 w-11 flex-col items-center justify-center text-sm ${day === selectedDay ? "bg-proof-green/15 text-proof-green" : "text-white/55"}`}>
            <span className="text-xs">{new Date(viewYear, viewMonth, day).toLocaleDateString("en", { weekday: "short" })}</span><span className="font-bold">{day}</span>
          </button>)}
        </div>
        {!loading && habits.map((habit) => <div key={habit.id} className="grid w-max items-center border-b border-white/[0.07]" style={columns}>
          <div className="sticky left-0 z-10 self-stretch border-r border-white/[0.07] bg-[#0a0d0b] px-3 py-3">
            <button onClick={() => onEdit(habit)} aria-label={`Edit ${habit.name}`} className="proof-focus min-h-11 w-full text-left">
              <span className="block break-words text-sm font-bold leading-5 text-white/90 [overflow-wrap:anywhere]">{habit.name}{habit.isCore && <Star size={11} fill="currentColor" aria-label="Core habit" className="ml-1 inline text-proof-amber" />}</span>
              <span className="mt-1 block text-xs leading-5 text-white/50">{habit.category}</span>
            </button>
          </div>
          {days.map((day) => {
            const key = formatDateKey(new Date(viewYear, viewMonth, day));
            const status = habit.logsByDate[key] ?? "empty";
            const scheduled = dashboard.isScheduledDate(habit.id, day);
            const canEdit = scheduled && dashboard.isEditableDate(day);
            const { icon: Icon, style, label } = statuses[status];
            const description = `${habit.name}, ${key}: ${scheduled ? label : "Not scheduled"}`;
            return <div key={day} className={`relative grid h-11 w-11 place-items-center focus-within:ring-2 focus-within:ring-inset focus-within:ring-proof-green ${day === selectedDay ? "bg-proof-green/[0.04]" : ""}`}>
              <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-md border ${scheduled ? style : "border-dashed border-white/15"}`}>
                {scheduled && <Icon size={15} />}
              </span>
              {canEdit ? <select aria-label={description} value={status} disabled={pendingCells.has(`${habit.id}:${key}`)}
                onChange={(event) => void dashboard.updateCell(habit.id, day, event.target.value as HabitStatus)}
                className="proof-focus absolute inset-0 h-11 w-11 cursor-pointer opacity-0">
                {Object.entries(statuses).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
              </select> : <span role="img" aria-label={`${description}${scheduled ? ", read only" : ""}`} className="absolute inset-0" />}
            </div>;
          })}
        </div>)}
      </div>
      {loading && <p role="status" className="p-4 text-sm text-white/55">Loading habits…</p>}
      {!loading && habits.length === 0 && <p className="p-4 text-sm text-white/55">No habits match the selected filters.</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-2 px-4 py-3 text-xs text-white/55">
        {Object.entries(statuses).map(([value, { label, icon: Icon }]) => <span key={value} className="inline-flex items-center gap-1"><Icon size={14} />{label}</span>)}
        <span>Tap a habit name to edit. More options in List.</span>
      </div>
    </div>;
  }

  return <div className="min-w-0 sm:hidden">
    <div className="border-b border-white/[0.07] py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4">
        <p className="text-sm font-semibold text-white/80">{dateLabel}</p>
        <span className="text-xs text-white/45">{editable ? "Swipe for dates" : "Read only · swipe dates"}</span>
      </div>
      <div ref={scroller} aria-label="Days of selected month" className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]">
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const date = new Date(viewYear, viewMonth, day);
          const selected = day === selectedDay;
          return <button key={day} ref={selected ? selectedButton : undefined} type="button"
            aria-label={date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            aria-pressed={selected} onClick={() => setSelectedDay(day)}
            className={`proof-focus flex h-14 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition ${selected ? "border-proof-green bg-proof-green text-black" : "border-white/[0.08] bg-white/[0.025] text-white/65"}`}>
            <span className="text-xs">{date.toLocaleDateString("en", { weekday: "short" })}</span>
            <span className="text-base font-bold">{day}</span>
          </button>;
        })}
      </div>
    </div>

    {loading ? <div aria-label="Loading habits" className="space-y-5 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
      : habits.length === 0 ? <p className="px-4 py-8 text-center text-sm text-white/55">No habits match the selected filters.</p>
      : habits.map((habit) => {
        const status = habit.logsByDate[dateKey] ?? "empty";
        const scheduled = dashboard.isScheduledDate(habit.id, selectedDay);
        const pending = pendingCells.has(`${habit.id}:${dateKey}`);
        const { label, icon: Icon, style } = statuses[status];
        return <article key={habit.id} className="border-b border-white/[0.07] px-4 py-4 last:border-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-base font-bold leading-6 text-white/90 [overflow-wrap:anywhere]">{habit.name}{habit.isCore && <Star size={12} fill="currentColor" aria-label="Core habit" className="ml-1.5 inline-block text-proof-amber" />}</h3>
              <p className="mt-1 break-words text-sm leading-5 text-white/50">{habit.category}</p>
            </div>
            <HabitRowMenu onEdit={() => onEdit(habit)} onDelete={() => onDelete(habit)} />
          </div>
          {scheduled && editable ? <div className={`relative mt-3 flex min-h-11 items-center rounded-xl border ${style}`}>
            <Icon size={18} className="pointer-events-none absolute left-3" />
            <select aria-label={`Status for ${habit.name}, ${dateLabel}`} value={status} disabled={pending}
              onChange={(event) => void dashboard.updateCell(habit.id, selectedDay, event.target.value as HabitStatus)}
              className="proof-focus h-11 w-full appearance-none rounded-xl bg-transparent pl-10 pr-10 text-base font-semibold disabled:opacity-60">
              {Object.entries(statuses).map(([value, option]) => <option key={value} value={value} className="bg-[#0a0d0b] text-white">{option.label}</option>)}
            </select>
            <ChevronDown size={17} className="pointer-events-none absolute right-3" />
            {pending && <span role="status" className="sr-only">Saving status</span>}
          </div> : <div className={`mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${scheduled ? style : "border-dashed border-white/[0.1] text-white/45"}`}>
            {scheduled ? <><Icon size={18} />{label}<LockKeyhole size={14} aria-label="Read only" className="ml-auto text-white/40" /></> : "Not scheduled"}
          </div>}
        </article>;
      })}
  </div>;
}

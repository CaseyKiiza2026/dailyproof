"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { navigateCalendarEvent } from "@/lib/calendar-navigation";
import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useCalendarData } from "@/lib/hooks/use-calendar-data";
import { Commitment } from "@/lib/calendar";
import {
  saveCommitment,
  deleteCommitment,
  setHabitTime,
} from "@/lib/actions/calendar";
import { useUserClock } from "@/components/layout/user-clock";
import { localDateTime, localDateTimeToUtc } from "@/lib/timezone";
import { Modal } from "@/components/ui/modal";

export function CalendarBoard() {
  const router = useRouter();
  const { today, timeZone } = useUserClock();
  const controller = useCalendarController();
  const remote = useCalendarData();
  const data = remote.data ?? { tasks: [], commitments: [], habits: [] };
  const ready = remote.data !== null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Commitment | "new" | null>(null);
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(null);
  const { refresh } = remote;
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await remote.mutate(action);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const events = [
    ...data.commitments.map((c) => ({
      id: c.id,
      title: `Fixed · ${c.title}`,
      start: c.start_at,
      end: c.end_at,
      color: "var(--raised)",
      contrastColor: "var(--foreground)",
      className: "commitment-event",
    })),
    ...data.tasks
      .filter((t) => t.scheduled_start && t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.scheduled_start!,
        end: t.scheduled_end!,
        color: "var(--raised)",
        contrastColor: "var(--foreground)",
        className: t.status === "completed" ? "task-event completed-event" : "task-event",
        url: "/todos",
      })),
    ...data.habits
      .filter((h) => h.scheduled_time)
      .map((h) => ({
        id: h.id,
        title: h.name,
        daysOfWeek: h.scheduled_days.map((d) => d % 7),
        startTime: h.scheduled_time!,
        duration: { minutes: h.duration_minutes! },
        color: "var(--raised)",
        contrastColor: "var(--foreground)",
        className: "habit-event",
        url: "/dashboard",
      })),
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <button className="proof-action proof-primary" onClick={() => { setSlot(null); setEditing("new"); }}>
          Add commitment
        </button>
      </header>
      <p className="text-xs text-white/55">{timeZone}</p>
      {(error || remote.error) && (
        <p role="alert" className="text-proof-red">
          {error || remote.error}{" "}
          <button className="proof-action" onClick={() => void refresh()}>
            Retry calendar
          </button>
        </p>
      )}
      {editing && (
        <Modal title={editing === "new" ? "New commitment" : "Edit commitment"} onClose={() => setEditing(null)}>
        <form
          key={typeof editing === "string" ? editing : editing.id}
          className="proof-panel space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await saveCommitment(editing === "new" ? null : editing.id, {
                title: String(f.get("title")),
                description: String(f.get("description")),
                start_at: localDateTimeToUtc(String(f.get("start")), timeZone)!,
                end_at: localDateTimeToUtc(String(f.get("end")), timeZone)!,
              });
            });
          }}
        >
          <label className="proof-field">
            Title
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={editing === "new" ? "" : editing.title}
            />
          </label>
          <label className="proof-field">
            Description
            <textarea
              name="description"
              maxLength={10000}
              defaultValue={editing === "new" ? "" : editing.description}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["start", "end"] as const).map((field) => (
              <label key={field} className="proof-field">
                {field === "start" ? "Start" : "End"}
                <input
                  type="datetime-local"
                  name={field}
                  required
                  defaultValue={
                    editing === "new"
                      ? slot?.[field] ?? `${today}T${field === "start" ? "09" : "10"}:00`
                      : localDateTime(editing[`${field}_at`], timeZone)
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy} className="proof-action">
              Save commitment
            </button>
            <button
              type="button"
              className="proof-action"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
        </Modal>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="proof-action"
          aria-label="Previous period"
          onClick={() => controller.prev()}
        >
          Previous
        </button>
        <button
          className="proof-action"
          onClick={() => controller.gotoDate(today)}
        >
          Today
        </button>
        <button
          className="proof-action"
          aria-label="Next period"
          onClick={() => controller.next()}
        >
          Next
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">{controller.view?.title}</h2>
        <div role="group" aria-label="Calendar view" className="flex gap-2">
          {[
            ["dayGridMonth", "Month"],
            ["timeGridWeek", "Week"],
            ["timeGridDay", "Day"],
          ].map(([view, label]) => (
            <button
              key={view}
              className="proof-action"
              aria-pressed={controller.view?.type === view}
              onClick={() => controller.changeView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="proof-calendar relative min-h-[600px] min-w-0 overflow-x-auto rounded-xl border border-white/10"
      >
        {!ready && (
          <div
            role="status"
            className="h-[600px] space-y-6 p-5 text-sm text-white/55"
          >
            {remote.error ? "Calendar unavailable" : "Loading calendar..."}
            <div
              aria-hidden="true"
              className="grid h-[520px] grid-cols-7 gap-2"
            >
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="rounded-lg bg-white/[0.025]" />
              ))}
            </div>
          </div>
        )}
        <div
          style={{
            minWidth:
              controller.view?.type === "timeGridWeek" ? 700 : undefined,
          }}
        >
          {ready && (
            <FullCalendar
              controller={controller}
              plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
              dateClick={(info) => {
                const start = info.dateStr.slice(0, 16);
                const localStart = info.allDay ? `${info.dateStr.slice(0, 10)}T09:00` : start;
                const instant = localDateTimeToUtc(localStart, timeZone);
                if (!instant) return;
                setSlot({ start: localStart, end: localDateTime(new Date(new Date(instant).getTime() + 60 * 60 * 1000).toISOString(), timeZone) });
                setEditing("new");
              }}
              initialView="timeGridDay"
              initialDate={today}
              timeZone={timeZone}
              now={() => new Date()}
              headerToolbar={false}
              height={600}
              events={events}
              eventMinHeight={48}
              eventClass="min-h-11"
              slotLaneClass="calendar-slot"
              editable={false}
              eventClick={(info) => {
                const c = data.commitments.find((c) => c.id === info.event.id);
                if (c) setEditing(c);
                else
                  navigateCalendarEvent(info.event.url, info.jsEvent, (url) =>
                    router.push(url),
                  );
              }}
            />
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Fixed commitments</h2>
        {!ready && (
          <div
            aria-label="Commitments not yet available"
            className="proof-panel min-h-36 p-4"
          >
            <div className="h-5 w-1/2 rounded bg-white/10" />
          </div>
        )}
        {data.commitments.map((c) => (
          <article key={c.id} className="proof-panel space-y-2 p-4">
            <h3 className="break-words font-bold">{c.title}</h3>
            <p className="text-sm text-white/55">
              {localDateTime(c.start_at, timeZone).replace("T", " ")} –{" "}
              {localDateTime(c.end_at, timeZone).replace("T", " ")}
            </p>
            <div className="flex gap-2">
              <button className="proof-action" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button
                disabled={busy}
                className="proof-action"
                onClick={() => {
                  if (confirm(`Delete “${c.title}”?`))
                    void run(() => deleteCommitment(c.id));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Habit times</h2>
        <p className="text-sm text-white/55">
          Optional times use each habit’s existing recurring days.
        </p>
        {!ready && (
          <div
            aria-label="Habit times not yet available"
            className="proof-panel min-h-48 p-4"
          >
            <div className="h-5 w-1/2 rounded bg-white/10" />
          </div>
        )}
        {data.habits.map((h) => (
          <form
            key={`${h.id}:${h.scheduled_time}`}
            className="proof-panel space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                setHabitTime(
                  h.id,
                  String(f.get("time")) || null,
                  Number(f.get("duration")),
                ),
              );
            }}
          >
            <h3 className="break-words font-bold">{h.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="proof-field">
                Time
                <input
                  name="time"
                  type="time"
                  defaultValue={h.scheduled_time?.slice(0, 5) ?? ""}
                />
              </label>
              <label className="proof-field">
                Minutes
                <input
                  name="duration"
                  type="number"
                  min={5}
                  max={720}
                  defaultValue={h.duration_minutes ?? 30}
                />
              </label>
            </div>
            <button disabled={busy} className="proof-action">
              Save habit time
            </button>
          </form>
        ))}
      </section>
      <Link href="/todos" className="proof-action">
        Schedule a task in To-Dos
      </Link>
    </div>
  );
}

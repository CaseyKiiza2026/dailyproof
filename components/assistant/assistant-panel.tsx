"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useCalendarData } from "@/lib/hooks/use-calendar-data";
import {
  runAssistant,
  approveAssistantPlan,
  AssistantReply,
} from "@/lib/actions/assistant";
import { useUserClock } from "@/components/layout/user-clock";
import { localDateTime } from "@/lib/timezone";
export function AssistantPanel() {
  const router = useRouter();
  const tasks = useTasks();
  const calendar = useCalendarData();
  const applying = useRef(false);
  const request = useRef<{ question: string; id: string } | null>(null);
  const previous = useRef<{ question: string; reply: string }[]>([]);
  const { timeZone } = useUserClock();
  const [question, setQuestion] = useState(""),
    [result, setResult] = useState<AssistantReply | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false),
    [current, setCurrent] = useState(true);
  async function ask() {
    if (busy) return;
    setBusy(true);
    setError("");
    setCurrent(false);
    setApplied(false);
    try {
      if (!request.current || request.current.question !== question)
        request.current = { question, id: crypto.randomUUID() };
      const response = await runAssistant(
        question,
        request.current.id,
        previous.current,
      );
      if (response.ok) {
        setResult(response);
        setCurrent(true);
        setApplied(Boolean(response.applied));
        previous.current = [
          ...previous.current,
          { question, reply: response.reply },
        ].slice(-8);
        if (response.applied || response.savedCount) {
          await Promise.all([tasks.invalidate(), calendar.invalidate()]);
          window.dispatchEvent(new Event("dailyproof:work-applied"));
          router.refresh();
        }
      } else setError(response.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Assistant</h1>
      <p className="text-sm leading-6 text-white/60">
        Plan your work with Gemini. Requests send relevant task, habit and
        reminder information to Gemini. Clear requests run automatically; broad
        deletions require confirmation. Uploads and privacy settings use their
        app controls. Times use {timeZone}.
      </p>
      <div className="assistant-layout">
        <section className="assistant-conversation proof-panel">
          <div className="assistant-suggestions">
            {[
              "Plan my week",
              "What should I do next?",
              "Find time for this",
              "How am I doing this week?",
            ].map((text) => (
              <button
                key={text}
                className="proof-action"
                onClick={() => setQuestion(text)}
              >
                {text}
              </button>
            ))}
          </div>
          {result && (
            <div className="assistant-reply">
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {result.reply}
              </p>
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="proof-field">
              Your request
              <textarea
                required
                maxLength={4000}
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <button disabled={busy} className="proof-action proof-primary">
              {busy ? "Working…" : "Ask assistant"}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-proof-red">
              {error}
            </p>
          )}
        </section>
        {result && (
          <aside aria-busy={busy} className="proof-panel space-y-4 p-4">
            <p role="status" className="min-h-5 text-sm text-white/55">
              {!current
                ? busy
                  ? "Working on your new request. Previous response shown below."
                  : "Previous response. Submit again to get a new plan."
                : ""}
            </p>
            <h2 className="text-lg">
              {result.applied || (result.savedCount && !result.planId)
                ? "Saved changes"
                : "Proposed changes"}
            </h2>
            {result.actions.map((a, i) => (
              <article
                key={i}
                className="space-y-2 rounded-xl border border-white/10 p-3"
              >
                <h2 className="font-bold">{a.tool.replaceAll("_", " ")}</h2>
                {a.displayTitle && <p className="text-sm">{a.displayTitle}</p>}
                {Object.entries(a.values)
                  .filter(([, v]) => v !== null && v !== "")
                  .map(([key, value]) => (
                    <p key={key} className="break-words text-sm text-white/65">
                      <span className="font-semibold">
                        {(
                          {
                            due_at: "Due",
                            scheduled_at: "Remind at",
                            scheduled_start: "Start",
                            scheduled_end: "End",
                            start_at: "Start",
                            end_at: "End",
                            only_if_incomplete: "Only if incomplete",
                            task_id: "Linked task",
                            habit_id: "Linked habit",
                          } as Record<string, string>
                        )[key] ?? key.replaceAll("_", " ")}
                        :
                      </span>{" "}
                      {typeof value === "string" &&
                      /(_at|_start|_end)$/.test(key)
                        ? localDateTime(value, timeZone).replace("T", " ")
                        : String(value)}
                    </p>
                  ))}
              </article>
            ))}
            {result.planId && !applied && (
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy || !current}
                  className="proof-action"
                  onClick={async () => {
                    if (applying.current) return;
                    applying.current = true;
                    setBusy(true);
                    setError("");
                    try {
                      const outcome = await approveAssistantPlan(
                        result.planId!,
                      );
                      if (outcome?.ok === false) throw new Error(outcome.error);
                      setApplied(true);
                      previous.current = [
                        ...previous.current,
                        {
                          question,
                          reply: "The reviewed changes were confirmed saved.",
                        },
                      ].slice(-8);
                      await Promise.all([
                        tasks.invalidate(),
                        calendar.invalidate(),
                      ]);
                      window.dispatchEvent(
                        new Event("dailyproof:work-applied"),
                      );
                      router.refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      applying.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  Apply reviewed changes
                </button>
                <button
                  disabled={busy}
                  className="proof-action"
                  onClick={() => setResult(null)}
                >
                  Discard
                </button>
              </div>
            )}
            {applied && (
              <p role="status" className="text-proof-green">
                Changes applied.
              </p>
            )}
          </aside>
        )}
        {!result && (
          <aside className="proof-panel p-6">
            <h2 className="text-lg">Proposed changes</h2>
            <p className="mt-3 text-sm text-white/55">
              Your suggestions will appear here for review.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

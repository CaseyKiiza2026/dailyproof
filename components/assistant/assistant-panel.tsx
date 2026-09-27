"use client";
import { useState } from "react";
import {
  askAssistant,
  approveAssistantPlan,
  AssistantReply,
} from "@/lib/actions/assistant";
import { useUserClock } from "@/components/layout/user-clock";
import { localDateTime } from "@/lib/timezone";
export function AssistantPanel() {
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
      const response = await askAssistant(question);
      if (response.ok) {
        setResult(response);
        setCurrent(true);
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
        reminder information to Gemini. You review changes before applying them.
        Times use {timeZone}.
      </p>
      <div className="assistant-layout"><section className="assistant-conversation proof-panel"><div className="assistant-suggestions">
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
      {result && <div className="assistant-reply"><p className="whitespace-pre-wrap break-words text-sm leading-6">{result.reply}</p></div>}
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
          <h2 className="text-lg">Proposed changes</h2>
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
                          only_if_incomplete: "Only if incomplete",
                          task_id: "Linked task",
                          habit_id: "Linked habit",
                        } as Record<string, string>
                      )[key] ?? key.replaceAll("_", " ")}
                      :
                    </span>{" "}
                    {typeof value === "string" && /(_at|_start|_end)$/.test(key)
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
                  setBusy(true);
                  setError("");
                  try {
                    await approveAssistantPlan(result.planId!);
                    setApplied(true);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
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
      {!result && <aside className="proof-panel p-6"><h2 className="text-lg">Proposed changes</h2><p className="mt-3 text-sm text-white/55">Your suggestions will appear here for review.</p></aside>}
      </div>
    </div>
  );
}

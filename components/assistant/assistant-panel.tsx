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
    [applied, setApplied] = useState(false);
  async function ask() {
    setBusy(true);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const response = await askAssistant(question);
      if (response.ok) setResult(response);
      else setError(response.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">DailyProof assistant</h1>
      <p className="text-sm leading-6 text-white/60">
        Plan your work with Gemini. Requests send relevant task, habit and
        reminder information to Gemini. You review changes before applying them.
        Times use {timeZone}.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
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
      <form
        className="proof-panel space-y-3 p-4"
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
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button disabled={busy} className="proof-action">
          {busy ? "Working…" : "Ask assistant"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-proof-red">
          {error}
        </p>
      )}
      {result && (
        <section className="proof-panel space-y-4 p-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {result.reply}
          </p>
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
                disabled={busy}
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
              <button className="proof-action" onClick={() => setResult(null)}>
                Discard
              </button>
            </div>
          )}
          {applied && (
            <p role="status" className="text-proof-green">
              Changes applied.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

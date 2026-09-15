"use client";
import { useEffect, useState } from "react";
import { useUserClock } from "@/components/layout/user-clock";
import { Task, TaskInput, taskBucket, taskBuckets } from "@/lib/tasks";
import { getTasks, saveTask, deleteTask } from "@/lib/actions/tasks";
import { localDateTime, localDateTimeToUtc } from "@/lib/timezone";
import { ProofPanel } from "@/components/proofs/proof-panel";

const empty: TaskInput = { title: "", description: "", due_at: null, scheduled_start: null, scheduled_end: null, priority: "normal", status: "pending" };
export function TaskBoard() {
  const { today, timeZone } = useUserClock();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [form, setForm] = useState<TaskInput>(empty);
  useEffect(() => { let live = true; getTasks().then((rows) => { if (live) { setTasks(rows); setReady(true); } }).catch((e: Error) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); setTasks(await getTasks()); setEditing(null); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update task."); } finally { setBusy(false); } }
  function edit(task: Task | "new") { setEditing(task); setForm(task === "new" ? empty : task); }
  return <div className="space-y-6">
    <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">To-Dos</h1><button className="proof-action" onClick={() => edit("new")}>Add task</button></header>
    <p className="text-sm text-white/55">Dates and times use {timeZone}.</p>
    {error && <p role="alert" className="text-sm text-proof-red">{error}</p>}
    {editing && <form key={editing === "new" ? "new" : editing.id} className="proof-panel space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); const fields=new FormData(e.currentTarget); void run(async () => saveTask(editing === "new" ? null : editing.id, {...form,due_at:localDateTimeToUtc(String(fields.get("due_at")),timeZone),scheduled_start:localDateTimeToUtc(String(fields.get("scheduled_start")),timeZone),scheduled_end:localDateTimeToUtc(String(fields.get("scheduled_end")),timeZone)})); }}>
      <h2 className="text-lg font-bold">{editing === "new" ? "New task" : "Edit task"}</h2>
      <label className="proof-field">Title<input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="proof-field">Description<textarea maxLength={10000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-3">{(["due_at", "scheduled_start", "scheduled_end"] as const).map((field, index) => <label key={field} className="proof-field">{["Due date and time", "Schedule start", "Schedule end"][index]}<input type="datetime-local" name={field} defaultValue={form[field] ? localDateTime(form[field], timeZone) : ""} /></label>)}</div>
      <label className="proof-field">Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task["priority"] })}>{["low", "normal", "high"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="proof-field">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Task["status"] })}>{["pending", "completed", "cancelled"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button disabled={busy} className="proof-action">Save task</button><button type="button" className="proof-action" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {!ready && !error && <p role="status">Loading tasks…</p>}
    {taskBuckets.map((bucket) => <section key={bucket} className="space-y-3"><h2 className="text-sm font-bold uppercase tracking-wide text-white/60">{bucket}</h2>
      {tasks.filter((task) => taskBucket(task, today, timeZone) === bucket).map((task) => <article key={task.id} className="proof-panel space-y-3 p-4">
        <h3 className="break-words text-base font-bold">{task.title}</h3>{task.description && <p className="whitespace-pre-wrap break-words text-sm text-white/60">{task.description}</p>}
        <p className="text-sm text-white/50">{task.priority} priority{task.due_at && ` · Due ${localDateTime(task.due_at, timeZone).replace("T", " ")}`}</p>
        {task.scheduled_start && <p className="text-sm text-white/50">Scheduled {localDateTime(task.scheduled_start, timeZone).replace("T", " ")}</p>}
        <div className="flex flex-wrap gap-2"><button disabled={busy} className="proof-action" onClick={() => void run(() => saveTask(task.id, { ...task, status: task.status === "completed" ? "pending" : "completed" }))}>{task.status === "completed" ? "Reopen" : "Complete"}</button><button className="proof-action" onClick={() => edit(task)}>Edit</button><button disabled={busy} className="proof-action" onClick={() => { if (confirm(`Delete “${task.title}”?`)) void run(() => deleteTask(task.id)); }}>Delete</button></div>
        {task.status === "completed" && <ProofPanel target={{taskId:task.id}}/>}
      </article>)}
      {ready && !tasks.some((task) => taskBucket(task, today, timeZone) === bucket) && <p className="text-sm text-white/35">No tasks.</p>}
    </section>)}
  </div>;
}

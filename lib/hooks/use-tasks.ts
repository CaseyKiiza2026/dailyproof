"use client";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Task, TaskInput } from "@/lib/tasks";
import { getTasks, saveTask, deleteTask } from "@/lib/actions/tasks";
import { isAuthorizationError } from "@/lib/read-errors";

function useTaskState(enabled: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useRef({
    generation: 0,
    live: false,
    writing: false,
    pending: null as Promise<void> | null,
  });
  const refresh = useCallback(() => {
    const s = state.current;
    if (!s.live || s.writing) return Promise.resolve();
    if (s.pending) return s.pending;
    const generation = ++s.generation;
    const pending = getTasks()
      .then((rows) => {
        if (s.live && generation === s.generation) {
          setTasks(rows);
          setReady(true);
          setError("");
        }
      })
      .catch((cause) => {
        if (!s.live || generation !== s.generation) return;
        if (
          isAuthorizationError(cause) ||
          isAuthorizationError(cause?.cause) ||
          cause?.message === "Please sign in."
        ) {
          setTasks([]);
          setReady(false);
        }
        setError("Unable to load tasks. Please try again.");
      })
      .finally(() => {
        if (s.pending === pending) s.pending = null;
      });
    s.pending = pending;
    return pending;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const s = state.current;
    s.live = true;
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    const timer = setInterval(onFocus, 60000);
    return () => {
      s.live = false;
      s.generation++;
      s.pending = null;
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [enabled, refresh]);
  async function write(action: () => Promise<Task | string>) {
    const s = state.current;
    if (s.writing) throw new Error("A task update is already in progress.");
    s.writing = true;
    s.generation++;
    s.pending = null;
    setBusy(true);
    setError("");
    setMutationError("");
    try {
      const result = await action();
      if (s.live)
        setTasks((rows) =>
          typeof result === "string"
            ? rows.filter((row) => row.id !== result)
            : rows.some((row) => row.id === result.id)
              ? rows.map((row) => (row.id === result.id ? result : row))
              : [result, ...rows],
        );
    } catch (cause) {
      if (s.live)
        setMutationError(
          cause instanceof Error ? cause.message : "Unable to update task.",
        );
      throw cause;
    } finally {
      s.writing = false;
      if (s.live) {
        setBusy(false);
        void refresh();
      }
    }
  }
  const save = (id: string | null, input: TaskInput) =>
    write(() => saveTask(id, input));
  const remove = (id: string) =>
    write(async () => {
      await deleteTask(id);
      return id;
    });
  async function complete(task: Task) {
    try {
      await save(task.id, {
        ...task,
        status: task.status === "completed" ? "pending" : "completed",
      });
    } catch {
      /* The shared error is rendered by consumers. */
    }
  }
  return {
    tasks,
    ready,
    error: mutationError || error,
    busy,
    refresh,
    save,
    remove,
    complete,
  };
}
const TasksContext = createContext<ReturnType<typeof useTaskState> | null>(
  null,
);
// The existing authenticated shell is unmounted on session changes. This keeps
// navigation reuse in memory without retaining another account's task data.
export function TasksProvider({ children }: { children: ReactNode }) {
  const value = useTaskState(true);
  return createElement(TasksContext.Provider, { value }, children);
}
export function useTasks() {
  const shared = useContext(TasksContext);
  const local = useTaskState(!shared);
  return shared ?? local;
}

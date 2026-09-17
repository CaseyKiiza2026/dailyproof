"use client";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { getCalendar } from "@/lib/actions/calendar";
import { CalendarData } from "@/lib/calendar";
import { useRemoteData } from "@/lib/hooks/use-remote-data";

function useCalendarState() {
  const pending = useRef<Promise<CalendarData> | null>(null);
  const read = useCallback(() => {
    if (pending.current) return pending.current;
    const request = getCalendar().finally(() => {
      if (pending.current === request) pending.current = null;
    });
    pending.current = request;
    return request;
  }, []);
  const remote = useRemoteData(read, "Unable to load calendar.");
  const mutate = async (write: () => Promise<unknown>) =>
    remote.mutate(async () => {
      // An old read must not be reused for the post-write refresh.
      pending.current = null;
      await write();
    });
  return { ...remote, mutate };
}
const CalendarContext = createContext<ReturnType<
  typeof useCalendarState
> | null>(null);
// Mounted inside the shell's user-keyed boundary; nothing persists to disk or
// across accounts. Route remounts receive the known snapshot synchronously.
export function CalendarProvider({ children }: { children: ReactNode }) {
  const value = useCalendarState();
  return createElement(CalendarContext.Provider, { value }, children);
}
export function useCalendarData() {
  const shared = useContext(CalendarContext);
  const local = useCalendarState();
  return shared ?? local;
}

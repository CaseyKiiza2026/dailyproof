"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Component/session scoped. A write invalidates earlier reads; polling cannot
// start another read while that write is in flight. Null means not yet known.
export function useRemoteData<T>(read: () => Promise<T>, message: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef({ value: 0 });
  const writing = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const counter = generation.current;
    return () => {
      live.current = false;
      counter.value++;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const request = ++generation.current.value;
    try {
      const value = await read();
      if (live.current && request === generation.current.value) {
        setData(value);
        setError(null);
      }
    } catch {
      if (live.current && request === generation.current.value)
        setError(message);
    }
  }, [read, message]);
  const mutate = useCallback(
    async (write: () => Promise<unknown>) => {
      if (writing.current) return false;
      writing.current = true;
      generation.current.value++;
      try {
        await write();
      } finally {
        writing.current = false;
      }
      if (live.current) await refresh();
      return true;
    },
    [refresh],
  );
  return { data, error, refresh, mutate };
}

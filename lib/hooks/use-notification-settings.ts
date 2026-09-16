"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotificationSettings,
  saveNotificationSettings,
} from "@/lib/actions/reminders";
import { enableBrowserPush } from "@/lib/push-browser";
import { NotificationSettings } from "@/lib/notifications";

export function useNotificationSettings() {
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const generation = useRef({ value: 0 });
  const writing = useRef(false);
  const load = useCallback(() => {
    if (writing.current) return;
    const request = ++generation.current.value;
    return getNotificationSettings().then(value => {
      if (live.current && request === generation.current.value) {
        setSaved(value);
        setDraft(value);
        setError(null);
      }
    }).catch(() => {
      if (live.current && request === generation.current.value)
        setError("Unable to load notification settings.");
    });
  }, []);
  useEffect(() => {
    live.current = true;
    const counter = generation.current;
    void load();
    return () => {
      live.current = false;
      counter.value++;
    };
  }, [load]);

  async function save(push = false) {
    if (!saved || !draft || writing.current) return;
    writing.current = true;
    generation.current.value++;
    setBusy(true);
    setError(null);
    // Enabling this device must not implicitly save other unsaved form edits.
    const value = push ? { ...saved, enabled: true } : { ...draft };
    try {
      if (push) await enableBrowserPush();
      await saveNotificationSettings(value);
      if (live.current) {
        setSaved(value);
        setDraft((current) =>
          push && current ? { ...current, enabled: true } : value,
        );
      }
    } catch {
      if (live.current)
        setError("Unable to save notification settings. Please try again.");
    } finally {
      writing.current = false;
      if (live.current) setBusy(false);
    }
  }
  function edit(value: NotificationSettings) {
    if (saved && !writing.current) setDraft(value);
  }
  return { draft, error, busy, load, save, edit };
}

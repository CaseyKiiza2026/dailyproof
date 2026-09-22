"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(callback: () => void) {
  window.addEventListener("dailyproof-theme", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("dailyproof-theme", callback);
    window.removeEventListener("storage", callback);
  };
}
function readTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");
  return <button type="button" className="proof-action" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("dailyproof.theme", next); } catch { /* The current session can still change appearance. */ }
    window.dispatchEvent(new Event("dailyproof-theme"));
  }}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}<span>Appearance</span></button>;
}

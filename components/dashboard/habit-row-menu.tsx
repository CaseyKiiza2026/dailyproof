"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

interface HabitRowMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

export function HabitRowMenu({ onEdit, onDelete }: HabitRowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`relative shrink-0 transition ${open ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"}`}
    >
      <button
        type="button"
        aria-label="Habit options"
        onClick={() => setOpen((value) => !value)}
        className="proof-pill proof-focus grid h-11 w-11 place-items-center text-white/50 hover:text-white/85 sm:h-6 sm:w-6"
      >
        <MoreVertical size={18} className="sm:h-[13px] sm:w-[13px]" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-40 overflow-hidden rounded-xl border border-white/[0.09] bg-proof-panel2 shadow-proof-card sm:bottom-auto sm:left-0 sm:right-auto sm:top-7 sm:mb-0 sm:w-32">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-white/75 hover:bg-white/[0.06] sm:min-h-0 sm:text-xs"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-proof-red hover:bg-proof-red/10 sm:min-h-0 sm:text-xs"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

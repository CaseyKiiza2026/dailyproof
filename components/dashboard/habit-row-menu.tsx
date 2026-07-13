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
      className={`relative shrink-0 transition ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
    >
      <button
        type="button"
        aria-label="Habit options"
        onClick={() => setOpen((value) => !value)}
        className="proof-pill proof-focus grid h-6 w-6 place-items-center text-white/50 hover:text-white/85"
      >
        <MoreVertical size={13} />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-20 w-32 overflow-hidden rounded-xl border border-white/[0.09] bg-[#0d110f] shadow-proof-card">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-white/75 hover:bg-white/[0.06]"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-proof-red hover:bg-proof-red/10"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

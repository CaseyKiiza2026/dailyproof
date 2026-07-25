"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, UserX } from "lucide-react";

interface FriendRowMenuProps {
  onRemove: () => void;
  label?: string;
}

export function FriendRowMenu({ onRemove, label = "Unfriend" }: FriendRowMenuProps) {
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
        aria-label="Friend options"
        onClick={() => setOpen((value) => !value)}
        className="proof-pill proof-focus grid h-7 w-7 place-items-center text-white/50 hover:text-white/85"
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-xl border border-white/[0.09] bg-[#0d110f] shadow-proof-card">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-proof-red hover:bg-proof-red/10"
          >
            <UserX size={12} /> {label}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="proof-panel w-full max-w-sm bg-[#0a0d0b] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white/90">{title}</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="proof-pill proof-focus h-8 w-8 text-white/50 hover:text-white/80"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

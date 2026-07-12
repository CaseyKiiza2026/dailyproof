import { ShieldCheck } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-proof-green/30 bg-proof-green/10 text-proof-green shadow-[0_0_26px_rgba(37,216,111,.12)]">
        <ShieldCheck size={21} strokeWidth={2.4} />
      </span>
      {!compact && <span className="text-[21px] font-extrabold tracking-[-0.04em]">DailyProof</span>}
    </div>
  );
}

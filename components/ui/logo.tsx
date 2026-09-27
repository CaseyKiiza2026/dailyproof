import { ProgressShield } from "@/components/ui/progress-shield";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="proof-brand flex items-center gap-2.5">
      <ProgressShield completion={100} className="brand-shield" />
      {!compact && <span className="text-[21px] font-extrabold tracking-[-0.04em]">Daily<span className="text-proof-green">Proof</span></span>}
    </div>
  );
}

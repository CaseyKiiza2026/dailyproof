import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: LucideIcon;
  tone?: "green" | "red" | "amber" | "neutral";
}

const toneMap = {
  green: "border-proof-green/25 bg-proof-green/[0.035] text-proof-green",
  red: "border-proof-red/25 bg-proof-red/[0.025] text-proof-red",
  amber: "border-proof-amber/25 bg-proof-amber/[0.025] text-proof-amber",
  neutral: "border-white/[0.08] bg-white/[0.025] text-white/70"
};

export function StatCard({ label, value, suffix, icon: Icon, tone = "neutral" }: StatCardProps) {
  return (
    <article className={`relative min-h-[116px] overflow-hidden rounded-[22px] border p-4 shadow-proof-card ${toneMap[tone]}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.025] to-transparent" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-white/40">{label}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-black leading-none tracking-[-0.05em] text-white">{value}</span>
            {suffix && <span className="text-xs text-white/35">{suffix}</span>}
          </div>
          <Icon size={25} strokeWidth={1.8} />
        </div>
      </div>
    </article>
  );
}

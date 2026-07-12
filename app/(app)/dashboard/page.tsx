import { CalendarDays, CheckCircle2, ChevronDown, Flame, Trophy, XCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { StatCard } from "@/components/ui/stat-card";
import { HabitGrid } from "@/components/dashboard/habit-grid";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <div className="proof-pill border-proof-green/25 bg-proof-green/[0.05] px-4 py-2 text-xs font-bold text-proof-green"><Trophy size={14} className="mr-2" />Winning the month</div>
      </header>

      <div className="flex items-center gap-2">
        <button className="proof-pill h-11 min-w-[150px] justify-between px-4 text-sm font-bold">July 2026 <ChevronDown size={15} className="text-white/35" /></button>
        <button className="proof-pill h-11 w-11"><CalendarDays size={17} /></button>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Completion" value="78%" icon={CheckCircle2} tone="green" />
        <StatCard label="Current streak" value="21" suffix="days" icon={Flame} tone="green" />
        <StatCard label="Best streak" value="32" suffix="days" icon={Trophy} tone="amber" />
        <StatCard label="Missed" value="6" suffix="days" icon={XCircle} tone="red" />
        <StatCard label="Completed" value="149" suffix="days" icon={CheckCircle2} tone="green" />
      </section>

      <HabitGrid />
    </div>
  );
}

import { cn } from '@/lib/utils';

interface RiskGaugeProps {
  score: number;
  label: string;
  className?: string;
}

function textColor(level: string): string {
  const u = level.toUpperCase();
  if (u === 'LOW') return 'text-emerald-400';
  if (u === 'MEDIUM') return 'text-amber-400';
  if (u === 'HIGH') return 'text-orange-400';
  if (u === 'CRITICAL') return 'text-red-400';
  return 'text-slate-300';
}

function barColor(level: string): string {
  const u = level.toUpperCase();
  if (u === 'LOW') return 'bg-emerald-500';
  if (u === 'MEDIUM') return 'bg-amber-500';
  if (u === 'HIGH') return 'bg-orange-500';
  if (u === 'CRITICAL') return 'bg-red-500';
  return 'bg-slate-500';
}

/** Week 4: visual risk score (0–100) with level label. */
export function RiskGauge({ score, label, className }: RiskGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-6',
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Sprint risk
      </p>
      <div className="flex flex-col items-center gap-2">
        <p className={cn('text-4xl font-bold tabular-nums', textColor(label))}>
          {clamped}
        </p>
        <p className={cn('text-sm font-semibold uppercase', textColor(label))}>
          {label}
        </p>
        <div className="mt-2 h-3 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn('h-full rounded-full transition-all', barColor(label))}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AiJobStatus, ApiSuccess } from '@/types/api';
import { RiskGauge } from './RiskGauge';

interface RiskJobResult {
  riskScore: number;
  riskLevel: string;
  factors: string[];
  recommendations: string[];
}

interface BlockerRow {
  ticketId: string;
  ticketKey: string;
  isBlocked: boolean;
  blockedReason: string;
  blockedDurationDays: number;
  suggestedActions: string[];
}

interface SprintSummaryResult {
  overview: string;
  achievements: string[];
  challenges: string[];
  retrospectiveQuestions: string[];
  metrics: {
    velocityTarget: number;
    actualVelocity: number;
    completionRate: number;
  };
}

interface SprintIntelligencePanelProps {
  projectId: string;
  sprintId: string;
  sprintName: string;
  sprintStatus: 'PLANNING' | 'ACTIVE' | 'DONE';
  /** Last persisted risk score from API sprint (optional). */
  persistedRiskScore?: number;
}

type JobKind = 'risk' | 'blockers' | 'summary' | null;

export function SprintIntelligencePanel({
  projectId,
  sprintId,
  sprintName,
  sprintStatus,
  persistedRiskScore,
}: SprintIntelligencePanelProps) {
  const queryClient = useQueryClient();
  const [pollId, setPollId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<JobKind>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['ai-job', pollId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AiJobStatus>>(
        `/ai/jobs/${pollId}`,
      );
      return res.data.data;
    },
    enabled: !!pollId,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (!st || st === 'completed' || st === 'failed') return false;
      return 1500;
    },
  });

  useEffect(() => {
    const st = jobQuery.data?.status;
    if (st === 'completed' || st === 'failed') {
      void queryClient.invalidateQueries({ queryKey: ['sprint', projectId, sprintId] });
    }
  }, [jobQuery.data?.status, queryClient, projectId, sprintId]);

  const enqueue = useMutation({
    mutationFn: async (path: string) => {
      const res = await api.post<ApiSuccess<{ jobId: string | number }>>(path, {
        sprintId,
      });
      return res.data.data.jobId;
    },
    onMutate: () => setLocalError(null),
    onSuccess: (jobId) => {
      setPollId(String(jobId));
    },
    onError: (e) => setLocalError(getErrorMessage(e)),
  });

  const busy = enqueue.isPending || (jobQuery.isFetching && pollId !== null);
  const job = jobQuery.data;
  const done = job?.status === 'completed';
  const failed = job?.status === 'failed';

  let riskResult: RiskJobResult | null = null;
  let blockerResult: BlockerRow[] | null = null;
  let summaryResult: SprintSummaryResult | null = null;

  if (done && job?.result !== undefined && job.result !== null) {
    if (jobKind === 'risk') {
      const r = job.result as RiskJobResult;
      if (typeof r?.riskScore === 'number') riskResult = r;
    } else if (jobKind === 'blockers') {
      if (Array.isArray(job.result)) blockerResult = job.result as BlockerRow[];
    } else if (jobKind === 'summary') {
      summaryResult = job.result as SprintSummaryResult;
    }
  }

  return (
    <section
      className={cn(
        'rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/40 to-slate-950 p-6',
        'shadow-lg shadow-violet-950/30',
      )}
    >
      <div className="mb-6 flex flex-col gap-1 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-violet-200">
            AI sprint intelligence
          </h2>
          <p className="text-sm text-slate-400">
            Risk scoring, blocker detection, and retrospective summaries for{' '}
            <span className="font-medium text-slate-300">{sprintName}</span>
          </p>
        </div>
        {persistedRiskScore !== undefined && (
          <p className="text-xs text-slate-500">
            Stored risk score:{' '}
            <span className="font-mono text-slate-300">{persistedRiskScore}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setJobKind('risk');
              enqueue.mutate('/ai/score-sprint-risk');
            }}
            className={cn(
              'rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white',
              'hover:bg-violet-500 disabled:opacity-50',
            )}
          >
            {busy && jobKind === 'risk' ? 'Analyzing…' : 'Analyze sprint risk'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setJobKind('blockers');
              enqueue.mutate('/ai/detect-blockers');
            }}
            className={cn(
              'rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100',
              'hover:bg-slate-700 disabled:opacity-50',
            )}
          >
            {busy && jobKind === 'blockers' ? 'Running…' : 'Detect blockers'}
          </button>
          <button
            type="button"
            disabled={busy || sprintStatus !== 'DONE'}
            title={
              sprintStatus !== 'DONE'
                ? 'Complete the sprint first to generate a summary'
                : undefined
            }
            onClick={() => {
              setJobKind('summary');
              enqueue.mutate('/ai/generate-sprint-summary');
            }}
            className={cn(
              'rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100',
              'hover:bg-slate-700 disabled:opacity-50',
            )}
          >
            {busy && jobKind === 'summary' ? 'Generating…' : 'Generate summary'}
          </button>
        </div>

        {pollId && (
          <div className="text-right text-xs text-slate-500">
            Job <span className="font-mono text-slate-400">{pollId}</span>
            {job && (
              <span className="ml-2 text-slate-400">· {job.status}</span>
            )}
          </div>
        )}
      </div>

      {localError && (
        <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {localError}
        </p>
      )}

      {failed && job?.error && (
        <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {job.error}
        </p>
      )}

      {done && jobKind === 'risk' && riskResult && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,220px)_1fr]">
          <RiskGauge
            score={riskResult.riskScore}
            label={riskResult.riskLevel}
          />
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Risk factors
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                {riskResult.factors.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recommendations
              </h3>
              <ul className="list-inside list-decimal space-y-1 text-sm text-violet-200/90">
                {riskResult.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {done && jobKind === 'blockers' && blockerResult && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Blocker analysis
          </h3>
          {blockerResult.length === 0 ? (
            <p className="text-sm text-slate-500">
              No stale tickets matched the 3-day inactivity window.
            </p>
          ) : (
            <ul className="space-y-3">
              {blockerResult.map((b) => (
                <li
                  key={b.ticketId}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-left text-sm"
                >
                  <div className="font-medium text-slate-200">
                    {b.ticketKey}{' '}
                    <span className="text-slate-500">
                      · {b.blockedDurationDays}d inactive
                    </span>
                  </div>
                  <p className="mt-1 text-slate-400">{b.blockedReason}</p>
                  {b.suggestedActions.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-slate-500">
                      {b.suggestedActions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {done && jobKind === 'summary' && summaryResult && (
        <div className="mt-8 space-y-6 text-left">
          <p className="text-sm leading-relaxed text-slate-300">
            {summaryResult.overview}
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Achievements
              </h3>
              <ul className="list-inside list-disc text-sm text-slate-300">
                {summaryResult.achievements.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Challenges
              </h3>
              <ul className="list-inside list-disc text-sm text-slate-300">
                {summaryResult.challenges.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Metrics: </span>
            target {summaryResult.metrics.velocityTarget} pts · actual{' '}
            {summaryResult.metrics.actualVelocity} pts ·{' '}
            {summaryResult.metrics.completionRate.toFixed(0)}% completion
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
              Retrospective prompts
            </h3>
            <ul className="space-y-1 text-sm text-violet-200/80">
              {summaryResult.retrospectiveQuestions.map((q) => (
                <li key={q}>• {q}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

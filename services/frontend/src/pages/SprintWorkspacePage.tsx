import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import type { ApiSuccess, SprintDetail } from '@/types/api';
import { SprintIntelligencePanel } from '@/components/ai/SprintIntelligencePanel';

export function SprintWorkspacePage() {
  const { projectId, sprintId } = useParams<{
    projectId: string;
    sprintId: string;
  }>();

  const sprintQ = useQuery({
    queryKey: ['sprint', projectId, sprintId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<SprintDetail>>(
        `/projects/${projectId}/sprints/${sprintId}`,
      );
      return res.data.data;
    },
    enabled: !!projectId && !!sprintId,
  });

  if (!projectId || !sprintId) return null;

  if (sprintQ.isLoading) {
    return <p className="text-slate-500">Loading sprint…</p>;
  }
  if (sprintQ.isError) {
    return <p className="text-red-400">{getErrorMessage(sprintQ.error)}</p>;
  }

  const sprint = sprintQ.data;
  if (!sprint) {
    return null;
  }

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-500">
        <Link to="/" className="hover:text-violet-400">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <Link
          to={`/projects/${projectId}`}
          className="hover:text-violet-400"
        >
          Project
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-400">{sprint.name}</span>
      </nav>

      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-left">
        <h1 className="text-2xl font-semibold text-slate-100">{sprint.name}</h1>
        <p className="mt-6 text-sm text-slate-500">
          {new Date(sprint.startDate).toLocaleDateString()} –{' '}
          {new Date(sprint.endDate).toLocaleDateString()}
        </p>
        {sprint.goal && (
          <p className="mt-2 text-sm text-slate-400">{sprint.goal}</p>
        )}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-200">{sprint.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Capacity</dt>
            <dd className="font-medium text-slate-200">
              {sprint.capacityPoints} pts
            </dd>
          </div>
        </dl>
      </div>

      <SprintIntelligencePanel
        projectId={projectId}
        sprintId={sprintId}
        sprintName={sprint.name}
        sprintStatus={sprint.status}
        persistedRiskScore={sprint.riskScore}
      />
    </div>
  );
}

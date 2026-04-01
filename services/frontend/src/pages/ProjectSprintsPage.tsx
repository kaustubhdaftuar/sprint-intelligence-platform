import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import type { ApiSuccess, ProjectSummary, SprintListData } from '@/types/api';

export function ProjectSprintsPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const projectQ = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ProjectSummary>>(
        `/projects/${projectId}`,
      );
      return res.data.data;
    },
    enabled: !!projectId,
  });

  const sprintsQ = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<SprintListData>>(
        `/projects/${projectId}/sprints`,
        { params: { page: 1, limit: 50 } },
      );
      return res.data.data;
    },
    enabled: !!projectId,
  });

  if (!projectId) return null;

  if (projectQ.isLoading || sprintsQ.isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (projectQ.isError) {
    return <p className="text-red-400">{getErrorMessage(projectQ.error)}</p>;
  }
  if (sprintsQ.isError) {
    return <p className="text-red-400">{getErrorMessage(sprintsQ.error)}</p>;
  }

  const project = projectQ.data;
  const sprintsData = sprintsQ.data;
  if (!project || !sprintsData) {
    return null;
  }

  const { sprints } = sprintsData;

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-500">
        <Link to="/" className="hover:text-violet-400">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-500">{project.name}</span>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-slate-100">
        {project.name}
      </h1>
      <p className="mb-8 text-slate-500">
        Open a sprint to run AI risk analysis and related jobs.
      </p>
      <ul className="space-y-3">
        {sprints.map((s) => (
          <li key={s.id}>
            <Link
              to={`/projects/${projectId}/sprints/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-left transition hover:border-violet-500/40 hover:bg-slate-900"
            >
              <div>
                <span className="font-medium text-slate-100">{s.name}</span>
                <span
                  className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${
                    s.status === 'ACTIVE'
                      ? 'bg-emerald-950 text-emerald-400'
                      : s.status === 'DONE'
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-amber-950 text-amber-400'
                  }`}
                >
                  {s.status}
                </span>
              </div>
              {typeof s.riskScore === 'number' && (
                <span className="font-mono text-slate-500">
                  Risk {s.riskScore}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {sprints.length === 0 && (
        <p className="text-slate-500">No sprints in this project yet.</p>
      )}
    </div>
  );
}

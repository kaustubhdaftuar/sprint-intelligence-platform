import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import type { ApiSuccess, ProjectListData } from '@/types/api';

export function ProjectsPage() {
  const q = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ProjectListData>>('/projects', {
        params: { page: 1, limit: 50 },
      });
      return res.data.data;
    },
  });

  if (q.isLoading) {
    return <p className="text-slate-500">Loading projects…</p>;
  }
  if (q.isError) {
    return (
      <p className="text-red-400">{getErrorMessage(q.error)}</p>
    );
  }

  if (!q.data) {
    return null;
  }

  const { projects } = q.data;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-100">Projects</h1>
      <p className="mb-8 text-slate-500">
        Open a project to view sprints and AI sprint intelligence.
      </p>
      <ul className="space-y-3">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-left transition hover:border-violet-500/40 hover:bg-slate-900"
            >
              <span className="font-medium text-slate-100">{p.name}</span>
              {p.description && (
                <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {projects.length === 0 && (
        <p className="text-slate-500">
          No projects yet. Create one via the API or ask an admin to add you.
        </p>
      )}
    </div>
  );
}

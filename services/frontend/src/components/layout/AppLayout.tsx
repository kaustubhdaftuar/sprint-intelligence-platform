import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const clear = useAuthStore((s) => s.clear);

  return (
    <div className="flex min-h-svh flex-col bg-slate-950 text-slate-100">
      <header
        className={cn(
          'flex items-center justify-between border-b border-slate-800',
          'bg-slate-900/80 px-4 py-3 backdrop-blur',
        )}
      >
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight text-violet-300"
          >
            Sprint Intelligence
          </Link>
          <nav className="flex gap-4 text-sm text-slate-400">
            <Link to="/" className="hover:text-slate-200">
              Projects
            </Link>
          </nav>
        </div>
        <button
          type="button"
          onClick={() => clear()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Sign out
        </button>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

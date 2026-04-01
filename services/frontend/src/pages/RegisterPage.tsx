import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { ApiSuccess, LoginResponseData } from '@/types/api';
import { cn } from '@/lib/utils';

export function RegisterPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'developer' | 'manager' | 'admin'>(
    'developer',
  );

  const register = useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiSuccess<LoginResponseData>>(
        '/auth/register',
        {
          name,
          email,
          password,
          role,
        },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      void navigate('/', { replace: true });
    },
  });

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-semibold text-slate-100">
          Create account
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          Join a sprint workspace
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Name
            </label>
            <input
              id="name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Password (min 8)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label
              htmlFor="role"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as 'developer' | 'manager' | 'admin')
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-violet-500"
            >
              <option value="developer">Developer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {register.isError && (
            <p className="text-sm text-red-400">
              {getErrorMessage(register.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={register.isPending}
            className={cn(
              'w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white',
              'hover:bg-violet-500 disabled:opacity-50',
            )}
          >
            {register.isPending ? 'Creating…' : 'Register'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-violet-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

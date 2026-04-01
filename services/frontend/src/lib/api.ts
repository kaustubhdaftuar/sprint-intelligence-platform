import axios, { type AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';

/**
 * Browser calls use Vite dev proxy: `/api` → API :4000 (see vite.config.ts).
 */
export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; error?: { message?: string } }>) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(err);
  },
);

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data;
    if (typeof d === 'object' && d !== null) {
      if ('message' in d && typeof d.message === 'string') return d.message;
      if (
        'error' in d &&
        typeof d.error === 'object' &&
        d.error !== null &&
        'message' in d.error &&
        typeof (d.error as { message?: string }).message === 'string'
      ) {
        return (d.error as { message: string }).message;
      }
    }
    return err.message || 'Request failed';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

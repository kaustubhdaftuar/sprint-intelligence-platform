import { z } from 'zod';

/**
 * All environment variables are validated here at process startup.
 * If any required variable is missing or malformed, the process exits
 * immediately with a descriptive error — never silently at runtime.
 *
 * Pattern: import { env } from '@/utils/env'
 * env.PORT is typed as number, env.NODE_ENV is a union literal, etc.
 * No raw process.env access anywhere else in the codebase.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .startsWith('mongodb', 'MONGODB_URI must be a valid MongoDB connection string'),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .startsWith('redis', 'REDIS_URL must be a valid Redis connection string'),

  // JWT — access token is short-lived, refresh token is long-lived
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // Correlation ID header name (used by request logging middleware)
  CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),

  // API prefix
  API_PREFIX: z.string().default('/api/v1'),

  // Rate limiting (requests per window per IP)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

// Infer the TypeScript type from the schema — single source of truth
export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Log human-readable field errors before exiting
  const formatted = parsed.error.issues
    .map((issue: { path: any[]; message: any; }) => `  [${issue.path.join('.')}] ${issue.message}`)
    .join('\n');

  // Use console.error here intentionally — logger depends on env, so it
  // doesn't exist yet at this point in the startup sequence.
  console.error('❌ Environment validation failed. Fix the following:\n');
  console.error(formatted);
  console.error('\nExiting.');
  process.exit(1);
}

export const env: Env = parsed.data;
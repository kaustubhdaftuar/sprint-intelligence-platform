import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .startsWith('mongodb', 'MONGODB_URI must be a valid MongoDB connection string'),
  
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .startsWith('redis', 'REDIS_URL must be a valid Redis connection string'),
  
  // AI Provider API Keys
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  ANTHROPIC_API_KEY: z.string().optional(), // Optional - fallback
  GROQ_API_KEY: z.string().optional(),      // Optional - fallback
  
  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  
  // Queue configuration
  QUEUE_NAME: z.string().default('ai-jobs'),
  CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  [${issue.path.join('.')}] ${issue.message}`)
    .join('\n');
  
  console.error('❌ Environment validation failed. Fix the following:\n');
  console.error(formatted);
  console.error('\nExiting.');
  process.exit(1);
}

export const env: Env = parsed.data;
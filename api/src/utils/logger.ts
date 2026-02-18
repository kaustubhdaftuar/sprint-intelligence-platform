import pino from 'pino';
import { env } from '@/utils/env';

/**
 * Structured logger using Pino.
 *
 * Why Pino over Winston:
 * - 5x faster than Winston in benchmarks
 * - JSON-first — all logs are structured by default, no template strings
 * - Smaller bundle size
 * - Better TypeScript support
 *
 * Log format:
 * - Development: pretty-printed with pino-pretty for readability
 * - Production: single-line JSON for log aggregators (Datadog, Elasticsearch)
 *
 * Usage:
 *   logger.info({ userId, action }, 'User logged in')
 *   logger.error({ err, correlationId }, 'Request failed')
 *
 * The first argument is always an object (structured fields).
 * The second argument is always a string (human-readable message).
 * Never use template strings in the message — they can't be queried.
 */

const logger = pino({
  level: env.LOG_LEVEL,
  
  // Base fields included in every log line
  base: {
    service: 'api-service',
    env: env.NODE_ENV,
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty print in development for human readability
  // In production, output raw JSON for log aggregators
  transport: env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,

  // Serialize errors properly (include stack trace in `err` field)
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Redact sensitive fields from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
// Stream for morgan HTTP logging
export const httpLogStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};


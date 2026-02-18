"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogStream = void 0;
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../utils/env");
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
const logger = (0, pino_1.default)({
    level: env_1.env.LOG_LEVEL,
    // Base fields included in every log line
    base: {
        service: 'api-service',
        env: env_1.env.NODE_ENV,
    },
    // Timestamp format
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    // Pretty print in development for human readability
    // In production, output raw JSON for log aggregators
    transport: env_1.env.NODE_ENV === 'development'
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
        err: pino_1.default.stdSerializers.err,
        req: pino_1.default.stdSerializers.req,
        res: pino_1.default.stdSerializers.res,
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
exports.default = logger;
// Stream for morgan HTTP logging
exports.httpLogStream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

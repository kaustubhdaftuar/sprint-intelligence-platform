"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = require("crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const ai_routes_1 = __importDefault(require("./routes/ai.routes"));
const env_1 = require("./utils/env");
const logger_1 = __importDefault(require("./utils/logger"));
const errorHandler_1 = require("./middleware/errorHandler");
// Routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const sprint_routes_1 = __importDefault(require("./routes/sprint.routes"));
const ticket_routes_1 = __importDefault(require("./routes/ticket.routes"));
/**
 * createApp() — pure Express application factory.
 *
 * No database connection, no port binding, no process.on() handlers here.
 * This function can be imported and called in tests without any side effects.
 *
 * All environment-dependent config is read from the validated `env` object.
 * No raw process.env access anywhere in this file.
 *
 * @param redisClient — passed in so /ready can check Redis state.
 *   Using dependency injection here rather than importing a global redis
 *   client keeps app.ts testable and avoids circular imports.
 */
function createApp(redisClient) {
    const app = (0, express_1.default)();
    // ─── Trust proxy ────────────────────────────────────────────────────────────
    // Required when running behind nginx ingress in Kubernetes.
    // Without this, req.ip returns the proxy IP, breaking rate limiting.
    app.set('trust proxy', 1);
    // ─── Security ───────────────────────────────────────────────────────────────
    app.use((0, helmet_1.default)());
    // ─── CORS ───────────────────────────────────────────────────────────────────
    app.use((0, cors_1.default)({
        origin: env_1.env.NODE_ENV === 'production'
            ? env_1.env.CORS_ORIGIN
            : true, // Allow all origins in dev
        credentials: true,
    }));
    // ─── Compression ────────────────────────────────────────────────────────────
    app.use((0, compression_1.default)());
    // ─── Body parsing ───────────────────────────────────────────────────────────
    // 1mb is sufficient for a JSON API — ticket descriptions are not 10MB.
    // Raising this limit increases surface area for DoS attacks.
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
    // ─── Rate limiting ──────────────────────────────────────────────────────────
    // Applied to /api/ prefix only — health and metrics endpoints are exempt.
    const limiter = (0, express_rate_limit_1.default)({
        windowMs: env_1.env.RATE_LIMIT_WINDOW_MS,
        max: env_1.env.RATE_LIMIT_MAX_REQUESTS,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMITED',
                    message: 'Too many requests — please slow down',
                },
            });
        },
    });
    app.use(`${env_1.env.API_PREFIX}/`, limiter);
    // ─── Correlation ID ─────────────────────────────────────────────────────────
    // Attach a unique ID to every request. Included in all log lines so a
    // single request can be traced across the full log stream in production.
    // Reads from the incoming header if present (e.g. set by the API gateway),
    // otherwise generates a new UUID.
    app.use((req, res, next) => {
        const correlationId = req.headers[env_1.env.CORRELATION_ID_HEADER] ??
            (0, crypto_1.randomUUID)();
        req.correlationId = correlationId;
        res.setHeader(env_1.env.CORRELATION_ID_HEADER, correlationId);
        next();
    });
    // ─── Structured request logging ──────────────────────────────────────────────
    // Fields are top-level in the log object — queryable in any log aggregator.
    // Template strings like `${method} ${path}` are NOT used — they can't be
    // filtered or aggregated by field.
    app.use((req, _res, next) => {
        logger_1.default.info({
            correlationId: req.correlationId,
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('user-agent'),
        }, 'incoming request');
        next();
    });
    // ─── Health & observability endpoints ───────────────────────────────────────
    // These are outside the API prefix and NOT rate limited.
    // Kubernetes liveness probe hits /health — must always be fast.
    // Kubernetes readiness probe hits /ready — checks dependencies.
    /**
     * Liveness probe — is the process alive?
     * Should NEVER check DB or Redis — if those are down, the pod is still
     * alive and Kubernetes should not restart it (restart won't fix the DB).
     * Only return non-200 if the process itself is in a broken state.
     */
    app.get('/health', (_req, res) => {
        res.status(200).json({
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    });
    /**
     * Readiness probe — is the pod ready to receive traffic?
     * Checks both MongoDB and Redis. If either is unavailable, return 503.
     * Kubernetes will stop routing traffic to this pod until it recovers.
     *
     * Structured response: per-dependency status so ops can see which
     * dependency is unhealthy without reading logs.
     */
    app.get('/ready', async (_req, res) => {
        const checks = {};
        let allHealthy = true;
        // MongoDB: readyState 1 = connected
        const dbState = mongoose_1.default.connection.readyState;
        if (dbState === 1) {
            checks['mongodb'] = 'ok';
        }
        else {
            checks['mongodb'] = 'error';
            allHealthy = false;
        }
        // Redis: only checked if client was passed in
        if (redisClient) {
            try {
                await redisClient.ping();
                checks['redis'] = 'ok';
            }
            catch {
                checks['redis'] = 'error';
                allHealthy = false;
            }
        }
        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json({
            status: allHealthy ? 'ready' : 'not ready',
            checks,
        });
    });
    /**
     * Metrics endpoint — basic process metrics for Prometheus scraping.
     * In a full observability setup this would use prom-client.
     * For now it exposes the minimal set needed for K8s dashboards.
     */
    app.get('/metrics', (_req, res) => {
        res.status(200).json({
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            nodeVersion: process.version,
        });
    });
    // ─── API routes ──────────────────────────────────────────────────────────────
    const api = env_1.env.API_PREFIX; // '/api/v1'
    app.use(`${api}/auth`, auth_routes_1.default);
    app.use(`${api}/projects`, project_routes_1.default);
    app.use(`${api}/ai`, ai_routes_1.default);
    // Sprint and ticket routes are nested under /projects/:projectId
    // mergeParams: true on those routers makes :projectId available downstream
    app.use(`${api}/projects/:projectId/sprints`, sprint_routes_1.default);
    app.use(`${api}/projects/:projectId/tickets`, ticket_routes_1.default);
    // ─── Error handling ──────────────────────────────────────────────────────────
    // Order matters: notFoundHandler must come after all routes,
    // errorHandler must be last (4-argument signature).
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
}

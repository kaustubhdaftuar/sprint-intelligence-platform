"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const redis_1 = require("redis");
const http_1 = __importDefault(require("http"));
const env_1 = require("./utils/env");
const logger_1 = __importDefault(require("./utils/logger"));
const app_1 = require("./app");
/**
 * server.ts — process boot sequence only.
 *
 * Responsibilities:
 * 1. Connect to MongoDB
 * 2. Connect to Redis
 * 3. Create the Express app (passing Redis client for /ready check)
 * 4. Start the HTTP server
 * 5. Register graceful shutdown handlers (SIGTERM + SIGINT)
 *
 * Nothing else belongs here.
 *
 * Why separate from app.ts:
 * - app.ts can be imported by tests without triggering DB connections
 * - Startup failures are isolated and logged with context
 * - Graceful shutdown has access to both the HTTP server and DB clients
 *
 * Graceful shutdown sequence (Kubernetes SIGTERM flow):
 * 1. K8s sends SIGTERM to the pod
 * 2. We stop accepting new connections (server.close())
 * 3. We wait for in-flight requests to complete (drain period)
 * 4. We close DB and Redis connections
 * 5. Process exits 0
 *
 * The drain period matters: K8s removes the pod from the Service endpoints
 * before sending SIGTERM, but there's a race — some requests may already
 * be in-flight to this pod. The drain period absorbs that race.
 */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000; // 10 seconds drain period
async function connectMongoDB() {
    try {
        await mongoose_1.default.connect(env_1.env.MONGODB_URI, {
            // These options prevent connection pool exhaustion under load
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        logger_1.default.info({ uri: env_1.env.MONGODB_URI.replace(/\/\/.*@/, '//***@') }, 'MongoDB connected');
        mongoose_1.default.connection.on('error', (err) => {
            logger_1.default.error({ err }, 'MongoDB connection error');
        });
        mongoose_1.default.connection.on('disconnected', () => {
            logger_1.default.warn('MongoDB disconnected');
        });
    }
    catch (err) {
        logger_1.default.error({ err }, 'MongoDB connection failed — exiting');
        process.exit(1);
    }
}
async function connectRedis() {
    const client = (0, redis_1.createClient)({ url: env_1.env.REDIS_URL });
    client.on('error', (err) => {
        logger_1.default.error({ err }, 'Redis client error');
    });
    client.on('reconnecting', () => {
        logger_1.default.warn('Redis reconnecting');
    });
    try {
        await client.connect();
        logger_1.default.info({ url: env_1.env.REDIS_URL }, 'Redis connected');
        return client;
    }
    catch (err) {
        logger_1.default.error({ err }, 'Redis connection failed — exiting');
        process.exit(1);
    }
}
function registerShutdownHandlers(httpServer, redisClient) {
    /**
     * Graceful shutdown function.
     * Called on both SIGTERM (Kubernetes) and SIGINT (local Ctrl+C).
     */
    async function shutdown(signal) {
        logger_1.default.info({ signal }, 'Shutdown signal received — starting graceful shutdown');
        // Step 1: Stop accepting new connections
        httpServer.close(async () => {
            logger_1.default.info('HTTP server closed — no new connections accepted');
            // Step 2: Close DB and cache connections
            try {
                await mongoose_1.default.connection.close(false);
                logger_1.default.info('MongoDB connection closed');
            }
            catch (err) {
                logger_1.default.error({ err }, 'Error closing MongoDB connection');
            }
            try {
                await redisClient.quit();
                logger_1.default.info('Redis connection closed');
            }
            catch (err) {
                logger_1.default.error({ err }, 'Error closing Redis connection');
            }
            logger_1.default.info('Graceful shutdown complete');
            process.exit(0);
        });
        // Step 3: Force exit if drain period exceeded
        // This prevents the pod from hanging indefinitely if requests stall
        setTimeout(() => {
            logger_1.default.error({ timeoutMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS }, 'Graceful shutdown timeout exceeded — forcing exit');
            process.exit(1);
        }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref(); // .unref() so this timer doesn't
        // prevent exit if shutdown completes first
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
    // Handle unhandled promise rejections — log and exit
    // In production, an unhandled rejection should be treated as fatal
    process.on('unhandledRejection', (reason) => {
        logger_1.default.error({ reason }, 'Unhandled promise rejection — exiting');
        process.exit(1);
    });
    // Handle uncaught exceptions — log and exit
    process.on('uncaughtException', (err) => {
        logger_1.default.error({ err }, 'Uncaught exception — exiting');
        process.exit(1);
    });
}
async function startServer() {
    // Step 1: Connect to dependencies first
    // If either fails, process.exit(1) is called inside the connect functions
    await connectMongoDB();
    const redisClient = await connectRedis();
    // Step 2: Create Express app with Redis client injected for /ready check
    const app = (0, app_1.createApp)(redisClient);
    // Step 3: Start HTTP server
    const httpServer = http_1.default.createServer(app);
    httpServer.listen(env_1.env.PORT, () => {
        logger_1.default.info({
            port: env_1.env.PORT,
            env: env_1.env.NODE_ENV,
            apiPrefix: env_1.env.API_PREFIX,
        }, 'HTTP server listening');
    });
    // Step 4: Register shutdown handlers with references to both connections
    registerShutdownHandlers(httpServer, redisClient);
}
// Boot
startServer().catch((err) => {
    logger_1.default.error({ err }, 'Fatal error during startup');
    process.exit(1);
});

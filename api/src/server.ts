import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/config';
import logger from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';

class Server {
  private app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(
      cors({
        origin: config.corsOrigin,
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Request logging
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoints
    this.app.get('/health', (_req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
      });
    });

    this.app.get('/health/live', (_req, res) => {
      res.status(200).json({ status: 'alive' });
    });

    this.app.get('/health/ready', async (_req, res) => {
      try {
        // Check MongoDB connection
        const dbState = mongoose.connection.readyState;
        if (dbState !== 1) {
          throw new Error('Database not connected');
        }

        res.status(200).json({
          status: 'ready',
          database: 'connected',
        });
      } catch (error) {
        res.status(503).json({
          status: 'not ready',
          error: (error as Error).message,
        });
      }
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    // Add more routes here as they're created:
    // this.app.use('/api/projects', projectRoutes);
    // this.app.use('/api/sprints', sprintRoutes);
    // this.app.use('/api/tickets', ticketRoutes);

    // API documentation
    this.app.get('/api', (_req, res) => {
      res.json({
        message: 'Sprint Intelligence Platform API',
        version: '1.0.0',
        endpoints: {
          auth: '/api/auth',
          projects: '/api/projects',
          sprints: '/api/sprints',
          tickets: '/api/tickets',
          health: '/health',
        },
        documentation: '/api/docs',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async connectDatabase(): Promise<void> {
    try {
      await mongoose.connect(config.mongoUri);
      logger.info('MongoDB connected successfully');

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      // Graceful shutdown
      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      });
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.connectDatabase();

      // Start server
      this.app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
        logger.info(`Health check: http://localhost:${config.port}/health`);
        logger.info(`API endpoint: http://localhost:${config.port}/api`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

// Create and start server
const server = new Server();
server.start();

export default server;
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import configurations
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { logger } from './config/logger.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeRazorpay } from './config/razorpay.js';
import { initializeCloudinary } from './config/cloudinary.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import deliveryRoutes from './routes/delivery.routes.js';
import adminRoutes from './routes/admin.routes.js';
import bannerRoutes from './routes/banner.routes.js';
import trackingRoutes from './routes/tracking.routes.js';

// Import socket handler
import { setupSocketHandlers } from './socket/socketHandler.js';

const isProd = process.env.NODE_ENV === 'production';

/** Browser / Expo dev server origins (comma-separated). RN native often sends no `Origin` — always allowed below. */
const explicitClientOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Express `cors` origin callback */
function expressCorsOrigin() {
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (!isProd) {
      callback(null, true);
      return;
    }
    if (explicitClientOrigins.length === 0) {
      callback(null, true);
      return;
    }
    if (explicitClientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    logger.warn(`CORS rejected origin: ${origin}`);
    callback(null, false);
  };
}

/** Socket.IO expects `true`, a string, or string[] for `cors.origin`. */
function socketCorsOriginSetting() {
  if (!isProd) return true;
  if (explicitClientOrigins.length === 0) return true;
  return explicitClientOrigins;
}

// Initialize express
const app = express();
const server = http.createServer(app);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '../uploads');
fs.mkdirSync(path.join(uploadsRoot, 'banners'), { recursive: true });
app.use(
  '/uploads',
  express.static(uploadsRoot, {
    maxAge: '7d',
    immutable: false,
    setHeaders: (res, filePath) => {
      if (/\.(jpe?g|png|webp|gif)$/i.test(filePath)) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      }
    },
  })
);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: socketCorsOriginSetting(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Make io accessible in routes
app.set('io', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: expressCorsOrigin(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    mongo: mongoOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    service: 'AquaRush API',
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/tracking', trackingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found.',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error.',
      errors: err.errors,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format.',
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();

    // Initialize Firebase
    try {
      initializeFirebase();
      logger.info('Firebase initialized successfully');
    } catch (firebaseError) {
      logger.warn(`Firebase initialization failed: ${firebaseError.message}`);
    }

    // Initialize Razorpay
    initializeRazorpay();

    // Initialize Cloudinary (optional for hosted image storage)
    initializeCloudinary();

    // Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT} (all interfaces — reachable on LAN)`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

export default app;
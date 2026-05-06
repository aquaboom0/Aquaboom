import mongoose from 'mongoose';
import { logger } from './logger.js';

/**
 * Connect to MongoDB before accepting traffic.
 * Previous implementation swallowed errors and returned immediately, so the HTTP
 * server started while mongoose was still disconnected — register/login then threw 500s.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to backend/.env (e.g. mongodb://127.0.0.1:27017/aquaboom)'
    );
  }

  const retries = Number(process.env.MONGODB_CONNECT_RETRIES || 8);
  const delayMs = Number(process.env.MONGODB_CONNECT_RETRY_MS || 3000);

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      });
      logger.info(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      lastErr = error;
      logger.error(`MongoDB connection attempt ${attempt}/${retries}: ${error.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr || new Error('MongoDB connection failed');
};

export default connectDB;

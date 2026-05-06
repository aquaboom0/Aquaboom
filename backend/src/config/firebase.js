import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

let firebaseInitialized = false;

export const initializeFirebase = () => {
  if (firebaseInitialized) return admin;

  try {
    // Check if service account file exists
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
    
    let serviceAccount;
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      logger.warn('Firebase service account not found. Push notifications will be disabled.');
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info('Firebase Admin SDK initialized successfully');
    return admin;
  } catch (error) {
    logger.error(`Firebase initialization error: ${error.message}`);
    return null;
  }
};

/** @param {{ imageUrl?: string }} [options] — rich notification thumbnail (HTTPS). */
export const sendPushNotification = async (
  fcmToken,
  title,
  body,
  data = {},
  options = {}
) => {
  if (!fcmToken || !firebaseInitialized) {
    logger.warn('FCM token missing or Firebase not initialized');
    return null;
  }

  try {
    const stringData = Object.fromEntries(
      Object.entries({ ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' }).map(([k, v]) => [
        k,
        v === undefined || v === null ? '' : String(v),
      ])
    );

    const imageUrl = typeof options.imageUrl === 'string' ? options.imageUrl.trim() : '';
    const apsPayload = {
      sound: 'default',
      badge: 1,
      ...(imageUrl ? { 'mutable-content': 1 } : {}),
    };

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'aquaboom_orders',
          sound: 'default',
          priority: 'high',
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
      apns: {
        payload: {
          aps: apsPayload,
        },
        ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
      },
    };

    return await admin.messaging().send(message);
  } catch (error) {
    logger.error(`FCM send error: ${error.message}`);
    return null;
  }
};

export default admin;
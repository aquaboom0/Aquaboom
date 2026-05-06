import Razorpay from 'razorpay';
import { logger } from './logger.js';

let razorpayInstance = null;

export const initializeRazorpay = () => {
  if (razorpayInstance) return razorpayInstance;

  try {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    logger.info('Razorpay initialized successfully');
    return razorpayInstance;
  } catch (error) {
    logger.error(`Razorpay initialization error: ${error.message}`);
    return null;
  }
};

export const createRazorpayOrder = async (amount, receipt, notes = {}) => {
  if (!razorpayInstance) {
    throw new Error('Razorpay not initialized');
  }

  const options = {
    amount: Math.round(amount * 100), // Convert to paise
    currency: 'INR',
    receipt,
    notes,
  };

  return await razorpayInstance.orders.create(options);
};

export const verifyRazorpayPayment = async (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  if (!razorpayInstance) {
    throw new Error('Razorpay not initialized');
  }

  const crypto = await import('crypto');
  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  return signature === razorpaySignature;
};

export const refundPayment = async (paymentId, amount) => {
  if (!razorpayInstance) {
    throw new Error('Razorpay not initialized');
  }

  const refund = await razorpayInstance.payments.refund(paymentId, {
    amount: Math.round(amount * 100),
  });

  return refund;
};

export default razorpayInstance;
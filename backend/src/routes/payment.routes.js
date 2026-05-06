import express from 'express';
import Order from '../models/Order.js';
import { verifyCustomerToken } from '../middleware/auth.middleware.js';
import { createRazorpayOrder, verifyRazorpayPayment, refundPayment } from '../config/razorpay.js';
import { broadcastPendingOrder, pushNotifyAgentsNewPending } from '../services/orderApproval.service.js';
import User from '../models/User.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// Create Razorpay order
router.post('/create-order', verifyCustomerToken, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and amount are required.',
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid.',
      });
    }

    const razorpayOrder = await createRazorpayOrder(
      amount,
      order.orderId,
      { orderId: order._id.toString(), customerId: req.user._id.toString() }
    );

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    logger.error(`Create payment order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order.',
    });
  }
});

// Verify payment webhook (Razorpay calls this)
router.post('/webhook', async (req, res) => {
  try {
    const { event, payload } = req.body;

    logger.info(`Razorpay webhook received: ${event}`);

    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      
      // Find order by razorpay order ID
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });

      if (!order) {
        logger.warn(`Order not found for razorpay order: ${payment.order_id}`);
        return res.json({ success: true });
      }

      // Update payment status
      order.paymentStatus = 'PAID';
      order.razorpayPaymentId = payment.id;
      order.razorpaySignature = payment.signature;
      await order.save();

      const customer = await User.findById(order.customer);
      const io = req.app.get('io');
      broadcastPendingOrder(io, order, customer);
      await pushNotifyAgentsNewPending(order);

      logger.info(`Payment captured for order: ${order.orderId}`);
    }

    if (event === 'payment.failed') {
      const payment = payload.payment.entity;
      
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });

      if (order) {
        order.paymentStatus = 'FAILED';
        await order.save();
        logger.info(`Payment failed for order: ${order.orderId}`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed.',
    });
  }
});

// Verify payment (client-side verification)
router.post('/verify', verifyCustomerToken, async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    const isValid = await verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      order.paymentStatus = 'FAILED';
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed.',
      });
    }

    order.paymentStatus = 'PAID';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    await order.save();

    const customer = await User.findById(order.customer);
    const io = req.app.get('io');
    broadcastPendingOrder(io, order, customer);
    await pushNotifyAgentsNewPending(order);

    res.json({
      success: true,
      message: 'Payment recorded. Awaiting order confirmation.',
      assignedAgent: null,
    });
  } catch (error) {
    logger.error(`Verify payment error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment.',
    });
  }
});

// Request refund
router.post('/refund', verifyCustomerToken, async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (order.paymentStatus !== 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Order is not paid.',
      });
    }

    if (!order.razorpayPaymentId) {
      return res.status(400).json({
        success: false,
        message: 'No payment to refund.',
      });
    }

    const refund = await refundPayment(order.razorpayPaymentId, order.totalAmount);

    order.paymentStatus = 'REFUNDED';
    order.status = 'CANCELLED';
    await order.save();

    res.json({
      success: true,
      message: 'Refund initiated successfully.',
      refundId: refund.id,
    });
  } catch (error) {
    logger.error(`Refund error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund.',
    });
  }
});

export default router;
import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import { verifyCustomerToken } from '../middleware/auth.middleware.js';
import { verifyDeliveryAgentToken } from '../middleware/adminAuth.middleware.js';
import { broadcastPendingOrder, pushNotifyAgentsNewPending } from '../services/orderApproval.service.js';
import { notifyCustomerOrderPlaced, notifyCustomerStatusUpdate } from '../services/notification.service.js';
import { createRazorpayOrder, verifyRazorpayPayment, refundPayment } from '../config/razorpay.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// Delivery charge threshold
const FREE_DELIVERY_THRESHOLD = 299;
const DELIVERY_CHARGE = 30;

// Create order
router.post('/create', verifyCustomerToken, async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, customerNote } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in cart.',
      });
    }

    if (!deliveryAddress || !deliveryAddress.line1) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required.',
      });
    }

    if (!paymentMethod || !['ONLINE', 'COD'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method.',
      });
    }

    // Validate and get product details
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (!product.isAvailable || product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Product out of stock: ${product.name}`,
        });
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        priceAtOrder: product.pricePerUnit,
        quantity: item.quantity,
        image: product.images[0] || '',
      });

      subtotal += product.pricePerUnit * item.quantity;

      // Reduce stock
      product.stock -= item.quantity;
      await product.save();
    }

    // Calculate delivery charge
    const deliveryCharge = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;

    // Create order — staff must approve before assignment (COD or online)
    const order = await Order.create({
      customer: req.user._id,
      items: orderItems,
      deliveryAddress,
      subtotal,
      deliveryCharge,
      discount: 0,
      totalAmount: subtotal + deliveryCharge,
      paymentMethod,
      paymentStatus: 'PENDING',
      isCOD: paymentMethod === 'COD',
      status: 'PENDING_APPROVAL',
      customerNote,
    });

    const customer = await User.findById(req.user._id);
    const io = req.app.get('io');

    broadcastPendingOrder(io, order, customer);
    await pushNotifyAgentsNewPending(order);
    await notifyCustomerOrderPlaced(order, customer);

    // If COD, wait for admin/agent approval before assigning a partner
    if (paymentMethod === 'COD') {
      res.json({
        success: true,
        order: {
          _id: order._id,
          orderId: order.orderId,
          items: order.items,
          deliveryAddress: order.deliveryAddress,
          subtotal: order.subtotal,
          deliveryCharge: order.deliveryCharge,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          status: order.status,
          createdAt: order.createdAt,
        },
        assignedAgent: null,
        message: 'Order placed. Awaiting confirmation from the team.',
      });
      return;
    }

    // If online payment, create Razorpay order
    try {
      const razorpayOrder = await createRazorpayOrder(
        order.totalAmount,
        order.orderId,
        { orderId: order._id.toString(), customerId: req.user._id.toString() }
      );

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      res.json({
        success: true,
        order: {
          _id: order._id,
          orderId: order.orderId,
          items: order.items,
          deliveryAddress: order.deliveryAddress,
          subtotal: order.subtotal,
          deliveryCharge: order.deliveryCharge,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          status: order.status,
          createdAt: order.createdAt,
        },
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
        key: process.env.RAZORPAY_KEY_ID,
      });
    } catch (razorpayError) {
      logger.error(`Razorpay order creation error: ${razorpayError.message}`);
      order.paymentMethod = 'COD';
      order.paymentStatus = 'PENDING';
      order.isCOD = true;
      await order.save();

      const io = req.app.get('io');
      broadcastPendingOrder(io, order, customer);
      await pushNotifyAgentsNewPending(order);

      res.json({
        success: true,
        order: {
          _id: order._id,
          orderId: order.orderId,
          items: order.items,
          deliveryAddress: order.deliveryAddress,
          subtotal: order.subtotal,
          deliveryCharge: order.deliveryCharge,
          totalAmount: order.totalAmount,
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          status: order.status,
          createdAt: order.createdAt,
        },
        message: 'Order created with COD due to payment gateway error — awaiting confirmation.',
      });
    }
  } catch (error) {
    logger.error(`Create order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create order.',
    });
  }
});

// Get customer's orders
router.get('/my-orders', verifyCustomerToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { customer: req.user._id };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('assignedAgent', 'name phone vehicleType vehicleNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get my orders error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders.',
    });
  }
});

// Get single order
router.get('/:orderId', verifyCustomerToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customer: req.user._id,
    }).populate('assignedAgent', 'name phone vehicleType vehicleNumber currentLocation');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error(`Get order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order.',
    });
  }
});

// Cancel order
router.post('/:orderId/cancel', verifyCustomerToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (!['PLACED', 'PENDING_APPROVAL', 'AUTO_APPROVED'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage.',
      });
    }

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity },
      });
    }

    // If payment was made, initiate refund
    if (order.paymentStatus === 'PAID' && order.razorpayPaymentId) {
      try {
        await refundPayment(order.razorpayPaymentId, order.totalAmount);
        order.paymentStatus = 'REFUNDED';
      } catch (refundError) {
        logger.error(`Refund error: ${refundError.message}`);
      }
    }

    // Free up agent if assigned
    if (order.assignedAgent) {
      await DeliveryAgent.findByIdAndUpdate(order.assignedAgent, {
        isAvailable: true,
        activeOrderId: null,
      });
    }

    order.status = 'CANCELLED';
    order.trackingHistory.push({
      status: 'CANCELLED',
      timestamp: new Date(),
      note: 'Order cancelled by customer',
    });
    await order.save();

    // Notify customer
    const customer = await User.findById(req.user._id);
    await notifyCustomerStatusUpdate(order, 'CANCELLED', customer);

    res.json({
      success: true,
      message: 'Order cancelled successfully.',
    });
  } catch (error) {
    logger.error(`Cancel order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order.',
    });
  }
});

// Verify payment (called from client after Razorpay success)
router.post('/verify-payment', verifyCustomerToken, async (req, res) => {
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

    // Verify payment signature
    const isValid = await verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      order.paymentStatus = 'FAILED';
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed.',
      });
    }

    // Update order
    order.paymentStatus = 'PAID';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    await order.save();

    const customer = await User.findById(req.user._id);
    const io = req.app.get('io');
    broadcastPendingOrder(io, order, customer);
    await pushNotifyAgentsNewPending(order);

    res.json({
      success: true,
      message: 'Payment successful. Your order is awaiting team confirmation.',
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

export default router;
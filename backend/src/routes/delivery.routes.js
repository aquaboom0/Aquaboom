import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import { exclusiveEndIndianCalendarDay, startOfIndianCalendarDay } from '../utils/indianTime.js';
import { verifyDeliveryAgentToken } from '../middleware/adminAuth.middleware.js';
import { freeAgentAfterDelivery, assignNextOrderToAgent, processPendingOrders } from '../services/orderAssignment.service.js';
import { approvePendingOrder, declinePendingOrder } from '../services/orderApproval.service.js';
import { notifyCustomerStatusUpdate, getCustomerOrderBannerCopy } from '../services/notification.service.js';
import User from '../models/User.js';
import { logger } from '../config/logger.js';
import { getDrivingRoute } from '../services/mapsDirections.service.js';

const router = express.Router();

const queueEligibleMatch = {
  status: 'AUTO_APPROVED',
  assignedAgent: null,
  $or: [{ paymentStatus: 'PAID' }, { paymentMethod: 'COD' }],
};

/** Order room to receive live agent GPS (customer map). Prefer out-for-delivery, else latest assigned/picked up. */
async function getAgentLiveTrackingOrder(agentId) {
  const ofd = await Order.findOne({
    assignedAgent: agentId,
    status: 'OUT_FOR_DELIVERY',
  }).select('_id');
  if (ofd) return ofd;
  return Order.findOne({
    assignedAgent: agentId,
    status: { $in: ['ASSIGNED', 'PICKED_UP'] },
  })
    .sort({ updatedAt: -1 })
    .select('_id');
}

/** Partner availability toggle (maps to isOnline + isAvailable — used for assignment eligibility). */
router.patch('/status', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { isOnline, isAvailable } = req.body;
    const update = {
      lastSeen: new Date(),
    };
    if (typeof isOnline === 'boolean') update.isOnline = isOnline;
    if (typeof isAvailable === 'boolean') update.isAvailable = isAvailable;

    const agent = await DeliveryAgent.findByIdAndUpdate(req.agentId, update, { new: true });
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }

    const io = req.app.get('io');
    const shouldTryQueueAssign =
      Boolean(agent?.isActive) &&
      Boolean(agent?.isOnline) &&
      Boolean(agent?.isAvailable) &&
      !agent?.activeOrderId;

    // Critical: if admin approved while partner was busy/offline, assign oldest queued order now.
    if (shouldTryQueueAssign) {
      await assignNextOrderToAgent(agent._id, io);
      // Also process queue globally in case multiple agents/orders are waiting.
      await processPendingOrders(io);
    }

    if (io) {
      io.to('admin:dashboard').emit('agent:fleetUpdate', {
        agentId: String(agent._id),
        isOnline: Boolean(agent.isOnline),
        isAvailable: Boolean(agent.isAvailable),
        isActive: Boolean(agent.isActive),
        name: agent.name,
        activeOrderId: agent.activeOrderId ? String(agent.activeOrderId) : null,
        lastSeen: agent.lastSeen,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      data: {
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable,
        lastSeen: agent.lastSeen,
      },
    });
  } catch (error) {
    logger.error(`Update agent status error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update status.',
    });
  }
});

// Orders awaiting admin / partner approval (same queue for all agents)
router.get('/pending-approval', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const orders = await Order.find({ status: 'PENDING_APPROVAL' })
      .populate('customer', 'name phone email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    logger.error(`Agent pending list error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders.',
    });
  }
});

router.post('/order/:orderId/approve', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const io = req.app.get('io');
    const result = await approvePendingOrder(req.params.orderId, io, { approverLabel: 'delivery partner' });

    if (!result.ok) {
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }
      return res.status(400).json({
        success: false,
        message: `Cannot approve order (status: ${result.status || 'unknown'}).`,
      });
    }

    if (result.alreadyDone) {
      return res.json({
        success: true,
        message: 'Order was already confirmed.',
        data: result.order,
      });
    }

    res.json({
      success: true,
      message: 'Order approved.',
      data: result.order,
      assignedAgent: result.agent
        ? {
            _id: result.agent._id,
            name: result.agent.name,
            phone: result.agent.phone,
          }
        : null,
    });
  } catch (error) {
    logger.error(`Agent approve order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to approve order.',
    });
  }
});

router.post('/order/:orderId/decline', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const io = req.app.get('io');
    const result = await declinePendingOrder(req.params.orderId, io, {
      reason: reason || 'Declined by delivery partner',
    });

    if (!result.ok) {
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }
      return res.status(400).json({
        success: false,
        message: `Cannot decline order (status: ${result.status || 'unknown'}).`,
      });
    }

    res.json({
      success: true,
      message: 'Order declined.',
      data: result.order,
    });
  } catch (error) {
    logger.error(`Agent decline order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to decline order.',
    });
  }
});

// Get agent's assigned orders
/** IST “today”: delivery fees credited for orders marked DELIVERED today (Asia/Kolkata). */
router.get('/earnings-summary', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const start = startOfIndianCalendarDay();
    const end = exclusiveEndIndianCalendarDay();

    const agent = await DeliveryAgent.findById(req.agentId).select('stats');

    const [agg] = await Order.aggregate([
      {
        $match: {
          assignedAgent: new mongoose.Types.ObjectId(req.agentId),
          status: 'DELIVERED',
          deliveredAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          earnings: { $sum: { $ifNull: ['$deliveryCharge', 0] } },
          deliveries: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        timezone: 'Asia/Kolkata',
        range: { start: start.toISOString(), endExclusive: end.toISOString() },
        today: {
          earnings: agg?.earnings ?? 0,
          deliveriesCompleted: agg?.deliveries ?? 0,
        },
        lifetime: {
          deliveries: agent?.stats?.totalDeliveries ?? 0,
          earnings: agent?.stats?.totalEarnings ?? 0,
        },
      },
    });
  } catch (error) {
    logger.error(`Earnings summary error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to load earnings.',
    });
  }
});

router.get('/my-orders', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const orders = await Order.find({ assignedAgent: req.agentId })
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments({ assignedAgent: req.agentId });

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
    logger.error(`Get agent orders error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders.',
    });
  }
});

// Global approved queue visible to delivery partners (FIFO).
router.get('/queue-orders', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { limit = 25 } = req.query;
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));

    const queued = await Order.find({
      ...queueEligibleMatch,
    })
      .populate('customer', 'name phone')
      .sort({ createdAt: 1 })
      .limit(safeLimit);

    const data = queued.map((order, idx) => ({
      ...order.toObject(),
      queuePosition: idx + 1,
    }));

    res.json({
      success: true,
      data,
      queueCount: data.length,
      message: data.length
        ? 'Approved orders waiting for next available partner.'
        : 'Queue is empty.',
    });
  } catch (error) {
    logger.error(`Get queue orders error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch queued orders.',
    });
  }
});

// Single assigned order detail (partner app unified build)
router.get('/order/:orderId', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      assignedAgent: req.agentId,
    }).populate('customer', 'name phone email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you.',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error(`Agent get order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order.',
    });
  }
});

// Get agent's current active order
router.get('/active-order', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      assignedAgent: req.agentId,
      status: { $in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
    }).populate('customer', 'name phone addresses');

    if (!order) {
      return res.json({
        success: true,
        data: null,
        message: 'No active order.',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error(`Get active order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active order.',
    });
  }
});

// Update order status
router.patch('/order/:orderId/update-status', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { status, note } = req.body;
    const validTransitions = {
      ASSIGNED: 'PICKED_UP',
      PICKED_UP: 'OUT_FOR_DELIVERY',
      OUT_FOR_DELIVERY: 'DELIVERED',
    };

    const order = await Order.findOne({
      _id: req.params.orderId,
      assignedAgent: req.agentId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you.',
      });
    }

    // Validate status transition
    const allowedNextStatus = validTransitions[order.status];
    if (allowedNextStatus !== status) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${order.status} to ${status}.`,
      });
    }

    // Update order
    order.status = status;
    order.trackingHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
    });

    if (status === 'PICKED_UP') {
      order.pickedUpAt = new Date();
    }

    if (status === 'OUT_FOR_DELIVERY') {
      // Get agent's current location
      const agent = await DeliveryAgent.findById(req.agentId);
      if (agent?.currentLocation) {
        order.trackingHistory[order.trackingHistory.length - 1].location = {
          lat: agent.currentLocation.lat,
          lng: agent.currentLocation.lng,
        };
      }
    }

    if (status === 'DELIVERED') {
      order.deliveredAt = new Date();
      order.otpVerified = true;
      order.codCollected = true;
      if (order.paymentMethod === 'COD') {
        order.paymentStatus = 'PAID';
      }

      // Update agent stats
      const partnerCut = Number(order.deliveryCharge) || 0;
      await DeliveryAgent.findByIdAndUpdate(req.agentId, {
        $inc: { 'stats.totalDeliveries': 1, 'stats.totalEarnings': partnerCut },
        isAvailable: true,
        activeOrderId: null,
      });

      // Free agent and check for pending orders
      await freeAgentAfterDelivery(req.agentId, req.app.get('io'));
    }

    await order.save();

    // Notify customer
    const customer = await User.findById(order.customer);
    await notifyCustomerStatusUpdate(order, status, customer);

    if (req.app.get('io')) {
      const banner = getCustomerOrderBannerCopy(order, status);
      req.app.get('io').to(`customer:${order.customer}`).emit('order:statusUpdate', {
        orderId: order._id,
        orderRef: order.orderId,
        status,
        title: banner?.title,
        subtitle: banner?.body,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}.`,
      data: order,
    });
  } catch (error) {
    logger.error(`Update order status error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
    });
  }
});

// Verify OTP for delivery
router.post('/order/:orderId/verify-otp', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { otp } = req.body;

    const order = await Order.findOne({
      _id: req.params.orderId,
      assignedAgent: req.agentId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you.',
      });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        success: false,
        message: 'Order must be out for delivery to verify OTP.',
      });
    }

    if (order.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP.',
      });
    }

    // Mark as delivered
    order.status = 'DELIVERED';
    order.deliveredAt = new Date();
    order.otpVerified = true;
    if (order.paymentMethod === 'COD') {
      order.paymentStatus = 'PAID';
    }
    order.trackingHistory.push({
      status: 'DELIVERED',
      timestamp: new Date(),
      note: 'OTP verified - Order delivered',
    });

    const partnerCut = Number(order.deliveryCharge) || 0;
    await DeliveryAgent.findByIdAndUpdate(req.agentId, {
      $inc: { 'stats.totalDeliveries': 1, 'stats.totalEarnings': partnerCut },
      isAvailable: true,
      activeOrderId: null,
    });

    await order.save();

    // Free agent and check for pending orders
    await freeAgentAfterDelivery(req.agentId, req.app.get('io'));

    // Notify customer
    const customer = await User.findById(order.customer);
    await notifyCustomerStatusUpdate(order, 'DELIVERED', customer);

    if (req.app.get('io')) {
      const deliveredBanner = getCustomerOrderBannerCopy(order, 'DELIVERED');
      req.app.get('io').to(`customer:${order.customer}`).emit('order:delivered', {
        orderId: order._id,
        orderRef: order.orderId,
        status: 'DELIVERED',
        title: deliveredBanner?.title,
        subtitle: deliveredBanner?.body,
        deliveredAt: order.deliveredAt,
      });
    }

    res.json({
      success: true,
      message: 'Order delivered successfully!',
    });
  } catch (error) {
    logger.error(`Verify OTP error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP.',
    });
  }
});

// Driving route polyline for in-app map (Google Directions)
router.get('/drive-route', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { originLat, originLng, destLat, destLng } = req.query;
    const result = await getDrivingRoute(originLat, originLng, destLat, destLng);

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      data: {
        coordinates: result.coordinates,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
      },
    });
  } catch (error) {
    logger.error(`Drive route error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to compute route.' });
  }
});

// Update agent location
router.patch('/location', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required.',
      });
    }

    const agent = await DeliveryAgent.findByIdAndUpdate(
      req.agentId,
      {
        currentLocation: {
          lat,
          lng,
          updatedAt: new Date(),
        },
        lastSeen: new Date(),
      },
      { new: true }
    );

    const activeOrder = await getAgentLiveTrackingOrder(req.agentId);

    // Emit location update to customer (room matches joinOrder(orderId))
    if (req.app.get('io') && activeOrder) {
      const oid = String(activeOrder._id);
      req.app.get('io').to(`order:${oid}`).emit('agent:locationUpdate', {
        agentId: req.agentId,
        agentName: agent.name,
        lat,
        lng,
        orderId: oid,
      });

      // Also emit to admin
      req.app.get('io').to('admin:dashboard').emit('agent:locationUpdate', {
        agentId: req.agentId,
        agentName: agent.name,
        lat,
        lng,
        orderId: oid,
      });
    }

    res.json({
      success: true,
      message: 'Location updated.',
    });
  } catch (error) {
    logger.error(`Update location error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update location.',
    });
  }
});

// Mark delivery as failed
router.post('/order/:orderId/failed', verifyDeliveryAgentToken, async (req, res) => {
  try {
    const { reason } = req.body;

    const order = await Order.findOne({
      _id: req.params.orderId,
      assignedAgent: req.agentId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you.',
      });
    }

    if (!['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark order as failed at this stage.',
      });
    }

    order.status = 'FAILED';
    order.failureReason = reason || 'Delivery failed';
    order.trackingHistory.push({
      status: 'FAILED',
      timestamp: new Date(),
      note: reason || 'Delivery failed',
    });

    // Free agent
    await DeliveryAgent.findByIdAndUpdate(req.agentId, {
      isAvailable: true,
      activeOrderId: null,
    });

    await order.save();

    // Notify customer
    const customer = await User.findById(order.customer);
    await notifyCustomerStatusUpdate(order, 'FAILED', customer);

    res.json({
      success: true,
      message: 'Order marked as failed.',
    });
  } catch (error) {
    logger.error(`Mark failed error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to mark order as failed.',
    });
  }
});

export default router;
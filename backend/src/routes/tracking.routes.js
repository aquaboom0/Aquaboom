import express from 'express';
import Order from '../models/Order.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import { verifyCustomerToken } from '../middleware/auth.middleware.js';
import { logger } from '../config/logger.js';
import { getDrivingRoute } from '../services/mapsDirections.service.js';

const router = express.Router();

// Get order tracking info
router.get('/order/:orderId', verifyCustomerToken, async (req, res) => {
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

    // Build tracking response
    const trackingInfo = {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      estimatedDelivery: order.estimatedDelivery,
      trackingHistory: order.trackingHistory,
    };

    // Add agent info if assigned
    if (order.assignedAgent) {
      trackingInfo.agent = {
        _id: order.assignedAgent._id,
        name: order.assignedAgent.name,
        phone: order.assignedAgent.phone,
        vehicleType: order.assignedAgent.vehicleType,
        vehicleNumber: order.assignedAgent.vehicleNumber,
        currentLocation: order.assignedAgent.currentLocation,
      };
    }

    // Add delivery times
    if (order.pickedUpAt) trackingInfo.pickedUpAt = order.pickedUpAt;
    if (order.outForDeliveryAt) trackingInfo.outForDeliveryAt = order.outForDeliveryAt;
    if (order.deliveredAt) trackingInfo.deliveredAt = order.deliveredAt;

    res.json({
      success: true,
      data: trackingInfo,
    });
  } catch (error) {
    logger.error(`Get tracking error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tracking info.',
    });
  }
});

/** Driving polyline agent → delivery pin (same as partner in-app route, for customer map). */
router.get('/order/:orderId/drive-route', verifyCustomerToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customer: req.user._id,
    })
      .populate('assignedAgent', 'name currentLocation')
      .select('deliveryAddress assignedAgent status');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const dest = order.deliveryAddress;
    const dlat = dest?.lat;
    const dlng = dest?.lng;
    if (dlat == null || dlng == null) {
      return res.status(400).json({
        success: false,
        message: 'Delivery location has no GPS coordinates yet.',
      });
    }

    const loc = order.assignedAgent?.currentLocation;
    const olat = loc?.lat;
    const olng = loc?.lng;
    if (olat == null || olng == null) {
      return res.status(400).json({
        success: false,
        message: 'Partner location not available yet.',
      });
    }

    const result = await getDrivingRoute(olat, olng, dlat, dlng);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
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
    logger.error(`Customer drive-route error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to compute route.' });
  }
});

// Get agent location for an order
router.get('/agent-location/:orderId', verifyCustomerToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customer: req.user._id,
    }).populate('assignedAgent', 'name currentLocation');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (!order.assignedAgent) {
      return res.status(400).json({
        success: false,
        message: 'No agent assigned to this order.',
      });
    }

    if (!order.assignedAgent.currentLocation) {
      return res.json({
        success: true,
        data: null,
        message: 'Agent location not available.',
      });
    }

    res.json({
      success: true,
      data: {
        agentId: order.assignedAgent._id,
        agentName: order.assignedAgent.name,
        location: order.assignedAgent.currentLocation,
      },
    });
  } catch (error) {
    logger.error(`Get agent location error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent location.',
    });
  }
});

// Get all active orders for tracking (for customer)
router.get('/active-orders', verifyCustomerToken, async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user._id,
      status: { $in: ['PLACED', 'AUTO_APPROVED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
    }).populate('assignedAgent', 'name phone vehicleType vehicleNumber currentLocation');

    const activeOrders = orders.map(order => ({
      orderId: order.orderId,
      status: order.status,
      items: order.items,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      estimatedDelivery: order.estimatedDelivery,
      agent: order.assignedAgent ? {
        _id: order.assignedAgent._id,
        name: order.assignedAgent.name,
        phone: order.assignedAgent.phone,
        vehicleType: order.assignedAgent.vehicleType,
        vehicleNumber: order.assignedAgent.vehicleNumber,
        currentLocation: order.assignedAgent.currentLocation,
      } : null,
    }));

    res.json({
      success: true,
      data: activeOrders,
    });
  } catch (error) {
    logger.error(`Get active orders error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active orders.',
    });
  }
});

// Admin: Get all agent locations
router.get('/all-agent-locations', async (req, res) => {
  try {
    const agents = await DeliveryAgent.find({
      isActive: true,
      currentLocation: { $exists: true, $ne: null },
    }).select('name phone currentLocation isAvailable activeOrderId');

    const locations = agents.map(agent => ({
      agentId: agent._id,
      agentName: agent.name,
      phone: agent.phone,
      location: agent.currentLocation,
      isAvailable: agent.isAvailable,
      hasActiveOrder: !!agent.activeOrderId,
    }));

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    logger.error(`Get all agent locations error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent locations.',
    });
  }
});

export default router;
import DeliveryAgent from '../models/DeliveryAgent.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendPushNotification } from '../config/firebase.js';
import { notifyCustomerOrderAssigned, getCustomerOrderBannerCopy } from './notification.service.js';
import {
  buildAgentOrderDataExtras,
  getOrderLocationExtras,
  truncateForNotification,
} from '../utils/orderLocationPush.js';
import { logger } from '../config/logger.js';

const queueEligibleMatch = {
  status: 'AUTO_APPROVED',
  assignedAgent: null,
  $or: [{ paymentStatus: 'PAID' }, { paymentMethod: 'COD' }],
};

// Haversine formula to calculate distance between two coordinates
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// Find nearest available agent
const findNearestAgent = async (deliveryLat, deliveryLng) => {
  const agents = await DeliveryAgent.find({
    isActive: true,
    isOnline: true,
    isAvailable: true,
    activeOrderId: null,
    'currentLocation.lat': { $exists: true },
    'currentLocation.lng': { $exists: true },
  });

  if (agents.length === 0) return null;

  if (agents.length === 1) {
    return agents[0];
  }

  // Calculate distance for each agent and find nearest
  let nearestAgent = null;
  let minDistance = Infinity;

  for (const agent of agents) {
    const distance = calculateDistance(
      agent.currentLocation.lat,
      agent.currentLocation.lng,
      deliveryLat,
      deliveryLng
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearestAgent = agent;
    }
  }

  return nearestAgent;
};

// Main order assignment function
export const assignOrderToAgent = async (orderId, io) => {
  try {
    const order = await Order.findById(orderId);

    if (!order) {
      logger.error(`Order not found: ${orderId}`);
      return null;
    }

    if (order.assignedAgent) {
      logger.warn(`Order ${orderId} already has an agent assigned`);
      return order.assignedAgent;
    }

    const deliveryLat = order.deliveryAddress.lat;
    const deliveryLng = order.deliveryAddress.lng;

    // Find available agents
    let availableAgents = await DeliveryAgent.find({
      isActive: true,
      isOnline: true,
      isAvailable: true,
      activeOrderId: null,
    });

    if (availableAgents.length === 0) {
      // No agents available - order stays in APPROVED status
      logger.info(`No agents available for order ${orderId}`);
      
      // Emit to admin about pending order
      if (io) {
        io.to('admin:dashboard').emit('no_agent_available', {
          orderId: order.orderId,
          message: 'No delivery agents available',
        });
      }

      return null;
    }

    let selectedAgent;

    if (availableAgents.length === 1) {
      // Only one agent - assign directly
      selectedAgent = availableAgents[0];
    } else {
      // Multiple agents - find nearest
      if (deliveryLat && deliveryLng) {
        selectedAgent = await findNearestAgent(deliveryLat, deliveryLng);
      } else {
        // No coordinates - assign to first available
        selectedAgent = availableAgents[0];
      }
    }

    if (!selectedAgent) {
      logger.warn(`Could not select agent for order ${orderId}`);
      return null;
    }

    // Update agent status
    selectedAgent.isAvailable = false;
    selectedAgent.activeOrderId = orderId;
    selectedAgent.lastSeen = new Date();
    await selectedAgent.save();

    // Update order
    order.status = 'ASSIGNED';
    order.assignedAgent = selectedAgent._id;
    order.assignedAt = new Date();
    order.trackingHistory.push({
      status: 'ASSIGNED',
      timestamp: new Date(),
      note: `Assigned to ${selectedAgent.name}`,
    });
    await order.save();

    // Get customer info for notifications
    const customer = await User.findById(order.customer);

    // Send rich push with map thumbnail when coords + Maps API key are available
    if (selectedAgent.fcmToken) {
      const { addressLine, mapImageUrl } = getOrderLocationExtras(order);
      const data = buildAgentOrderDataExtras(order, 'new_order');
      const city = order.deliveryAddress?.city || 'customer';
      const bodyText = addressLine
        ? `Order #${order.orderId} · ${truncateForNotification(addressLine)}`
        : `Order #${order.orderId} · Deliver to ${city}`;

      await sendPushNotification(
        selectedAgent.fcmToken,
        '🎉 New Order Assigned!',
        bodyText,
        data,
        mapImageUrl ? { imageUrl: mapImageUrl } : {}
      );
    }

    await notifyCustomerOrderAssigned(order, selectedAgent, customer);

    if (io) {
      const assignBanner = getCustomerOrderBannerCopy(order, 'ASSIGNED', selectedAgent.name);
      io.to(`customer:${order.customer}`).emit('order:assigned', {
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          assignedAt: order.assignedAt,
        },
        agent: {
          _id: selectedAgent._id,
          name: selectedAgent.name,
          phone: selectedAgent.phone,
          vehicleType: selectedAgent.vehicleType,
          vehicleNumber: selectedAgent.vehicleNumber,
        },
        title: assignBanner?.title,
        subtitle: assignBanner?.body,
      });

      // To admin
      io.to('admin:dashboard').emit('order:assigned', {
        orderId: order.orderId,
        agent: selectedAgent.name,
      });
    }

    logger.info(`Order ${orderId} assigned to agent ${selectedAgent.name}`);
    return selectedAgent;
  } catch (error) {
    logger.error(`Order assignment error: ${error.message}`);
    return null;
  }
};

/**
 * Assign the oldest approved order in queue to a specific agent (if eligible).
 * Used when a busy/offline partner becomes available again.
 */
export const assignNextOrderToAgent = async (agentId, io) => {
  try {
    const agent = await DeliveryAgent.findById(agentId);
    if (!agent) return null;
    if (!agent.isActive || !agent.isOnline || !agent.isAvailable || agent.activeOrderId) {
      return null;
    }

    const nextOrder = await Order.findOne({
      ...queueEligibleMatch,
    }).sort({ createdAt: 1 });

    if (!nextOrder) return null;

    // Lock agent first (best-effort guard against duplicate assignment race).
    const lockedAgent = await DeliveryAgent.findOneAndUpdate(
      {
        _id: agent._id,
        isActive: true,
        isOnline: true,
        isAvailable: true,
        activeOrderId: null,
      },
      {
        $set: {
          isAvailable: false,
          activeOrderId: nextOrder._id,
          lastSeen: new Date(),
        },
      },
      { new: true }
    );
    if (!lockedAgent) return null;

    // If order got assigned in parallel, unlock and exit.
    const order = await Order.findOneAndUpdate(
      {
        _id: nextOrder._id,
        status: 'AUTO_APPROVED',
        assignedAgent: null,
      },
      {
        $set: {
          status: 'ASSIGNED',
          assignedAgent: lockedAgent._id,
          assignedAt: new Date(),
        },
        $push: {
          trackingHistory: {
            status: 'ASSIGNED',
            timestamp: new Date(),
            note: `Assigned to ${lockedAgent.name}`,
          },
        },
      },
      { new: true }
    );

    if (!order) {
      await DeliveryAgent.findByIdAndUpdate(lockedAgent._id, {
        $set: { isAvailable: true, activeOrderId: null },
      });
      return null;
    }

    const customer = await User.findById(order.customer);

    if (lockedAgent.fcmToken) {
      const { addressLine, mapImageUrl } = getOrderLocationExtras(order);
      const data = buildAgentOrderDataExtras(order, 'new_order');
      const city = order.deliveryAddress?.city || 'customer';
      const bodyText = addressLine
        ? `Order #${order.orderId} · ${truncateForNotification(addressLine)}`
        : `Order #${order.orderId} · Deliver to ${city}`;

      await sendPushNotification(
        lockedAgent.fcmToken,
        '🎉 New Order Assigned!',
        bodyText,
        data,
        mapImageUrl ? { imageUrl: mapImageUrl } : {}
      );
    }

    await notifyCustomerOrderAssigned(order, lockedAgent, customer);

    if (io) {
      const assignBanner = getCustomerOrderBannerCopy(order, 'ASSIGNED', lockedAgent.name);
      io.to(`customer:${order.customer}`).emit('order:assigned', {
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          assignedAt: order.assignedAt,
        },
        agent: {
          _id: lockedAgent._id,
          name: lockedAgent.name,
          phone: lockedAgent.phone,
          vehicleType: lockedAgent.vehicleType,
          vehicleNumber: lockedAgent.vehicleNumber,
        },
        title: assignBanner?.title,
        subtitle: assignBanner?.body,
      });
      io.to('admin:dashboard').emit('order:assigned', {
        orderId: order.orderId,
        agent: lockedAgent.name,
      });
    }

    logger.info(`Queued order ${order._id} assigned to available agent ${lockedAgent.name}`);
    return lockedAgent;
  } catch (error) {
    logger.error(`assignNextOrderToAgent error: ${error.message}`);
    return null;
  }
};

// Reassign order when agent is deleted or unavailable
export const reassignOrder = async (orderId, io) => {
  try {
    const order = await Order.findById(orderId);

    if (!order) {
      logger.error(`Order not found for reassignment: ${orderId}`);
      return null;
    }

    // Reset order assignment
    order.assignedAgent = null;
    order.assignedAt = null;
    order.status = 'AUTO_APPROVED';
    await order.save();

    // Try to reassign
    return await assignOrderToAgent(orderId, io);
  } catch (error) {
    logger.error(`Order reassignment error: ${error.message}`);
    return null;
  }
};

// Process pending orders queue
export const processPendingOrders = async (io) => {
  try {
    const pendingOrders = await Order.find({
      ...queueEligibleMatch,
    }).sort({ createdAt: 1 });

    for (const order of pendingOrders) {
      await assignOrderToAgent(order._id, io);
    }

    logger.info(`Processed ${pendingOrders.length} pending orders`);
  } catch (error) {
    logger.error(`Process pending orders error: ${error.message}`);
  }
};

// Free agent after delivery
export const freeAgentAfterDelivery = async (agentId, io) => {
  try {
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) return;

    // Check for pending orders
    const assigned = await assignNextOrderToAgent(agentId, io);
    if (!assigned) {
      // Just mark agent as available
      agent.isAvailable = true;
      await agent.save();

      // Notify admin
      if (io) {
        io.to('admin:dashboard').emit('agent:available', {
          agentId: agent._id,
          name: agent.name,
        });
      }
    }
  } catch (error) {
    logger.error(`Free agent error: ${error.message}`);
  }
};

export default {
  assignOrderToAgent,
  assignNextOrderToAgent,
  reassignOrder,
  processPendingOrders,
  freeAgentAfterDelivery,
  calculateDistance,
};
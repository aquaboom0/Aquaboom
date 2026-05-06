import { sendPushNotification } from '../config/firebase.js';
import { logger } from '../config/logger.js';
import {
  buildAgentOrderDataExtras,
  getOrderLocationExtras,
  truncateForNotification,
} from '../utils/orderLocationPush.js';

/** Zepto-style short titles + actionable subtitles for FCM. */
const milestoneCopy = {
  AUTO_APPROVED: (order) => ({
    title: 'Order confirmed',
    body: `Order #${order.orderId} is confirmed. We're assigning a delivery partner.`,
  }),
  ASSIGNED: (order, agentName) => ({
    title: 'Rider on the way',
    body: `${agentName || 'Your partner'} will deliver order #${order.orderId}. Track live in the app.`,
  }),
  PICKED_UP: (order) => ({
    title: 'Picked up',
    body: `Your order #${order.orderId} has left the hub and is with your rider.`,
  }),
  OUT_FOR_DELIVERY: (order) => ({
    title: 'Out for delivery',
    body: `Almost there — order #${order.orderId} is nearby. Keep the app open for live tracking.`,
  }),
  DELIVERED: (order) => ({
    title: 'Delivered',
    body: `Order #${order.orderId} is complete. Thanks for choosing AquaRush!`,
  }),
  FAILED: (order) => ({
    title: 'Delivery issue',
    body: `We couldn't complete order #${order.orderId}. ${order.failureReason || 'Please contact support.'}`,
  }),
  CANCELLED: (order) => ({
    title: 'Order cancelled',
    body: `Order #${order.orderId} has been cancelled.`,
  }),
};

// Notify customer when order is placed (may be awaiting merchant approval)
export const notifyCustomerOrderPlaced = async (order, customer) => {
  if (!customer?.fcmToken) return;

  const pending = order.status === 'PENDING_APPROVAL';
  const title = pending ? 'Order received' : 'Order placed';
  const body = pending
    ? `We're reviewing #${order.orderId}. You'll get a ping when it's confirmed.`
    : `Order #${order.orderId} is in.`;

  try {
    await sendPushNotification(customer.fcmToken, title, body, {
      orderId: order._id.toString(),
      type: pending ? 'order_pending_approval' : 'order_placed',
    });
  } catch (error) {
    logger.error(`Order placed notification error: ${error.message}`);
  }
};

/** After admin / partner approves — before or independent of rider assignment. */
export const notifyCustomerOrderApproved = async (order, customer) => {
  if (!customer?.fcmToken) return;
  const { title, body } = milestoneCopy.AUTO_APPROVED(order);
  try {
    await sendPushNotification(customer.fcmToken, title, body, {
      orderId: order._id.toString(),
      type: 'order_confirmed',
      status: 'AUTO_APPROVED',
    });
  } catch (error) {
    logger.error(`Order approved notification error: ${error.message}`);
  }
};

// Notify customer when agent is assigned
export const notifyCustomerOrderAssigned = async (order, agent, customer) => {
  if (!customer?.fcmToken) return;

  const { title, body } = milestoneCopy.ASSIGNED(order, agent?.name);
  try {
    await sendPushNotification(customer.fcmToken, title, body, {
      orderId: order._id.toString(),
      type: 'order_assigned',
      status: 'ASSIGNED',
    });
  } catch (error) {
    logger.error(`Order assigned notification error: ${error.message}`);
  }
};

// Notify customer when order status changes (pickup, OFD, delivered, etc.)
export const notifyCustomerStatusUpdate = async (order, newStatus, customer) => {
  if (!customer?.fcmToken) return;

  const fn = milestoneCopy[newStatus];
  if (!fn) return;

  let title;
  let body;
  if (newStatus === 'ASSIGNED') {
    const agentName =
      typeof order.assignedAgent === 'object' && order.assignedAgent?.name
        ? order.assignedAgent.name
        : undefined;
    ({ title, body } = milestoneCopy.ASSIGNED(order, agentName));
  } else {
    ({ title, body } = fn(order));
  }

  try {
    await sendPushNotification(customer.fcmToken, title, body, {
      orderId: order._id.toString(),
      type: `order_${String(newStatus).toLowerCase()}`,
      status: newStatus,
    });
  } catch (error) {
    logger.error(`Status update notification error: ${error.message}`);
  }
};

// Notify delivery agent of new order
export const notifyAgentNewOrder = async (agent, order) => {
  if (!agent?.fcmToken) return;

  try {
    const { addressLine, mapImageUrl } = getOrderLocationExtras(order);
    const city = order.deliveryAddress?.city || '';
    const body = addressLine
      ? `Order #${order.orderId} · ${truncateForNotification(addressLine)}`
      : `Order #${order.orderId} · ${city || 'New delivery'}`;
    const data = buildAgentOrderDataExtras(order, 'new_order');
    await sendPushNotification(
      agent.fcmToken,
      'New Delivery Order!',
      body,
      data,
      mapImageUrl ? { imageUrl: mapImageUrl } : {}
    );
  } catch (error) {
    logger.error(`New order notification error: ${error.message}`);
  }
};

// Notify agent of order cancellation
export const notifyAgentOrderCancelled = async (agent, order) => {
  if (!agent?.fcmToken) return;

  try {
    await sendPushNotification(
      agent.fcmToken,
      'Order Cancelled',
      `Order #${order.orderId} has been cancelled by the customer.`,
      {
        orderId: order._id.toString(),
        type: 'order_cancelled',
      }
    );
  } catch (error) {
    logger.error(`Order cancelled notification error: ${error.message}`);
  }
};

// Notify customer of payment success
export const notifyCustomerPaymentSuccess = async (order, customer) => {
  if (!customer?.fcmToken) return;

  try {
    await sendPushNotification(
      customer.fcmToken,
      'Payment received',
      `₹${order.totalAmount} secured for order #${order.orderId}.`,
      {
        orderId: order._id.toString(),
        type: 'payment_success',
      }
    );
  } catch (error) {
    logger.error(`Payment success notification error: ${error.message}`);
  }
};

// Notify customer of payment failure
export const notifyCustomerPaymentFailed = async (order, customer) => {
  if (!customer?.fcmToken) return;

  try {
    await sendPushNotification(
      customer.fcmToken,
      'Payment failed',
      `Try again for order #${order.orderId}.`,
      {
        orderId: order._id.toString(),
        type: 'payment_failed',
      }
    );
  } catch (error) {
    logger.error(`Payment failed notification error: ${error.message}`);
  }
};

/** In-app banner + socket: same copy as FCM for consistency. */
export const getCustomerOrderBannerCopy = (order, newStatus, agentNameOverride) => {
  const fn = milestoneCopy[newStatus];
  if (!fn) return null;
  if (newStatus === 'ASSIGNED') {
    const agentName =
      agentNameOverride ||
      (typeof order.assignedAgent === 'object' && order.assignedAgent?.name
        ? order.assignedAgent.name
        : undefined);
    return milestoneCopy.ASSIGNED(order, agentName);
  }
  return fn(order);
};

export default {
  notifyCustomerOrderPlaced,
  notifyCustomerOrderApproved,
  notifyCustomerOrderAssigned,
  notifyCustomerStatusUpdate,
  getCustomerOrderBannerCopy,
  notifyAgentNewOrder,
  notifyAgentOrderCancelled,
  notifyCustomerPaymentSuccess,
  notifyCustomerPaymentFailed,
};


import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import AdminPushToken from '../models/AdminPushToken.js';
import {
  buildAgentOrderDataExtras,
  getOrderLocationExtras,
  truncateForNotification,
} from '../utils/orderLocationPush.js';
import { assignOrderToAgent } from './orderAssignment.service.js';
import { refundPayment } from '../config/razorpay.js';
import { sendPushNotification } from '../config/firebase.js';
import {
  notifyCustomerOrderApproved,
  notifyCustomerStatusUpdate,
  getCustomerOrderBannerCopy,
} from './notification.service.js';
import { logger } from '../config/logger.js';

export async function restoreOrderStock(order) {
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
  }
}

export function buildPendingPayload(order, customer) {
  return {
    order: {
      _id: order._id,
      orderId: order.orderId,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      deliveryAddress: order.deliveryAddress,
      status: order.status,
      createdAt: order.createdAt,
    },
    customer: {
      name: customer?.name,
      phone: customer?.phone,
      email: customer?.email,
    },
  };
}

/** Realtime to admin only — admins approve orders; partners toggle Available and receive assignments automatically. */
export function broadcastPendingOrder(io, order, customer) {
  if (!io) return;
  const payload = buildPendingPayload(order, customer);
  io.to('admin:dashboard').emit('order:pendingApproval', payload);
}

const PENDING_TITLE = 'New order — needs approval';

/** FCM to registered admin devices only (delivery partners no longer approve orders here). */
export async function pushNotifyAgentsNewPending(order) {
  const { mapImageUrl, addressLine } = getOrderLocationExtras(order);
  const rows = [`Order #${order.orderId} · ₹${order.totalAmount}`];
  if (addressLine) rows.push(truncateForNotification(addressLine, 180));
  const body = rows.join('\n');
  const data = buildAgentOrderDataExtras(order, 'order_pending_approval');
  const opts = mapImageUrl ? { imageUrl: mapImageUrl } : {};

  try {
    const adminRows = await AdminPushToken.find().select('fcmToken').lean();
    await Promise.all(
      adminRows.map((row) =>
        sendPushNotification(row.fcmToken, PENDING_TITLE, body, data, opts)
      )
    );
  } catch (e) {
    logger.error(`pushNotifyAgentsNewPending (admin): ${e.message}`);
  }
}

export async function approvePendingOrder(orderId, io, meta = {}) {
  const approverLabel = meta.approverLabel || 'merchant';

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: 'PENDING_APPROVAL' },
    {
      $set: { status: 'AUTO_APPROVED' },
      $push: {
        trackingHistory: {
          status: 'AUTO_APPROVED',
          timestamp: new Date(),
          note: `Order confirmed by ${approverLabel}`,
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    const existing = await Order.findById(orderId);
    if (!existing) return { ok: false, error: 'not_found' };
    if (existing.status === 'AUTO_APPROVED' || existing.status === 'ASSIGNED') {
      return { ok: true, order: existing, agent: existing.assignedAgent, alreadyDone: true };
    }
    return { ok: false, error: 'invalid_status', status: existing.status };
  }

  const customerForApprovalPush = await User.findById(updated.customer);
  if (customerForApprovalPush) {
    await notifyCustomerOrderApproved(updated, customerForApprovalPush);
  }

  let agent = null;
  try {
    agent = await assignOrderToAgent(updated._id, io);
  } catch (e) {
    logger.error(`assignOrderToAgent after approve: ${e.message}`);
  }

  const orderAfter = await Order.findById(updated._id);
  const statusForEmit = orderAfter?.status || updated.status;

  const customer = await User.findById(updated.customer);

  if (io) {
    let approvalBanner = null;
    if (statusForEmit === 'ASSIGNED' && agent) {
      approvalBanner = getCustomerOrderBannerCopy(orderAfter || updated, 'ASSIGNED', agent.name);
    } else {
      approvalBanner = getCustomerOrderBannerCopy(orderAfter || updated, 'AUTO_APPROVED');
    }
    io.to(`customer:${updated.customer}`).emit('order:approvalResult', {
      orderId: updated._id,
      orderIdHuman: updated.orderId,
      status: statusForEmit,
      approved: true,
      assignedAgent: agent
        ? { _id: agent._id, name: agent.name, phone: agent.phone }
        : null,
      title: approvalBanner?.title,
      subtitle: approvalBanner?.body,
    });
    io.to('admin:dashboard').emit('order:pendingResolved', {
      orderId: updated._id,
      approved: true,
    });
  }

  return { ok: true, order: orderAfter || updated, agent, customer };
}

export async function declinePendingOrder(orderId, io, meta = {}) {
  const reason = meta.reason || 'Order declined by merchant';

  const order = await Order.findOne({ _id: orderId, status: 'PENDING_APPROVAL' });
  if (!order) {
    const existing = await Order.findById(orderId);
    if (!existing) return { ok: false, error: 'not_found' };
    return { ok: false, error: 'invalid_status', status: existing.status };
  }

  await restoreOrderStock(order);

  if (order.paymentStatus === 'PAID' && order.razorpayPaymentId) {
    try {
      await refundPayment(order.razorpayPaymentId, order.totalAmount);
      order.paymentStatus = 'REFUNDED';
    } catch (e) {
      logger.error(`Decline refund failed: ${e.message}`);
    }
  }

  order.status = 'CANCELLED';
  order.trackingHistory.push({
    status: 'CANCELLED',
    timestamp: new Date(),
    note: reason,
  });
  await order.save();

  const customer = await User.findById(order.customer);
  if (customer) {
    await notifyCustomerStatusUpdate(order, 'CANCELLED', customer);
  }

  if (io) {
    const declineBanner = getCustomerOrderBannerCopy(order, 'CANCELLED');
    io.to(`customer:${order.customer}`).emit('order:approvalResult', {
      orderId: order._id,
      orderIdHuman: order.orderId,
      status: 'CANCELLED',
      approved: false,
      reason,
      title: declineBanner?.title,
      subtitle: declineBanner?.body,
    });
    io.to('admin:dashboard').emit('order:pendingResolved', {
      orderId: order._id,
      approved: false,
    });
  }

  return { ok: true, order, customer };
}

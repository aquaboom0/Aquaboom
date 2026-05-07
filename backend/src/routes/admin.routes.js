import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import User from '../models/User.js';
import { verifyAdminToken } from '../middleware/adminAuth.middleware.js';
import { assignOrderToAgent, reassignOrder } from '../services/orderAssignment.service.js';
import { approvePendingOrder, declinePendingOrder } from '../services/orderApproval.service.js';
import {
  notifyCustomerStatusUpdate,
  getCustomerOrderBannerCopy,
} from '../services/notification.service.js';
import { logger } from '../config/logger.js';
import {
  exclusiveEndIndianCalendarDay,
  indianCalendarStartMinusDays,
  startOfIndianCalendarDay,
} from '../utils/indianTime.js';
import { resizeProductPhotoBuffer, PRODUCT_IMAGE_MAX } from '../utils/processProductImage.js';
import { isCloudinaryEnabled, uploadImageBuffer } from '../config/cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productsImgDir = path.join(__dirname, '../../uploads/products');
fs.mkdirSync(productsImgDir, { recursive: true });

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG or WebP'));
  },
});

const router = express.Router();

// ==================== DASHBOARD & ANALYTICS ====================

// Get dashboard stats
router.get('/dashboard/stats', verifyAdminToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      totalCustomers,
      totalAgents,
      activeAgents,
      revenueData,
      pendingOrders,
      awaitingApproval,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ role: 'customer' }),
      DeliveryAgent.countDocuments(),
      DeliveryAgent.countDocuments({ isAvailable: true, isOnline: true, isActive: true, activeOrderId: null }),
      Order.aggregate([
        { $match: { paymentStatus: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.countDocuments({ status: { $in: ['PLACED', 'AUTO_APPROVED'] } }),
      Order.countDocuments({ status: 'PENDING_APPROVAL' }),
    ]);

    // Get orders by status
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Get top products
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.name' }, totalQty: { $sum: '$items.quantity' } } },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        todayOrders,
        totalCustomers,
        totalAgents,
        /** Partners eligible to receive a new assignment (available + online + no active order). */
        activeAgents,
        totalRevenue: revenueData[0]?.total || 0,
        pendingOrders,
        awaitingApproval,
        ordersByStatus: ordersByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        topProducts,
      },
    });
  } catch (error) {
    logger.error(`Dashboard stats error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats.',
    });
  }
});

/** Orders + paid revenue for IST “today” or last 7 IST calendar days (inclusive of today). */
router.get('/dashboard/range-stats', verifyAdminToken, async (req, res) => {
  try {
    const range = req.query.range === '7d' ? '7d' : 'today';
    const start =
      range === 'today'
        ? startOfIndianCalendarDay()
        : indianCalendarStartMinusDays(6);
    const end = exclusiveEndIndianCalendarDay();

    const [paidAgg, totalCount] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            paymentStatus: 'PAID',
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalAmount' },
            paidOrders: { $sum: 1 },
          },
        },
      ]),
      Order.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    ]);

    const paid = paidAgg[0];

    res.json({
      success: true,
      data: {
        range,
        timezone: 'Asia/Kolkata',
        start: start.toISOString(),
        endExclusive: end.toISOString(),
        ordersTotal: totalCount,
        paidOrders: paid?.paidOrders ?? 0,
        revenuePaid: paid?.revenue ?? 0,
      },
    });
  } catch (error) {
    logger.error(`Range stats error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to load range analytics.',
    });
  }
});

// Get revenue chart data
router.get('/dashboard/revenue', verifyAdminToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const revenueData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          paymentStatus: 'PAID',
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: revenueData,
    });
  } catch (error) {
    logger.error(`Revenue chart error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue data.',
    });
  }
});

// ==================== DELIVERY AGENT MANAGEMENT ====================

// Get all agents
router.get('/agents', verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, isAvailable } = req.query;

    const query = {};
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    const agents = await DeliveryAgent.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await DeliveryAgent.countDocuments(query);

    res.json({
      success: true,
      data: agents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get agents error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents.',
    });
  }
});

// Get single agent
router.get('/agents/:agentId', verifyAdminToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findById(req.params.agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found.',
      });
    }

    // Get agent's order history
    const orderHistory = await Order.find({ assignedAgent: agent._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: {
        ...agent.toObject(),
        orderHistory,
      },
    });
  } catch (error) {
    logger.error(`Get agent error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent.',
    });
  }
});

// Create agent
router.post('/agents', verifyAdminToken, async (req, res) => {
  try {
    const { name, phone, email, vehicleType, vehicleNumber, licenseNumber, aadharNumber, address, zone } = req.body;

    if (!name || !phone || !vehicleType || !vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, vehicle type, and vehicle number are required.',
      });
    }

    // Check if phone already exists
    const existingAgent = await DeliveryAgent.findOne({ phone });
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this phone already exists.',
      });
    }

    const agent = await DeliveryAgent.create({
      name,
      phone,
      email,
      password: req.body.password || 'agent123',
      vehicleType,
      vehicleNumber,
      licenseNumber,
      aadharNumber,
      address,
      zone,
      isOnline: false,
      isAvailable: false,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Agent created successfully.',
      data: agent,
    });
  } catch (error) {
    logger.error(`Create agent error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create agent.',
    });
  }
});

// Update agent
router.put('/agents/:agentId', verifyAdminToken, async (req, res) => {
  try {
    const { name, phone, email, vehicleType, vehicleNumber, licenseNumber, aadharNumber, address, zone, isActive } = req.body;

    const agent = await DeliveryAgent.findById(req.params.agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found.',
      });
    }

    // If agent has active order, don't allow deactivation
    if (isActive === false && agent.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate agent with active order.',
      });
    }

    // If deactivating, reassign orders
    if (isActive === false && agent.isActive !== false) {
      await reassignOrder(agent._id, req.app.get('io'));
    }

    const updatedAgent = await DeliveryAgent.findByIdAndUpdate(
      req.params.agentId,
      {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(vehicleType && { vehicleType }),
        ...(vehicleNumber && { vehicleNumber }),
        ...(licenseNumber && { licenseNumber }),
        ...(aadharNumber && { aadharNumber }),
        ...(address && { address }),
        ...(zone && { zone }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Agent updated successfully.',
      data: updatedAgent,
    });
  } catch (error) {
    logger.error(`Update agent error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent.',
    });
  }
});

// Delete agent
router.delete('/agents/:agentId', verifyAdminToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findById(req.params.agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found.',
      });
    }

    // If agent has active order, don't allow deletion
    if (agent.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete agent with active order.',
      });
    }

    // Reassign pending orders
    await reassignOrder(agent._id, req.app.get('io'));

    await DeliveryAgent.findByIdAndDelete(req.params.agentId);

    res.json({
      success: true,
      message: 'Agent deleted successfully.',
    });
  } catch (error) {
    logger.error(`Delete agent error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agent.',
    });
  }
});

// ==================== PRODUCT MANAGEMENT ====================

/** Upload product photo → resized square JPEG (prefers Cloudinary, falls back to /uploads/products). */
router.post(
  '/products/upload-image',
  verifyAdminToken,
  (req, res, next) => {
    productImageUpload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Invalid upload',
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          message: 'Missing image file (field name: image).',
        });
      }
      const resized = await resizeProductPhotoBuffer(req.file.buffer);
      const persistLocal = async () => {
        const filename = `product-${Date.now()}.jpg`;
        await fs.promises.writeFile(path.join(productsImgDir, filename), resized);
        const publicPath = `/uploads/products/${filename}`;
        const base = `${req.protocol}://${req.get('host')}`;
        return { publicPath, publicUrl: `${base}${publicPath}` };
      };
      let publicPath = '';
      let publicUrl = '';
      if (isCloudinaryEnabled()) {
        try {
          const uploaded = await uploadImageBuffer(resized, {
            folder: 'aquaboom/products',
            format: 'jpg',
            transformation: [
              { width: PRODUCT_IMAGE_MAX, height: PRODUCT_IMAGE_MAX, crop: 'fill' },
              { quality: 'auto:good' },
            ],
          });
          publicPath = uploaded.url;
          publicUrl = uploaded.url;
        } catch (cloudErr) {
          logger.error(`Product upload Cloudinary failed, using local fallback: ${cloudErr.message}`);
          const local = await persistLocal();
          publicPath = local.publicPath;
          publicUrl = local.publicUrl;
        }
      } else {
        const local = await persistLocal();
        publicPath = local.publicPath;
        publicUrl = local.publicUrl;
      }
      res.json({
        success: true,
        data: {
          path: publicPath,
          url: publicUrl,
          width: PRODUCT_IMAGE_MAX,
          height: PRODUCT_IMAGE_MAX,
          format: 'jpeg',
        },
      });
    } catch (error) {
      logger.error(`Product image upload: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Could not process image.',
      });
    }
  }
);

// Get all products
router.get('/products', verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, isAvailable } = req.query;

    const query = {};
    if (category) query.category = category;
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get products error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products.',
    });
  }
});

// Create product
router.post('/products', verifyAdminToken, async (req, res) => {
  try {
    const { name, description, category, pricePerUnit, stock, unit, images, image, imageUrl, isAvailable, capacity, brand } =
      req.body;

    if (!name || pricePerUnit === undefined || stock === undefined || !unit || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, price, stock, and unit are required.',
      });
    }

    const imageList = Array.isArray(images)
      ? images
      : [imageUrl || image].filter(Boolean);

    const product = await Product.create({
      name,
      description,
      category,
      pricePerUnit,
      stock,
      unit,
      images: imageList.length ? imageList.map(String) : [],
      isAvailable: isAvailable !== false,
      capacity,
      brand,
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: product,
    });
  } catch (error) {
    logger.error(`Create product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create product.',
    });
  }
});

// Update product
router.put('/products/:productId', verifyAdminToken, async (req, res) => {
  try {
    const { name, description, category, pricePerUnit, stock, unit, images, isAvailable, capacity, brand } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.productId,
      {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(pricePerUnit !== undefined && { pricePerUnit }),
        ...(stock !== undefined && { stock }),
        ...(unit && { unit }),
        ...(images !== undefined && {
          images: Array.isArray(images) ? images.map(String).filter(Boolean) : [],
        }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(capacity && { capacity }),
        ...(brand && { brand }),
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully.',
      data: product,
    });
  } catch (error) {
    logger.error(`Update product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update product.',
    });
  }
});

// Delete product
router.delete('/products/:productId', verifyAdminToken, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    logger.error(`Delete product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product.',
    });
  }
});

// ==================== ORDER MANAGEMENT ====================

// Pending approval queue (must be before /orders/:orderId)
router.get('/orders/pending-approval', verifyAdminToken, async (req, res) => {
  try {
    const orders = await Order.find({ status: 'PENDING_APPROVAL' })
      .populate('customer', 'name phone email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    logger.error(`Pending approval list error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders.',
    });
  }
});

// Get all orders
router.get('/orders', verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus, dateFrom, dateTo } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const orders = await Order.find(query)
      .populate('customer', 'name phone')
      .populate('assignedAgent', 'name phone')
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
    logger.error(`Get orders error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders.',
    });
  }
});

router.post('/orders/:orderId/approve', verifyAdminToken, async (req, res) => {
  try {
    const io = req.app.get('io');
    const result = await approvePendingOrder(req.params.orderId, io, { approverLabel: 'admin' });

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
      message: 'Order approved and queued for assignment.',
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
    logger.error(`Admin approve order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to approve order.',
    });
  }
});

router.post('/orders/:orderId/decline', verifyAdminToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const io = req.app.get('io');
    const result = await declinePendingOrder(req.params.orderId, io, {
      reason: reason || 'Declined by admin',
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
    logger.error(`Admin decline order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to decline order.',
    });
  }
});

// Get single order
router.get('/orders/:orderId', verifyAdminToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'name phone email addresses')
      .populate('assignedAgent', 'name phone vehicleType vehicleNumber currentLocation');

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

// Update order status (admin override)
router.patch('/orders/:orderId/status', verifyAdminToken, async (req, res) => {
  try {
    const { status, note } = req.body;

    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    order.status = status;
    order.trackingHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated by admin to ${status}`,
    });

    // Handle specific status changes
    if (status === 'DELIVERED') {
      order.deliveredAt = new Date();
      
      // Free agent if assigned
      if (order.assignedAgent) {
        await DeliveryAgent.findByIdAndUpdate(order.assignedAgent, {
          isAvailable: true,
          activeOrderId: null,
        });
      }
    }

    if (status === 'CANCELLED') {
      // Restore stock
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }
    }

    await order.save();

    const customer = await User.findById(order.customer);
    if (customer) {
      const orderForNotify = await Order.findById(order._id).populate('assignedAgent', 'name');
      await notifyCustomerStatusUpdate(orderForNotify || order, status, customer);

      const io = req.app.get('io');
      if (io) {
        const banner = getCustomerOrderBannerCopy(orderForNotify || order, status);
        io.to(`customer:${order.customer}`).emit('order:statusUpdate', {
          orderId: order._id,
          orderRef: order.orderId,
          status,
          title: banner?.title,
          subtitle: banner?.body,
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      message: 'Order status updated.',
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

// Manually assign order to agent
router.post('/orders/:orderId/assign', verifyAdminToken, async (req, res) => {
  try {
    const { agentId } = req.body;

    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (!['AUTO_APPROVED', 'ASSIGNED'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be assigned at this stage.',
      });
    }

    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found.',
      });
    }

    if (!agent.isAvailable || !agent.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Agent is not available.',
      });
    }

    // Free previous agent if any
    if (order.assignedAgent) {
      await DeliveryAgent.findByIdAndUpdate(order.assignedAgent, {
        isAvailable: true,
        activeOrderId: null,
      });
    }

    // Assign new agent
    order.assignedAgent = agentId;
    order.status = 'ASSIGNED';
    order.assignedAt = new Date();
    order.trackingHistory.push({
      status: 'ASSIGNED',
      timestamp: new Date(),
      note: `Manually assigned to ${agent.name}`,
    });

    // Generate OTP
    order.otp = Math.floor(1000 + Math.random() * 9000).toString();

    await order.save();

    // Update agent
    await DeliveryAgent.findByIdAndUpdate(agentId, {
      isAvailable: false,
      activeOrderId: order._id,
    });

    res.json({
      success: true,
      message: 'Order assigned successfully.',
      data: {
        order,
        agent: {
          _id: agent._id,
          name: agent.name,
          phone: agent.phone,
        },
      },
    });
  } catch (error) {
    logger.error(`Assign order error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to assign order.',
    });
  }
});

// ==================== CUSTOMER MANAGEMENT ====================

// Get all customers
router.get('/customers', verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const customers = await User.find({ role: 'customer' })
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ role: 'customer' });

    res.json({
      success: true,
      data: customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get customers error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers.',
    });
  }
});

// Get single customer
router.get('/customers/:customerId', verifyAdminToken, async (req, res) => {
  try {
    const customer = await User.findOne({ _id: req.params.customerId, role: 'customer' });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.',
      });
    }

    // Get customer's order count
    const orderCount = await Order.countDocuments({ customer: customer._id });

    res.json({
      success: true,
      data: {
        ...customer.toObject(),
        orderCount,
      },
    });
  } catch (error) {
    logger.error(`Get customer error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer.',
    });
  }
});

export default router;
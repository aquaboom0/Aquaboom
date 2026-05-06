import DeliveryAgent from '../models/DeliveryAgent.js';
import Order from '../models/Order.js';
import { logger } from '../config/logger.js';

export function initializeSocket(io) {
  // Store io instance for use in other modules
  return io;
}

export function setupSocketHandlers(io) {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const userType = socket.handshake.query.userType; // 'customer', 'agent', 'admin'

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // For now, we'll do simple token validation
      // In production, verify JWT token here
      socket.userType = userType;
      socket.token = token;

      next();
    } catch (error) {
      logger.error(`Socket auth error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}, userType: ${socket.userType}`);

    // Handle user joining their personal room
    socket.on('join', async (userId) => {
      try {
        if (socket.userType === 'customer') {
          socket.join(`customer:${userId}`);
          logger.info(`Customer ${userId} joined room customer:${userId}`);
        } else if (socket.userType === 'agent') {
          socket.join(`agent:${userId}`);
          socket.join('agents:all');
          
          // Update agent's socket ID and online status
          await DeliveryAgent.findByIdAndUpdate(userId, {
            socketId: socket.id,
            isOnline: true,
            lastSeen: new Date(),
          });
          
          logger.info(`Agent ${userId} joined rooms agent:${userId} and agents:all`);
        } else if (socket.userType === 'admin') {
          socket.join('admin:dashboard');
          logger.info(`Admin joined admin:dashboard room`);
        }
      } catch (error) {
        logger.error(`Socket join error: ${error.message}`);
      }
    });

    // Handle order room joining (for real-time tracking)
    socket.on('joinOrder', async (orderId) => {
      try {
        socket.join(`order:${orderId}`);
        logger.info(`Socket ${socket.id} joined order room: ${orderId}`);
      } catch (error) {
        logger.error(`Socket joinOrder error: ${error.message}`);
      }
    });

    // Handle leaving order room
    socket.on('leaveOrder', async (orderId) => {
      try {
        socket.leave(`order:${orderId}`);
        logger.info(`Socket ${socket.id} left order room: ${orderId}`);
      } catch (error) {
        logger.error(`Socket leaveOrder error: ${error.message}`);
      }
    });

    // Handle agent location update
    socket.on('locationUpdate', async (data) => {
      try {
        const { agentId, lat, lng } = data;

        await DeliveryAgent.findByIdAndUpdate(agentId, {
          currentLocation: {
            lat,
            lng,
            updatedAt: new Date(),
          },
          lastSeen: new Date(),
        });

        let activeOrder = await Order.findOne({
          assignedAgent: agentId,
          status: 'OUT_FOR_DELIVERY',
        }).select('_id');
        if (!activeOrder) {
          activeOrder = await Order.findOne({
            assignedAgent: agentId,
            status: { $in: ['ASSIGNED', 'PICKED_UP'] },
          })
            .sort({ updatedAt: -1 })
            .select('_id');
        }

        if (activeOrder) {
          const oid = String(activeOrder._id);
          io.to(`order:${oid}`).emit('agent:locationUpdate', {
            agentId,
            lat,
            lng,
            orderId: oid,
            timestamp: new Date(),
          });

          io.to('admin:dashboard').emit('agent:locationUpdate', {
            agentId,
            lat,
            lng,
            orderId: oid,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error(`Socket locationUpdate error: ${error.message}`);
      }
    });

    // Handle agent status update
    socket.on('statusUpdate', async (data) => {
      try {
        const { agentId, status } = data;

        await DeliveryAgent.findByIdAndUpdate(agentId, {
          isAvailable: status === 'available',
        });

        // Notify admin
        io.to('admin:dashboard').emit('agent:statusUpdate', {
          agentId,
          status,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Socket statusUpdate error: ${error.message}`);
      }
    });

    // Handle ping for keepalive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);

      try {
        if (socket.userType === 'agent') {
          // Get agent by socket ID and update status
          await DeliveryAgent.findOneAndUpdate(
            { socketId: socket.id },
            {
              isOnline: false,
              lastSeen: new Date(),
            }
          );
        }
      } catch (error) {
        logger.error(`Socket disconnect error: ${error.message}`);
      }
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error: ${error.message}`);
    });
  });

  // Helper functions to emit events from other parts of the app
  return {
    // Emit to specific customer
    emitToCustomer: (customerId, event, data) => {
      io.to(`customer:${customerId}`).emit(event, data);
    },

    // Emit to specific agent
    emitToAgent: (agentId, event, data) => {
      io.to(`agent:${agentId}`).emit(event, data);
    },

    // Emit to order room
    emitToOrder: (orderId, event, data) => {
      io.to(`order:${orderId}`).emit(event, data);
    },

    // Emit to all admins
    emitToAdmins: (event, data) => {
      io.to('admin:dashboard').emit(event, data);
    },

    // Emit to all agents
    emitToAllAgents: (event, data) => {
      io.in('agent:').emit(event, data);
    },

    // Get io instance
    getIO: () => io,
  };
}

// Export a function to get the socket helpers
export function getSocketHelpers(io) {
  return {
    emitToCustomer: (customerId, event, data) => {
      io.to(`customer:${customerId}`).emit(event, data);
    },
    emitToAgent: (agentId, event, data) => {
      io.to(`agent:${agentId}`).emit(event, data);
    },
    emitToOrder: (orderId, event, data) => {
      io.to(`order:${orderId}`).emit(event, data);
    },
    emitToAdmins: (event, data) => {
      io.to('admin:dashboard').emit(event, data);
    },
  };
}
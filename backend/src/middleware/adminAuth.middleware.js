import jwt from 'jsonwebtoken';

export const verifyAdminToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No admin token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    req.admin = decoded;
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin token.',
    });
  }
};

export const verifyDeliveryAgentToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No agent token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'delivery_agent') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Delivery agent privileges required.',
      });
    }

    req.agent = decoded;
    req.agentId = decoded.agentId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid agent token.',
    });
  }
};

export default { verifyAdminToken, verifyDeliveryAgentToken };
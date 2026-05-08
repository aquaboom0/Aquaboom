import express from 'express';
import {
  sendCustomerOTP,
  verifyCustomerOTP,
  registerCustomer,
  loginCustomer,
  unifiedLogin,
  refreshToken,
  getCustomerProfile,
  updateCustomerProfile,
  addCustomerAddress,
  deleteCustomerAddress,
  getCustomerAddresses,
  adminLogin,
  agentLogin,
  agentLogout,
  updateFCMToken,
  updateAdminFCMToken,
  requestPasswordResetCode,
  verifyPasswordResetCode,
  resetPasswordWithCode,
} from '../controllers/auth.controller.js';
import { verifyCustomerToken } from '../middleware/auth.middleware.js';
import { verifyAdminToken, verifyDeliveryAgentToken } from '../middleware/adminAuth.middleware.js';

const router = express.Router();

// Customer auth routes
router.post('/register', registerCustomer);
router.post('/login', unifiedLogin);
router.post('/send-otp', sendCustomerOTP);
router.post('/verify-otp', verifyCustomerOTP);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password/request-code', requestPasswordResetCode);
router.post('/forgot-password/verify-code', verifyPasswordResetCode);
router.post('/forgot-password/reset', resetPasswordWithCode);
router.get('/profile', verifyCustomerToken, getCustomerProfile);
router.put('/profile', verifyCustomerToken, updateCustomerProfile);
router.post('/address', verifyCustomerToken, addCustomerAddress);
router.get('/addresses', verifyCustomerToken, getCustomerAddresses);
router.delete('/address/:addressId', verifyCustomerToken, deleteCustomerAddress);

// Admin auth routes
router.post('/admin/login', adminLogin);

// Delivery agent auth routes
router.post('/agent/login', agentLogin);
router.post('/agent/logout', verifyDeliveryAgentToken, agentLogout);

// Update FCM token (both customer and agent)
router.patch('/fcm-token', verifyCustomerToken, updateFCMToken);
router.patch('/agent/fcm-token', verifyDeliveryAgentToken, updateFCMToken);
router.patch('/admin/fcm-token', verifyAdminToken, updateAdminFCMToken);

export default router;
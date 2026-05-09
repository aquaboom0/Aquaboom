import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import AdminPushToken from '../models/AdminPushToken.js';
import { logger } from '../config/logger.js';
import { assignNextOrderToAgent, processPendingOrders } from '../services/orderAssignment.service.js';
import { normalizeIndiaMobilePhone } from '../utils/phone.js';

// In-memory OTP storage (use Redis in production)
const otpStorage = new Map();
const passwordResetStorage = new Map();

/** Maps mongoose / JWT failures to HTTP responses (avoid opaque 500s). */
function handleCustomerAuthError(error, res, logLabel, fallbackMessage) {
  logger.error(`${logLabel}: [${error.name}] ${error.message}`, error.stack);

  if (error.code === 'JWT_CONFIG' || error.message?.includes('JWT_SECRET')) {
    return res.status(500).json({
      success: false,
      message:
        'Server misconfiguration: set JWT_SECRET (and optionally JWT_REFRESH_SECRET) in backend/.env',
    });
  }

  if (error.code === 11000) {
    const key = error.keyPattern ? Object.keys(error.keyPattern)[0] : '';
    const msg =
      key === 'email'
        ? 'An account with this email already exists.'
        : key === 'phone'
          ? 'An account with this mobile number already exists.'
          : 'This email or phone is already registered.';
    return res.status(400).json({ success: false, message: msg });
  }

  if (error.name === 'ValidationError') {
    const msg = Object.values(error.errors || {})
      .map((e) => e.message)
      .join(' ');
    return res.status(400).json({
      success: false,
      message: msg || 'Validation failed.',
    });
  }

  const mongoDown =
    error.name === 'MongoServerSelectionError' ||
    error.name === 'MongoNotConnectedError' ||
    error.name === 'MongoNetworkError' ||
    /not connected|ECONNREFUSED|Server selection timed out|topology was destroyed/i.test(
      String(error.message || '')
    );

  if (mongoDown) {
    return res.status(503).json({
      success: false,
      message:
        'Database unavailable. Start MongoDB on your machine and set MONGODB_URI in backend/.env',
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid email or account data.',
    });
  }

  if (
    error.name === 'JsonWebTokenError' ||
    /secretOrPrivateKey|must be a string|Cannot read.*jwt|sign.*failed/i.test(String(error.message || ''))
  ) {
    return res.status(500).json({
      success: false,
      message:
        'Session signing failed. Set JWT_SECRET in backend/.env (no quotes/spaces); restart the server.',
    });
  }

  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

// Generate JWT tokens (refresh can share JWT_SECRET if JWT_REFRESH_SECRET is unset)
const generateTokens = (userId, role = 'customer') => {
  const accessSecret = process.env.JWT_SECRET?.trim();
  const refreshSecret = (
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  )?.trim();

  if (!accessSecret || !refreshSecret) {
    const err = new Error('JWT_SECRET is not set in server environment');
    err.code = 'JWT_CONFIG';
    throw err;
  }

  const uid =
    userId != null && typeof userId === 'object' && typeof userId.toString === 'function'
      ? userId.toString()
      : String(userId);
  if (!uid || uid === 'undefined') {
    const err = new Error('Invalid user id for token');
    err.code = 'JWT_CONFIG';
    throw err;
  }

  const accessToken = jwt.sign({ userId: uid, role }, accessSecret, {
    expiresIn: '7d',
  });

  const refreshToken = jwt.sign(
    { userId: uid, role, type: 'refresh' },
    refreshSecret,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP (simulated - use Twilio/Firebase in production)
const sendOTP = async (phone, otp) => {
  // In production, integrate with Twilio or Firebase Auth
  logger.info(`OTP for ${phone}: ${otp}`);
  return true;
};

function normalizeEmailForReset(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function getPasswordResetExpiryMs() {
  const minutes = Number(process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES || 10);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
  return safeMinutes * 60 * 1000;
}

async function sendResetCodeEmail(email, code) {
  const appName = process.env.APP_NAME || 'AquaBoom';
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendApiKey) {
    logger.warn(
      `RESEND_API_KEY not configured. Password reset code for ${email}: ${code} (set RESEND_* env vars)`
    );
    return false;
  }
  const resendFrom = process.env.RESEND_FROM || 'AquaBoom <onboarding@resend.dev>';
  const resendTimeoutMs = Number(process.env.RESEND_TIMEOUT_MS || 18000);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resendTimeoutMs);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        subject: `${appName} password reset code`,
        text: `Your ${appName} password reset code is ${code}. It expires in ${
          Number(process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES || 10) || 10
        } minutes.`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Resend API ${response.status}: ${errBody}`);
    }
    logger.info(`Password reset email sent via Resend to ${email}`);
    return true;
  } catch (resendErr) {
    logger.error(`Resend email failed for ${email}: ${resendErr.message}`);
    return false;
  }
}

async function resolveResetAccountByEmail(email) {
  const normalizedEmail = normalizeEmailForReset(email);
  if (!normalizedEmail) return null;
  const user = await User.findOne({ email: normalizedEmail });
  if (user && (!user.role || user.role === 'customer')) {
    return { entity: user, type: 'customer' };
  }
  const agent = await DeliveryAgent.findOne({ email: normalizedEmail });
  if (agent) {
    return { entity: agent, type: 'delivery_agent' };
  }
  return null;
}

// Customer: Send OTP
export const sendCustomerOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.',
      });
    }

    // Validate phone format (Indian numbers)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format.',
      });
    }

    const otp = generateOTP();
    
    // Store OTP with 5-minute expiry
    otpStorage.set(phone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await sendOTP(phone, otp);

    // In development, return OTP in response
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.json({
      success: true,
      message: 'OTP sent successfully.',
      ...(isDevelopment && { otp }), // Only in development
    });
  } catch (error) {
    logger.error(`Send OTP error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP.',
    });
  }
};

// Customer: Verify OTP and login/register
export const verifyCustomerOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP are required.',
      });
    }

    const storedOTP = otpStorage.get(phone);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP.',
      });
    }

    if (Date.now() > storedOTP.expiresAt) {
      otpStorage.delete(phone);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    // OTP verified - clear from storage
    otpStorage.delete(phone);

    // Find or create user
    let user = await User.findOne({ phone });

    if (!user) {
      // Create new user
      user = await User.create({
        name: `User ${phone.slice(-4)}`,
        phone,
      });
      logger.info(`New user created: ${user._id}`);
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    const tokens = generateTokens(user._id, 'customer');

    res.json({
      success: true,
      message: 'Login successful.',
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        profileImage: user.profileImage,
        addresses: user.addresses,
      },
      isNewUser: user.createdAt.getTime() === user.updatedAt.getTime(),
    });
  } catch (error) {
    logger.error(`Verify OTP error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP.',
    });
  }
};

// Customer: Register with email/password
export const registerCustomer = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message:
          'Database is not connected. Start MongoDB, set MONGODB_URI in backend/.env, then restart the API.',
      });
    }

    const { name, email, password, phone: phoneRaw } = req.body;

    if (!name || !email || !password || phoneRaw === undefined || phoneRaw === '') {
      return res.status(400).json({
        success: false,
        message: 'Name, mobile number, email, and password are required.',
      });
    }

    const phone = normalizeIndiaMobilePhone(phoneRaw);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10-digit Indian mobile number (digits 6–9).',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [existingEmail, existingPhone] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      User.findOne({ phone }),
    ]);

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email.',
      });
    }

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this mobile number.',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone,
      password,
      role: 'customer',
    });

    const tokens = generateTokens(user._id, 'customer');

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses,
      },
    });
  } catch (error) {
    return handleCustomerAuthError(
      error,
      res,
      'Customer register error',
      'Failed to register customer.'
    );
  }
};

/**
 * Single entry for mobile: same email/password field; resolves admin → delivery agent → customer.
 * JWT shapes match existing middleware (admin / delivery_agent / customer generateTokens).
 */
export const unifiedLogin = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message:
          'Database is not connected. Start MongoDB, set MONGODB_URI in backend/.env, then restart the API.',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const adminUsername = String(process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'aquarush_admin_2024';

    if (normalizedEmail === adminUsername && password === adminPassword) {
      const displayUsername = process.env.ADMIN_USERNAME || adminUsername;
      const token = jwt.sign(
        { adminId: 'admin', role: 'admin', username: displayUsername },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      const user = {
        name: 'Admin',
        email: normalizedEmail,
        username: displayUsername,
        role: 'admin',
      };
      return res.json({
        success: true,
        message: 'Login successful.',
        token,
        accessToken: token,
        user,
      });
    }

    const agent = await DeliveryAgent.findOne({ email: normalizedEmail });
    if (agent) {
      if (!agent.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Contact admin.',
        });
      }
      const agentMatch = await agent.comparePassword(password);
      if (!agentMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials.',
        });
      }
      agent.lastSeen = new Date();
      await agent.save();

      const token = jwt.sign(
        { agentId: agent._id, role: 'delivery_agent' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      const user = {
        _id: agent._id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        profileImage: agent.profileImage,
        vehicleType: agent.vehicleType,
        vehicleNumber: agent.vehicleNumber,
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable,
        stats: agent.stats,
        role: 'delivery_agent',
      };
      return res.json({
        success: true,
        message: 'Login successful.',
        token,
        accessToken: token,
        user,
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (user.role && user.role !== 'customer') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message:
          'Password not set for this account. Create a password via registration or contact support.',
      });
    }

    let isMatch;
    try {
      isMatch = await user.comparePassword(password);
    } catch (bcryptErr) {
      logger.error(`comparePassword error: ${bcryptErr.message}`);
      return res.status(500).json({
        success: false,
        message:
          'Could not verify password (invalid stored hash). Try registering again or contact support.',
      });
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    const tokens = generateTokens(user._id, 'customer');

    return res.json({
      success: true,
      message: 'Login successful.',
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || 'customer',
        addresses: user.addresses,
      },
    });
  } catch (error) {
    return handleCustomerAuthError(error, res, 'Unified login error', 'Login failed.');
  }
};

// Customer: Login with email/password (kept for direct API/tests; mobile uses unifiedLogin on POST /login)
export const loginCustomer = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message:
          'Database is not connected. Start MongoDB, set MONGODB_URI in backend/.env, then restart the API.',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    // Do not require role:'customer' in the query — older docs may omit `role`;
    // { email, role: 'customer' } matches NOTHING if `role` field is missing.
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (user.role && user.role !== 'customer') {
      return res.status(401).json({
        success: false,
        message:
          'This email is registered with a role that does not use customer login.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'This account was created with phone/OTP. Use phone login with OTP, or add a password in the app after signing in with OTP.',
      });
    }

    let isMatch;
    try {
      isMatch = await user.comparePassword(password);
    } catch (bcryptErr) {
      logger.error(`comparePassword error: ${bcryptErr.message}`);
      return res.status(500).json({
        success: false,
        message:
          'Could not verify password (invalid stored hash). Use “Login with phone OTP” or register a new account.',
      });
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    const tokens = generateTokens(user._id, 'customer');

    res.json({
      success: true,
      message: 'Login successful.',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses,
      },
    });
  } catch (error) {
    return handleCustomerAuthError(
      error,
      res,
      'Customer login error',
      'Failed to login customer.'
    );
  }
};

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required.',
      });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, refreshSecret);

    if (decoded.type !== 'refresh') {
      return res.status(400).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive.',
      });
    }

    const tokens = generateTokens(user._id, decoded.role);

    res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    logger.error(`Refresh token error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token.',
    });
  }
};

export const requestPasswordResetCode = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmailForReset(email);
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const account = await resolveResetAccountByEmail(normalizedEmail);
    if (!account?.entity?.isActive) {
      return res.json({
        success: true,
        message: 'If this email is registered, a reset code has been sent.',
      });
    }

    const resetCode = generateResetCode();
    passwordResetStorage.set(normalizedEmail, {
      codeHash: hashResetCode(resetCode),
      expiresAt: Date.now() + getPasswordResetExpiryMs(),
      verifiedUntil: 0,
      accountType: account.type,
      accountId: String(account.entity._id),
      attempts: 0,
    });

    /**
     * Respond immediately — nodemailer/Gmail SMTP from cloud hosts can hang for a long time
     * (blocked egress, TLS, cold SMTP), which left the app stuck on loading. Email sends in background.
     */
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
      success: true,
      message: 'If this email is registered, a reset code has been sent.',
      ...(isDev ? { devCode: resetCode } : {}),
    });

    setImmediate(() => {
      sendResetCodeEmail(normalizedEmail, resetCode)
        .then((sent) => {
          if (sent === false) {
            logger.warn(
              `Password reset code generated for ${normalizedEmail} but email was not sent (check RESEND_* env vars).`
            );
          }
        })
        .catch((err) => {
          logger.error(`Password reset email failed for ${normalizedEmail}: ${err.message}`);
        });
    });
  } catch (error) {
    logger.error(`Request password reset code error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to send reset code.' });
  }
};

export const verifyPasswordResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmailForReset(email);
    const otpCode = String(code || '').trim();
    if (!normalizedEmail || !otpCode) {
      return res.status(400).json({ success: false, message: 'Email and code are required.' });
    }
    const record = passwordResetStorage.get(normalizedEmail);
    if (!record) {
      return res.status(400).json({ success: false, message: 'Reset code not found. Request a new code.' });
    }
    if (Date.now() > record.expiresAt) {
      passwordResetStorage.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'Reset code expired. Request a new code.' });
    }
    if (record.attempts >= 5) {
      passwordResetStorage.delete(normalizedEmail);
      return res.status(429).json({ success: false, message: 'Too many invalid attempts. Request a new code.' });
    }
    if (hashResetCode(otpCode) !== record.codeHash) {
      record.attempts += 1;
      passwordResetStorage.set(normalizedEmail, record);
      return res.status(400).json({ success: false, message: 'Invalid reset code.' });
    }
    record.verifiedUntil = Date.now() + 10 * 60 * 1000;
    passwordResetStorage.set(normalizedEmail, record);
    return res.json({ success: true, message: 'Code verified. You can now set a new password.' });
  } catch (error) {
    logger.error(`Verify password reset code error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to verify reset code.' });
  }
};

export const resetPasswordWithCode = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const normalizedEmail = normalizeEmailForReset(email);
    const password = String(newPassword || '');
    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email and new password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const record = passwordResetStorage.get(normalizedEmail);
    if (!record) {
      return res.status(400).json({ success: false, message: 'Reset session not found. Verify code first.' });
    }
    if (!record.verifiedUntil || Date.now() > record.verifiedUntil) {
      passwordResetStorage.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'Reset code verification expired. Verify again.' });
    }

    if (record.accountType === 'delivery_agent') {
      const agent = await DeliveryAgent.findOne({ _id: record.accountId, email: normalizedEmail });
      if (!agent) {
        passwordResetStorage.delete(normalizedEmail);
        return res.status(404).json({ success: false, message: 'Account not found.' });
      }
      agent.password = password;
      await agent.save();
    } else {
      const user = await User.findOne({ _id: record.accountId, email: normalizedEmail });
      if (!user) {
        passwordResetStorage.delete(normalizedEmail);
        return res.status(404).json({ success: false, message: 'Account not found.' });
      }
      user.password = password;
      await user.save();
    }

    passwordResetStorage.delete(normalizedEmail);
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    logger.error(`Reset password with code error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// Customer profile
export const getCustomerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -__v');
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

export const updateCustomerProfile = async (req, res) => {
  try {
    const { name, email, phone: phoneRaw } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();
    if (phoneRaw !== undefined && phoneRaw !== null && String(phoneRaw).trim() !== '') {
      const phone = normalizeIndiaMobilePhone(phoneRaw);
      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Enter a valid 10-digit Indian mobile number (digits 6–9).',
        });
      }
      if (phone !== user.phone) {
        const taken = await User.findOne({ phone, _id: { $ne: user._id } });
        if (taken) {
          return res.status(400).json({
            success: false,
            message: 'Another account already uses this mobile number.',
          });
        }
        user.phone = phone;
      }
    }
    await user.save();
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

export const addCustomerAddress = async (req, res) => {
  try {
    const { line1, city, pincode, landmark, label = 'Home', isDefault = false } = req.body;
    if (!line1 || !city || !pincode) {
      return res.status(400).json({ success: false, message: 'line1, city, and pincode are required.' });
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (isDefault) {
      user.addresses.forEach((a) => {
        a.isDefault = false;
      });
    }
    const newAddress = { line1, city, pincode, landmark, label, isDefault };
    user.addresses.push(newAddress);
    await user.save();
    res.status(201).json({ success: true, data: user.addresses[user.addresses.length - 1] });
  } catch (error) {
    logger.error(`Add address error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to add address.' });
  }
};

export const deleteCustomerAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    user.addresses = user.addresses.filter((a) => a._id.toString() !== addressId);
    await user.save();
    res.json({ success: true, message: 'Address deleted.' });
  } catch (error) {
    logger.error(`Delete address error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to delete address.' });
  }
};

export const getCustomerAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');
    res.json({ success: true, data: user?.addresses || [] });
  } catch (error) {
    logger.error(`Get addresses error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch addresses.' });
  }
};

// Admin login
export const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check hardcoded admin credentials
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'aquarush_admin_2024';
    const adminSecretKey = process.env.ADMIN_SECRET_KEY || 'aquarush_admin_2024';

    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.',
      });
    }

    const token = jwt.sign(
      { adminId: 'admin', role: 'admin', username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      accessToken: token,
      admin: {
        name: 'Admin',
        username,
        role: 'admin',
      },
    });
  } catch (error) {
    logger.error(`Admin login error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Admin login failed.',
    });
  }
};

// Delivery Agent login
export const agentLogin = async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    if ((!phone && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/phone and password are required.',
      });
    }

    const agent = phone
      ? await DeliveryAgent.findOne({ phone })
      : await DeliveryAgent.findOne({ email: email?.toLowerCase().trim() });

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (!agent.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Contact admin.',
      });
    }

    const isMatch = await agent.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    agent.lastSeen = new Date();
    await agent.save();

    // If this partner was set available earlier and had queued approvals waiting, attach next order now.
    if (agent.isActive && agent.isOnline && agent.isAvailable && !agent.activeOrderId) {
      try {
        await assignNextOrderToAgent(agent._id, null);
        await processPendingOrders(null);
      } catch (assignErr) {
        logger.error(`Agent login queue assign error: ${assignErr.message}`);
      }
    }

    const token = jwt.sign(
      { agentId: agent._id, role: 'delivery_agent' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      accessToken: token,
      agent: {
        _id: agent._id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        profileImage: agent.profileImage,
        vehicleType: agent.vehicleType,
        vehicleNumber: agent.vehicleNumber,
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable,
        stats: agent.stats,
      },
    });
  } catch (error) {
    logger.error(`Agent login error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Agent login failed.',
    });
  }
};

// Delivery Agent logout
export const agentLogout = async (req, res) => {
  try {
    const { agentId } = req.body;

    await DeliveryAgent.findByIdAndUpdate(agentId, {
      isOnline: false,
      isAvailable: false,
      lastSeen: new Date(),
    });

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    logger.error(`Agent logout error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Logout failed.',
    });
  }
};

// Update FCM token
export const updateFCMToken = async (req, res) => {
  try {
    const { fcmToken, userType } = req.body;
    const userId = req.userId || req.agentId;

    if (!fcmToken || !userType) {
      return res.status(400).json({
        success: false,
        message: 'FCM token and user type are required.',
      });
    }

    if (userType === 'customer') {
      await User.findByIdAndUpdate(userId, { fcmToken });
    } else if (userType === 'agent') {
      await DeliveryAgent.findByIdAndUpdate(userId, { fcmToken });
    }

    res.json({
      success: true,
      message: 'FCM token updated.',
    });
  } catch (error) {
    logger.error(`Update FCM token error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update FCM token.',
    });
  }
};

// Admin device FCM (same app, admin login — store native FCM token for order alerts)
export const updateAdminFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'fcmToken is required.',
      });
    }

    await AdminPushToken.findOneAndUpdate(
      { fcmToken: fcmToken.trim() },
      { fcmToken: fcmToken.trim() },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Admin push token saved.',
    });
  } catch (error) {
    logger.error(`Update admin FCM token error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to save admin push token.',
    });
  }
};

export default {
  sendCustomerOTP,
  verifyCustomerOTP,
  registerCustomer,
  unifiedLogin,
  loginCustomer,
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
};
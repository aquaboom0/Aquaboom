import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { getApiBaseUrlSync } from '../config/dynamicEndpoints';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    config.baseURL = getApiBaseUrlSync();
    const token = (await AsyncStorage.getItem('authToken')) || (await AsyncStorage.getItem('customerToken'));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data && typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const req = error?.config || {};
    const base = String(req.baseURL || getApiBaseUrlSync() || '');
    const isRenderHost = /\.onrender\.com/i.test(base);
    const isNetworkLevel = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error');

    /**
     * Render free services can sleep and take ~50s+ on first hit.
     * Wake once via /health and retry the original request once.
     */
    if (isRenderHost && isNetworkLevel && !req.__retriedAfterWakeup) {
      req.__retriedAfterWakeup = true;
      const origin = base.replace(/\/api\/?$/i, '');
      try {
        await axios.get(`${origin}/health`, { timeout: 90000 });
      } catch (_) {
        // Even if warm-up ping fails, retry original request once.
      }
      return api(req);
    }

    if (error.response?.status === 401) {
      AsyncStorage.multiRemove([
        'authToken',
        'authData',
        'customerToken',
        'customerData',
      ]);
    }
    return Promise.reject(error);
  }
);

function apiOriginForHealthPing() {
  const base = String(getApiBaseUrlSync() || '');
  return base.replace(/\/api\/?$/i, '');
}

async function warmRenderIfNeeded() {
  const base = String(getApiBaseUrlSync() || '');
  if (!/\.onrender\.com/i.test(base)) return;
  const origin = apiOriginForHealthPing();
  try {
    await axios.get(`${origin}/health`, { timeout: 90000 });
  } catch (_) {
    // Best effort warm-up only.
  }
}

function isTransientNetworkFailure(error) {
  if (!error || error.response) return false;
  const msg = String(error.message || '');
  const code = error.code;
  return (
    code === 'ECONNABORTED' || code === 'ERR_NETWORK' || msg === 'Network Error' || /network request failed/i.test(msg)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Multipart uploads are heavier; extra warm-up retries help Render cold starts and flaky LTE. */
async function postMultipartWithWarmRetries(urlPath, filePart) {
  const base = String(getApiBaseUrlSync() || '');
  const isRender = /\.onrender\.com/i.test(base);
  const maxAttempts = isRender ? 4 : 2;
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = String(urlPath || '').startsWith('/') ? String(urlPath) : `/${urlPath}`;
  const url = `${normalizedBase}${normalizedPath}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isRender) await warmRenderIfNeeded();
    try {
      const token =
        (await AsyncStorage.getItem('authToken')) || (await AsyncStorage.getItem('customerToken'));
      const formData = new FormData();
      formData.append('image', filePart);
      const response = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = raw ? { message: raw } : null;
      }
      if (!response.ok) {
        const err = new Error(data?.message || `Upload failed (${response.status})`);
        err.response = { status: response.status, data: data || { message: `Upload failed (${response.status})` } };
        throw err;
      }
      return { data: data || {} };
    } catch (err) {
      if (attempt >= maxAttempts || !isTransientNetworkFailure(err)) throw err;
      await sleep(isRender ? 3000 + attempt * 1500 : 1200 * attempt);
    }
  }
  throw new Error('Upload retries exhausted');
}

// Auth API
export const authAPI = {
  // Login with email/password
  login: (email, password) => api.post('/auth/login', { email, password }),

  // Admin login
  adminLogin: (email, password) => api.post('/auth/admin/login', { username: email, password }),

  // Delivery agent login
  agentLogin: (email, password) => api.post('/auth/agent/login', { email, password }),
  
  // Register
  register: (userData) => api.post('/auth/register', userData),
  
  // Get profile
  getProfile: () => api.get('/auth/profile'),
  
  // Update profile
  updateProfile: (data) => api.put('/auth/profile', data),
  
  // Add address
  addAddress: (address) => api.post('/auth/address', address),
  
  // Update address
  updateAddress: (addressId, address) => api.put(`/auth/address/${addressId}`, address),
  
  // Delete address
  deleteAddress: (addressId) => api.delete(`/auth/address/${addressId}`),
  
  // Get addresses
  getAddresses: () => api.get('/auth/addresses'),

  /** Native FCM device token — call after admin login (same unified app). */
  updateAdminFcmToken: (fcmToken) => api.patch('/auth/admin/fcm-token', { fcmToken }),

  /** Native FCM device token — call after delivery agent login. */
  updateAgentFcmToken: (fcmToken) =>
    api.patch('/auth/agent/fcm-token', { fcmToken, userType: 'agent' }),

  /** Customer device token — order milestone pushes (confirm, OFD, delivered). */
  updateCustomerFcmToken: (fcmToken) =>
    api.patch('/auth/fcm-token', { fcmToken, userType: 'customer' }),
};

// Admin API
export const adminAPI = {
  getDashboardStats: () => api.get('/admin/dashboard/stats'),
  getRangeStats: (range = 'today') => api.get('/admin/dashboard/range-stats', { params: { range } }),
  getRevenue: (days = 30) => api.get('/admin/dashboard/revenue', { params: { days } }),
  getAgents: () => api.get('/admin/agents'),
  createAgent: (data) => api.post('/admin/agents', data),
  updateAgent: (agentId, data) => api.put(`/admin/agents/${agentId}`, data),
  getOrders: (params = {}) => api.get('/admin/orders', { params }),
  getPendingApproval: () => api.get('/admin/orders/pending-approval'),
  approveOrder: (orderId) => api.post(`/admin/orders/${orderId}/approve`),
  declineOrder: (orderId, reason) => api.post(`/admin/orders/${orderId}/decline`, { reason }),
  getProducts: () => api.get('/admin/products'),
  uploadProductImage: (filePart) => postMultipartWithWarmRetries('/admin/products/upload-image', filePart),
  createProduct: (data) => api.post('/admin/products', data),
  updateProduct: (id, data) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/admin/products/${id}`),
  getAdminBanners: () => api.get('/banners/admin'),
  uploadBannerImage: (filePart) => postMultipartWithWarmRetries('/banners/upload', filePart),
  createBanner: (payload) => api.post('/banners/', payload),
  updateBanner: (bannerId, payload) => api.put(`/banners/${bannerId}`, payload),
  deleteBanner: (bannerId) => api.delete(`/banners/${bannerId}`),
};

// Delivery API
export const deliveryAPI = {
  getEarningsSummary: () => api.get('/delivery/earnings-summary'),
  getMyOrders: (params) => api.get('/delivery/my-orders', { params }),
  getDeliveryOrder: (orderId) => api.get(`/delivery/order/${orderId}`),
  getPendingApproval: () => api.get('/delivery/pending-approval'),
  approveOrder: (orderId) => api.post(`/delivery/order/${orderId}/approve`),
  declineOrder: (orderId, reason) => api.post(`/delivery/order/${orderId}/decline`, { reason }),
  getActiveOrder: () => api.get('/delivery/active-order'),
  updateOrderStatus: (orderId, status) => api.patch(`/delivery/order/${orderId}/update-status`, { status }),
  setStatus: (data) => api.patch('/delivery/status', data),
  updateLocation: (data) => api.patch('/delivery/location', data),
  /** @param {{ originLat: number|string, originLng: number|string, destLat: number|string, destLng: number|string }} params */
  getDriveRoute: (params) => api.get('/delivery/drive-route', { params }),
};

// Products API
export const productsAPI = {
  // Get all products
  getProducts: (params) => api.get('/products', { params }),
  
  // Get single product
  getProduct: (productId) => api.get(`/products/${productId}`),
  
  // Get categories
  getCategories: () => api.get('/products/categories'),
  
  // Search products
  searchProducts: (query) => api.get('/products/search', { params: { q: query } }),
};

// Orders API
export const ordersAPI = {
  // Create order
  createOrder: (orderData) => api.post('/orders/create', orderData),
  
  // Get my orders
  getMyOrders: (params) => api.get('/orders/my-orders', { params }),
  
  // Get single order
  getOrder: (orderId) => api.get(`/orders/${orderId}`),
  
  // Cancel order
  cancelOrder: (orderId) => api.post(`/orders/${orderId}/cancel`),
  
  // Verify payment
  verifyPayment: (data) => api.post('/orders/verify-payment', data),
};

// Payment API
export const paymentAPI = {
  // Create Razorpay order
  createOrder: (orderId, amount) => api.post('/payment/create-order', { orderId, amount }),
  
  // Verify payment
  verify: (data) => api.post('/payment/verify', data),
  
  // Request refund
  refund: (orderId) => api.post('/payment/refund', { orderId }),
};

// Tracking API
export const trackingAPI = {
  // Get order tracking
  getOrderTracking: (orderId) => api.get(`/tracking/order/${orderId}`),
  getOrderDriveRoute: (orderId) => api.get(`/tracking/order/${orderId}/drive-route`),
  
  // Get agent location
  getAgentLocation: (orderId) => api.get(`/tracking/agent-location/${orderId}`),
  
  // Get active orders
  getActiveOrders: () => api.get('/tracking/active-orders'),
};

// Banners API
export const bannersAPI = {
  // Get banners
  getBanners: () => api.get('/banners'),
};

export default api;
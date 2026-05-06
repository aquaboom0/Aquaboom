import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { API_URL } from '../../config';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

export const fetchDashboardStats = createAsyncThunk(
  'analytics/fetchDashboardStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/admin/analytics/dashboard');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch stats');
    }
  }
);

export const fetchRevenueAnalytics = createAsyncThunk(
  'analytics/fetchRevenueAnalytics',
  async ({ period = 'week' }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/admin/analytics/revenue?period=${period}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch revenue data');
    }
  }
);

export const fetchOrderAnalytics = createAsyncThunk(
  'analytics/fetchOrderAnalytics',
  async ({ period = 'week' }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/admin/analytics/orders?period=${period}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch order data');
    }
  }
);

export const fetchTopProducts = createAsyncThunk(
  'analytics/fetchTopProducts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/admin/analytics/top-products');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch top products');
    }
  }
);

export const fetchTopCustomers = createAsyncThunk(
  'analytics/fetchTopCustomers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/admin/analytics/top-customers');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch top customers');
    }
  }
);

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState: {
    dashboardStats: null,
    analytics: null,
    summary: {},
    revenueData: [],
    orderData: [],
    ordersData: [],
    topProducts: [],
    topCustomers: [],
    ordersByStatus: [],
    loading: false,
    error: null,
    period: 'week',
  },
  reducers: {
    setPeriod: (state, action) => {
      state.period = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.loading = false;
        state.dashboardStats = action.payload.stats;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchRevenueAnalytics.fulfilled, (state, action) => {
        state.revenueData = action.payload.data;
      })
      .addCase(fetchOrderAnalytics.fulfilled, (state, action) => {
        state.orderData = action.payload.data;
      })
      .addCase(fetchTopProducts.fulfilled, (state, action) => {
        state.topProducts = action.payload.products;
      })
      .addCase(fetchTopCustomers.fulfilled, (state, action) => {
        state.topCustomers = action.payload.customers;
      })
      .addCase(fetchAnalytics.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAnalytics.fulfilled, (state, action) => {
        state.loading = false;
        state.analytics = action.payload;
        state.summary = action.payload.summary;
        state.revenueData = action.payload.revenueData;
        state.ordersData = action.payload.ordersData;
        state.topProducts = action.payload.topProducts;
        state.ordersByStatus = action.payload.ordersByStatus;
      })
      .addCase(fetchAnalytics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

// Combined analytics fetch for Analytics page
export const fetchAnalytics = createAsyncThunk(
  'analytics/fetchAnalytics',
  async (_, { rejectWithValue }) => {
    try {
      const [statsRes, revenueRes, ordersRes, topProductsRes, statusRes] = await Promise.all([
        api.get('/admin/analytics/dashboard'),
        api.get('/admin/analytics/revenue?period=month'),
        api.get('/admin/analytics/orders?period=month'),
        api.get('/admin/analytics/top-products'),
        api.get('/admin/analytics/orders-by-status')
      ]);

      return {
        summary: statsRes.data.stats || {},
        revenueData: revenueRes.data.data || [],
        ordersData: ordersRes.data.data || [],
        topProducts: topProductsRes.data.products || [],
        ordersByStatus: statusRes.data.data || []
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }
);

export const { setPeriod, clearError } = analyticsSlice.actions;
export default analyticsSlice.reducer;
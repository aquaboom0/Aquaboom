import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ordersAPI, trackingAPI } from '../../services/api';

// Async thunks
export const createOrder = createAsyncThunk(
  'orders/createOrder',
  async (orderData, { rejectWithValue }) => {
    try {
      const response = await ordersAPI.createOrder(orderData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create order');
    }
  }
);

export const fetchMyOrders = createAsyncThunk(
  'orders/fetchMyOrders',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await ordersAPI.getMyOrders(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch orders');
    }
  }
);

export const fetchOrderDetails = createAsyncThunk(
  'orders/fetchOrderDetails',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await ordersAPI.getOrder(orderId);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch order');
    }
  }
);

export const cancelOrder = createAsyncThunk(
  'orders/cancelOrder',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await ordersAPI.cancelOrder(orderId);
      return { orderId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel order');
    }
  }
);

export const verifyPayment = createAsyncThunk(
  'orders/verifyPayment',
  async (data, { rejectWithValue }) => {
    try {
      const response = await ordersAPI.verifyPayment(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Payment verification failed');
    }
  }
);

export const fetchOrderTracking = createAsyncThunk(
  'orders/fetchOrderTracking',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await trackingAPI.getOrderTracking(orderId);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch tracking');
    }
  }
);

export const fetchActiveOrders = createAsyncThunk(
  'orders/fetchActiveOrders',
  async (_, { rejectWithValue }) => {
    try {
      const response = await trackingAPI.getActiveOrders();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch active orders');
    }
  }
);

const initialState = {
  orders: [],
  currentOrder: null,
  activeOrders: [],
  trackingInfo: null,
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
};

const orderSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentOrder: (state, action) => {
      state.currentOrder = action.payload;
    },
    setOrderStatus: (state, action) => {
      const { orderId, status, agent } = action.payload;
      const idStr = orderId != null ? String(orderId) : '';

      // Update in orders array
      const orderIndex = state.orders.findIndex((o) => String(o._id) === idStr);
      if (orderIndex !== -1) {
        state.orders[orderIndex].status = status;
        if (agent) {
          state.orders[orderIndex].assignedAgent = agent;
        }
      }
      
      // Update current order if it matches
      if (state.currentOrder && String(state.currentOrder._id) === idStr) {
        state.currentOrder.status = status;
        if (agent) {
          state.currentOrder.assignedAgent = agent;
        }
      }
      
      // Update active orders
      const activeIndex = state.activeOrders.findIndex((o) => String(o._id) === idStr);
      if (activeIndex !== -1) {
        if (status === 'DELIVERED' || status === 'CANCELLED') {
          state.activeOrders.splice(activeIndex, 1);
        } else {
          state.activeOrders[activeIndex].status = status;
        }
      }
    },
    setAgentLocation: (state, action) => {
      const { orderId, location } = action.payload;
      const loc = location
        ? { lat: Number(location.lat), lng: Number(location.lng), updatedAt: new Date() }
        : null;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;

      const idStr = orderId != null ? String(orderId) : '';

      if (state.currentOrder?.assignedAgent && String(state.currentOrder._id) === idStr) {
        state.currentOrder.assignedAgent.currentLocation = loc;
      }

      if (state.trackingInfo && String(state.trackingInfo._id ?? '') === idStr) {
        if (state.trackingInfo.agent) {
          state.trackingInfo.agent.currentLocation = loc;
        }
      }

      const activeIndex = state.activeOrders.findIndex(
        (o) => String(o._id) === idStr
      );
      if (activeIndex !== -1 && state.activeOrders[activeIndex].assignedAgent) {
        state.activeOrders[activeIndex].assignedAgent.currentLocation = loc;
      }
    },
    clearCurrentOrder: (state) => {
      state.currentOrder = null;
      state.trackingInfo = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create order
      .addCase(createOrder.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload.order;
        if (action.payload.assignedAgent) {
          state.currentOrder.assignedAgent = action.payload.assignedAgent;
        }
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Fetch my orders
      .addCase(fetchMyOrders.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchMyOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchMyOrders.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Fetch order details
      .addCase(fetchOrderDetails.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchOrderDetails.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
      })
      .addCase(fetchOrderDetails.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Cancel order
      .addCase(cancelOrder.fulfilled, (state, action) => {
        const { orderId } = action.payload;
        const index = state.orders.findIndex(o => o._id === orderId);
        if (index !== -1) {
          state.orders[index].status = 'CANCELLED';
        }
        if (state.currentOrder?._id === orderId) {
          state.currentOrder.status = 'CANCELLED';
        }
      })
      // Verify payment
      .addCase(verifyPayment.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(verifyPayment.fulfilled, (state, action) => {
        state.isLoading = false;
        if (state.currentOrder) {
          state.currentOrder.paymentStatus = 'PAID';
          state.currentOrder.status = 'PENDING_APPROVAL';
          state.currentOrder.assignedAgent = action.payload?.assignedAgent || null;
        }
      })
      .addCase(verifyPayment.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Fetch order tracking
      .addCase(fetchOrderTracking.fulfilled, (state, action) => {
        state.trackingInfo = action.payload;
      })
      // Fetch active orders
      .addCase(fetchActiveOrders.fulfilled, (state, action) => {
        state.activeOrders = action.payload;
      });
  },
});

export const { 
  clearError, 
  setCurrentOrder, 
  setOrderStatus, 
  setAgentLocation,
  clearCurrentOrder 
} = orderSlice.actions;

export default orderSlice.reducer;
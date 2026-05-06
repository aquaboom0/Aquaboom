import { createSlice } from '@reduxjs/toolkit';
import { createAsyncThunk } from '@reduxjs/toolkit';
import socketService from '../../services/socket';

export const connectSocket = createAsyncThunk(
  'socket/connectSocket',
  async (orderId, { getState }) => {
    const state = getState();
    const token = state.auth?.token;
    const user = state.auth?.user;
    const role = state.auth?.role || user?.role || 'customer';
    const socketRole =
      role === 'delivery_agent' ? 'agent' : role === 'admin' ? 'admin' : 'customer';
    let userId = user?._id || user?.agentId;
    if (role === 'admin') userId = 'admin';
    if (!userId) userId = 'unknown';

    if (!token) return false;

    socketService.connect(token, socketRole, userId);
    if (orderId) {
      socketService.joinOrderRoom(orderId);
    }
    return true;
  }
);

export const disconnectSocket = createAsyncThunk(
  'socket/disconnectSocket',
  async (orderId) => {
    if (orderId) {
      socketService.leaveOrderRoom(orderId);
    }
    socketService.disconnect();
    return true;
  }
);

const initialState = {
  isConnected: false,
  currentOrderId: null,
  driverLocation: null,
  orderStatus: null,
};

const socketSlice = createSlice({
  name: 'socket',
  initialState,
  reducers: {
    setConnected: (state, action) => {
      state.isConnected = action.payload;
    },
    setCurrentOrderId: (state, action) => {
      state.currentOrderId = action.payload;
    },
    updateDriverLocation: (state, action) => {
      state.driverLocation = action.payload;
    },
    updateOrderStatus: (state, action) => {
      state.orderStatus = action.payload;
    },
    clearSocketData: (state) => {
      state.isConnected = false;
      state.currentOrderId = null;
      state.driverLocation = null;
      state.orderStatus = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(connectSocket.fulfilled, (state) => {
        state.isConnected = true;
      })
      .addCase(connectSocket.rejected, (state) => {
        state.isConnected = false;
      })
      .addCase(disconnectSocket.fulfilled, (state) => {
        state.isConnected = false;
      });
  },
});

export const {
  setConnected,
  setCurrentOrderId,
  updateDriverLocation,
  updateOrderStatus,
  clearSocketData,
} = socketSlice.actions;

export default socketSlice.reducer;
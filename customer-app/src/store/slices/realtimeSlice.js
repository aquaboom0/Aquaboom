import { createSlice } from '@reduxjs/toolkit';

/** Bumped when admin/agent should refresh approval queues (socket events). */
const realtimeSlice = createSlice({
  name: 'realtime',
  initialState: {
    staffRefreshToken: 0,
    customerOrderRefreshToken: 0,
    orderActivityBanner: null,
  },
  reducers: {
    bumpStaffRefresh: (state) => {
      state.staffRefreshToken += 1;
    },
    bumpCustomerOrdersRefresh: (state) => {
      state.customerOrderRefreshToken += 1;
    },
    showOrderActivityBanner: (state, action) => {
      const { title, subtitle, accent, orderId, orderRef } = action.payload;
      state.orderActivityBanner = {
        key: `${orderId || 'o'}-${Date.now()}`,
        title: title || 'Order update',
        subtitle: subtitle || '',
        accent: accent || 'teal',
        orderId,
        orderRef,
      };
    },
    dismissOrderActivityBanner: (state) => {
      state.orderActivityBanner = null;
    },
  },
});

export const {
  bumpStaffRefresh,
  bumpCustomerOrdersRefresh,
  showOrderActivityBanner,
  dismissOrderActivityBanner,
} = realtimeSlice.actions;
export default realtimeSlice.reducer;

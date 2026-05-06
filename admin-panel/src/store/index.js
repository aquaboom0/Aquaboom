import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import orderReducer from './slices/orderSlice';
import customerReducer from './slices/customerSlice';
import agentReducer from './slices/agentSlice';
import productReducer from './slices/productSlice';
import analyticsReducer from './slices/analyticsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    orders: orderReducer,
    customers: customerReducer,
    agents: agentReducer,
    products: productReducer,
    analytics: analyticsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
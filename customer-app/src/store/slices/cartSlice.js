import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  items: [],
  totalItems: 0,
  subtotal: 0,
  deliveryCharge: 30,
  freeDeliveryThreshold: 299,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart: (state, action) => {
      const payload = action.payload || {};
      const product = payload.product || payload;
      const quantity = payload.quantity ?? 1;
      if (!product?._id) return;
      const existingItem = state.items.find(item => item.product._id === product._id);

      if (existingItem) {
        existingItem.quantity += quantity;
        if (existingItem.quantity <= 0) {
          state.items = state.items.filter(item => item.product._id !== product._id);
        }
      } else {
        if (quantity > 0) {
          state.items.push({ product, quantity });
        }
      }

      // Recalculate totals
      state.totalItems = state.items.reduce((total, item) => total + item.quantity, 0);
      state.subtotal = state.items.reduce(
        (total, item) => total + (item.product.pricePerUnit * item.quantity),
        0
      );
      
      // Calculate delivery charge
      state.deliveryCharge = state.subtotal >= state.freeDeliveryThreshold ? 0 : 30;
    },

    removeFromCart: (state, action) => {
      const productId = action.payload;
      state.items = state.items.filter(item => item.product._id !== productId);

      // Recalculate totals
      state.totalItems = state.items.reduce((total, item) => total + item.quantity, 0);
      state.subtotal = state.items.reduce(
        (total, item) => total + (item.product.pricePerUnit * item.quantity),
        0
      );
      
      // Calculate delivery charge
      state.deliveryCharge = state.subtotal >= state.freeDeliveryThreshold ? 0 : 30;
    },

    updateQuantity: (state, action) => {
      const { productId, quantity } = action.payload;
      const item = state.items.find(item => item.product._id === productId);

      if (item) {
        if (quantity <= 0) {
          state.items = state.items.filter(i => i.product._id !== productId);
        } else {
          item.quantity = quantity;
        }
      }

      // Recalculate totals
      state.totalItems = state.items.reduce((total, item) => total + item.quantity, 0);
      state.subtotal = state.items.reduce(
        (total, item) => total + (item.product.pricePerUnit * item.quantity),
        0
      );
      
      // Calculate delivery charge
      state.deliveryCharge = state.subtotal >= state.freeDeliveryThreshold ? 0 : 30;
    },

    clearCart: (state) => {
      state.items = [];
      state.totalItems = 0;
      state.subtotal = 0;
      state.deliveryCharge = 30;
    },

    setFreeDeliveryThreshold: (state, action) => {
      state.freeDeliveryThreshold = action.payload;
      // Recalculate delivery charge
      state.deliveryCharge = state.subtotal >= state.freeDeliveryThreshold ? 0 : 30;
    },
  },
});

export const { 
  addToCart, 
  removeFromCart, 
  updateQuantity, 
  clearCart,
  setFreeDeliveryThreshold 
} = cartSlice.actions;

export const selectCartItems = (state) => state.cart.items;
export const selectCartTotalItems = (state) => state.cart.totalItems;
export const selectCartSubtotal = (state) => state.cart.subtotal;
export const selectCartDeliveryCharge = (state) => state.cart.deliveryCharge;
export const selectCartTotal = (state) => state.cart.subtotal + state.cart.deliveryCharge;

export default cartSlice.reducer;
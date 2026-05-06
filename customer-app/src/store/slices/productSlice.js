import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';

const normalizeProduct = (p = {}) => {
  const rawImg =
    p.image ||
    p.imageUrl ||
    (Array.isArray(p.images) && p.images.length ? p.images[0] : null);
  const resolvedImg = rawImg ? resolveMediaUrl(rawImg) : '';
  return {
    ...p,
    image: resolvedImg || null,
    price: p.price ?? p.pricePerUnit ?? 0,
    originalPrice: p.originalPrice ?? p.mrp ?? p.pricePerUnit ?? 0,
    inStock: typeof p.inStock === 'boolean' ? p.inStock : (p.stock ?? 0) > 0,
  };
};

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/products');
      const list = response.data?.data || response.data?.products || [];
      return list.map(normalizeProduct);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch products');
    }
  }
);

export const fetchProductById = createAsyncThunk(
  'products/fetchProductById',
  async (productId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/products/${productId}`);
      return normalizeProduct(response.data?.data || response.data?.product);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch product');
    }
  }
);

export const fetchProductsByCategory = createAsyncThunk(
  'products/fetchProductsByCategory',
  async (category, { rejectWithValue }) => {
    try {
      const response = await api.get(`/products?category=${category}`);
      const list = response.data?.data || response.data?.products || [];
      return list.map(normalizeProduct);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch products');
    }
  }
);

const initialState = {
  products: [],
  currentProduct: null,
  loading: false,
  error: null,
  categories: [
    { id: '1', name: 'Water Cans', icon: '🧴', key: 'can' },
    { id: '2', name: 'Bottles', icon: '🍾', key: 'bottle' },
    { id: '3', name: 'Dispensers', icon: '💧', key: 'dispenser' },
    { id: '4', name: 'Accessories', icon: '🎁', key: 'accessory' },
  ],
};

const productSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    clearCurrentProduct: (state) => {
      state.currentProduct = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Products
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch Product By ID
      .addCase(fetchProductById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentProduct = action.payload;
      })
      .addCase(fetchProductById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch Products By Category
      .addCase(fetchProductsByCategory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProductsByCategory.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload;
      })
      .addCase(fetchProductsByCategory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearCurrentProduct, clearError } = productSlice.actions;
export default productSlice.reducer;
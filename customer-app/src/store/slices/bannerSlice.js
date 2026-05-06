import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';

export const fetchBanners = createAsyncThunk(
  'banners/fetchBanners',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/banners');
      const list = response.data?.data || response.data?.banners || [];
      return list.map((b) => {
        const raw = b.imageUrl || b.image;
        return {
          ...b,
          image: raw,
          imageUrl: raw,
          resolvedUrl: resolveMediaUrl(raw),
        };
      });
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch banners');
    }
  }
);

const initialState = {
  banners: [],
  loading: false,
  error: null,
};

const bannerSlice = createSlice({
  name: 'banners',
  initialState,
  reducers: {
    clearBanners: (state) => {
      state.banners = [];
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBanners.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBanners.fulfilled, (state, action) => {
        state.loading = false;
        state.banners = action.payload;
      })
      .addCase(fetchBanners.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearBanners, clearError } = bannerSlice.actions;
export default bannerSlice.reducer;
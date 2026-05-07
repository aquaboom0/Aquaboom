import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { API_URL } from '../../config';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

export const fetchBanners = createAsyncThunk(
  'banners/fetchBanners',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/banners/admin');
      return response.data.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch banners');
    }
  }
);

export const uploadBannerImage = createAsyncThunk(
  'banners/uploadImage',
  async (file, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await api.post('/banners/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload image');
    }
  }
);

export const createBanner = createAsyncThunk(
  'banners/createBanner',
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post('/banners', data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create banner');
    }
  }
);

export const updateBanner = createAsyncThunk(
  'banners/updateBanner',
  async ({ bannerId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/banners/${bannerId}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update banner');
    }
  }
);

export const deleteBanner = createAsyncThunk(
  'banners/deleteBanner',
  async (bannerId, { rejectWithValue }) => {
    try {
      await api.delete(`/banners/${bannerId}`);
      return bannerId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete banner');
    }
  }
);

export const reorderBanners = createAsyncThunk(
  'banners/reorderBanners',
  async (bannerIds, { rejectWithValue }) => {
    try {
      const response = await api.post('/banners/reorder', { bannerIds });
      return response.data.data || bannerIds;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reorder banners');
    }
  }
);

const bannerSlice = createSlice({
  name: 'banners',
  initialState: {
    banners: [],
    loading: false,
    error: null,
    uploadingImage: false,
    uploadedImage: null,
  },
  reducers: {
    clearUploadedImage: (state) => {
      state.uploadedImage = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch banners
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
      })

      // Upload image
      .addCase(uploadBannerImage.pending, (state) => {
        state.uploadingImage = true;
        state.error = null;
      })
      .addCase(uploadBannerImage.fulfilled, (state, action) => {
        state.uploadingImage = false;
        state.uploadedImage = action.payload;
      })
      .addCase(uploadBannerImage.rejected, (state, action) => {
        state.uploadingImage = false;
        state.error = action.payload;
      })

      // Create banner
      .addCase(createBanner.fulfilled, (state, action) => {
        state.banners.push(action.payload);
        state.uploadedImage = null;
      })
      .addCase(createBanner.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Update banner
      .addCase(updateBanner.fulfilled, (state, action) => {
        const index = state.banners.findIndex(b => b._id === action.payload._id);
        if (index !== -1) {
          state.banners[index] = action.payload;
        }
        state.uploadedImage = null;
      })
      .addCase(updateBanner.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Delete banner
      .addCase(deleteBanner.fulfilled, (state, action) => {
        state.banners = state.banners.filter(b => b._id !== action.payload);
      })
      .addCase(deleteBanner.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Reorder banners
      .addCase(reorderBanners.fulfilled, (state, action) => {
        const idOrder = action.payload;
        state.banners.sort((a, b) => idOrder.indexOf(a._id) - idOrder.indexOf(b._id));
      });
  },
});

export const { clearUploadedImage, clearError } = bannerSlice.actions;
export default bannerSlice.reducer;

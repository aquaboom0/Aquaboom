import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../../services/api';
import { getAuthErrorMessage } from '../../utils/authErrors';

// Async thunks
export const loginWithPassword = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(email, password);
      const data = response.data;
      const token = data.token ?? data.accessToken;
      const user = data.user;

      if (!token || !user) {
        return rejectWithValue('Invalid response from server');
      }

      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('authData', JSON.stringify(user));
      
      return { token, user };
    } catch (error) {
      return rejectWithValue(getAuthErrorMessage(error, 'Email/password login failed'));
    }
  }
);

/** Backend POST /auth/login resolves admin → agent → customer from email/password alone. */
export const loginUnified = createAsyncThunk(
  'auth/loginUnified',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(email, password);
      const data = response.data;
      const token = data.token ?? data.accessToken;
      const userRaw = data.user;
      const user = userRaw
        ? {
            ...userRaw,
            role: userRaw.role || 'customer',
          }
        : null;

      if (!token || !user) {
        return rejectWithValue('Invalid response from server');
      }

      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('authData', JSON.stringify(user));

      return { token, user };
    } catch (error) {
      return rejectWithValue(getAuthErrorMessage(error, 'Login failed'));
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authAPI.register(userData);
      const token = response.data.token ?? response.data.accessToken;
      const user = response.data.user;
      if (!token || !user) {
        return rejectWithValue('Invalid response from server');
      }
      
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('authData', JSON.stringify({ ...user, role: user.role || 'customer' }));
      
      return { token, user };
    } catch (error) {
      return rejectWithValue(getAuthErrorMessage(error, 'Registration failed'));
    }
  }
);

export const loadUser = createAsyncThunk(
  'auth/loadUser',
  async (_, { rejectWithValue }) => {
    try {
      const token = (await AsyncStorage.getItem('authToken')) || (await AsyncStorage.getItem('customerToken'));
      const userData = (await AsyncStorage.getItem('authData')) || (await AsyncStorage.getItem('customerData'));
      
      if (!token || !userData) {
        return rejectWithValue('No token found');
      }
      
      const user = JSON.parse(userData);
      return { token, user };
    } catch (error) {
      return rejectWithValue('Failed to load user');
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('authData');
    await AsyncStorage.removeItem('customerToken');
    await AsyncStorage.removeItem('customerData');
    return null;
  }
);

export const fetchProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authAPI.getProfile();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch profile');
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authAPI.updateProfile(data);
      const existingRaw = (await AsyncStorage.getItem('authData')) || (await AsyncStorage.getItem('customerData'));
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      const merged = { ...existing, ...(response.data.data || {}) };
      await AsyncStorage.setItem('authData', JSON.stringify(merged));
      await AsyncStorage.setItem('customerData', JSON.stringify(merged));
      return merged;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update profile');
    }
  }
);

export const addAddress = createAsyncThunk(
  'auth/addAddress',
  async (address, { rejectWithValue }) => {
    try {
      const response = await authAPI.addAddress(address);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add address');
    }
  }
);

export const deleteAddress = createAsyncThunk(
  'auth/deleteAddress',
  async (addressId, { rejectWithValue }) => {
    try {
      await authAPI.deleteAddress(addressId);
      return addressId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete address');
    }
  }
);

const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  addresses: [],
  role: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    syncAgentFleetStatus: (state, action) => {
      if (!state.user || state.role !== 'delivery_agent') return;
      const { isOnline, isAvailable } = action.payload || {};
      if (typeof isOnline === 'boolean') state.user.isOnline = isOnline;
      if (typeof isAvailable === 'boolean') state.user.isAvailable = isAvailable;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login with password
      .addCase(loginWithPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user?.role || 'customer';
      })
      .addCase(loginWithPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(loginUnified.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUnified.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user?.role || 'customer';
      })
      .addCase(loginUnified.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      
      // Register
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user?.role || 'customer';
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Load user
      .addCase(loadUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user?.role || 'customer';
      })
      .addCase(loadUser.rejected, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.token = null;
        state.user = null;
        state.role = null;
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.token = null;
        state.user = null;
        state.role = null;
        state.addresses = [];
      })
      // Fetch profile
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.addresses = action.payload.addresses || [];
      })
      // Update profile
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      // Add address
      .addCase(addAddress.fulfilled, (state, action) => {
        state.addresses.push(action.payload);
      })
      // Delete address
      .addCase(deleteAddress.fulfilled, (state, action) => {
        state.addresses = state.addresses.filter(addr => addr._id !== action.payload);
      });
  },
});

export const { clearError, syncAgentFleetStatus } = authSlice.actions;
export default authSlice.reducer;
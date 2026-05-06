import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { API_URL } from '../../config';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

export const fetchAgents = createAsyncThunk(
  'agents/fetchAgents',
  async ({ page = 1, status, search, limit = 20 }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', limit);
      if (status) params.append('status', status);
      if (search) params.append('search', search);
      
      const response = await api.get(`/admin/agents?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch agents');
    }
  }
);

export const fetchAgentById = createAsyncThunk(
  'agents/fetchAgentById',
  async (agentId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/admin/agents/${agentId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch agent');
    }
  }
);

export const updateAgentStatus = createAsyncThunk(
  'agents/updateAgentStatus',
  async ({ agentId, isActive }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/admin/agents/${agentId}/status`, { isActive });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update agent');
    }
  }
);

export const updateAgent = createAsyncThunk(
  'agents/updateAgent',
  async ({ agentId, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/admin/agents/${agentId}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update agent');
    }
  }
);

const agentSlice = createSlice({
  name: 'agents',
  initialState: {
    agents: [],
    currentAgent: null,
    totalPages: 1,
    currentPage: 1,
    loading: false,
    error: null,
    filters: {
      status: '',
      search: '',
    },
  },
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearCurrentAgent: (state) => {
      state.currentAgent = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAgents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAgents.fulfilled, (state, action) => {
        state.loading = false;
        state.agents = action.payload.agents;
        state.totalPages = action.payload.totalPages;
        state.currentPage = action.payload.currentPage;
      })
      .addCase(fetchAgents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchAgentById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAgentById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentAgent = action.payload.agent;
      })
      .addCase(fetchAgentById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateAgentStatus.fulfilled, (state, action) => {
        const index = state.agents.findIndex(a => a._id === action.payload.agent._id);
        if (index !== -1) {
          state.agents[index] = action.payload.agent;
        }
        if (state.currentAgent?._id === action.payload.agent._id) {
          state.currentAgent = action.payload.agent;
        }
      })
      .addCase(updateAgent.fulfilled, (state, action) => {
        const index = state.agents.findIndex(a => a._id === action.payload.agent._id);
        if (index !== -1) {
          state.agents[index] = action.payload.agent;
        }
        if (state.currentAgent?._id === action.payload.agent._id) {
          state.currentAgent = action.payload.agent;
        }
      });
  },
});

export const { setFilters, clearCurrentAgent, clearError } = agentSlice.actions;
export default agentSlice.reducer;
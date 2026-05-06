// API Configuration
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Colors
export const COLORS = {
  primary: '#0077B6',
  primaryLight: '#00B4D8',
  secondary: '#90E0EF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textLight: '#64748B',
  border: '#E2E8F0',
  sidebar: '#0F172A',
  sidebarHover: '#1E293B',
};

// Order Status
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_COLORS = {
  pending: '#F59E0B',
  confirmed: '#0077B6',
  assigned: '#8B5CF6',
  picked_up: '#F59E0B',
  in_transit: '#00B4D8',
  delivered: '#10B981',
  cancelled: '#EF4444',
};

// Pagination
export const PAGE_SIZE = 20;
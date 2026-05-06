import { io } from 'socket.io-client';
import { getSocketUrlSync } from '../config/dynamicEndpoints';
import { store } from '../store';
import { setOrderStatus, setAgentLocation } from '../store/slices/orderSlice';
import {
  bumpStaffRefresh,
  bumpCustomerOrdersRefresh,
  showOrderActivityBanner,
} from '../store/slices/realtimeSlice';
import { accentForStatus } from '../utils/orderActivityAccent';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.lastKey = null;
  }

  sessionKey(token, userType, userId) {
    return `${userType}:${userId}:${token?.slice?.(-8) || ''}`;
  }

  connect(token, userType = 'customer', userId) {
    const key = this.sessionKey(token, userType, userId);
    if (this.socket && this.lastKey === key && this.socket.connected) {
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.lastKey = key;

    this.socket = io(getSocketUrlSync(), {
      auth: { token },
      query: { userType },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.socket.emit('join', userId);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
    });

    this.socket.on('connect_error', () => {});

    this.setupEventListeners();
  }

  dispatchOrderBanner(payload, status) {
    const st = status || payload?.status;
    const title =
      payload?.title ||
      (st ? st.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Order update');
    const subtitle = payload?.subtitle || '';
    if (!title && !subtitle) return;
    store.dispatch(
      showOrderActivityBanner({
        title,
        subtitle,
        accent: accentForStatus(st),
        orderId: payload.orderId,
        orderRef: payload.orderRef || payload.orderIdHuman,
      })
    );
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('order:assigned', (data) => {
      store.dispatch(
        setOrderStatus({
          orderId: data.order?._id,
          status: 'ASSIGNED',
          agent: data.agent,
        })
      );
      this.dispatchOrderBanner(
        {
          title: data.title,
          subtitle: data.subtitle,
          orderId: data.order?._id,
          orderRef: data.order?.orderId,
          status: 'ASSIGNED',
        },
        'ASSIGNED'
      );
      store.dispatch(bumpCustomerOrdersRefresh());
    });

    this.socket.on('order:statusUpdate', (data) => {
      store.dispatch(
        setOrderStatus({
          orderId: data.orderId,
          status: data.status,
        })
      );
      this.dispatchOrderBanner(data, data.status);
      store.dispatch(bumpCustomerOrdersRefresh());
    });

    this.socket.on('order:delivered', (data) => {
      store.dispatch(
        setOrderStatus({
          orderId: data.orderId,
          status: 'DELIVERED',
        })
      );
      this.dispatchOrderBanner(
        {
          title: data.title,
          subtitle: data.subtitle,
          orderId: data.orderId,
          orderRef: data.orderRef,
          status: 'DELIVERED',
        },
        'DELIVERED'
      );
      store.dispatch(bumpCustomerOrdersRefresh());
    });

    this.socket.on('order:approvalResult', (data) => {
      store.dispatch(
        setOrderStatus({
          orderId: data.orderId,
          status: data.status,
          agent: data.assignedAgent,
        })
      );
      if (data.approved === false) {
        this.dispatchOrderBanner(
          {
            title: data.title,
            subtitle: data.subtitle || data.reason,
            orderId: data.orderId,
            orderRef: data.orderIdHuman,
            status: 'CANCELLED',
          },
          'CANCELLED'
        );
      } else {
        this.dispatchOrderBanner(
          {
            title: data.title,
            subtitle: data.subtitle,
            orderId: data.orderId,
            orderRef: data.orderIdHuman,
            status: data.status,
          },
          data.status
        );
      }
      store.dispatch(bumpCustomerOrdersRefresh());
    });

    this.socket.on('agent:locationUpdate', (data) => {
      store.dispatch(
        setAgentLocation({
          orderId: data.orderId,
          location: { lat: data.lat, lng: data.lng },
        })
      );
    });

    this.socket.on('no_agent_available', () => {});

    /** Partner availability / online toggled (HTTP PATCH /delivery/status or legacy socket). */
    this.socket.on('agent:fleetUpdate', () => {
      store.dispatch(bumpStaffRefresh());
    });

    this.socket.on('agent:statusUpdate', () => {
      store.dispatch(bumpStaffRefresh());
    });

    this.socket.on('order:pendingApproval', () => {
      store.dispatch(bumpStaffRefresh());
    });

    this.socket.on('order:pendingResolved', () => {
      store.dispatch(bumpStaffRefresh());
    });
  }

  joinOrderRoom(orderId) {
    if (this.socket?.connected) {
      this.socket.emit('joinOrder', orderId);
    }
  }

  leaveOrderRoom(orderId) {
    if (this.socket?.connected) {
      this.socket.emit('leaveOrder', orderId);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.lastKey = null;
  }

  getSocket() {
    return this.socket;
  }

  isSocketConnected() {
    return this.isConnected;
  }
}

export const socketService = new SocketService();
export default socketService;

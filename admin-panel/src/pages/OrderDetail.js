import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  User, 
  Package,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { fetchOrderById, updateOrderStatus, assignAgent } from '../store/slices/orderSlice';
import { fetchAgents } from '../store/slices/agentSlice';
import { COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../config';
import './OrderDetail.css';

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, loading } = useSelector(state => state.orders);
  const { agents } = useSelector(state => state.agents);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');

  useEffect(() => {
    dispatch(fetchOrderById(id));
    dispatch(fetchAgents({ status: 'online', limit: 50 }));
  }, [dispatch, id]);

  const handleStatusUpdate = (status) => {
    dispatch(updateOrderStatus({ orderId: id, status }));
  };

  const handleAssignAgent = () => {
    if (selectedAgent) {
      dispatch(assignAgent({ orderId: id, agentId: selectedAgent }));
      setShowAgentModal(false);
      setSelectedAgent('');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delivered': return <CheckCircle size={18} />;
      case 'cancelled': return <XCircle size={18} />;
      default: return <Clock size={18} />;
    }
  };

  const statusFlow = ['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered'];

  if (loading || !currentOrder) {
    return <div className="order-detail-loading">Loading order details...</div>;
  }

  return (
    <div className="order-detail-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/orders')}>
          <ArrowLeft size={20} />
          Back to Orders
        </button>
        <div className="header-content">
          <h1>Order #{currentOrder.orderId?.slice(-6) || currentOrder._id.slice(-6)}</h1>
          <span 
            className="status-badge"
            style={{ 
              background: `${ORDER_STATUS_COLORS[currentOrder.status]}20`,
              color: ORDER_STATUS_COLORS[currentOrder.status]
            }}
          >
            {ORDER_STATUS_LABELS[currentOrder.status]}
          </span>
        </div>
      </div>

      <div className="order-detail-grid">
        {/* Order Info */}
        <div className="detail-card">
          <h3><Package size={18} /> Order Information</h3>
          <div className="detail-row">
            <span className="label">Order ID</span>
            <span className="value">{currentOrder.orderId}</span>
          </div>
          <div className="detail-row">
            <span className="label">Date</span>
            <span className="value">{new Date(currentOrder.createdAt).toLocaleString()}</span>
          </div>
          <div className="detail-row">
            <span className="label">Payment Method</span>
            <span className="value capitalize">{currentOrder.paymentMethod || 'Online'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Payment Status</span>
            <span className={`value status ${currentOrder.paymentStatus}`}>
              {currentOrder.paymentStatus}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="detail-card">
          <h3><User size={18} /> Customer Details</h3>
          <div className="detail-row">
            <span className="label">Name</span>
            <span className="value">{currentOrder.customer?.name || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Phone</span>
            <span className="value">{currentOrder.customer?.phone || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Address</span>
            <span className="value">
              {currentOrder.deliveryAddress?.address || 'N/A'}
            </span>
          </div>
        </div>

        {/* Delivery Agent */}
        <div className="detail-card">
          <h3><Truck size={18} /> Delivery Agent</h3>
          {currentOrder.assignedAgent ? (
            <div className="agent-info">
              <div className="agent-avatar">
                {currentOrder.assignedAgent.name?.charAt(0) || 'A'}
              </div>
              <div className="agent-details">
                <span className="agent-name">{currentOrder.assignedAgent.name}</span>
                <span className="agent-phone">{currentOrder.assignedAgent.phone}</span>
              </div>
            </div>
          ) : (
            <div className="no-agent">
              <AlertCircle size={20} />
              <span>No agent assigned</span>
              <button 
                className="assign-btn"
                onClick={() => setShowAgentModal(true)}
              >
                Assign Agent
              </button>
            </div>
          )}
        </div>

        {/* Order Items */}
        <div className="detail-card items-card">
          <h3><Package size={18} /> Order Items</h3>
          <div className="items-list">
            {currentOrder.items?.map((item, index) => (
              <div key={index} className="item-row">
                <div className="item-info">
                  <span className="item-name">{item.product?.name || 'Product'}</span>
                  <span className="item-qty">x{item.quantity}</span>
                </div>
                <span className="item-price">₹{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="order-total">
            <span>Total</span>
            <span className="total-amount">₹{currentOrder.totalAmount}</span>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="detail-card timeline-card">
          <h3>Order Timeline</h3>
          <div className="timeline">
            {statusFlow.map((status, index) => {
              const currentIndex = statusFlow.indexOf(currentOrder.status);
              const isCompleted = index <= currentIndex;
              const isCurrent = status === currentOrder.status;
              
              return (
                <div 
                  key={status} 
                  className={`timeline-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div className="timeline-dot">
                    {isCompleted && getStatusIcon(status)}
                  </div>
                  <div className="timeline-content">
                    <span className="timeline-label">{ORDER_STATUS_LABELS[status]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="detail-card actions-card">
          <h3>Actions</h3>
          <div className="actions-list">
            {currentOrder.status === 'pending' && (
              <button 
                className="action-btn confirm"
                onClick={() => handleStatusUpdate('confirmed')}
              >
                Confirm Order
              </button>
            )}
            {currentOrder.status === 'confirmed' && !currentOrder.assignedAgent && (
              <button 
                className="action-btn assign"
                onClick={() => setShowAgentModal(true)}
              >
                Assign Agent
              </button>
            )}
            {currentOrder.status === 'assigned' && (
              <button 
                className="action-btn pickup"
                onClick={() => handleStatusUpdate('picked_up')}
              >
                Mark as Picked Up
              </button>
            )}
            {currentOrder.status === 'picked_up' && (
              <button 
                className="action-btn transit"
                onClick={() => handleStatusUpdate('in_transit')}
              >
                Mark as In Transit
              </button>
            )}
            {currentOrder.status === 'in_transit' && (
              <button 
                className="action-btn deliver"
                onClick={() => handleStatusUpdate('delivered')}
              >
                Mark as Delivered
              </button>
            )}
            {['pending', 'confirmed'].includes(currentOrder.status) && (
              <button 
                className="action-btn cancel"
                onClick={() => handleStatusUpdate('cancelled')}
              >
                Cancel Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Agent Assignment Modal */}
      {showAgentModal && (
        <div className="modal-overlay" onClick={() => setShowAgentModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Assign Delivery Agent</h3>
            <select 
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="">Select an agent</option>
              {agents.map(agent => (
                <option key={agent._id} value={agent._id}>
                  {agent.name} - {agent.phone}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowAgentModal(false)}>
                Cancel
              </button>
              <button 
                className="confirm-btn" 
                onClick={handleAssignAgent}
                disabled={!selectedAgent}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetail;
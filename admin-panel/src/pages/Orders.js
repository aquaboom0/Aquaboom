import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Search, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { fetchOrders, setFilters } from '../store/slices/orderSlice';
import { COLORS, ORDER_STATUS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../config';
import './Orders.css';

const Orders = () => {
  const dispatch = useDispatch();
  const { orders, totalPages, currentPage, loading, filters } = useSelector(state => state.orders);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    dispatch(fetchOrders({ page: 1, status: statusFilter, search: searchTerm }));
  }, [dispatch, statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(fetchOrders({ page: 1, status: statusFilter, search: searchTerm }));
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      dispatch(fetchOrders({ page, status: statusFilter, search: searchTerm }));
    }
  };

  const statusOptions = Object.keys(ORDER_STATUS).map(key => ({
    value: ORDER_STATUS[key],
    label: ORDER_STATUS_LABELS[ORDER_STATUS[key]]
  }));

  return (
    <div className="orders-page">
      <div className="page-header">
        <h1>Orders</h1>
        <p>Manage and track all customer orders</p>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by order ID or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="search-btn">Search</button>
        </form>

        <div className="filter-group">
          <Filter size={18} />
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="orders-table-card">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="loading-cell">Loading orders...</td>
              </tr>
            ) : orders.length > 0 ? (
              orders.map(order => (
                <tr key={order._id}>
                  <td>
                    <Link to={`/orders/${order._id}`} className="order-id">
                      #{order.orderId?.slice(-6) || order._id.slice(-6)}
                    </Link>
                  </td>
                  <td>
                    <div className="customer-cell">
                      <span className="customer-name">{order.customer?.name || 'N/A'}</span>
                      <span className="customer-phone">{order.customer?.phone || ''}</span>
                    </div>
                  </td>
                  <td>{order.items?.length || 0} items</td>
                  <td className="amount-cell">₹{order.totalAmount}</td>
                  <td>
                    <span 
                      className="status-badge"
                      style={{ 
                        background: `${ORDER_STATUS_COLORS[order.status]}20`,
                        color: ORDER_STATUS_COLORS[order.status]
                      }}
                    >
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/orders/${order._id}`} className="view-btn">
                      <Eye size={16} />
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="empty-cell">No orders found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="page-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="page-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`page-number ${currentPage === page ? 'active' : ''}`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button 
            className="page-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Orders;
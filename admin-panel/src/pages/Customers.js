import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Search, Users, Eye, Mail, Phone, MapPin } from 'lucide-react';
import { fetchCustomers } from '../store/slices/customerSlice';
import { COLORS } from '../config';
import './Customers.css';

const Customers = () => {
  const dispatch = useDispatch();
  const { customers, totalPages, currentPage, loading } = useSelector(state => state.customers);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    dispatch(fetchCustomers({ page: 1 }));
  }, [dispatch]);

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(fetchCustomers({ page: 1, search: searchTerm }));
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      dispatch(fetchCustomers({ page, search: searchTerm }));
    }
  };

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1>Customers</h1>
        <p>Manage your customer database</p>
      </div>

      {/* Search */}
      <div className="filters-bar">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="search-btn">Search</button>
        </form>
      </div>

      {/* Customers Grid */}
      <div className="customers-grid">
        {loading ? (
          <div className="loading-state">Loading customers...</div>
        ) : customers.length > 0 ? (
          customers.map(customer => (
            <div key={customer._id} className="customer-card">
              <div className="customer-header">
                <div className="customer-avatar">
                  {customer.name?.charAt(0) || 'C'}
                </div>
                <div className="customer-info">
                  <h3>{customer.name}</h3>
                  <span className="customer-since">
                    Customer since {new Date(customer.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              <div className="customer-details">
                <div className="detail-item">
                  <Phone size={14} />
                  <span>{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="detail-item">
                    <Mail size={14} />
                    <span>{customer.email}</span>
                </div>
                {customer.address && (
                  <div className="detail-item">
                    <MapPin size={14} />
                    <span>{customer.address.length > 30 ? customer.address.slice(0, 30) + '...' : customer.address}</span>
                  </div>
                )}
              </div>

              <div className="customer-stats">
                <div className="stat">
                  <span className="stat-value">{customer.totalOrders || 0}</span>
                  <span className="stat-label">Orders</span>
                </div>
                <div className="stat">
                  <span className="stat-value">₹{(customer.totalSpent || 0).toLocaleString()}</span>
                  <span className="stat-label">Spent</span>
                </div>
              </div>

              <div className="customer-actions">
                <Link to={`/customers/${customer._id}`} className="view-btn">
                  <Eye size={16} />
                  View Details
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Users size={48} />
            <p>No customers found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="page-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            &lt;
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
            &gt;
          </button>
        </div>
      )}
    </div>
  );
};

export default Customers;
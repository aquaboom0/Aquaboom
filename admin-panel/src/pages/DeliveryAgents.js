import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, Truck, Eye, Phone, MapPin, ToggleLeft, ToggleRight } from 'lucide-react';
import { fetchAgents, updateAgentStatus } from '../store/slices/agentSlice';
import { COLORS } from '../config';
import './DeliveryAgents.css';

function partnerFleetBadge(agent) {
  if (!agent?.isActive) return 'Account deactivated';
  if (agent.activeOrderId) return 'On delivery';
  if (agent.isOnline && agent.isAvailable) return 'Available for assignments';
  return 'Off duty';
}

const DeliveryAgents = () => {
  const dispatch = useDispatch();
  const { agents, totalPages, currentPage, loading } = useSelector(state => state.agents);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    dispatch(fetchAgents({ page: 1 }));
  }, [dispatch]);

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(fetchAgents({ page: 1, search: searchTerm, status: statusFilter }));
  };

  const handleStatusToggle = (agentId, currentStatus) => {
    dispatch(updateAgentStatus({ agentId, isActive: !currentStatus }));
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      dispatch(fetchAgents({ page, search: searchTerm, status: statusFilter }));
    }
  };

  return (
    <div className="agents-page">
      <div className="page-header">
        <h1>Delivery Agents</h1>
        <p>Manage your delivery partner workforce</p>
      </div>

      {/* Filters */}
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

        <div className="filter-group">
          <select 
            value={statusFilter} 
            onChange={(e) => {
              setStatusFilter(e.target.value);
              dispatch(fetchAgents({ page: 1, search: searchTerm, status: e.target.value }));
            }}
          >
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="agents-grid">
        {loading ? (
          <div className="loading-state">Loading agents...</div>
        ) : agents.length > 0 ? (
          agents.map(agent => (
            <div key={agent._id} className={`agent-card ${agent.isActive ? 'active' : 'inactive'}`}>
              <div className="agent-header">
                <div className="agent-avatar">
                  {agent.name?.charAt(0) || 'A'}
                </div>
                <div className="agent-info">
                  <h3>{agent.name}</h3>
                  <span className={`status-indicator ${agent.isActive ? 'online' : 'offline'}`}>
                    {agent.isActive ? 'Online' : 'Offline'}
                  </span>
                </div>
                <button 
                  className={`toggle-btn ${agent.isActive ? 'on' : 'off'}`}
                  onClick={() => handleStatusToggle(agent._id, agent.isActive)}
                  title={agent.isActive ? 'Deactivate' : 'Activate'}
                >
                  {agent.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </div>
              
              <div className="agent-details">
                <div className={`fleet-row ${agent.isOnline && agent.isAvailable && !agent.activeOrderId ? 'fleet-ready' : ''}`}>
                  {partnerFleetBadge(agent)}
                </div>
                <div className="detail-item">
                  <Phone size={14} />
                  <span>{agent.phone}</span>
                </div>
                {agent.email && (
                  <div className="detail-item">
                    <MapPin size={14} />
                    <span>{agent.area || 'Not assigned'}</span>
                  </div>
                )}
              </div>

              <div className="agent-stats">
                <div className="stat">
                  <span className="stat-value">{agent.totalDeliveries || 0}</span>
                  <span className="stat-label">Deliveries</span>
                </div>
                <div className="stat">
                  <span className="stat-value">₹{(agent.totalEarnings || 0).toLocaleString()}</span>
                  <span className="stat-label">Earnings</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{agent.rating?.toFixed(1) || '0.0'}</span>
                  <span className="stat-label">Rating</span>
                </div>
              </div>

              <div className="agent-actions">
                <button className="view-btn">
                  <Eye size={16} />
                  View Details
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Truck size={48} />
            <p>No agents found</p>
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

export default DeliveryAgents;
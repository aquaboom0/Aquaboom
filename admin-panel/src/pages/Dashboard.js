import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { 
  ShoppingCart, 
  Users, 
  Truck, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import { 
  fetchDashboardStats, 
  fetchRevenueAnalytics,
  fetchOrderAnalytics 
} from '../store/slices/analyticsSlice';
import { COLORS } from '../config';
import './Dashboard.css';

const StatCard = ({ icon: Icon, title, value, change, changeType, link }) => (
  <Link to={link} className="stat-card">
    <div className="stat-icon" style={{ background: `${COLORS.primary}15` }}>
      <Icon size={24} color={COLORS.primary} />
    </div>
    <div className="stat-content">
      <span className="stat-title">{title}</span>
      <span className="stat-value">{value}</span>
      {change && (
        <span className={`stat-change ${changeType}`}>
          {changeType === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {change}
        </span>
      )}
    </div>
    <ArrowRight size={20} className="stat-arrow" />
  </Link>
);

const Dashboard = () => {
  const dispatch = useDispatch();
  const { dashboardStats, revenueData, orderData, loading } = useSelector(state => state.analytics);

  useEffect(() => {
    dispatch(fetchDashboardStats());
    dispatch(fetchRevenueAnalytics({ period: 'week' }));
    dispatch(fetchOrderAnalytics({ period: 'week' }));
  }, [dispatch]);

  const stats = [
    { 
      icon: ShoppingCart, 
      title: 'Total Orders', 
      value: dashboardStats?.totalOrders || '0',
      change: '+12%',
      changeType: 'up',
      link: '/orders'
    },
    { 
      icon: Users, 
      title: 'Total Customers', 
      value: dashboardStats?.totalCustomers || '0',
      change: '+8%',
      changeType: 'up',
      link: '/customers'
    },
    { 
      icon: Truck, 
      title: 'Partners ready now', 
      value: dashboardStats?.activeAgents || '0',
      change: '+5%',
      changeType: 'up',
      link: '/agents'
    },
    { 
      icon: DollarSign, 
      title: 'Total Revenue', 
      value: `₹${(dashboardStats?.totalRevenue || 0).toLocaleString()}`,
      change: '+15%',
      changeType: 'up',
      link: '/analytics'
    },
  ];

  const recentOrders = dashboardStats?.recentOrders || [];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your water delivery business</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <div className="chart-card">
          <h3>Revenue Overview</h3>
          <div className="chart-placeholder">
            {revenueData.length > 0 ? (
              <div className="revenue-bars">
                {revenueData.map((item, index) => (
                  <div key={index} className="revenue-bar-container">
                    <div 
                      className="revenue-bar" 
                      style={{ height: `${(item.value / Math.max(...revenueData.map(d => d.value))) * 100}%` }}
                    />
                    <span className="bar-label">{item.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">Loading revenue data...</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Orders Overview</h3>
          <div className="chart-placeholder">
            {orderData.length > 0 ? (
              <div className="order-bars">
                {orderData.map((item, index) => (
                  <div key={index} className="order-bar-container">
                    <div 
                      className="order-bar" 
                      style={{ height: `${(item.value / Math.max(...orderData.map(d => d.value))) * 100}%` }}
                    />
                    <span className="bar-label">{item.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">Loading order data...</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="recent-orders-card">
        <div className="card-header">
          <h3>Recent Orders</h3>
          <Link to="/orders" className="view-all">View All</Link>
        </div>
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map(order => (
                  <tr key={order._id}>
                    <td>
                      <Link to={`/orders/${order._id}`} className="order-id">
                        #{order.orderId?.slice(-6) || order._id.slice(-6)}
                      </Link>
                    </td>
                    <td>{order.customer?.name || 'N/A'}</td>
                    <td>₹{order.totalAmount}</td>
                    <td>
                      <span className={`status-badge ${order.status}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data">No recent orders</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package } from 'lucide-react';
import { fetchAnalytics } from '../store/slices/analyticsSlice';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { COLORS } from '../config';
import './Analytics.css';

const Analytics = () => {
  const dispatch = useDispatch();
  const { analytics, loading } = useSelector(state => state.analytics);

  useEffect(() => {
    dispatch(fetchAnalytics());
  }, [dispatch]);

  const { 
    revenueData = [], 
    ordersData = [], 
    topProducts = [], 
    ordersByStatus = [],
    summary = {}
  } = analytics;

  const summaryCards = [
    {
      title: 'Total Revenue',
      value: `₹${(summary.totalRevenue || 0).toLocaleString()}`,
      change: summary.revenueGrowth || 0,
      icon: DollarSign,
      color: '#10b981'
    },
    {
      title: 'Total Orders',
      value: summary.totalOrders || 0,
      change: summary.ordersGrowth || 0,
      icon: ShoppingCart,
      color: '#0077b6'
    },
    {
      title: 'Total Customers',
      value: summary.totalCustomers || 0,
      change: summary.customersGrowth || 0,
      icon: Users,
      color: '#8b5cf6'
    },
    {
      title: 'Products Sold',
      value: summary.totalProductsSold || 0,
      change: summary.productsGrowth || 0,
      icon: Package,
      color: '#f59e0b'
    }
  ];

  const statusColors = {
    pending: '#f59e0b',
    confirmed: '#3b82f6',
    processing: '#8b5cf6',
    out_for_delivery: '#06b6d4',
    delivered: '#10b981',
    cancelled: '#ef4444'
  };

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Track your business performance and insights</p>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        {summaryCards.map((card, index) => (
          <div key={index} className="summary-card">
            <div className="card-icon" style={{ background: `${card.color}15`, color: card.color }}>
              <card.icon size={24} />
            </div>
            <div className="card-content">
              <span className="card-title">{card.title}</span>
              <span className="card-value">{card.value}</span>
              <span className={`card-change ${card.change >= 0 ? 'positive' : 'negative'}`}>
                {card.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {Math.abs(card.change)}% vs last month
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Revenue Chart */}
        <div className="chart-card">
          <h3>Revenue Overview</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(value) => `₹${value}`} />
                <Tooltip 
                  formatter={(value) => [`₹${value.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#0077b6" 
                  strokeWidth={3}
                  dot={{ fill: '#0077b6', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders Chart */}
        <div className="chart-card">
          <h3>Orders Overview</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ordersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="orders" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="bottom-row">
        {/* Orders by Status */}
        <div className="chart-card">
          <h3>Orders by Status</h3>
          <div className="chart-container pie-container">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={ordersByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="status"
                >
                  {ordersByStatus.map((entry, index) => (
                    <Cell key={index} fill={statusColors[entry.status] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span style={{ color: '#64748b', fontSize: '12px' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="chart-card">
          <h3>Top Selling Products</h3>
          <div className="top-products-list">
            {topProducts.length > 0 ? (
              topProducts.map((product, index) => (
                <div key={index} className="top-product-item">
                  <span className="product-rank">#{index + 1}</span>
                  <div className="product-info">
                    <span className="product-name">{product.name}</span>
                    <span className="product-sales">{product.sold} sold</span>
                  </div>
                  <span className="product-revenue">₹{product.revenue?.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="empty-chart">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
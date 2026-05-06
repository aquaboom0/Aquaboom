import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Save, User, Bell, Shield, Palette, Globe } from 'lucide-react';
import { updateSettings } from '../store/slices/authSlice';
import { COLORS } from '../config';
import './Settings.css';

const Settings = () => {
  const dispatch = useDispatch();
  const { admin } = useSelector(state => state.auth);
  
  const [activeTab, setActiveTab] = useState('profile');
  const [settings, setSettings] = useState({
    // Profile
    name: admin?.name || 'Admin',
    email: admin?.email || 'admin@aquaboom.com',
    phone: admin?.phone || '',
    
    // Notifications
    emailNotifications: true,
    orderAlerts: true,
    dailyReports: false,
    weeklyReports: true,
    
    // Business Settings
    businessName: 'AquaRush',
    deliveryFee: 20,
    minOrderAmount: 100,
    freeDeliveryThreshold: 500,
    deliveryRadius: 10,
    
    // Appearance
    theme: 'light',
    primaryColor: '#0077b6',
    language: 'en'
  });
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (field, value) => {
    setSettings({ ...settings, [field]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    }, 1000);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'business', label: 'Business', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette }
  ];

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account and application preferences</p>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`message-toast ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-container">
        {/* Tabs */}
        <div className="settings-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="settings-section">
              <h2>Profile Information</h2>
              <p className="section-description">Update your personal information</p>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={settings.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="settings-section">
              <h2>Notification Preferences</h2>
              <p className="section-description">Choose how you want to be notified</p>
              
              <div className="toggle-list">
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">Email Notifications</span>
                    <span className="toggle-description">Receive notifications via email</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={(e) => handleChange('emailNotifications', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">Order Alerts</span>
                    <span className="toggle-description">Get notified for new orders</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.orderAlerts}
                      onChange={(e) => handleChange('orderAlerts', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">Daily Reports</span>
                    <span className="toggle-description">Receive daily summary reports</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.dailyReports}
                      onChange={(e) => handleChange('dailyReports', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">Weekly Reports</span>
                    <span className="toggle-description">Receive weekly performance reports</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.weeklyReports}
                      onChange={(e) => handleChange('weeklyReports', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Business Tab */}
          {activeTab === 'business' && (
            <div className="settings-section">
              <h2>Business Settings</h2>
              <p className="section-description">Configure your business parameters</p>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>Business Name</label>
                  <input
                    type="text"
                    value={settings.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label>Delivery Fee (₹)</label>
                  <input
                    type="number"
                    value={settings.deliveryFee}
                    onChange={(e) => handleChange('deliveryFee', parseFloat(e.target.value))}
                  />
                </div>
                
                <div className="form-group">
                  <label>Minimum Order Amount (₹)</label>
                  <input
                    type="number"
                    value={settings.minOrderAmount}
                    onChange={(e) => handleChange('minOrderAmount', parseFloat(e.target.value))}
                  />
                </div>
                
                <div className="form-group">
                  <label>Free Delivery Above (₹)</label>
                  <input
                    type="number"
                    value={settings.freeDeliveryThreshold}
                    onChange={(e) => handleChange('freeDeliveryThreshold', parseFloat(e.target.value))}
                  />
                </div>
                
                <div className="form-group">
                  <label>Delivery Radius (km)</label>
                  <input
                    type="number"
                    value={settings.deliveryRadius}
                    onChange={(e) => handleChange('deliveryRadius', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <h2>Appearance</h2>
              <p className="section-description">Customize the look and feel</p>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>Theme</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => handleChange('theme', e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Primary Color</label>
                  <div className="color-picker">
                    <input
                      type="color"
                      value={settings.primaryColor}
                      onChange={(e) => handleChange('primaryColor', e.target.value)}
                    />
                    <span>{settings.primaryColor}</span>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Language</label>
                  <select
                    value={settings.language}
                    onChange={(e) => handleChange('language', e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="settings-actions">
            <button 
              className="save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
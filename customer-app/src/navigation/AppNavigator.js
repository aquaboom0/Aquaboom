import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useDispatch, useSelector } from 'react-redux';
import { Text, View, StyleSheet } from 'react-native';
import { connectSocket, disconnectSocket } from '../store/slices/socketSlice';
import { fetchMyOrders } from '../store/slices/orderSlice';
import OrderActivityBanner from '../components/OrderActivityBanner';
import {
  ensurePushRegistrationForCustomer,
  consumePendingAgentOrderTap,
} from '../services/pushNotifications';
import { navigationRef } from './navigationRef';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import DeliveryDashboardScreen from '../screens/delivery/DeliveryDashboardScreen';
import AgentEarningsScreen from '../screens/delivery/AgentEarningsScreen';
import AgentProfileScreen from '../screens/delivery/AgentProfileScreen';
import AgentOrderDetailScreen from '../screens/delivery/AgentOrderDetailScreen';
import HomeScreen from '../screens/main/HomeScreen';
import ProductDetailScreen from '../screens/main/ProductDetailScreen';
import CartScreen from '../screens/main/CartScreen';
import CheckoutScreen from '../screens/main/CheckoutScreen';
import OrdersScreen from '../screens/main/OrdersScreen';
import OrderDetailScreen from '../screens/main/OrderDetailScreen';
import OrderTrackingScreen from '../screens/main/OrderTrackingScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import AddressesScreen from '../screens/main/AddressesScreen';
import { COLORS } from '../config';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab Bar Icon Component
const TabIcon = ({ icon, label, focused }) => (
  <View style={styles.tabIconContainer}>
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
  </View>
);

// Main Tab Navigator
const MainTabs = () => {
  const dispatch = useDispatch();
  const { items } = useSelector(state => state.cart);
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const customerOrderRefreshToken = useSelector((s) => s.realtime?.customerOrderRefreshToken);

  useEffect(() => {
    dispatch(connectSocket(null));
    ensurePushRegistrationForCustomer();
    return () => {
      dispatch(disconnectSocket(null));
    };
  }, [dispatch]);

  useEffect(() => {
    if (customerOrderRefreshToken > 0) {
      dispatch(fetchMyOrders({}));
    }
  }, [customerOrderRefreshToken, dispatch]);

  return (
    <View style={{ flex: 1 }}>
      <OrderActivityBanner />
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📦" label="Orders" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View>
              <TabIcon icon="🛒" label="Cart" focused={focused} />
              {cartCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{cartCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
    </View>
  );
};

// Auth Stack Navigator
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// Main Stack Navigator
const MainStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabs} />
    <Stack.Screen 
      name="ProductDetail" 
      component={ProductDetailScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen 
      name="Cart" 
      component={CartScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen 
      name="Checkout" 
      component={CheckoutScreen}
      options={{ animation: 'slide_from_bottom' }}
    />
    <Stack.Screen 
      name="Orders" 
      component={OrdersScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen 
      name="OrderDetail" 
      component={OrderDetailScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen 
      name="OrderTracking" 
      component={OrderTrackingScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen 
      name="Addresses" 
      component={AddressesScreen}
      options={{ animation: 'slide_from_right' }}
    />
  </Stack.Navigator>
);

const AdminStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
  </Stack.Navigator>
);

const PartnerTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: styles.tabBar,
      tabBarShowLabel: false,
    }}
  >
    <Tab.Screen
      name="PartnerHome"
      component={DeliveryDashboardScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="🏠" label="Home" focused={focused} />
        ),
      }}
    />
    <Tab.Screen
      name="PartnerEarnings"
      component={AgentEarningsScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="💰" label="Earnings" focused={focused} />
        ),
      }}
    />
    <Tab.Screen
      name="PartnerProfile"
      component={AgentProfileScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="👤" label="Profile" focused={focused} />
        ),
      }}
    />
  </Tab.Navigator>
);

const DeliveryStack = () => {
  useEffect(() => {
    consumePendingAgentOrderTap();
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PartnerTabs" component={PartnerTabs} />
      <Stack.Screen
        name="AgentOrderDetail"
        component={AgentOrderDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator
const AppNavigator = () => {
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const role = user?.role || 'customer';

  return (
    <NavigationContainer ref={navigationRef}>
      {!isAuthenticated ? <AuthStack /> : role === 'admin' ? <AdminStack /> : role === 'delivery_agent' ? <DeliveryStack /> : <MainStack />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    height: 82,
    paddingTop: 10,
    paddingBottom: 22,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabLabelFocused: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  badgeText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default AppNavigator;
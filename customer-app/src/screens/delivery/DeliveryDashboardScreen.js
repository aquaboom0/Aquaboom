import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useDispatch, useSelector } from 'react-redux';
import { deliveryAPI } from '../../services/api';
import { logout, syncAgentFleetStatus } from '../../store/slices/authSlice';
import { connectSocket, disconnectSocket } from '../../store/slices/socketSlice';
import { ensurePushRegistrationForStaff } from '../../services/pushNotifications';
import { COLORS } from '../../config';

const NEXT_STATUS = {
  ASSIGNED: 'PICKED_UP',
  PICKED_UP: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

async function persistAgentAvailability(patch) {
  try {
    const raw = await AsyncStorage.getItem('authData');
    if (!raw) return;
    const u = JSON.parse(raw);
    Object.assign(u, patch);
    await AsyncStorage.setItem('authData', JSON.stringify(u));
  } catch (_e) {
    // ignore
  }
}

const rupeeShort = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

const DeliveryDashboardScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const authUser = useSelector((s) => s.auth.user);
  const [orders, setOrders] = useState([]);
  const [queueOrders, setQueueOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Single control: Available for dispatch (= isOnline && isAvailable on server). */
  const [available, setAvailable] = useState(false);
  const [locationText, setLocationText] = useState('Location not shared yet');
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [earnings, setEarnings] = useState({
    todayEarnings: 0,
    todayDeliveries: 0,
    lifetimeEarnings: 0,
    lifetimeDeliveries: 0,
  });

  const activeCount = useMemo(
    () => orders.filter((o) => ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.status)).length,
    [orders]
  );

  const shouldShareLocation = available || activeCount > 0;

  useEffect(() => {
    if (authUser?.role === 'delivery_agent') {
      setAvailable(Boolean(authUser.isOnline && authUser.isAvailable));
    }
  }, [authUser?.role, authUser?.isOnline, authUser?.isAvailable]);

  const loadEarningsSummary = useCallback(async () => {
    try {
      const res = await deliveryAPI.getEarningsSummary();
      const d = res.data?.data;
      if (!d?.today || !d?.lifetime) return;
      setEarnings({
        todayEarnings: d.today.earnings ?? 0,
        todayDeliveries: d.today.deliveriesCompleted ?? 0,
        lifetimeEarnings: d.lifetime.earnings ?? 0,
        lifetimeDeliveries: d.lifetime.deliveries ?? 0,
      });
    } catch (_e) {
      // Silent — earnings are secondary when offline
    }
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const [ordersRes, queueRes] = await Promise.all([
        deliveryAPI.getMyOrders(),
        deliveryAPI.getQueueOrders({ limit: 20 }),
        loadEarningsSummary(),
      ]);
      setOrders(ordersRes.data?.data || []);
      setQueueOrders(queueRes.data?.data || []);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      deliveryAPI.getMyOrders().then((res) => setOrders(res.data?.data || [])),
      deliveryAPI.getQueueOrders({ limit: 20 }).then((res) => setQueueOrders(res.data?.data || [])),
      loadEarningsSummary(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    dispatch(connectSocket(null));
    ensurePushRegistrationForStaff('delivery_agent');
    loadOrders();
    return () => {
      dispatch(disconnectSocket(null));
    };
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      loadEarningsSummary();
    }, [loadEarningsSummary])
  );

  const toggleAvailability = async () => {
    try {
      const next = !available;
      await deliveryAPI.setStatus({ isOnline: next, isAvailable: next });
      setAvailable(next);
      dispatch(syncAgentFleetStatus({ isOnline: next, isAvailable: next }));
      await persistAgentAvailability({ isOnline: next, isAvailable: next });
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update availability');
    }
  };

  useEffect(() => {
    let intervalId;
    const pushLocation = async () => {
      try {
        if (!shouldShareLocation) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationText('Location permission denied');
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (lat === undefined || lng === undefined) return;
        await deliveryAPI.updateLocation({ lat, lng });
        setLocationText(`Live ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } catch (_error) {
        setLocationText('Unable to update live location');
      }
    };
    pushLocation();
    intervalId = setInterval(pushLocation, 10000);
    return () => clearInterval(intervalId);
  }, [shouldShareLocation]);

  const handleFetchCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location to share live tracking.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = position?.coords?.latitude;
      const lng = position?.coords?.longitude;
      if (lat === undefined || lng === undefined) return;
      await deliveryAPI.updateLocation({ lat, lng });
      setLocationText(`Live ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      Alert.alert('Updated', 'Current location shared successfully');
    } catch (_error) {
      Alert.alert('Error', 'Unable to fetch current location');
    }
  };

  const handleNextStatus = async (order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      setUpdatingOrderId(order._id);
      await deliveryAPI.updateOrderStatus(order._id, next);
      await Promise.all([
        deliveryAPI.getMyOrders().then((res) => setOrders(res.data?.data || [])),
        deliveryAPI.getQueueOrders({ limit: 20 }).then((res) => setQueueOrders(res.data?.data || [])),
        loadEarningsSummary(),
      ]);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'DELIVERED') return '#16a34a';
    if (status === 'OUT_FOR_DELIVERY') return '#0284c7';
    if (status === 'PICKED_UP') return '#7c3aed';
    if (status === 'ASSIGNED') return '#ea580c';
    return COLORS.textLight;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Delivery Partner</Text>
          <Text style={styles.subtitle}>Admin confirms orders • you receive assignments when available</Text>
        </View>
        <TouchableOpacity onPress={() => dispatch(logout())}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.earningsHero}>
        <View style={styles.earningsHeroTop}>
          <Text style={styles.earningsHeroTitle}>Today's earnings</Text>
          <View style={styles.istBadge}>
            <Text style={styles.istBadgeText}>IST</Text>
          </View>
        </View>
        <Text style={styles.earningsHeroAmount}>{rupeeShort(earnings.todayEarnings)}</Text>
        <Text style={styles.earningsHeroLine}>
          {earnings.todayDeliveries} delivery{earnings.todayDeliveries === 1 ? '' : 'ies'} completed today · sum of{' '}
          <Text style={styles.earningsHeroBold}>delivery fees</Text> on those orders
        </Text>
        <View style={styles.earningsHeroDivider} />
        <Text style={styles.earningsLifetimeLine}>
          All-time · <Text style={styles.earningsLifetimeStrong}>{rupeeShort(earnings.lifetimeEarnings)}</Text> ·{' '}
          {earnings.lifetimeDeliveries} completed
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardGrow]}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active on you</Text>
        </View>
        <View style={[styles.statCard, styles.statCardGrow, styles.statCardLast]}>
          <Text style={styles.statValue}>{earnings.lifetimeDeliveries}</Text>
          <Text style={styles.statLabel}>Lifetime drops</Text>
          <Text style={styles.statHint}>{rupeeShort(earnings.lifetimeEarnings)} from delivery fees</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardGrow, styles.statCardLast]}>
          <Text style={styles.statValue}>{queueOrders.length}</Text>
          <Text style={styles.statLabel}>Queue waiting</Text>
          <Text style={styles.statHint}>Approved by admin, waiting for next available partner</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusMainRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.statusTitle}>Available for assignments</Text>
            <Text style={styles.statusHint}>
              Turn on only when online and accepting new deliveries. Orders are approved only by AquaBoom admin.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.availChip, available && styles.availChipOn]}
            onPress={toggleAvailability}
            accessibilityRole="button"
          >
            <Text style={[styles.availChipText, available && styles.availChipTextOn]}>
              {available ? 'Available' : 'Off duty'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.locationMeta}>{locationText}</Text>
        {!shouldShareLocation ? (
          <Text style={styles.locationHint}>Enable availability (or carry an active order) to refresh GPS periodically.</Text>
        ) : null}
        <TouchableOpacity style={styles.fetchBtn} onPress={handleFetchCurrentLocation}>
          <Text style={styles.fetchBtnText}>Share current location now</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.queueCard}>
        <View style={styles.queueHeader}>
          <Text style={styles.queueTitle}>Queue Line</Text>
          <View style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>{queueOrders.length}</Text>
          </View>
        </View>
        {queueOrders.length === 0 ? (
          <Text style={styles.queueEmpty}>No queued approved orders right now.</Text>
        ) : (
          queueOrders.slice(0, 5).map((q) => (
            <View key={q._id} style={styles.queueItem}>
              <Text style={styles.queueItemTitle}>#{q.orderId}</Text>
              <Text style={styles.queueItemMeta}>
                Position {q.queuePosition || '-'} · Rs {q.totalAmount}
              </Text>
              <Text style={styles.queueItemMeta}>
                {q.customer?.name || 'Customer'}{q.deliveryAddress?.city ? ` · ${q.deliveryAddress.city}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No assigned orders yet. Stay available — new jobs appear here automatically.</Text>}
          renderItem={({ item }) => {
            const nextStatus = NEXT_STATUS[item.status];
            return (
              <View style={styles.item}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() =>
                    navigation.getParent()?.navigate?.('AgentOrderDetail', {
                      orderId: item._id,
                    })
                  }
                >
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle}>Order #{item.orderId}</Text>
                    <Text style={[styles.statusPill, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                  </View>
                  <Text style={styles.itemMeta}>Amount: Rs {item.totalAmount}</Text>
                </TouchableOpacity>
                {nextStatus && (
                  <TouchableOpacity
                    style={[styles.actionBtn, updatingOrderId === item._id && { opacity: 0.6 }]}
                    disabled={updatingOrderId === item._id}
                    onPress={() => handleNextStatus(item)}
                  >
                    <Text style={styles.actionBtnText}>
                      {updatingOrderId === item._id ? 'Updating...' : `Mark as ${nextStatus}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 11, color: COLORS.textLight, marginTop: 4, maxWidth: '88%' },
  logout: { color: COLORS.error, fontWeight: '700' },
  earningsHero: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#10b981',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  earningsHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earningsHeroTitle: { fontSize: 13, fontWeight: '800', color: '#065f46', letterSpacing: 0.5 },
  istBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  istBadgeText: { fontSize: 10, fontWeight: '800', color: '#047857' },
  earningsHeroAmount: { fontSize: 34, fontWeight: '900', color: COLORS.primaryDark, marginTop: 6 },
  earningsHeroLine: { fontSize: 12, color: '#065f46', marginTop: 8, lineHeight: 17 },
  earningsHeroBold: { fontWeight: '800', color: '#064e3b' },
  earningsHeroDivider: { height: 1, backgroundColor: '#a7f3d0', marginTop: 12, marginBottom: 10 },
  earningsLifetimeLine: { fontSize: 12, color: COLORS.textLight },
  earningsLifetimeStrong: { fontWeight: '800', color: COLORS.text },
  statsRow: { flexDirection: 'row', marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginRight: 10 },
  statCardGrow: { flex: 1 },
  statCardLast: { marginRight: 0 },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.primaryDark },
  statLabel: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  statHint: { fontSize: 10, color: COLORS.textLight, marginTop: 6, lineHeight: 14 },
  statusCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
  statusMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  statusHint: { fontSize: 12, color: COLORS.textLight, marginTop: 6, lineHeight: 17 },
  availChip: {
    minWidth: 102,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  availChipOn: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  availChipText: { fontWeight: '800', fontSize: 12, color: COLORS.textLight },
  availChipTextOn: { color: '#15803d' },
  locationMeta: { marginTop: 12, color: COLORS.textLight, fontSize: 12 },
  locationHint: { marginTop: 6, color: '#92400e', fontSize: 11 },
  fetchBtn: { marginTop: 10, backgroundColor: '#e0f2fe', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  fetchBtnText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 12 },
  queueCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 12 },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  queueTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  queueBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueBadgeText: { color: '#6d28d9', fontSize: 12, fontWeight: '800' },
  queueEmpty: { color: COLORS.textLight, fontSize: 12 },
  queueItem: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  queueItemTitle: { color: COLORS.text, fontWeight: '800', fontSize: 13 },
  queueItemMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  item: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 10 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  statusPill: { fontWeight: '700', fontSize: 12 },
  itemMeta: { color: COLORS.textLight, marginTop: 6 },
  actionBtn: { marginTop: 10, backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  actionBtnText: { color: COLORS.surface, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.textLight, paddingHorizontal: 12 },
});

export default DeliveryDashboardScreen;

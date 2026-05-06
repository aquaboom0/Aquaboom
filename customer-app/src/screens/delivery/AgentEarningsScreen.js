import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { deliveryAPI } from '../../services/api';
import { COLORS } from '../../config';

const EST_FEE_PER_DELIVERY = 30;

export default function AgentEarningsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);

  const load = async () => {
    try {
      const res = await deliveryAPI.getMyOrders({ limit: '200', page: '1' });
      const list = res.data?.data || [];
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to load deliveries');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const estimate = delivered.length * EST_FEE_PER_DELIVERY;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.inner}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Earnings overview</Text>
      <Text style={styles.disclaimer}>
        Approximate earnings from completed drops (× ₹{EST_FEE_PER_DELIVERY} per delivered order). Exact payouts can be tracked with operations.
      </Text>

      <View style={styles.card}>
        <Text style={styles.bigNum}>₹{estimate}</Text>
        <Text style={styles.bigLabel}>{delivered.length} delivered orders</Text>
      </View>

      <Text style={styles.section}>Recent deliveries</Text>
      {delivered.slice(0, 20).length === 0 ? (
        <Text style={styles.empty}>No completed deliveries yet.</Text>
      ) : (
        delivered.slice(0, 20).map((o) => (
          <View key={o._id} style={styles.row}>
            <Text style={styles.rowId}>#{String(o.orderId || o._id).slice(-8)}</Text>
            <Text style={styles.rowAmt}>₹{o.totalAmount ?? '—'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  disclaimer: { fontSize: 12, color: COLORS.textLight, marginTop: 8, marginBottom: 16, lineHeight: 18 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  bigNum: { fontSize: 34, fontWeight: '900', color: COLORS.primaryDark },
  bigLabel: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  section: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowId: { fontWeight: '700', color: COLORS.text },
  rowAmt: { color: COLORS.textLight },
  empty: { color: COLORS.textLight },
});

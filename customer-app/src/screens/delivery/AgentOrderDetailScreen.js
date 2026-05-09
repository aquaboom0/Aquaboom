import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { deliveryAPI } from '../../services/api';
import { COLORS } from '../../config';
import { format } from 'date-fns';
import { thinCoordinates } from '../../utils/mapRoute';
import { buildLeafletTrackingHtml } from '../../utils/leafletMapHtml';
import { hapticDeliveredSuccess, hapticSuccess } from '../../utils/haptics';

/** @returns {{ latitude: number, longitude: number } | null} */
function toCoord(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const NEXT_STATUS = {
  ASSIGNED: { code: 'PICKED_UP', label: 'Mark as picked up' },
  PICKED_UP: { code: 'OUT_FOR_DELIVERY', label: 'Start delivery' },
  OUT_FOR_DELIVERY: { code: 'DELIVERED', label: 'Mark as delivered' },
};

function formatAddress(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(', ');
}

function latestTrackingCoord(trackingHistory) {
  if (!Array.isArray(trackingHistory) || trackingHistory.length === 0) return null;
  for (let i = trackingHistory.length - 1; i >= 0; i -= 1) {
    const loc = trackingHistory[i]?.location;
    const c = toCoord(loc?.lat, loc?.lng);
    if (c) return c;
  }
  return null;
}

export default function AgentOrderDetailScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [navPermission, setNavPermission] = useState(null);
  const [agentPos, setAgentPos] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMeta, setRouteMeta] = useState(null);

  const dropoffCoord = useMemo(
    () => toCoord(order?.deliveryAddress?.lat, order?.deliveryAddress?.lng),
    [order?.deliveryAddress?.lat, order?.deliveryAddress?.lng]
  );
  const historyAgentCoord = useMemo(
    () => latestTrackingCoord(order?.trackingHistory),
    [order?.trackingHistory]
  );

  const fallbackHtml = useMemo(
    () =>
      buildLeafletTrackingHtml({
        center: dropoffCoord || agentPos,
        agent: agentPos,
        destination: dropoffCoord,
        routeCoords,
      }),
    [dropoffCoord, agentPos, routeCoords]
  );

  useEffect(() => {
    if (!agentPos && historyAgentCoord) {
      setAgentPos(historyAgentCoord);
    }
  }, [agentPos, historyAgentCoord]);

  useEffect(() => {
    let cancelled = false;
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!cancelled) setNavPermission(status === 'granted');
      if (status !== 'granted') return;

      // Prime marker quickly with cached or one-shot fix before watcher ticks.
      try {
        const last = await Location.getLastKnownPositionAsync();
        const lastCoord = toCoord(last?.coords?.latitude, last?.coords?.longitude);
        if (!cancelled && lastCoord) setAgentPos(lastCoord);
      } catch {
        // ignore
      }
      try {
        const now = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const current = toCoord(now?.coords?.latitude, now?.coords?.longitude);
        if (!cancelled && current) setAgentPos(current);
      } catch {
        // ignore, watcher below continues trying
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 8,
          timeInterval: 6000,
        },
        (p) => {
          const c = toCoord(p.coords.latitude, p.coords.longitude);
          setAgentPos(c);
        }
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  /** Share GPS with customer tracking while this order is active */
  useEffect(() => {
    if (!order?._id || !['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.status))
      return;
    let cancelled = false;
    const sync = async () => {
      if (cancelled) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = position.coords?.latitude;
        const lng = position.coords?.longitude;
        if (lat != null && lng != null) {
          await deliveryAPI.updateLocation({ lat, lng });
        }
      } catch (_e) {
        // ignore — next tick
      }
    };
    sync();
    const id = setInterval(sync, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [order?._id, order?.status]);

  /** Google Directions polyline agent → drop-off */
  useEffect(() => {
    if (!dropoffCoord || !agentPos) {
      setRouteCoords([]);
      setRouteMeta(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setRouteLoading(true);
      try {
        const res = await deliveryAPI.getDriveRoute({
          originLat: agentPos.latitude,
          originLng: agentPos.longitude,
          destLat: dropoffCoord.latitude,
          destLng: dropoffCoord.longitude,
        });
        const data = res.data?.data;
        const raw = Array.isArray(data?.coordinates) ? data.coordinates : [];
        const coords = raw
          .map((p) =>
            Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
              ? { latitude: Number(p.latitude), longitude: Number(p.longitude) }
              : null
          )
          .filter(Boolean);

        if (cancelled) return;

        if (coords.length > 1) {
          setRouteCoords(thinCoordinates(coords, 500));
          setRouteMeta({
            distanceMeters: data?.distanceMeters,
            durationSeconds: data?.durationSeconds,
          });
        } else {
          setRouteCoords([agentPos, dropoffCoord]);
          setRouteMeta(null);
        }
      } catch (_e) {
        if (!cancelled) {
          setRouteCoords([agentPos, dropoffCoord]);
          setRouteMeta(null);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };

    const tDebounce = setTimeout(load, 500);
    const iv = setInterval(load, 35000);

    return () => {
      cancelled = true;
      clearTimeout(tDebounce);
      clearInterval(iv);
    };
  }, [
    dropoffCoord?.latitude,
    dropoffCoord?.longitude,
    agentPos?.latitude,
    agentPos?.longitude,
  ]);

  const load = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const res = await deliveryAPI.getDeliveryOrder(orderId);
      setOrder(res.data?.data || null);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to load order');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const next = order ? NEXT_STATUS[order.status] : null;

  const showActions = useMemo(() => {
    if (!order) return false;
    return !['DELIVERED', 'CANCELLED'].includes(order.status);
  }, [order]);

  const handleCall = () => {
    const phone = order?.customer?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
    else Alert.alert('Unavailable', 'No phone number for this customer.');
  };

  const handleNavigateMaps = async () => {
    try {
      const c = dropoffCoord;
      if (c && agentPos) {
        await Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&origin=${agentPos.latitude},${agentPos.longitude}&destination=${c.latitude},${c.longitude}&travelmode=driving`
        );
        return;
      }
      if (c) {
        await Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`
        );
        return;
      }
      const q = encodeURIComponent(formatAddress(order?.deliveryAddress) || '');
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${q || encodeURIComponent('India')}`
      );
    } catch {
      Alert.alert('Maps', 'Could not open Google Maps. Install the app or try again.');
    }
  };

  const handleNextStatus = () => {
    if (!next) return;
    Alert.alert('Update status', `Set order to ${next.code}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            setUpdating(true);
            await deliveryAPI.updateOrderStatus(order._id, next.code);
            if (next.code === 'DELIVERED') {
              await hapticDeliveredSuccess();
            } else {
              await hapticSuccess();
            }
            await load();
          } catch (e) {
            Alert.alert('Error', e.response?.data?.message || 'Update failed');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.light}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
        <View style={styles.hero}>
          <Text style={styles.heroStatus}>{order.status}</Text>
          <Text style={styles.heroId}>#{String(order.orderId || '').slice(-8)}</Text>
          <Text style={styles.heroDate}>
            {order.createdAt ? format(new Date(order.createdAt), 'MMM d, yyyy · h:mm a') : ''}
          </Text>
        </View>

        <Section title="Customer">
          <Text style={styles.line}>{order.customer?.name || 'Customer'}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.line}>{order.customer?.phone || 'No phone'}</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={handleCall}>
              <Text>📞</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <View style={styles.mapSection}>
          <Text style={styles.sectionHeading}>Delivery map & route</Text>
          {(routeMeta?.durationSeconds || routeLoading) ? (
            <Text style={styles.routeSummary}>
              {routeLoading ? 'Calculating fastest route…' : ''}
              {!routeLoading && routeMeta?.durationSeconds ? (
                <>
                  Driving ~{Math.max(1, Math.round(Number(routeMeta.durationSeconds) / 60))} min
                  {routeMeta.distanceMeters
                    ? ` · ${(Number(routeMeta.distanceMeters) / 1000).toFixed(1)} km`
                    : ''}
                </>
              ) : null}
            </Text>
          ) : null}
          <View style={styles.mapShell}>
            <WebView
              style={styles.mapWeb}
              source={{ html: fallbackHtml }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.mapLoading}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.mapLoadingTxt}>Loading live map…</Text>
                </View>
              )}
            />
            {!navPermission ? (
              <View style={styles.mapHintBanner}>
                <Text style={styles.mapHintTxt}>
                  Enable location permission so your position and route can update.
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.mapsFab}
              onPress={handleNavigateMaps}
              activeOpacity={0.85}
            >
              <Text style={styles.mapsFabTxt}>Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
          {dropoffCoord ? null : (
            <Text style={styles.mapFallbackNote}>
              This order has no saved GPS coordinates. Showing map search by address — use{" "}
              <Text style={styles.bold}>Navigate</Text> below if the pin looks wrong.
            </Text>
          )}
          {!agentPos ? (
            <Text style={styles.mapFallbackNote}>
              Waiting for your live GPS. Keep location set to <Text style={styles.bold}>Allow all the time</Text> for smooth
              realtime tracking.
            </Text>
          ) : null}
        </View>

        <Section title="Delivery address">
          <Text style={styles.line}>{formatAddress(order.deliveryAddress) || '—'}</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={handleNavigateMaps}>
            <Text style={styles.actionBtnTxt}>Open navigation in Google Maps</Text>
          </TouchableOpacity>
        </Section>

        <Section title="Items">
          {(order.items || []).map((item, idx) => (
            <View key={item._id || idx} style={styles.itemRow}>
              <Text style={styles.itemName}>
                {item.quantity}× {item.name || 'Item'}
              </Text>
              <Text style={styles.itemPrice}>₹{(item.priceAtOrder || 0) * (item.quantity || 1)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalNum}>₹{order.totalAmount}</Text>
          </View>
        </Section>

        <Section title="Payment">
          <Text style={styles.line}>Method: {order.paymentMethod}</Text>
          <Text style={styles.line}>Status: {order.paymentStatus}</Text>
        </Section>

        {showActions && next ? (
          <TouchableOpacity
            style={[styles.mainCta, updating && { opacity: 0.6 }]}
            onPress={handleNextStatus}
            disabled={updating}
          >
            <Text style={styles.mainCtaTxt}>{updating ? 'Updating…' : next.label}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  pad: { paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  light: { marginTop: 8, color: COLORS.textLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: COLORS.text },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  hero: {
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    alignItems: 'center',
  },
  heroStatus: { fontWeight: '800', color: COLORS.primaryDark, marginBottom: 6 },
  heroId: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  heroDate: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
  },
  line: { fontSize: 14, color: COLORS.text, marginBottom: 6 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary + '22',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnTxt: { fontWeight: '700', color: COLORS.primary },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  itemName: { flex: 1, color: COLORS.text },
  itemPrice: { fontWeight: '600', color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  totalLabel: { fontWeight: '700', color: COLORS.text },
  totalNum: { fontWeight: '900', color: COLORS.text, fontSize: 17 },
  mainCta: {
    marginHorizontal: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  mainCtaTxt: { color: COLORS.surface, fontWeight: '800', fontSize: 16 },
  mapSection: { paddingHorizontal: 16, marginBottom: 16 },
  sectionHeading: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  routeSummary: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 8,
    marginTop: -2,
  },
  mapShell: {
    height: 380,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.border,
    position: 'relative',
  },
  mapWeb: { flex: 1, backgroundColor: '#e2e8f0' },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  mapLoadingTxt: { marginTop: 8, fontSize: 12, color: COLORS.textLight },
  mapHintBanner: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 48,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    padding: 8,
  },
  mapHintTxt: { fontSize: 11, color: COLORS.textLight },
  mapsFab: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 22,
    maxWidth: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  mapsFabTxt: {
    color: COLORS.surface,
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  mapFallbackNote: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
  bold: { fontWeight: '700', color: COLORS.text },
});

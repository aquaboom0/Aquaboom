import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchOrderDetails,
  fetchOrderTracking,
  setAgentLocation,
} from '../../store/slices/orderSlice';
import { connectSocket, disconnectSocket } from '../../store/slices/socketSlice';
import { trackingAPI } from '../../services/api';
import { subscribeOrderLiveTracking } from '../../services/liveTrackingRtdb';
import { COLORS } from '../../config';
import { thinCoordinates } from '../../utils/mapRoute';
import { buildLeafletTrackingHtml } from '../../utils/leafletMapHtml';

const toCoord = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

const haversKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.sin(dLng / 2) ** 2;
  const c =
    s1 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      s2;
  return R * (2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c)));
};

const latestTrackingCoord = (trackingHistory) => {
  if (!Array.isArray(trackingHistory) || trackingHistory.length === 0) return null;
  for (let i = trackingHistory.length - 1; i >= 0; i -= 1) {
    const loc = trackingHistory[i]?.location;
    const c = toCoord(loc?.lat, loc?.lng);
    if (c) return c;
  }
  return null;
};

const OrderTrackingScreen = ({ route, navigation }) => {
  const orderId = route?.params?.orderId;
  const dispatch = useDispatch();
  const { currentOrder, trackingInfo, isLoading } = useSelector((s) => s.orders);
  const { isConnected } = useSelector((s) => s.socket);

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [driveMeta, setDriveMeta] = useState(null);
  const [mapBootOk, setMapBootOk] = useState(null);
  const [webRemount, setWebRemount] = useState(0);
  const mapWebRef = useRef(null);

  const order = useMemo(() => {
    const id = orderId != null ? String(orderId) : '';
    if (!id) return null;
    if (currentOrder && String(currentOrder._id) === id) return currentOrder;
    if (trackingInfo && String(trackingInfo._id) === id) {
      return {
        ...trackingInfo,
        assignedAgent: trackingInfo.agent || trackingInfo.assignedAgent,
      };
    }
    return null;
  }, [currentOrder, trackingInfo, orderId]);

  const historyAgent = useMemo(
    () => latestTrackingCoord(order?.trackingHistory || trackingInfo?.trackingHistory),
    [order?.trackingHistory, trackingInfo?.trackingHistory]
  );

  const agent = useMemo(() => {
    const lat =
      order?.assignedAgent?.currentLocation?.lat ??
      trackingInfo?.agent?.currentLocation?.lat ??
      historyAgent?.latitude;
    const lng =
      order?.assignedAgent?.currentLocation?.lng ??
      trackingInfo?.agent?.currentLocation?.lng ??
      historyAgent?.longitude;
    return toCoord(lat, lng);
  }, [
    order?.assignedAgent?.currentLocation?.lat,
    order?.assignedAgent?.currentLocation?.lng,
    trackingInfo?.agent?.currentLocation?.lat,
    trackingInfo?.agent?.currentLocation?.lng,
    historyAgent?.latitude,
    historyAgent?.longitude,
  ]);

  const destination = useMemo(
    () => toCoord(order?.deliveryAddress?.lat, order?.deliveryAddress?.lng),
    [order?.deliveryAddress?.lat, order?.deliveryAddress?.lng]
  );

  const destinationText = useMemo(() => {
    const d = order?.deliveryAddress || {};
    return [d.line1, d.line2, d.landmark, d.city, d.pincode].filter(Boolean).join(', ');
  }, [order?.deliveryAddress]);

  const etaMinutesFromDistance = useMemo(() => {
    const km = haversKm(agent, destination);
    return km ? Math.max(3, Math.round(km / 0.35)) : null;
  }, [agent?.latitude, agent?.longitude, destination?.latitude, destination?.longitude]);

  const etaLabel = useMemo(() => {
    if (driveMeta?.durationSeconds) {
      const m = Math.max(1, Math.round(Number(driveMeta.durationSeconds) / 60));
      return `About ${m} min away`;
    }
    if (etaMinutesFromDistance != null) {
      return `Arriving in ~${etaMinutesFromDistance} min`;
    }
    return destination ? 'Waiting for rider position…' : 'Calculating…';
  }, [driveMeta, etaMinutesFromDistance, destination]);

  const exitTrackingScreen = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }

    // Guaranteed escape route when this screen is opened directly / from push.
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            state: {
              index: 1,
              routes: [{ name: 'Home' }, { name: 'Orders' }, { name: 'Cart' }, { name: 'Profile' }],
            },
          },
        ],
      })
    );
    return true;
  }, [navigation]);

  useEffect(() => {
    if (!orderId) return;
    dispatch(fetchOrderDetails(orderId));
    dispatch(fetchOrderTracking(orderId));
    dispatch(connectSocket(orderId));
    return () => dispatch(disconnectSocket(orderId));
  }, [dispatch, orderId]);

  // Keep order/agent assignment fresh even if socket misses a join/update.
  useEffect(() => {
    if (!orderId) return;
    const refresh = () => {
      dispatch(fetchOrderTracking(orderId));
    };
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
  }, [dispatch, orderId]);

  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeOrderLiveTracking(String(orderId), ({ lat, lng }) => {
      dispatch(
        setAgentLocation({
          orderId: String(orderId),
          location: { lat, lng },
        })
      );
      setLastUpdatedAt(Date.now());
    });
    return () => unsub();
  }, [dispatch, orderId]);

  useEffect(() => {
    if (!orderId) return;
    const poll = async () => {
      try {
        const res = await trackingAPI.getAgentLocation(orderId);
        const loc = res?.data?.data?.location;
        if (loc?.lat !== undefined && loc?.lng !== undefined) {
          dispatch(
            setAgentLocation({
              orderId,
              location: { lat: loc.lat, lng: loc.lng },
            })
          );
          setLastUpdatedAt(Date.now());
        }
      } catch (_e) {
        // ignore — next interval
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [dispatch, orderId]);

  useEffect(() => {
    if (agent) setLastUpdatedAt(Date.now());
  }, [agent?.latitude, agent?.longitude]);

  useEffect(() => {
    if (!orderId || !agent || !destination) {
      setRouteCoords([]);
      setDriveMeta(null);
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      setRouteLoading(true);
      try {
        const res = await trackingAPI.getOrderDriveRoute(orderId);
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
          setDriveMeta({
            distanceMeters: data?.distanceMeters,
            durationSeconds: data?.durationSeconds,
          });
        } else {
          setRouteCoords([agent, destination]);
          setDriveMeta(null);
        }
      } catch (_err) {
        if (!cancelled) {
          setRouteCoords([agent, destination]);
          setDriveMeta(null);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };

    loadRoute();
    const iv = setInterval(loadRoute, 28000);

    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [orderId, agent?.latitude, agent?.longitude, destination?.latitude, destination?.longitude]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => exitTrackingScreen();
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => sub.remove();
    }, [exitTrackingScreen])
  );

  const injectMapFix = useCallback(() => {
    const js = `
      try {
        if (window.__invalidate) { window.__invalidate(); }
        else if (window.__fitTracking) { window.__fitTracking(); }
      } catch (_e) {}
      true;
    `;
    mapWebRef.current?.injectJavaScript(js);
  }, []);

  const openExternalMap = async () => {
    try {
      if (destination) {
        const label = encodeURIComponent(destinationText || 'Delivery');
        const geo = `geo:${destination.latitude},${destination.longitude}?q=${destination.latitude},${destination.longitude}(${label})`;
        if (Platform.OS === 'android') {
          const can = await Linking.canOpenURL(geo).catch(() => false);
          if (can) {
            await Linking.openURL(geo);
            return;
          }
        }
      }

      let url = '';
      if (agent && destination) {
        url = `https://www.google.com/maps/dir/?api=1&origin=${agent.latitude},${agent.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
      } else if (destination) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
      } else if (destinationText) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationText)}`;
      } else {
        Alert.alert('Navigation', 'Destination is not available yet.');
        return;
      }
      await Linking.openURL(url);
    } catch (_e) {
      Alert.alert('Navigation', 'No maps app responded. Install Google Maps or another maps app.');
    }
  };

  const onMapWebMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'map_ready') setMapBootOk(true);
      if (data.type === 'map_boot_error') setMapBootOk(false);
    } catch {
      /* ignore */
    }
  }, []);

  const centerLat = destination?.latitude || agent?.latitude || 20.5937;
  const centerLng = destination?.longitude || agent?.longitude || 78.9629;

  const leafletHtml = useMemo(
    () =>
      buildLeafletTrackingHtml({
        center: { latitude: centerLat, longitude: centerLng },
        agent,
        destination,
        routeCoords,
      }),
    [centerLat, centerLng, agent, destination, routeCoords]
  );

  useEffect(() => {
    setMapBootOk(null);
  }, [leafletHtml, webRemount]);

  if ((isLoading && !order) || !orderId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={exitTrackingScreen}
        >
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Track Order</Text>
        <View style={[styles.dot, isConnected ? styles.dotOn : styles.dotOff]} />
      </View>

      <View style={styles.card}>
        <Text style={styles.order}>Order #{order?.orderId || '-'}</Text>
        <Text style={styles.eta}>{etaLabel}</Text>
        {driveMeta?.distanceMeters ? (
          <Text style={styles.metaDistance}>
            Route ~{(driveMeta.distanceMeters / 1000).toFixed(1)} km
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {lastUpdatedAt
            ? `Live • ${Math.floor((Date.now() - lastUpdatedAt) / 1000)}s since rider update`
            : 'Live • waiting for rider GPS'}
          {routeLoading ? ' • updating route' : ''}
        </Text>
      </View>

      <View style={styles.mapCard}>
        {(destination || agent) ? (
          <>
            <WebView
              ref={mapWebRef}
              key={`track-map-${String(orderId)}-${webRemount}`}
              style={styles.mapWeb}
              source={{
                html: leafletHtml,
                baseUrl: 'https://aquaboom.tracking.local',
              }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              cacheEnabled
              mixedContentMode="always"
              allowsInlineMediaPlayback
              androidLayerType="hardware"
              setBuiltInZoomControls={false}
              startInLoadingState
              nestedScrollEnabled
              onLoadEnd={() => {
                setTimeout(injectMapFix, 120);
                setTimeout(injectMapFix, 400);
              }}
              onMessage={onMapWebMessage}
              onError={() => setMapBootOk(false)}
              onHttpError={() => setMapBootOk(false)}
              renderLoading={() => (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.loadingText}>Loading live map…</Text>
                  <Text style={styles.loadingSub}>OpenStreetMap · not Google Maps</Text>
                </View>
              )}
            />
            <View style={styles.mapBrandPill} pointerEvents="none">
              <View style={styles.mapBrandDot} />
              <Text style={styles.mapBrandTxt}>AquaBoom · live map</Text>
            </View>
            <View style={styles.mapToolbar} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={injectMapFix}
                accessibilityLabel="Fit route and rider on map"
              >
                <Text style={styles.toolBtnTxt}>Fit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() => setWebRemount((n) => n + 1)}
                accessibilityLabel="Reload map"
              >
                <Text style={styles.toolBtnTxt}>Reload</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.mapLegend} pointerEvents="none">
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.legendRider]} />
                <Text style={styles.legendLabel}>Rider</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.legendDrop]} />
                <Text style={styles.legendLabel}>Drop-off</Text>
              </View>
            </View>
            {mapBootOk === false ? (
              <View style={styles.mapWarn} pointerEvents="box-none">
                <Text style={styles.mapWarnTxt}>Map tiles did not finish loading. Tap Reload or check internet.</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Map data not available yet</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>
        <Text style={styles.line}>Status: {order?.status || 'PENDING'}</Text>
        <Text style={styles.line}>
          Rider: {order?.assignedAgent?.name || trackingInfo?.agent?.name || 'Assigning...'}
        </Text>
        <Text style={styles.line}>
          Rider GPS: {agent ? `${agent.latitude.toFixed(5)}, ${agent.longitude.toFixed(5)}` : 'Waiting…'}
        </Text>
        <Text style={styles.line}>Destination: {destinationText || 'Not available'}</Text>
        <TouchableOpacity style={styles.button} onPress={openExternalMap}>
          <Text style={styles.buttonText}>Open in maps app (turn-by-turn)</Text>
        </TouchableOpacity>
        <Text style={styles.buttonHint}>
          Opens Google Maps or your phone{'\u2019'}s default maps app.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: { fontSize: 24, color: COLORS.text },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: COLORS.success },
  dotOff: { backgroundColor: COLORS.error },
  card: {
    margin: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 14,
  },
  mapCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
    height: 380,
    marginBottom: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapWeb: {
    flex: 1,
    backgroundColor: '#e8eaf0',
    opacity: 1,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    paddingHorizontal: 24,
  },
  loadingText: { marginTop: 8, fontSize: 13, fontWeight: '700', color: COLORS.text },
  loadingSub: { marginTop: 6, fontSize: 11, color: COLORS.textLight, textAlign: 'center' },
  mapBrandPill: {
    position: 'absolute',
    left: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    gap: 8,
    maxWidth: '78%',
  },
  mapBrandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  mapBrandTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryDark,
    letterSpacing: 0.2,
  },
  mapToolbar: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toolBtnTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDark },
  mapLegend: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 36,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendRider: { backgroundColor: '#6c2bd9', borderWidth: 1, borderColor: '#fff' },
  legendDrop: { backgroundColor: '#4c1d95', borderWidth: 1, borderColor: '#fff' },
  legendLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f8fafc',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mapWarn: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(254,242,242,0.96)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  mapWarnTxt: { fontSize: 11, color: '#991b1b', fontWeight: '600', textAlign: 'center' },
  order: { color: COLORS.text, fontWeight: '700' },
  eta: { marginTop: 6, color: COLORS.primaryDark, fontWeight: '800', fontSize: 20 },
  metaDistance: { marginTop: 4, color: COLORS.textLight, fontSize: 13 },
  meta: { marginTop: 4, color: COLORS.textLight, fontSize: 12 },
  sheet: {
    marginHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
  },
  line: { color: COLORS.text, marginBottom: 10, fontSize: 14 },
  button: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: COLORS.surface, fontWeight: '800' },
  buttonHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default OrderTrackingScreen;

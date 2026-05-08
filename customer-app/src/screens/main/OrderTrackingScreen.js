import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
  Image,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Circle } from 'react-native-maps';
import { WebView } from 'react-native-webview';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchOrderDetails,
  fetchOrderTracking,
  setAgentLocation,
} from '../../store/slices/orderSlice';
import { connectSocket, disconnectSocket } from '../../store/slices/socketSlice';
import { trackingAPI } from '../../services/api';
import { COLORS } from '../../config';
import { coordsForFit, thinCoordinates } from '../../utils/mapRoute';
import { buildLeafletTrackingHtml } from '../../utils/leafletMapHtml';

const LIVE_TRACKER_ICON = require('../../../assets/map-live-truck.png');

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

const ZEPTO_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f4f4f8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#eef2ff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const OrderTrackingScreen = ({ route, navigation }) => {
  const orderId = route?.params?.orderId;
  const dispatch = useDispatch();
  const { currentOrder, trackingInfo, isLoading } = useSelector((s) => s.orders);
  const { isConnected } = useSelector((s) => s.socket);

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [driveMeta, setDriveMeta] = useState(null);
  const [nativeMapLoaded, setNativeMapLoaded] = useState(false);
  const [mapLoadGracePassed, setMapLoadGracePassed] = useState(false);
  const mapRef = useRef(null);

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

  const fitCamera = useCallback(() => {
    if (!mapRef.current) return;
    const pts = coordsForFit([agent, destination, routeCoords]);
    if (pts.length < 2 && destination) {
      mapRef.current.animateToRegion({
        latitude: destination.latitude,
        longitude: destination.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      });
      return;
    }
    if (pts.length === 1) {
      mapRef.current.animateToRegion({
        latitude: pts[0].latitude,
        longitude: pts[0].longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      });
      return;
    }
    try {
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 70, right: 36, bottom: 70, left: 36 },
        animated: true,
      });
    } catch (_e) {
      // ignore rare layout timing issues
    }
  }, [agent?.latitude, agent?.longitude, destination?.latitude, destination?.longitude, routeCoords]);

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

    const tFit = setTimeout(fitCamera, 800);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(tFit);
    };
  }, [orderId, agent?.latitude, agent?.longitude, destination?.latitude, destination?.longitude, fitCamera]);

  useEffect(() => {
    const t = setTimeout(fitCamera, 500);
    return () => clearTimeout(t);
  }, [routeCoords, fitCamera]);

  useEffect(() => {
    setNativeMapLoaded(false);
    setMapLoadGracePassed(false);
    const t = setTimeout(() => setMapLoadGracePassed(true), 5500);
    return () => clearTimeout(t);
  }, [orderId, agent?.latitude, agent?.longitude, destination?.latitude, destination?.longitude]);

  const openExternalMap = async () => {
    try {
      let url = '';
      if (agent && destination) {
        url = `https://www.google.com/maps/dir/?api=1&origin=${agent.latitude},${agent.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
      } else if (destination) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
      } else if (destinationText) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationText)}`;
      } else {
        Alert.alert('Map unavailable', 'Destination not available yet.');
        return;
      }
      await Linking.openURL(url);
    } catch (_e) {
      Alert.alert('Error', 'Unable to open Google Maps.');
    }
  };

  const centerLat = destination?.latitude || agent?.latitude || 20.5937;
  const centerLng = destination?.longitude || agent?.longitude || 78.9629;
  const showFallbackWebMap = Boolean((destination || agent) && mapLoadGracePassed && !nativeMapLoaded);
  const fallbackHtml = useMemo(
    () =>
      buildLeafletTrackingHtml({
        center: { latitude: centerLat, longitude: centerLng },
        agent,
        destination,
        routeCoords,
      }),
    [centerLat, centerLng, agent, destination, routeCoords]
  );

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
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Orders');
            }
          }}
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
        {(destination || agent) && !showFallbackWebMap ? (
          <MapView
            ref={mapRef}
            style={styles.mapView}
            provider={PROVIDER_GOOGLE}
            customMapStyle={ZEPTO_MAP_STYLE}
            initialRegion={{
              latitude: centerLat,
              longitude: centerLng,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
            onMapReady={() => fitCamera()}
            onMapLoaded={() => setNativeMapLoaded(true)}
            showsUserLocation={false}
            showsCompass={false}
            showsTraffic={false}
            showsIndoors={false}
            toolbarEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {destination ? (
              <Marker coordinate={destination} title="Deliver to you" pinColor={COLORS.primaryDark} />
            ) : null}
            {agent ? (
              <Circle
                center={agent}
                radius={45}
                strokeWidth={0}
                fillColor="rgba(108,43,217,0.14)"
              />
            ) : null}
            {agent ? (
              <Marker
                coordinate={agent}
                title="Delivery partner"
                description={
                  order?.assignedAgent?.vehicleNumber || trackingInfo?.agent?.vehicleNumber
                    ? `Vehicle ${order?.assignedAgent?.vehicleNumber || trackingInfo?.agent?.vehicleNumber}`
                    : ''
                }
                anchor={{ x: 0.5, y: 0.85 }}
                tracksViewChanges={false}
              >
                <View style={styles.bikeBubble}>
                  <Image source={LIVE_TRACKER_ICON} style={styles.bikeIconImage} resizeMode="contain" />
                </View>
              </Marker>
            ) : null}
            {routeCoords?.length >= 2 ? (
              <Polyline
                coordinates={routeCoords}
                strokeColor="#6C2BD9"
                strokeWidth={6}
              />
            ) : null}
          </MapView>
        ) : showFallbackWebMap ? (
          <WebView
            style={styles.mapWeb}
            source={{ html: fallbackHtml }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading fallback map…</Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Map data not available yet</Text>
          </View>
        )}
        <View style={styles.livePill}>
          <Text style={styles.livePillText}>
            {agent ? (showFallbackWebMap ? 'Live rider tracking (fallback)' : 'Live rider tracking') : 'Waiting for rider location'}
          </Text>
        </View>
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
          <Text style={styles.buttonText}>Open navigation (Google Maps)</Text>
        </TouchableOpacity>
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
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    height: 300,
    marginBottom: 12,
    position: 'relative',
  },
  mapView: { flex: 1, backgroundColor: '#e2e8f0' },
  mapWeb: { flex: 1, backgroundColor: '#e2e8f0' },
  bikeBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  bikeIconImage: { width: 26, height: 26 },
  loadingOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2f7' },
  loadingText: { marginTop: 6, fontSize: 12, color: COLORS.textLight },
  livePill: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  livePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
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
});

export default OrderTrackingScreen;

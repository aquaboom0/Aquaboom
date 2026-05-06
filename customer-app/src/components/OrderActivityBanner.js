import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { dismissOrderActivityBanner } from '../store/slices/realtimeSlice';

const { width: W } = Dimensions.get('window');

const GRADIENTS = {
  teal: ['#0f766e', '#14b8a6', '#2dd4bf'],
  emerald: ['#047857', '#10b981', '#34d399'],
  indigo: ['#3730a3', '#6366f1', '#a5b4fc'],
  violet: ['#5b21b6', '#8b5cf6', '#c4b5fd'],
  success: ['#14532d', '#22c55e', '#86efac'],
  rose: ['#9f1239', '#f43f5e', '#fda4af'],
  slate: ['#0f172a', '#334155', '#64748b'],
};

const OrderActivityBanner = () => {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const banner = useSelector((s) => s.realtime?.orderActivityBanner);
  const slide = useRef(new Animated.Value(-180)).current;

  useEffect(() => {
    if (!banner) {
      Animated.timing(slide, {
        toValue: -180,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.spring(slide, {
      toValue: 0,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => dispatch(dismissOrderActivityBanner()), 6500);
    return () => clearTimeout(t);
  }, [banner, dispatch, slide]);

  if (!banner) return null;

  const colors = GRADIENTS[banner.accent] || GRADIENTS.teal;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 8),
          transform: [{ translateY: slide }],
        },
      ]}
      pointerEvents="box-none"
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.inner}>
          <View style={styles.textCol}>
            <View style={styles.badgeRow}>
              <Text style={styles.liveDot}>●</Text>
              <Text style={styles.badge}>LIVE ORDER</Text>
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {banner.title}
            </Text>
            <Text style={styles.sub} numberOfLines={2}>
              {banner.subtitle}
            </Text>
            {banner.orderRef ? (
              <Text style={styles.ref}>#{banner.orderRef}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => dispatch(dismissOrderActivityBanner())}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.shine} />
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    maxWidth: W - 24,
    alignSelf: 'center',
    width: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 10,
  },
  textCol: { flex: 1, paddingRight: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  liveDot: { color: '#fef08a', fontSize: 10, marginRight: 6 },
  badge: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  ref: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  shine: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ skewX: '-18deg' }, { translateX: 40 }],
  },
});

export default OrderActivityBanner;

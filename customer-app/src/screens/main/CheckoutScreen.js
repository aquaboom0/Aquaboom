import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import * as Location from 'expo-location';
import { useDispatch, useSelector } from 'react-redux';
import RazorpayCheckout from 'react-native-razorpay';
import { createOrder, verifyPayment } from '../../store/slices/orderSlice';
import { clearCart } from '../../store/slices/cartSlice';
import { COLORS, RAZORPAY_KEY_ID } from '../../config';
import { hapticSuccess } from '../../utils/haptics';

const CheckoutScreen = ({ route, navigation }) => {
  const { amount, discount, deliveryCharge } = route.params;
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { items, subtotal } = useSelector((state) => state.cart);
  const { isLoading } = useSelector((state) => state.orders);

  const [paymentMethod, setPaymentMethod] = useState('online');
  const [deliveryAddress, setDeliveryAddress] = useState(
    user?.addresses?.find((a) => a.isDefault)?.line1 || user?.addresses?.[0]?.line1 || ''
  );
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Order placed');
  const [confirmBody, setConfirmBody] = useState('');
  const confirmScale = useRef(new Animated.Value(0.88)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const tickScale = useRef(new Animated.Value(0.6)).current;

  const timeSlots = [
    { id: 'morning', label: 'Morning (8AM - 12PM)', time: '08:00 - 12:00' },
    { id: 'afternoon', label: 'Afternoon (12PM - 4PM)', time: '12:00 - 16:00' },
    { id: 'evening', label: 'Evening (4PM - 8PM)', time: '16:00 - 20:00' },
  ];

  const handlePlaceOrder = async () => {
    if (!deliveryAddress.trim()) {
      Alert.alert('Error', 'Please enter a delivery address');
      return;
    }
    if (!selectedSlot) {
      Alert.alert('Error', 'Please select a delivery time slot');
      return;
    }

    const orderData = {
      items: items.map((item) => ({
        productId: item.product._id,
        quantity: item.quantity,
      })),
      deliveryAddress: {
        line1: deliveryAddress,
        city: currentCoords?.city || 'Bangalore',
        pincode: currentCoords?.pincode || '560001',
        lat: currentCoords?.lat,
        lng: currentCoords?.lng,
      },
      customerNote: `Slot: ${selectedSlot}${deliveryInstructions ? ` | ${deliveryInstructions}` : ''}`,
      paymentMethod: paymentMethod === 'cod' ? 'COD' : 'ONLINE',
    };

    const result = await dispatch(createOrder(orderData));
    if (!createOrder.fulfilled.match(result)) return;

    if (paymentMethod === 'cod') {
      dispatch(clearCart());
      showOrderConfirmation(
        'Order placed successfully',
        'Your order is saved instantly. We will confirm it shortly and keep you updated in My Orders.'
      );
      return;
    }

    const order = result.payload?.order;
    const razorpayOrder = result.payload?.razorpayOrder;
    const key = result.payload?.key || RAZORPAY_KEY_ID;
    if (!order?._id || !razorpayOrder?.id || !key) {
      Alert.alert('Payment Error', 'Could not initialize Razorpay order');
      return;
    }

    try {
      const paymentRes = await RazorpayCheckout.open({
        description: `Order ${order.orderId}`,
        image: 'https://i.imgur.com/3g7nmJC.png',
        currency: 'INR',
        key,
        amount: razorpayOrder.amount,
        name: 'AquaBoom',
        order_id: razorpayOrder.id,
        prefill: {
          email: user?.email || '',
          contact: user?.phone || '',
          name: user?.name || '',
        },
        theme: { color: COLORS.primary },
      });

      const verifyRes = await dispatch(
        verifyPayment({
          orderId: order._id,
          razorpayOrderId: paymentRes.razorpay_order_id,
          razorpayPaymentId: paymentRes.razorpay_payment_id,
          razorpaySignature: paymentRes.razorpay_signature,
        })
      );

      if (verifyPayment.fulfilled.match(verifyRes)) {
        dispatch(clearCart());
        showOrderConfirmation(
          'Payment successful',
          'We have received your payment. Your order is now being prepared and will appear in My Orders.'
        );
      } else {
        Alert.alert('Payment Verification Failed', verifyRes.payload || 'Try again');
      }
    } catch (e) {
      Alert.alert('Payment Cancelled', e?.description || 'Payment not completed');
    }
  };

  const showOrderConfirmation = (title, body) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmVisible(true);

    confirmScale.setValue(0.88);
    confirmOpacity.setValue(0);
    tickScale.setValue(0.6);

    Animated.parallel([
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(confirmScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(tickScale, {
          toValue: 1.06,
          duration: 240,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.spring(tickScale, {
          toValue: 1,
          friction: 7,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    hapticSuccess();
  };

  const handleCloseConfirmation = () => {
    setConfirmVisible(false);
    navigation.navigate('Orders');
  };

  const handleUseCurrentLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location permission.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (lat === undefined || lng === undefined) {
        Alert.alert('Location error', 'Could not fetch coordinates');
        return;
      }
      const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const g = geocode?.[0] || {};
      const line = [g.name, g.street, g.subregion].filter(Boolean).join(', ');
      setDeliveryAddress(line || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      setCurrentCoords({
        lat,
        lng,
        city: g.city || g.subregion || 'Bangalore',
        pincode: g.postalCode || '560001',
      });
    } catch (_e) {
      Alert.alert('Error', 'Unable to fetch current location');
    } finally {
      setLocLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <TextInput
            style={styles.addressInput}
            placeholder="Enter your full delivery address"
            placeholderTextColor={COLORS.textLight}
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.locationBtn} onPress={handleUseCurrentLocation} disabled={locLoading}>
            <Text style={styles.locationBtnText}>{locLoading ? 'Fetching location...' : 'Use Current Location'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.instructionsInput}
            placeholder="Delivery instructions (optional)"
            placeholderTextColor={COLORS.textLight}
            value={deliveryInstructions}
            onChangeText={setDeliveryInstructions}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Delivery Time</Text>
          {timeSlots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={[styles.slotOption, selectedSlot === slot.id && styles.slotSelected]}
              onPress={() => setSelectedSlot(slot.id)}
            >
              <View style={styles.radioOuter}>{selectedSlot === slot.id && <View style={styles.radioInner} />}</View>
              <View style={styles.slotInfo}>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                <Text style={styles.slotTime}>{slot.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'online' && styles.paymentSelected]}
            onPress={() => setPaymentMethod('online')}
          >
            <View style={styles.radioOuter}>{paymentMethod === 'online' && <View style={styles.radioInner} />}</View>
            <Text style={styles.paymentLabel}>Online (Razorpay)</Text>
            <Text style={styles.paymentIcon}>💳</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'cod' && styles.paymentSelected]}
            onPress={() => setPaymentMethod('cod')}
          >
            <View style={styles.radioOuter}>{paymentMethod === 'cod' && <View style={styles.radioInner} />}</View>
            <Text style={styles.paymentLabel}>Cash on Delivery</Text>
            <Text style={styles.paymentIcon}>💵</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {items.map((item) => (
            <View key={item.product._id} style={styles.summaryItem}>
              <Text style={styles.summaryItemName} numberOfLines={1}>
                {item.product.name} x {item.quantity}
              </Text>
              <Text style={styles.summaryItemPrice}>
                Rs {(item.product.price ?? item.product.pricePerUnit ?? 0) * item.quantity}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>Rs {subtotal.toFixed(2)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount</Text>
              <Text style={[styles.summaryValue, styles.discountText]}>- Rs {discount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={[styles.summaryValue, deliveryCharge === 0 && styles.freeText]}>
              {deliveryCharge === 0 ? 'FREE' : `Rs ${deliveryCharge}`}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total to Pay</Text>
            <Text style={styles.totalValue}>Rs {amount.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.placeOrderButton, isLoading && styles.buttonDisabled]} onPress={handlePlaceOrder} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.placeOrderText}>{paymentMethod === 'cod' ? 'Place Order' : `Pay Rs ${amount.toFixed(2)}`}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseConfirmation}
      >
        <View style={styles.confirmBackdrop}>
          <Animated.View
            style={[
              styles.confirmCard,
              {
                opacity: confirmOpacity,
                transform: [{ scale: confirmScale }],
              },
            ]}
          >
            <Animated.View style={[styles.tickWrap, { transform: [{ scale: tickScale }] }]}>
              <Text style={styles.tickText}>✓</Text>
            </Animated.View>
            <Text style={styles.confirmTitle}>{confirmTitle}</Text>
            <Text style={styles.confirmBody}>{confirmBody}</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleCloseConfirmation}>
              <Text style={styles.confirmBtnText}>View Orders</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 24, color: COLORS.text },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  section: { backgroundColor: COLORS.surface, margin: 16, marginBottom: 0, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  addressInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 80, marginBottom: 12 },
  instructionsInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: 12, fontSize: 14, color: COLORS.text },
  locationBtn: { backgroundColor: '#e0f2fe', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  locationBtnText: { color: COLORS.primaryDark, fontWeight: '700' },
  slotOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, padding: 12, marginBottom: 8 },
  slotSelected: { borderWidth: 2, borderColor: COLORS.primary },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  slotInfo: { flex: 1 },
  slotLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  slotTime: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  paymentOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, padding: 12, marginBottom: 8 },
  paymentSelected: { borderWidth: 2, borderColor: COLORS.primary },
  paymentLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  paymentIcon: { fontSize: 20 },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryItemName: { flex: 1, fontSize: 14, color: COLORS.textLight },
  summaryItemPrice: { fontSize: 14, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: COLORS.textLight },
  summaryValue: { fontSize: 14, color: COLORS.text },
  discountText: { color: COLORS.success },
  freeText: { color: COLORS.success },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  footer: { padding: 16, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  placeOrderButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  placeOrderText: { color: COLORS.surface, fontSize: 18, fontWeight: '600' },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  tickWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    borderWidth: 1.5,
    borderColor: '#86efac',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tickText: {
    color: '#16a34a',
    fontSize: 34,
    fontWeight: '800',
    marginTop: -1,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  confirmBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  confirmBtn: {
    marginTop: 18,
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default CheckoutScreen;

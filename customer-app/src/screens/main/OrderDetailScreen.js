import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOrderDetails, cancelOrder } from '../../store/slices/orderSlice';
import { COLORS } from '../../config';

const OrderDetailScreen = ({ route, navigation }) => {
  const { orderId } = route.params;
  const dispatch = useDispatch();
  const { currentOrder: order, isLoading } = useSelector(state => state.orders);

  useEffect(() => {
    dispatch(fetchOrderDetails(orderId));
  }, [orderId, dispatch]);

  const handleCancelOrder = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            await dispatch(cancelOrder(orderId));
            navigation.goBack();
          }
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    const statusColors = {
      PENDING: COLORS.warning,
      CONFIRMED: COLORS.primary,
      ASSIGNED: COLORS.primary,
      PICKED_UP: COLORS.primary,
      IN_TRANSIT: COLORS.primary,
      DELIVERED: COLORS.success,
      CANCELLED: COLORS.error,
    };
    return statusColors[status] || COLORS.textLight;
  };

  const getStatusLabel = (status) => {
    const labels = {
      PENDING: 'Pending',
      CONFIRMED: 'Confirmed',
      ASSIGNED: 'Assigned to Delivery Partner',
      PICKED_UP: 'Picked Up',
      IN_TRANSIT: 'In Transit',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
    };
    return labels[status] || status;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading || !order) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const canCancel = ['PLACED', 'PENDING_APPROVAL', 'AUTO_APPROVED'].includes(order.status);
  const resolveAddress = () => {
    if (!order?.deliveryAddress) return 'Not specified';
    if (order.deliveryAddress.fullAddress) return order.deliveryAddress.fullAddress;
    const parts = [
      order.deliveryAddress.line1,
      order.deliveryAddress.line2,
      order.deliveryAddress.landmark,
      order.deliveryAddress.city,
      order.deliveryAddress.pincode,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Not specified';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Order Status */}
        <View style={styles.statusSection}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
              {getStatusLabel(order.status)}
            </Text>
          </View>
          <Text style={styles.orderId}>Order #{order.orderId}</Text>
          <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {(order.items || []).map((item, index) => {
            const unitPrice = Number(item.priceAtOrder ?? item.price ?? 0);
            const qty = Number(item.quantity || 0);
            const lineTotal = unitPrice * qty;
            return (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.product?.name || 'Product'}</Text>
                <Text style={styles.itemDetails}>
                  ₹{unitPrice} x {qty}
                </Text>
              </View>
              <Text style={styles.itemTotal}>₹{Number.isFinite(lineTotal) ? lineTotal : 0}</Text>
            </View>
          );
          })}
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Text style={styles.addressText}>
            {resolveAddress()}
          </Text>
          {order.deliveryAddress?.instructions && (
            <Text style={styles.instructionsText}>
              Note: {order.deliveryAddress.instructions}
            </Text>
          )}
        </View>

        {/* Delivery Time */}
        {order.deliverySlot && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Time</Text>
            <Text style={styles.slotText}>{order.deliverySlot}</Text>
          </View>
        )}

        {/* Delivery Agent */}
        {order.assignedAgent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Partner</Text>
            <View style={styles.agentCard}>
              <View style={styles.agentAvatar}>
                <Text style={styles.agentAvatarText}>
                  {order.assignedAgent.name?.charAt(0) || 'D'}
                </Text>
              </View>
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{order.assignedAgent.name}</Text>
                <Text style={styles.agentPhone}>{order.assignedAgent.phone}</Text>
              </View>
              {order.assignedAgent.phone && (
                <TouchableOpacity 
                  style={styles.callButton}
                  onPress={() => {
                    // In a real app, use Linking to make a call
                    Alert.alert('Call', `Calling ${order.assignedAgent.phone}...`);
                  }}
                >
                  <Text style={styles.callButtonText}>📞</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Subtotal</Text>
            <Text style={styles.paymentValue}>₹{order.subtotal}</Text>
          </View>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Delivery Charge</Text>
            <Text style={styles.paymentValue}>
              {order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge}`}
            </Text>
          </View>
          
          {order.discount > 0 && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Discount</Text>
              <Text style={[styles.paymentValue, styles.discountText]}>
                - ₹{order.discount}
              </Text>
            </View>
          )}
          
          <View style={styles.divider} />
          
          <View style={styles.paymentRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{order.totalAmount}</Text>
          </View>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Payment Method</Text>
            <Text style={styles.paymentValue}>
              {String(order.paymentMethod || '').toUpperCase() === 'COD' ? 'Cash on Delivery' : 'Online Payment'}
            </Text>
          </View>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Payment Status</Text>
            <Text style={[styles.paymentValue, { 
              color: order.paymentStatus === 'PAID' ? COLORS.success : COLORS.warning 
            }]}>
              {order.paymentStatus}
            </Text>
          </View>
        </View>

        {/* Track Order Button */}
        {['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.status) && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.trackButton}
              onPress={() => navigation.navigate('OrderTracking', { orderId: order._id })}
            >
              <Text style={styles.trackButtonText}>Track Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Order Button */}
        {canCancel && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={handleCancelOrder}
            >
              <Text style={styles.cancelButtonText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  backButton: {
    fontSize: 24,
    color: COLORS.text,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusSection: {
    backgroundColor: COLORS.surface,
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  orderId: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  section: {
    backgroundColor: COLORS.surface,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  itemDetails: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  addressText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  instructionsText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginTop: 8,
  },
  slotText: {
    fontSize: 14,
    color: COLORS.text,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  agentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  agentPhone: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 20,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  paymentValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  discountText: {
    color: COLORS.success,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  buttonContainer: {
    padding: 16,
  },
  trackButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  trackButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: COLORS.error + '20',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  cancelButtonText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OrderDetailScreen;
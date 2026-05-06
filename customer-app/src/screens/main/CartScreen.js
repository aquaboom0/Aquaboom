import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  TextInput,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart, removeFromCart, clearCart } from '../../store/slices/cartSlice';
import { COLORS, SPACE, RADII } from '../../config';

const CartScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { items, subtotal, deliveryCharge, freeDeliveryThreshold } = useSelector(state => state.cart);
  const { user } = useSelector(state => state.auth);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  const handleQuantityChange = (item, delta) => {
    if (delta === -1 && item.quantity === 1) {
      Alert.alert(
        'Remove Item',
        'Do you want to remove this item from cart?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Remove', 
            style: 'destructive',
            onPress: () => dispatch(removeFromCart(item.product._id))
          },
        ]
      );
    } else {
      dispatch(addToCart({ product: item.product, quantity: delta }));
    }
  };

  const handleRemoveItem = (productId) => {
    Alert.alert(
      'Remove Item',
      'Do you want to remove this item from cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => dispatch(removeFromCart(productId))
        },
      ]
    );
  };

  const handleApplyCoupon = () => {
    // Mock coupon validation
    if (couponCode.toUpperCase() === 'FIRST50') {
      setAppliedCoupon({ code: 'FIRST50', discount: 50 });
      setCouponCode('');
    } else if (couponCode.toUpperCase() === 'FRESH10') {
      setAppliedCoupon({ code: 'FRESH10', discount: subtotal * 0.1 });
      setCouponCode('');
    } else {
      Alert.alert('Invalid Coupon', 'Please enter a valid coupon code');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  const calculateDiscount = () => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.code === 'FIRST50') {
      return Math.min(appliedCoupon.discount, subtotal * 0.5);
    }
    return appliedCoupon.discount;
  };

  const discount = calculateDiscount();
  const appliedDelivery = subtotal >= freeDeliveryThreshold ? 0 : deliveryCharge;
  const finalAmount = subtotal - discount + appliedDelivery;

  const handleCheckout = () => {
    if (!user) {
      Alert.alert('Login Required', 'Please login to place an order', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }
    navigation.navigate('Checkout', { 
      amount: finalAmount,
      discount,
      deliveryCharge: appliedDelivery
    });
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.itemImageContainer}>
        {item.product?.image ? (
          <Image source={{ uri: item.product.image }} style={styles.itemImage} />
        ) : (
          <View style={styles.itemImagePlaceholder}>
            <Text style={styles.placeholderText}>💧</Text>
          </View>
        )}
      </View>
      
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.product?.name}</Text>
        <Text style={styles.itemPrice}>₹{item.product?.price ?? item.product?.pricePerUnit} / {item.product?.unit}</Text>
        
        <View style={styles.itemActions}>
          <View style={styles.quantityControl}>
            <TouchableOpacity 
              style={styles.quantityButton}
              onPress={() => handleQuantityChange(item, -1)}
            >
              <Text style={styles.quantityButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <TouchableOpacity 
              style={styles.quantityButton}
              onPress={() => handleQuantityChange(item, 1)}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => handleRemoveItem(item.product._id)}
            
          >
            <Text style={styles.removeButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.itemTotal}>
        <Text style={styles.itemTotalText}>₹{(item.product?.price ?? item.product?.pricePerUnit ?? 0) * item.quantity}</Text>
      </View>
    </View>
  );

  const renderEmptyCart = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🛒</Text>
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptySubtitle}>Add some water bottles to get started</Text>
      <TouchableOpacity 
        style={styles.shopButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.shopButtonText}>Start Shopping</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={() => dispatch(clearCart())}>
            <Text style={styles.clearButton}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        renderEmptyCart()
      ) : (
        <>
          <FlatList
            data={items}
            renderItem={renderCartItem}
            keyExtractor={item => item.product._id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          {/* Coupon Section */}
          <View style={styles.couponSection}>
            <Text style={styles.sectionTitle}>Apply Coupon</Text>
            {appliedCoupon ? (
              <View style={styles.appliedCoupon}>
                <Text style={styles.appliedCouponText}>{appliedCoupon.code}</Text>
                <Text style={styles.appliedCouponDiscount}>- ₹{discount.toFixed(2)}</Text>
                <TouchableOpacity onPress={handleRemoveCoupon}>
                  <Text style={styles.removeCouponText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.couponInput}>
                <TextInput
                  style={styles.couponTextInput}
                  placeholder="Enter coupon code"
                  placeholderTextColor={COLORS.placeholder}
                  value={couponCode}
                  onChangeText={setCouponCode}
                />
                <TouchableOpacity 
                  style={styles.applyButton}
                  onPress={handleApplyCoupon}
                >
                  <Text style={styles.applyButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Price Summary */}
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Price Details</Text>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({items.length} items)</Text>
              <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            
            {discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount</Text>
                <Text style={[styles.summaryValue, styles.discountText]}>
                  - ₹{discount.toFixed(2)}
                </Text>
              </View>
            )}
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Charge</Text>
              <Text style={[styles.summaryValue, appliedDelivery === 0 && styles.freeText]}>
                {appliedDelivery === 0 ? 'FREE' : `₹${deliveryCharge}`}
              </Text>
            </View>
            
            {subtotal < freeDeliveryThreshold && (
              <Text style={styles.freeDeliveryHint}>
                Add ₹{Math.max(0, freeDeliveryThreshold - subtotal).toFixed(2)} more for free delivery
              </Text>
            )}
            
            <View style={styles.divider} />
            
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{finalAmount.toFixed(2)}</Text>
            </View>
          </View>

          {/* Checkout Button */}
          <View style={styles.checkoutSection}>
            <TouchableOpacity 
              style={styles.checkoutButton}
              onPress={handleCheckout}
            >
              <Text style={styles.checkoutButtonText}>
                Proceed to Checkout • ₹{finalAmount.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  clearButton: {
    fontSize: 14,
    color: COLORS.error,
  },
  listContent: {
    padding: 16,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemPrice: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 12,
  },
  removeButton: {
    marginLeft: 'auto',
    padding: 8,
  },
  removeButtonText: {
    fontSize: 18,
  },
  itemTotal: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  itemTotalText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 24,
  },
  shopButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  shopButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  couponSection: {
    padding: 16,
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  couponInput: {
    flexDirection: 'row',
  },
  couponTextInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    marginRight: 12,
  },
  applyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  applyButtonText: {
    color: COLORS.surface,
    fontWeight: '600',
  },
  appliedCoupon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '20',
    borderRadius: 8,
    padding: 12,
  },
  appliedCouponText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
    flex: 1,
  },
  appliedCouponDiscount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
    marginRight: 12,
  },
  removeCouponText: {
    fontSize: 16,
    color: COLORS.textLight,
  },
  summarySection: {
    padding: 16,
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  discountText: {
    color: COLORS.success,
  },
  freeText: {
    color: COLORS.success,
  },
  freeDeliveryHint: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  checkoutSection: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  checkoutButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '600',
  },
});

export default CartScreen;
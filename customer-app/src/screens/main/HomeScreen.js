import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProducts } from '../../store/slices/productSlice';
import { fetchBanners } from '../../store/slices/bannerSlice';
import { addToCart } from '../../store/slices/cartSlice';
import { COLORS, SPACE, RADII } from '../../config';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';

const { width: WINDOW_W } = Dimensions.get('window');
const H_PAD = SPACE.lg;
/** Full-bleed paging width; image frame is inset so carousel aligns with product grid. */
const SLIDE_W = WINDOW_W;
const BANNER_FRAME_W = SLIDE_W - H_PAD * 2;
const BANNER_H = Math.round(BANNER_FRAME_W / 2.25);

const HomeScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { products = [], loading: productsLoading } = useSelector(state => state.products);
  const { banners } = useSelector(state => state.banners);
  const { items: cartItems } = useSelector(state => state.cart);
  const [refreshing, setRefreshing] = useState(false);
  const posterRef = useRef(null);
  const [posterIndex, setPosterIndex] = useState(0);

  const slides = useMemo(() => {
    if (!banners?.length) return [{ _id: '_placeholder', uri: null }];
    return banners.map((b) => ({
      ...b,
      uri: b.resolvedUrl || resolveMediaUrl(b.imageUrl || b.image),
    }));
  }, [banners]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      dispatch(fetchProducts()),
      dispatch(fetchBanners()),
    ]);
  };

  useEffect(() => {
    const n = slides.length;
    if (n <= 1) return undefined;
    const timer = setInterval(() => {
      setPosterIndex((prev) => {
        const next = (prev + 1) % n;
        posterRef.current?.scrollToIndex?.({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddToCart = (product) => {
    dispatch(addToCart(product));
  };

  const getCartQuantity = (productId) => {
    const item = cartItems.find(i => i._id === productId);
    return item ? item.quantity : 0;
  };

  const renderProduct = ({ item }) => {
    const quantity = getCartQuantity(item._id);
    
    return (
      <TouchableOpacity 
        style={styles.productCard}
        onPress={() => navigation.navigate('ProductDetail', { product: item })}
      >
        <View style={styles.productImageContainer}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.productImage} />
          ) : (
            <View style={styles.productPlaceholder}>
              <Text style={styles.productPlaceholderText}>💧</Text>
            </View>
          )}
          {item.isOnSale && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleText}>SALE</Text>
            </View>
          )}
        </View>
        
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.description ? (
            <Text style={styles.productDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <Text style={styles.productPrice}>₹{item.price}</Text>
              {item.originalPrice > item.price && (
                <Text style={styles.originalPrice}>₹{item.originalPrice}</Text>
              )}
            </View>
            <Text style={styles.productUnit} numberOfLines={1}>
              / {item.unit}
            </Text>
          </View>

          {item.inStock ? (
            quantity > 0 ? (
              <View style={styles.quantityControl}>
                <TouchableOpacity 
                  style={styles.quantityButton}
                  onPress={() => dispatch(addToCart({ ...item, quantity: -1 }))}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.quantityText}>{quantity}</Text>
                <TouchableOpacity 
                  style={styles.quantityButton}
                  onPress={() => dispatch(addToCart(item))}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => handleAddToCart(item)}
              >
                <Text style={styles.addButtonText}>Add to Cart</Text>
              </TouchableOpacity>
            )
          ) : (
            <View style={styles.outOfStock}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (productsLoading && products.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.greeting}>Hello, {user?.name?.split?.(' ')?.[0] || 'there'} 👋</Text>
          <Text style={styles.location}>Delivering to · Home</Text>
        </View>
        <TouchableOpacity 
          style={styles.cartButton}
          onPress={() => navigation.navigate('Cart')}
        >
          <Text style={styles.cartIcon}>🛒</Text>
          {cartItems.length > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offers for you</Text>
          <FlatList
            ref={posterRef}
            data={slides}
            horizontal
            pagingEnabled
            snapToInterval={SLIDE_W}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => String(item._id ?? index)}
            getItemLayout={(_, index) => ({ length: SLIDE_W, offset: SLIDE_W * index, index })}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                posterRef.current?.scrollToIndex({ index, animated: true });
              }, 400);
            }}
            renderItem={({ item }) => (
              <View style={[styles.offerSlide, { width: SLIDE_W }]}>
                <View style={[styles.bannerFrame, { width: BANNER_FRAME_W, height: BANNER_H }]}>
                  {item.uri ? (
                    <Image source={{ uri: item.uri }} style={styles.bannerFill} resizeMode="cover" />
                  ) : (
                    <View style={styles.bannerPlaceholder}>
                      <Text style={styles.bannerPlaceholderTitle}>Hero offers</Text>
                      <Text style={styles.bannerPlaceholderSub}>Add carousel posters from the Admin panel (Banners tab).</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_W);
              if (!Number.isNaN(idx)) setPosterIndex(Math.max(0, Math.min(idx, slides.length - 1)));
            }}
          />
          {slides.length > 1 ? (
            <View style={styles.posterDots}>
              {slides.map((s, idx) => (
                <View
                  key={`dot-${s._id ?? idx}`}
                  style={[styles.posterDot, idx === posterIndex && styles.posterDotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Products */}
        <View style={[styles.section, styles.sectionProducts]}>
          <Text style={styles.sectionTitle}>Shop products</Text>
          <FlatList
            data={products}
            renderItem={renderProduct}
            keyExtractor={item => item._id}
            numColumns={2}
            columnWrapperStyle={styles.productRow}
            scrollEnabled={false}
          />
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  headerTextBlock: {
    flex: 1,
    marginRight: SPACE.sm,
    minWidth: 0,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  location: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 5,
    letterSpacing: 0.15,
  },
  cartButton: {
    width: 48,
    height: 48,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartIcon: {
    fontSize: 24,
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  cartBadgeText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    marginTop: SPACE.lg,
  },
  sectionProducts: {
    marginTop: SPACE.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    paddingHorizontal: SPACE.lg,
    marginBottom: SPACE.md,
    letterSpacing: -0.35,
  },
  offerSlide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerFrame: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bannerFill: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    paddingHorizontal: SPACE.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
  },
  bannerPlaceholderTitle: {
    fontWeight: '800',
    fontSize: 15,
    color: COLORS.primaryDark,
    textAlign: 'center',
  },
  bannerPlaceholderSub: {
    marginTop: SPACE.sm,
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: SPACE.sm,
  },
  posterDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
  },
  posterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.borderStrong,
    marginHorizontal: 4,
  },
  posterDotActive: {
    backgroundColor: COLORS.primary,
    width: 20,
    height: 7,
    borderRadius: 4,
  },
  productRow: {
    paddingHorizontal: SPACE.md,
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  productCard: {
    width: '48%',
    maxWidth: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
    overflow: 'hidden',
  },
  productImageContainer: {
    height: 128,
    backgroundColor: COLORS.surfaceMuted,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(109, 40, 217, 0.08)',
  },
  productPlaceholderText: {
    fontSize: 48,
  },
  saleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: COLORS.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saleText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: 'bold',
  },
  productInfo: {
    flexGrow: 1,
    padding: SPACE.md,
    paddingBottom: SPACE.md,
    minHeight: 128,
    justifyContent: 'flex-start',
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 5,
    lineHeight: 20,
    minHeight: 40,
  },
  productDescription: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: SPACE.sm,
    lineHeight: 16,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: SPACE.sm,
    marginTop: 'auto',
  },
  priceCol: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  productPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primaryDark,
    letterSpacing: -0.3,
  },
  originalPrice: {
    fontSize: 12,
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
    marginLeft: 6,
  },
  productUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
    marginLeft: 'auto',
    maxWidth: '42%',
    textAlign: 'right',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  addButtonText: {
    color: COLORS.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADII.sm,
    paddingVertical: 5,
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: COLORS.surface,
    fontSize: 20,
    fontWeight: 'bold',
  },
  quantityText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
  },
  outOfStock: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADII.sm,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outOfStockText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default HomeScreen;
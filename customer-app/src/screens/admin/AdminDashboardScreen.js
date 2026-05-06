import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { adminAPI } from '../../services/api';
import { logout } from '../../store/slices/authSlice';
import { fetchProducts } from '../../store/slices/productSlice';
import { connectSocket, disconnectSocket } from '../../store/slices/socketSlice';
import { ensurePushRegistrationForStaff } from '../../services/pushNotifications';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import { ADMIN_THEME } from './adminTheme';
import AdminBannersTab from './AdminBannersTab';
import { formatApiErrorForAlert } from '../../utils/apiReachability';
import {
  getApiBaseUrlSync,
  parseHostPortFromOverride,
  persistEndpointOverride,
  clearEndpointOverride,
} from '../../config/dynamicEndpoints';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = ['queue', 'analytics', 'banners', 'products', 'agents', 'orders'];

const TAB_LABELS = {
  queue: 'Queue',
  analytics: 'Insights',
  banners: 'Posters',
  products: 'Catalog',
  agents: 'Fleet',
  orders: 'Orders',
};

const fmtRs = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const PRODUCT_IMAGE_HINT = '800×800 storefront JPEG · auto-cropped square';

function partnerFleetLabel(agent) {
  if (!agent?.isActive) return 'Account deactivated';
  if (agent.activeOrderId) return 'On a delivery';
  if (agent.isOnline && agent.isAvailable) return 'Eligible — Available in app';
  return 'Off duty';
}

const AdminDashboardScreen = () => {
  const { width } = useWindowDimensions();
  const isNarrow = width <= 360;
  const isCompact = width <= 390;
  const dispatch = useDispatch();
  const staffRefreshToken = useSelector((s) => s.realtime?.staffRefreshToken);
  const [tab, setTab] = useState('queue');
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('day');

  const [stats, setStats] = useState({});
  const [revenue, setRevenue] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [agents, setAgents] = useState([]);

  const [editingProductId, setEditingProductId] = useState(null);
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  /** Stored path like /uploads/products/....jpg or legacy https URL — sent as images[]. */
  const [productImagePath, setProductImagePath] = useState('');
  const [uploadingProductImg, setUploadingProductImg] = useState(false);

  const [editingAgentId, setEditingAgentId] = useState(null);
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentVehicle, setAgentVehicle] = useState('');
  const [agentVehicleType, setAgentVehicleType] = useState('bike');
  const [agentPassword, setAgentPassword] = useState('agent123');
  const [orderSearch, setOrderSearch] = useState('');
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [fleetReady, setFleetReady] = useState(0);
  const [fleetTotal, setFleetTotal] = useState(0);
  const [insightsRange, setInsightsRange] = useState('today');
  const [rangeStats, setRangeStats] = useState({});

  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiHostInput, setApiHostInput] = useState('');
  const [apiPortInput, setApiPortInput] = useState('5001');

  useEffect(() => {
    dispatch(connectSocket(null));
    ensurePushRegistrationForStaff('admin');
    return () => {
      dispatch(disconnectSocket(null));
    };
  }, [dispatch]);

  const loadPendingQueue = async () => {
    const [res, statsRes] = await Promise.all([
      adminAPI.getPendingApproval(),
      adminAPI.getDashboardStats(),
    ]);
    setPendingQueue(res.data?.data || []);
    const s = statsRes.data?.data || {};
    setFleetReady(typeof s.activeAgents === 'number' ? s.activeAgents : 0);
    setFleetTotal(typeof s.totalAgents === 'number' ? s.totalAgents : 0);
  };

  const loadAnalytics = async () => {
    const [statsRes, revenueRes, ordersRes, agentsRes, rangeRes] = await Promise.all([
      adminAPI.getDashboardStats(),
      adminAPI.getRevenue(period === 'day' ? 1 : 30),
      adminAPI.getOrders(),
      adminAPI.getAgents(),
      adminAPI.getRangeStats(insightsRange),
    ]);
    setStats(statsRes.data?.data || {});
    setRevenue(revenueRes.data?.data || []);
    setOrders(ordersRes.data?.data || []);
    setAgents(agentsRes.data?.data || []);
    setRangeStats(rangeRes.data?.data || {});
  };

  const loadProducts = async () => {
    const res = await adminAPI.getProducts();
    setProducts(res.data?.data || []);
  };

  const loadAgents = async () => {
    const res = await adminAPI.getAgents();
    setAgents(res.data?.data || []);
  };

  const loadOrders = async () => {
    const res = await adminAPI.getOrders();
    setOrders(res.data?.data || []);
  };

  const loadTabData = async () => {
    try {
      setLoading(true);
      if (tab === 'queue') await loadPendingQueue();
      if (tab === 'products') await loadProducts();
      if (tab === 'agents') await loadAgents();
      if (tab === 'orders') await loadOrders();
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Failed to load dashboard data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabData();
  }, [tab, period]);

  useEffect(() => {
    if (tab === 'analytics') {
      loadAnalytics();
    }
  }, [insightsRange, tab]);

  useEffect(() => {
    if (staffRefreshToken <= 0) return;
    if (tab === 'queue') loadPendingQueue();
    if (tab === 'agents') loadAgents();
    if (tab === 'analytics') loadAnalytics();
  }, [staffRefreshToken, tab]);

  const handleApproveOrder = async (order) => {
    try {
      setProcessingOrderId(order._id);
      await adminAPI.approveOrder(order._id);
      Alert.alert(
        'Approved',
        fleetReady < 1
          ? 'Order confirmed. No partner is marked Available right now — keep the queue open until someone goes on duty. Partners do not need to approve the order again.'
          : 'Order confirmed. The nearest partner who is Available is assigned automatically — no second approval on their side.'
      );
      await loadPendingQueue();
      await loadAnalytics();
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Could not approve'));
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleDeclineOrder = (order) => {
    Alert.alert(
      'Decline order?',
      'Stock is restored. Online payments are refunded when possible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingOrderId(order._id);
              await adminAPI.declineOrder(order._id);
              await loadPendingQueue();
              await loadAnalytics();
            } catch (error) {
              Alert.alert('Error', formatApiErrorForAlert(error, 'Could not decline'));
            } finally {
              setProcessingOrderId(null);
            }
          },
        },
      ]
    );
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductName('');
    setPrice('');
    setStock('');
    setProductImagePath('');
  };

  const pickUploadProductPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission', 'Allow photo library access to attach a product image.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.92,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const asset = picked.assets[0];
      const form = new FormData();
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime =
        asset.mimeType ||
        (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      form.append('image', {
        uri: asset.uri,
        name: `product.${ext === 'jpeg' ? 'jpg' : ext}`,
        type: mime,
      });
      setUploadingProductImg(true);
      const res = await adminAPI.uploadProductImage(form);
      const path = res.data?.data?.path;
      if (!path) {
        Alert.alert('Upload failed', 'No image URL returned');
        return;
      }
      setProductImagePath(path);
      Alert.alert('Image ready', PRODUCT_IMAGE_HINT);
    } catch (e) {
      Alert.alert('Error', formatApiErrorForAlert(e, 'Upload failed'));
    } finally {
      setUploadingProductImg(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!productName.trim() || !price || !stock) {
      Alert.alert('Error', 'Enter product name, price and stock');
      return;
    }
    const payload = {
      name: productName.trim(),
      pricePerUnit: Number(price),
      stock: Number(stock),
      unit: 'bottle',
      category: '1L',
      isAvailable: true,
      images: productImagePath ? [productImagePath] : [],
    };
    try {
      if (editingProductId) {
        await adminAPI.updateProduct(editingProductId, payload);
      } else {
        await adminAPI.createProduct(payload);
      }
      resetProductForm();
      await loadProducts();
      dispatch(fetchProducts());
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Failed to save product'));
    }
  };

  const openEditProduct = (item) => {
    setEditingProductId(item._id);
    setProductName(item.name || '');
    setPrice(String(item.pricePerUnit || ''));
    setStock(String(item.stock || ''));
    const first = Array.isArray(item.images) && item.images.length ? item.images[0] : '';
    setProductImagePath(first || '');
  };

  const openEditAgent = (item) => {
    setEditingAgentId(item._id);
    setAgentName(item.name || '');
    setAgentPhone(item.phone || '');
    setAgentEmail(item.email || '');
    setAgentVehicle(item.vehicleNumber || '');
    setAgentVehicleType(item.vehicleType || 'bike');
    setAgentPassword('agent123');
  };

  const resetAgentForm = () => {
    setEditingAgentId(null);
    setAgentName('');
    setAgentPhone('');
    setAgentEmail('');
    setAgentVehicle('');
    setAgentVehicleType('bike');
    setAgentPassword('agent123');
  };

  const handleSaveAgent = async () => {
    if (!editingAgentId) return;
    try {
      await adminAPI.updateAgent(editingAgentId, {
        name: agentName.trim(),
        phone: agentPhone.trim(),
        email: agentEmail.trim(),
        vehicleNumber: agentVehicle.trim(),
        vehicleType: agentVehicleType.trim() || 'bike',
      });
      resetAgentForm();
      loadAgents();
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Failed to update agent'));
    }
  };

  const handleCreateAgent = async () => {
    if (!agentName.trim() || !agentPhone.trim() || !agentVehicle.trim()) {
      Alert.alert('Error', 'Name, phone and vehicle number are required');
      return;
    }
    try {
      await adminAPI.createAgent({
        name: agentName.trim(),
        phone: agentPhone.trim(),
        email: agentEmail.trim(),
        vehicleNumber: agentVehicle.trim(),
        vehicleType: agentVehicleType.trim() || 'bike',
        password: agentPassword || 'agent123',
      });
      Alert.alert('Success', 'Delivery agent created');
      resetAgentForm();
      loadAgents();
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Failed to create agent'));
    }
  };

  const toggleAgentActive = async (agent) => {
    try {
      await adminAPI.updateAgent(agent._id, { isActive: !agent.isActive });
      loadAgents();
    } catch (error) {
      Alert.alert('Error', formatApiErrorForAlert(error, 'Failed to update agent status'));
    }
  };

  const totalDeliveredByAgent = useMemo(() => {
    return agents.map((a) => ({
      id: a._id,
      name: a.name,
      delivered: a.stats?.totalDeliveries || 0,
      fleet: partnerFleetLabel(a),
    }));
  }, [agents]);

  const renderQueue = () => (
    <ScrollView
      style={styles.tabScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPad}
    >
      <View style={styles.heroBanner}>
        <Text style={styles.heroTitle}>Order approval queue</Text>
        <Text style={styles.heroSub}>
          You approve or decline every new order. Partners only tap Available in their app so you can see who can take a
          drop — the system assigns the nearest ready rider; they never need to approve the same order again.
        </Text>
      </View>
      <View style={styles.fleetStrip}>
        <Text style={styles.fleetStripTitle}>Partner availability</Text>
        <Text style={styles.fleetStripStat}>
          {fleetReady} of {fleetTotal} accounts ready for new assignments (Available + online + free)
        </Text>
        {fleetReady < 1 ? (
          <Text style={styles.fleetStripWarn}>
            No idle riders right now — you can still approve; assignment happens when someone goes Available.
          </Text>
        ) : null}
      </View>
      {(pendingQueue || []).length === 0 ? (
        <View style={styles.emptyQueue}>
          <Text style={styles.emptyQueueTitle}>All clear</Text>
          <Text style={styles.emptyQueueText}>New orders will pop in here with soundless push + live updates.</Text>
        </View>
      ) : (
        (pendingQueue || []).map((item) => (
          <View key={item._id} style={styles.approvalCard}>
            <View style={styles.approvalTop}>
              <Text style={styles.approvalId}>#{item.orderId}</Text>
              <View style={styles.payChip}>
                <Text style={styles.payChipText}>
                  {item.paymentMethod} · {item.paymentStatus}
                </Text>
              </View>
            </View>
            <Text style={styles.approvalAmt}>₹{item.totalAmount}</Text>
            <Text style={styles.approvalWho}>
              {item.customer?.name || 'Customer'} · {item.customer?.phone || '—'}
            </Text>
            <Text style={styles.approvalAddr} numberOfLines={2}>
              {item.deliveryAddress?.line1}, {item.deliveryAddress?.city} — {item.deliveryAddress?.pincode}
            </Text>
            <View style={styles.approvalRow}>
              <TouchableOpacity
                style={[styles.approveBtn, processingOrderId === item._id && { opacity: 0.6 }]}
                disabled={processingOrderId === item._id}
                onPress={() => handleApproveOrder(item)}
              >
                <Text style={styles.approveBtnText}>{processingOrderId === item._id ? '…' : 'Approve'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.declineBtn, processingOrderId === item._id && { opacity: 0.6 }]}
                disabled={processingOrderId === item._id}
                onPress={() => handleDeclineOrder(item)}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderAnalytics = () => (
    <ScrollView
      style={styles.tabScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPad}
    >
      <Text style={styles.insightsSectionLabel}>Earnings snapshot (IST)</Text>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, insightsRange === 'today' && styles.filterBtnActive]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setInsightsRange('today');
          }}
        >
          <Text style={[styles.filterText, insightsRange === 'today' && styles.filterTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, insightsRange === '7d' && styles.filterBtnActive]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setInsightsRange('7d');
          }}
        >
          <Text style={[styles.filterText, insightsRange === '7d' && styles.filterTextActive]}>Last 7 days</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <LinearGradient
          colors={['#7c3aed', '#8b5cf6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.kpiCard, isCompact && styles.kpiCardCompact]}
        >
          <Text style={styles.kpiLabel}>Paid revenue</Text>
          <Text style={styles.kpiValue}>{fmtRs(rangeStats.revenuePaid)}</Text>
          <Text style={styles.kpiHint}>{insightsRange === 'today' ? 'Today' : '7-day window'} · paid orders only</Text>
        </LinearGradient>
        <View style={[styles.kpiCard, styles.kpiCardDark, isCompact && styles.kpiCardCompact]}>
          <Text style={styles.kpiLabelMuted}>Orders placed</Text>
          <Text style={styles.kpiValueLight}>{rangeStats.ordersTotal ?? 0}</Text>
          <Text style={styles.kpiHintMuted}>All statuses in range</Text>
        </View>
      </View>

      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <View style={[styles.kpiCard, styles.kpiCardDark, { flex: 1, marginRight: 0 }, isCompact && styles.kpiCardCompact, isCompact && styles.kpiCardSoloCompact]}>
          <Text style={styles.kpiLabelMuted}>Paid orders in range</Text>
          <Text style={styles.kpiValueLight}>{rangeStats.paidOrders ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.insightsSectionLabel}>Revenue chart range</Text>
      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.filterBtn, period === 'day' && styles.filterBtnActive]} onPress={() => setPeriod('day')}>
          <Text style={[styles.filterText, period === 'day' && styles.filterTextActive]}>Chart: day</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterBtn, period === 'month' && styles.filterBtnActive]} onPress={() => setPeriod('month')}>
          <Text style={[styles.filterText, period === 'month' && styles.filterTextActive]}>Chart: month</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.highlightRow}>
        <View style={styles.highlightCard}>
          <Text style={styles.highlightValue}>{stats.totalCustomers || 0}</Text>
          <Text style={styles.highlightLabel}>Users</Text>
        </View>
        <View style={styles.highlightCard}>
          <Text style={styles.highlightValue}>{stats.totalAgents || 0}</Text>
          <Text style={styles.highlightLabel}>Partners</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.metric}>Lifetime revenue · {fmtRs(stats.totalRevenue || 0)}</Text>
        <Text style={styles.metaDark}>
          Orders: {stats.totalOrders || 0} | Awaiting approval: {stats.awaitingApproval ?? 0}
        </Text>
        <Text style={styles.metaDark}>
          Partners ready now: {stats.activeAgents ?? 0} / {stats.totalAgents ?? 0}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Revenue log ({period})</Text>
        {(revenue || []).map((r, idx) => (
          <Text key={`rev-${idx}`} style={styles.metaDark}>
            {r._id}: {fmtRs(r.revenue)} ({r.orders} orders)
          </Text>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Partner activity</Text>
        {totalDeliveredByAgent.map((a) => (
          <Text key={a.id} style={styles.metaDark}>
            {a.name}: {a.delivered} delivered — {a.fleet}
          </Text>
        ))}
      </View>
    </ScrollView>
  );

  const renderProducts = () => (
    <View style={styles.fullFlex}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{editingProductId ? 'Edit Product' : 'Add Product'}</Text>
        <Text style={styles.productImgHint}>Server resizes uploads to fit the customer storefront — {PRODUCT_IMAGE_HINT}</Text>
        <View style={styles.productImgPreviewWrap}>
          {productImagePath ? (
            <Image source={{ uri: resolveMediaUrl(productImagePath) }} style={styles.productImgPreview} resizeMode="cover" />
          ) : (
            <View style={styles.productImgEmpty}>
              <Text style={styles.productImgEmptyTxt}>No image</Text>
            </View>
          )}
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.secondaryBtnFlex]}
            onPress={pickUploadProductPhoto}
            disabled={uploadingProductImg}
          >
            {uploadingProductImg ? (
              <ActivityIndicator color={ADMIN_THEME.violet} />
            ) : (
              <Text style={styles.secondaryBtnText} numberOfLines={1}>
                Pick & upload photo
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.secondaryBtnFixed]}
            onPress={() => setProductImagePath('')}
            disabled={!productImagePath}
          >
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={productName}
          onChangeText={setProductName}
        />
        <TextInput
          style={styles.input}
          placeholder="Price"
          placeholderTextColor={ADMIN_THEME.placeholder}
          keyboardType="numeric"
          value={price}
          onChangeText={setPrice}
        />
        <TextInput
          style={styles.input}
          placeholder="Stock"
          placeholderTextColor={ADMIN_THEME.placeholder}
          keyboardType="numeric"
          value={stock}
          onChangeText={setStock}
        />
        <View style={styles.row}>
          <TouchableOpacity style={[styles.primaryBtn, styles.flex1]} onPress={handleSaveProduct}>
            <Text style={styles.primaryBtnText}>{editingProductId ? 'Update' : 'Add'}</Text>
          </TouchableOpacity>
          {editingProductId && (
            <TouchableOpacity style={[styles.secondaryBtn, styles.flex1]} onPress={resetProductForm}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        data={products}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContentPad}
        renderItem={({ item }) => {
          const thumb = resolveMediaUrl(
            Array.isArray(item.images) && item.images[0] ? item.images[0] : ''
          );
          return (
            <View style={styles.productListRow}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.productListThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.productListThumb, styles.productListThumbPh]}>
                  <Text style={styles.productListThumbEmoji}>💧</Text>
                </View>
              )}
              <View style={styles.flex1}>
                <Text style={styles.itemTitle}>{item.name}</Text>
                <Text style={styles.meta}>Rs {item.pricePerUnit} | Stock {item.stock}</Text>
                <TouchableOpacity style={styles.inlineBtn} onPress={() => openEditProduct(item)}>
                  <Text style={styles.inlineBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );

  const renderAgents = () => (
    <View style={styles.fullFlex}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{editingAgentId ? 'Edit Delivery Agent' : 'Add Delivery Agent'}</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentName}
          onChangeText={setAgentName}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentPhone}
          onChangeText={setAgentPhone}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentEmail}
          onChangeText={setAgentEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Vehicle Number"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentVehicle}
          onChangeText={setAgentVehicle}
        />
        <TextInput
          style={styles.input}
          placeholder="Vehicle Type (bike)"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentVehicleType}
          onChangeText={setAgentVehicleType}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={agentPassword}
          onChangeText={setAgentPassword}
          secureTextEntry
        />
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flex1]}
            onPress={editingAgentId ? handleSaveAgent : handleCreateAgent}
          >
            <Text style={styles.primaryBtnText}>{editingAgentId ? 'Save Agent' : 'Create Agent'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, styles.flex1]} onPress={resetAgentForm}>
            <Text style={styles.secondaryBtnText}>{editingAgentId ? 'Cancel Edit' : 'Reset'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={agents}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContentPad}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.itemTitle}>{item.name}</Text>
            <Text style={styles.meta}>{item.phone}</Text>
            <Text style={styles.metaFleet}>{partnerFleetLabel(item)}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.inlineBtn} onPress={() => openEditAgent(item)}>
                <Text style={styles.inlineBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineBtn} onPress={() => toggleAgentActive(item)}>
                <Text style={styles.inlineBtnText}>{item.isActive ? 'Deactivate' : 'Activate'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderOrders = () => (
    <View style={styles.fullFlex}>
    <TextInput
      style={styles.input}
      placeholder="Search by order id / username / delivery agent"
      placeholderTextColor={ADMIN_THEME.placeholder}
      value={orderSearch}
      onChangeText={setOrderSearch}
    />
    <FlatList
      data={orders.filter((item) => {
        const q = orderSearch.trim().toLowerCase();
        if (!q) return true;
        const orderId = String(item.orderId || '').toLowerCase();
        const customerName = String(item.customer?.name || '').toLowerCase();
        const agentName = String(item.assignedAgent?.name || '').toLowerCase();
        return orderId.includes(q) || customerName.includes(q) || agentName.includes(q);
      })}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.listContentPad}
      renderItem={({ item }) => (
        <View style={styles.listItem}>
          <Text style={styles.itemTitle}>Order #{item.orderId}</Text>
          <Text style={styles.meta}>
            {item.status} | Rs {item.totalAmount} | {new Date(item.createdAt).toLocaleString()}
          </Text>
          <Text style={styles.meta}>User: {item.customer?.name || 'Unknown'}</Text>
          <Text style={styles.meta}>Agent: {item.assignedAgent?.name || 'Unassigned'}</Text>
        </View>
      )}
    />
    </View>
  );

  const setTabAnimated = (t) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setTab(t);
  };

  const openApiEndpointModal = () => {
    const o = parseHostPortFromOverride();
    let host = '';
    let port = '443';
    if (o) {
      host = o.host;
      port = o.port ? String(o.port) : o.protocol === 'http' ? '5001' : '443';
    } else {
      try {
        const url = new URL(getApiBaseUrlSync());
        host = url.hostname;
        port = url.port ? String(url.port) : url.protocol === 'http:' ? '5001' : '443';
      } catch {
        /* keep defaults */
      }
    }
    setApiHostInput(host);
    setApiPortInput(port || '5001');
    setApiModalVisible(true);
  };

  const applyApiEndpointAndReconnect = async () => {
    const h = apiHostInput.trim();
    try {
      if (!h) {
        await clearEndpointOverride();
      } else {
        const protocolHint = /\.onrender\.com$/i.test(h) ? 'https' : '';
        await persistEndpointOverride(h, apiPortInput, protocolHint);
      }
      setApiModalVisible(false);
      dispatch(disconnectSocket(undefined));
      await dispatch(connectSocket(null));
      Alert.alert(
        !h ? 'API address' : 'API updated',
        !h ? 'Using the URL baked into this app install.' : `Using ${getApiBaseUrlSync()}\nPoster uploads use this immediately — no reinstall.`
      );
      loadTabData();
    } catch {
      Alert.alert('Error', 'Could not save API settings.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#f5f3ff', '#ede9fe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, isCompact && styles.headerCompact, isNarrow && styles.headerNarrow]}
      >
        <View>
          <Text style={[styles.brandMark, isCompact && styles.brandMarkCompact, isNarrow && styles.brandMarkNarrow]}>AquaBoom</Text>
          <Text style={[styles.headerSubtitle, isCompact && styles.headerSubtitleCompact, isNarrow && styles.headerSubtitleNarrow]}>
            Admin · operations
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.apiPill, isNarrow && styles.apiPillNarrow]} onPress={openApiEndpointModal} hitSlop={10}>
            <Text style={[styles.apiPillText, isNarrow && styles.apiPillTextNarrow]}>API</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logoutPill, isCompact && styles.logoutPillCompact, isNarrow && styles.logoutPillNarrow]}
            onPress={() => dispatch(logout())}
          >
            <Text style={[styles.logoutPillText, isCompact && styles.logoutPillTextCompact, isNarrow && styles.logoutPillTextNarrow]}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabsRow, isCompact && styles.tabsRowCompact, isNarrow && styles.tabsRowNarrow]}
        style={styles.tabsScroll}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabPill, isCompact && styles.tabPillCompact, isNarrow && styles.tabPillNarrow, tab === t && styles.tabPillActive]}
            onPress={() => setTabAnimated(t)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.tabPillText,
                isCompact && styles.tabPillTextCompact,
                isNarrow && styles.tabPillTextNarrow,
                tab === t && styles.tabPillTextActive,
              ]}
            >
              {TAB_LABELS[t] || t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.contentFlex}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={ADMIN_THEME.violet} size="large" />
          </View>
        ) : tab === 'queue' ? (
          renderQueue()
        ) : tab === 'analytics' ? (
          renderAnalytics()
        ) : tab === 'banners' ? (
          <AdminBannersTab />
        ) : tab === 'products' ? (
          renderProducts()
        ) : tab === 'agents' ? (
          renderAgents()
        ) : (
          renderOrders()
        )}
      </View>

      <Modal transparent visible={apiModalVisible} animationType="fade" onRequestClose={() => setApiModalVisible(false)}>
        <TouchableOpacity style={styles.apiModalBackdrop} activeOpacity={1} onPress={() => setApiModalVisible(false)}>
          <View style={styles.apiModalCard}>
            <Text style={styles.apiModalTitle}>Backend API</Text>
            <Text style={styles.apiModalHint}>
              For Render, use host like aquaboom.onrender.com and port 443. For LAN, use your PC IPv4 (e.g. 192.168.1.x) and port
              5001.
            </Text>
            <Text style={styles.apiModalCurrent} numberOfLines={2}>
              Current: {getApiBaseUrlSync()}
            </Text>
            <Text style={styles.apiModalLabel}>Host (domain or IPv4)</Text>
            <TextInput
              style={styles.apiModalInput}
              placeholder="aquaboom.onrender.com or 192.168.1.3"
              placeholderTextColor={ADMIN_THEME.placeholder}
              value={apiHostInput}
              onChangeText={setApiHostInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.apiModalLabel}>Port</Text>
            <TextInput
              style={styles.apiModalInput}
              placeholder="5001"
              placeholderTextColor={ADMIN_THEME.placeholder}
              value={apiPortInput}
              onChangeText={setApiPortInput}
              keyboardType="number-pad"
            />
            <View style={styles.apiModalBtns}>
              <TouchableOpacity style={[styles.apiModalBtnGhost, styles.apiModalBtnGrow]} onPress={() => setApiModalVisible(false)}>
                <Text style={styles.apiModalBtnGhostTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.apiModalBtnGhost, styles.apiModalBtnGrow]}
                onPress={async () => {
                  await clearEndpointOverride();
                  const url = new URL(getApiBaseUrlSync());
                  setApiHostInput(url.hostname);
                  setApiPortInput(url.port ? String(url.port) : url.protocol === 'http:' ? '5001' : '443');
                }}
              >
                <Text style={styles.apiModalBtnGhostTxt}>Reset to app default</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.apiModalBtnPrimary} onPress={applyApiEndpointAndReconnect}>
              <Text style={styles.apiModalBtnPrimaryTxt}>Save & reconnect</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ADMIN_THEME.bg,
    paddingHorizontal: 14,
    paddingBottom: 6,
    paddingTop: 4,
  },
  contentFlex: {
    flex: 1,
    minHeight: 0,
  },
  tabScroll: {
    flex: 1,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  fullFlex: { flex: 1, minHeight: 0 },
  loaderWrap: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  listContentPad: { paddingBottom: 18 },
  scrollPad: { paddingBottom: 20, flexGrow: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: ADMIN_THEME.radius,
    marginHorizontal: 0,
    marginTop: 4,
    marginBottom: 2,
    overflow: 'hidden',
  },
  headerCompact: {
    marginHorizontal: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerNarrow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  brandMark: { fontSize: 22, fontWeight: '900', color: ADMIN_THEME.violetDim, letterSpacing: 0.3 },
  brandMarkCompact: { fontSize: 20 },
  brandMarkNarrow: { fontSize: 18 },
  headerSubtitle: { color: '#6d28d9', fontSize: 12, marginTop: 4, fontWeight: '600' },
  headerSubtitleCompact: { fontSize: 11, marginTop: 2 },
  headerSubtitleNarrow: { fontSize: 10, marginTop: 1 },
  logoutPill: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiPill: {
    backgroundColor: '#faf5ff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  apiPillNarrow: { paddingHorizontal: 9, paddingVertical: 8 },
  apiPillText: { color: ADMIN_THEME.violetDim, fontWeight: '900', fontSize: 12 },
  apiPillTextNarrow: { fontSize: 11 },

  logoutPillText: { color: ADMIN_THEME.violetDim, fontWeight: '800', fontSize: 13 },
  logoutPillCompact: { paddingHorizontal: 12, paddingVertical: 8 },
  logoutPillTextCompact: { fontSize: 12 },
  logoutPillNarrow: { paddingHorizontal: 10, paddingVertical: 7 },
  logoutPillTextNarrow: { fontSize: 11 },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 2,
    paddingRight: 12,
    gap: 8,
  },
  tabsRowCompact: {
    paddingVertical: 5,
    paddingRight: 8,
    gap: 6,
  },
  tabsRowNarrow: {
    paddingVertical: 4,
    paddingRight: 6,
    gap: 6,
  },
  tabPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ADMIN_THEME.surface,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    marginRight: 0,
  },
  tabPillCompact: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 0,
  },
  tabPillNarrow: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginRight: 0,
  },
  tabPillActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#c4b5fd',
  },
  tabPillText: { fontWeight: '700', fontSize: 13, color: ADMIN_THEME.muted },
  tabPillTextCompact: { fontSize: 12 },
  tabPillTextNarrow: { fontSize: 11 },
  tabPillTextActive: { color: ADMIN_THEME.violetDim },

  insightsSectionLabel: {
    fontSize: ADMIN_THEME.type.body,
    fontWeight: '800',
    color: ADMIN_THEME.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 2,
  },
  kpiRow: { flexDirection: 'row', marginBottom: 8 },
  kpiRowCompact: { flexDirection: 'column' },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    marginRight: 8,
    minHeight: 100,
    justifyContent: 'flex-end',
  },
  kpiCardCompact: {
    marginRight: 0,
    marginBottom: 8,
    minHeight: 92,
  },
  kpiCardSoloCompact: { marginBottom: 0 },
  kpiCardDark: {
    marginRight: 0,
    backgroundColor: ADMIN_THEME.card,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  kpiLabel: { color: '#f5f3ff', fontSize: ADMIN_THEME.type.caption, fontWeight: '700' },
  kpiLabelMuted: { color: ADMIN_THEME.muted, fontSize: ADMIN_THEME.type.caption, fontWeight: '700' },
  kpiValue: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 6 },
  kpiValueLight: { color: ADMIN_THEME.ink, fontSize: 24, fontWeight: '900', marginTop: 6 },
  kpiHint: { color: '#ede9fe', fontSize: 11, marginTop: 8 },
  kpiHintMuted: { color: ADMIN_THEME.muted, fontSize: 11, marginTop: 8 },

  highlightRow: { flexDirection: 'row', marginBottom: 8 },
  highlightCard: {
    flex: 1,
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 12,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  highlightValue: { fontSize: 22, fontWeight: '900', color: ADMIN_THEME.ink },
  highlightLabel: { marginTop: 6, color: ADMIN_THEME.muted, fontSize: ADMIN_THEME.type.caption, fontWeight: '600' },
  card: {
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  metric: { fontSize: 17, fontWeight: '800', color: ADMIN_THEME.ink, marginBottom: 4 },
  metaDark: { color: ADMIN_THEME.muted, marginTop: 4, fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: ADMIN_THEME.type.section, fontWeight: '800', color: ADMIN_THEME.ink, marginBottom: 6 },
  /** Secondary lines on cards (was referenced but missing — broke contrast on dark cards). */
  meta: {
    color: ADMIN_THEME.muted,
    marginTop: 4,
    fontSize: ADMIN_THEME.type.body,
    lineHeight: 18,
  },
  input: {
    backgroundColor: ADMIN_THEME.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: ADMIN_THEME.control.inputMinHeight,
    marginBottom: 6,
    color: ADMIN_THEME.ink,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  primaryBtn: {
    backgroundColor: ADMIN_THEME.violet,
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: ADMIN_THEME.type.bodyStrong },
  secondaryBtn: {
    backgroundColor: ADMIN_THEME.surface,
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  secondaryBtnFlex: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  secondaryBtnFixed: {
    flexShrink: 0,
    minWidth: 80,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  secondaryBtnText: { color: ADMIN_THEME.ink, fontWeight: '800', fontSize: ADMIN_THEME.type.bodyStrong },
  listItem: {
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  itemTitle: { color: ADMIN_THEME.ink, fontWeight: '800', fontSize: 15 },
  metaFleet: { color: ADMIN_THEME.violetDim, marginTop: 5, fontSize: ADMIN_THEME.type.body, fontWeight: '600' },
  inlineBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  inlineBtnText: { color: ADMIN_THEME.violetDim, fontWeight: '800', fontSize: 12 },

  filterRow: { flexDirection: 'row', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ADMIN_THEME.surface,
    marginRight: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  filterBtnActive: {
    backgroundColor: '#f3e8ff',
    borderColor: ADMIN_THEME.violet,
  },
  filterText: { color: ADMIN_THEME.muted, fontWeight: '800', fontSize: ADMIN_THEME.type.body },
  filterTextActive: { color: ADMIN_THEME.ink },

  heroBanner: {
    backgroundColor: '#f5f3ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  heroTitle: { color: ADMIN_THEME.ink, fontSize: 16, fontWeight: '900' },
  heroSub: { color: ADMIN_THEME.muted, fontSize: ADMIN_THEME.type.body, marginTop: 5, lineHeight: 18 },

  fleetStrip: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  fleetStripTitle: { fontSize: 14, fontWeight: '900', color: ADMIN_THEME.mint },
  fleetStripStat: { color: ADMIN_THEME.ink, fontSize: ADMIN_THEME.type.body, marginTop: 5, lineHeight: 18 },
  fleetStripWarn: { color: '#b45309', fontSize: ADMIN_THEME.type.caption, marginTop: 8, fontWeight: '700' },

  emptyQueue: {
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  emptyQueueTitle: { fontSize: 17, fontWeight: '800', color: ADMIN_THEME.ink },
  emptyQueueText: { color: ADMIN_THEME.muted, textAlign: 'center', marginTop: 8, fontSize: ADMIN_THEME.type.body, lineHeight: 19 },

  approvalCard: {
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  approvalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  approvalId: { fontSize: 16, fontWeight: '900', color: ADMIN_THEME.ink },
  payChip: { backgroundColor: '#ede9fe', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  payChipText: { fontSize: 11, fontWeight: '800', color: ADMIN_THEME.violetDim },
  approvalAmt: { fontSize: 23, fontWeight: '900', color: ADMIN_THEME.violet, marginTop: 8 },
  approvalWho: { color: ADMIN_THEME.muted, marginTop: 8, fontSize: ADMIN_THEME.type.body },
  approvalAddr: { color: ADMIN_THEME.ink, marginTop: 6, fontSize: ADMIN_THEME.type.body, lineHeight: 19 },
  approvalRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  approveBtn: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveBtnText: { color: '#ffffff', fontWeight: '900', fontSize: ADMIN_THEME.type.bodyStrong },
  declineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtnText: { color: '#b91c1c', fontWeight: '900', fontSize: ADMIN_THEME.type.bodyStrong },

  productImgHint: { color: ADMIN_THEME.muted, fontSize: 11, marginBottom: 8, lineHeight: 15 },
  productImgPreviewWrap: {
    alignSelf: 'center',
    width: 118,
    height: 118,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    backgroundColor: ADMIN_THEME.surface,
  },
  productImgPreview: { width: '100%', height: '100%' },
  productImgEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  productImgEmptyTxt: { color: ADMIN_THEME.muted, fontWeight: '600', fontSize: 13 },
  productListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ADMIN_THEME.card,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  productListThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: ADMIN_THEME.surface,
  },
  productListThumbPh: { justifyContent: 'center', alignItems: 'center' },
  productListThumbEmoji: { fontSize: 26 },

  apiModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  apiModalCard: {
    backgroundColor: ADMIN_THEME.surface,
    borderRadius: ADMIN_THEME.radius,
    padding: 18,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  apiModalTitle: { fontSize: 18, fontWeight: '900', color: ADMIN_THEME.ink, marginBottom: 8 },
  apiModalHint: { fontSize: 12, lineHeight: 18, color: ADMIN_THEME.muted, marginBottom: 8 },
  apiModalCurrent: { fontSize: 11, color: ADMIN_THEME.violetDim, marginBottom: 12, fontWeight: '700' },
  apiModalLabel: { fontSize: 12, fontWeight: '800', color: ADMIN_THEME.muted, marginBottom: 4 },
  apiModalInput: {
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
    color: ADMIN_THEME.ink,
    backgroundColor: '#f9fafb',
  },
  apiModalBtns: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  apiModalBtnGrow: { flex: 1 },
  apiModalBtnGhost: {
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: ADMIN_THEME.surface,
  },
  apiModalBtnGhostTxt: { fontWeight: '800', fontSize: 13, color: ADMIN_THEME.muted },
  apiModalBtnPrimary: {
    backgroundColor: ADMIN_THEME.violet,
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: 'center',
  },
  apiModalBtnPrimaryTxt: { color: '#ffffff', fontWeight: '900', fontSize: 15 },
});

export default AdminDashboardScreen;

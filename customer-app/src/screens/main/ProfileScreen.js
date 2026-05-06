import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProfile, logout, updateProfile } from '../../store/slices/authSlice';
import { clearCart } from '../../store/slices/cartSlice';
import { COLORS, SPACE, RADII } from '../../config';

const ProfileScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const { orders } = useSelector(state => state.orders);
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchProfile());
    }
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    setNameInput(user?.name || '');
    setEmailInput(user?.email || '');
  }, [user?.name, user?.email]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            dispatch(logout());
            dispatch(clearCart());
          },
        },
      ]
    );
  };

  const handleSaveProfile = async () => {
    if (!nameInput.trim() || !emailInput.trim()) {
      Alert.alert('Error', 'Name and email are required');
      return;
    }
    const result = await dispatch(updateProfile({ name: nameInput.trim(), email: emailInput.trim() }));
    if (updateProfile.fulfilled.match(result)) {
      setIsEditing(false);
      Alert.alert('Saved', 'Profile updated');
    } else {
      Alert.alert('Error', result.payload || 'Failed to update profile');
    }
  };

  const menuItems = [
    {
      icon: '📦',
      title: 'My Orders',
      subtitle: `${orders.length} orders`,
      onPress: () => navigation.navigate('Orders'),
    },
    {
      icon: '📍',
      title: 'Saved Addresses',
      subtitle: 'Manage delivery addresses',
      onPress: () => navigation.navigate('Addresses'),
    },
    {
      icon: '💳',
      title: 'Payment Methods',
      subtitle: 'Manage payment options',
      onPress: () => Alert.alert('Coming Soon', 'Payment management will be available soon'),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.userSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userPhone}>{isAuthenticated ? 'Logged in' : 'Not logged in'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'No email'}</Text>
          </View>
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(v => !v)}>
            <Text style={styles.editButtonText}>✏️</Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <View style={styles.editPanel}>
            <Text style={styles.editLabel}>Name</Text>
            <TextInput
              style={styles.editInput}
              placeholder="Your name"
              placeholderTextColor={COLORS.placeholder}
              value={nameInput}
              onChangeText={setNameInput}
            />
            <Text style={styles.editLabel}>Email</Text>
            <TextInput
              style={styles.editInput}
              placeholder="you@gmail.com"
              placeholderTextColor={COLORS.placeholder}
              value={emailInput}
              onChangeText={setEmailInput}
              autoCapitalize="none"
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.statsContainer}>
          <TouchableOpacity style={styles.statItem} onPress={() => navigation.navigate('Orders')}>
            <Text style={styles.statValue}>{orders.length}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem} onPress={item.onPress}>
              <View style={styles.menuIcon}>
                <Text style={styles.menuIconText}>{item.icon}</Text>
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {user && (
          <View style={styles.logoutSection}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACE.lg,
    margin: SPACE.lg,
    marginBottom: 0,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: COLORS.surface },
  userInfo: { flex: 1, marginLeft: SPACE.lg, minWidth: 0 },
  userName: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  userPhone: { fontSize: 13, fontWeight: '600', color: COLORS.textLight, marginTop: 5 },
  userEmail: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: { fontSize: 18 },
  editPanel: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACE.lg,
    borderRadius: RADII.lg,
    padding: SPACE.md,
    marginTop: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 5, marginTop: SPACE.sm },
  editInput: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 15,
  },
  editActions: { flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.sm },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnText: { color: COLORS.surface, fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADII.sm,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '800', fontSize: 15 },
  statsContainer: {
    backgroundColor: COLORS.surface,
    margin: SPACE.lg,
    marginTop: SPACE.md,
    borderRadius: RADII.lg,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', color: COLORS.primaryDark, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textLight, marginTop: 5 },
  menuSection: {
    backgroundColor: COLORS.surface,
    margin: SPACE.lg,
    marginTop: 0,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconText: { fontSize: 20 },
  menuContent: { flex: 1, marginLeft: SPACE.md, minWidth: 0 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  menuSubtitle: { fontSize: 12, color: COLORS.textLight, marginTop: 4, lineHeight: 16 },
  menuArrow: { fontSize: 22, color: COLORS.textMuted, fontWeight: '300' },
  logoutSection: { padding: SPACE.lg, paddingBottom: SPACE.xl },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: RADII.md,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  logoutText: { fontSize: 16, fontWeight: '800', color: COLORS.error },
});

export default ProfileScreen;

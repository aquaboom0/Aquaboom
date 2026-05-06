import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import { COLORS } from '../../config';

export default function AgentProfileScreen() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Partner profile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.name || '—'}</Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{user?.phone || '—'}</Text>
        {user?.email ? (
          <>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user.email}</Text>
          </>
        ) : null}
        {(user?.vehicleType || user?.vehicleNumber) && (
          <>
            <Text style={styles.label}>Vehicle</Text>
            <Text style={styles.value}>
              {[user.vehicleType, user.vehicleNumber].filter(Boolean).join(' · ')}
            </Text>
          </>
        )}
      </View>

      <Text style={styles.hint}>You’re signed in to AquaBoom as a delivery partner. Log out below to switch accounts.</Text>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => dispatch(logout())}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: { fontSize: 12, color: COLORS.textLight, marginTop: 12 },
  value: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  hint: { fontSize: 13, color: COLORS.textLight, lineHeight: 20, marginBottom: 24 },
  logoutBtn: {
    backgroundColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#b91c1c', fontWeight: '800', fontSize: 16 },
});

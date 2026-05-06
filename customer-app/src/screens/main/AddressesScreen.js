import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useDispatch, useSelector } from 'react-redux';
import { addAddress, deleteAddress, fetchProfile } from '../../store/slices/authSlice';
import { COLORS } from '../../config';

const AddressesScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { addresses = [] } = useSelector((state) => state.auth);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  const handleAdd = async () => {
    if (!line1 || !city || !pincode) {
      Alert.alert('Error', 'Please fill all address fields');
      return;
    }
    const res = await dispatch(addAddress({ line1, city, pincode, label: 'Home' }));
    if (addAddress.fulfilled.match(res)) {
      setLine1('');
      setCity('');
      setPincode('');
      dispatch(fetchProfile());
    }
  };

  const handleDelete = (addressId) => {
    Alert.alert('Delete Address', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await dispatch(deleteAddress(addressId));
          dispatch(fetchProfile());
        },
      },
    ]);
  };

  const useCurrentLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location permission');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (lat === undefined || lng === undefined) return;
      const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const g = geocode?.[0] || {};
      setLine1([g.name, g.street, g.subregion].filter(Boolean).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      setCity(g.city || g.subregion || '');
      setPincode(g.postalCode || '');
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
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Saved Addresses</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Address line" value={line1} onChangeText={setLine1} />
        <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        <TextInput style={styles.input} placeholder="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
        <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locLoading}>
          <Text style={styles.locBtnText}>{locLoading ? 'Fetching location...' : 'Use Current Location'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>Add Address</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.addr}>{item.line1}</Text>
            <Text style={styles.meta}>{item.city} - {item.pincode}</Text>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item._id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No saved addresses yet.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  back: { fontSize: 22, color: COLORS.text },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  form: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 12 },
  input: { backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: COLORS.surface, fontWeight: '700' },
  locBtn: { backgroundColor: '#e0f2fe', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  locBtnText: { color: COLORS.primaryDark, fontWeight: '700' },
  card: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 8 },
  addr: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  deleteBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  deleteText: { color: COLORS.error, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.textLight },
});

export default AddressesScreen;

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch } from 'react-redux';
import { adminAPI } from '../../services/api';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import { fetchBanners } from '../../store/slices/bannerSlice';
import { ADMIN_THEME } from './adminTheme';
import { formatApiErrorForAlert } from '../../utils/apiReachability';

const ASPECT_HINT = 'Recommended 3×1 or 2×1 (wide) — fits home carousel; image is cropped to fill.';

const AdminBannersTab = () => {
  const { width } = useWindowDimensions();
  const isNarrow = width <= 360;
  const isCompact = width <= 390;
  const dispatch = useDispatch();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Offer');
  const [uploading, setUploading] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getAdminBanners();
      setBanners(res.data?.data || []);
    } catch (e) {
      Alert.alert('Error', formatApiErrorForAlert(e, 'Could not load posters'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshCustomerBanners = () => dispatch(fetchBanners());

  const pickAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission', 'Photos access is needed to upload a poster.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];

      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime =
        asset.mimeType ||
        (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      const filePart = {
        uri: asset.uri,
        name: `poster.${ext === 'jpeg' ? 'jpg' : ext}`,
        type: mime,
      };

      setUploading(true);
      const res = await adminAPI.uploadBannerImage(filePart);
      const path = res.data?.data?.path || res.data?.data?.url;
      if (!path) {
        Alert.alert('Upload failed', 'No file URL returned');
        return;
      }
      setPendingImageUrl(path);
      Alert.alert('Uploaded', 'Poster stored. Enter a title and tap Add to carousel.');
    } catch (e) {
      Alert.alert('Error', formatApiErrorForAlert(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const addBanner = async () => {
    const imageUrl = pendingImageUrl.trim();
    if (!title.trim() || !imageUrl) {
      Alert.alert('Missing', 'Upload a poster image and enter a title.');
      return;
    }
    try {
      await adminAPI.createBanner({
        title: title.trim(),
        imageUrl,
        sortOrder: banners.length,
        isActive: true,
      });
      setTitle('Offer');
      setPendingImageUrl('');
      await load();
      refreshCustomerBanners();
      Alert.alert('Added', 'Customers will see this on the home carousel after refresh.');
    } catch (e) {
      Alert.alert('Error', formatApiErrorForAlert(e, 'Could not save'));
    }
  };

  const toggleActive = async (b) => {
    try {
      await adminAPI.updateBanner(b._id, { isActive: !b.isActive });
      await load();
      refreshCustomerBanners();
    } catch (e) {
      Alert.alert('Error', formatApiErrorForAlert(e, 'Update failed'));
    }
  };

  const removeBanner = (b) => {
    Alert.alert('Remove poster?', b.title || 'This carousel slide', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminAPI.deleteBanner(b._id);
            await load();
            refreshCustomerBanners();
          } catch (e) {
            Alert.alert('Error', formatApiErrorForAlert(e, 'Delete failed'));
          }
        },
      },
    ]);
  };

  const previewSrc = pendingImageUrl ? resolveMediaUrl(pendingImageUrl) : null;

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.pad, isCompact && styles.padCompact, isNarrow && styles.padNarrow]}
    >
      <Text style={[styles.title, isCompact && styles.titleCompact, isNarrow && styles.titleNarrow]}>Carousel posters</Text>
      <Text style={styles.note}>{ASPECT_HINT}</Text>

      <View style={[styles.card, isCompact && styles.cardCompact, isNarrow && styles.cardNarrow]}>
        <Text style={styles.cardLabel}>Preview (home fit)</Text>
        <View style={styles.aspectBox}>
          {previewSrc ? (
            <Image source={{ uri: previewSrc }} style={styles.aspectImg} resizeMode="cover" />
          ) : (
            <Text style={styles.placeholder}>Upload to preview how it fills the banner area</Text>
          )}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Title shown to team (customer UI is image-led)"
          placeholderTextColor={ADMIN_THEME.placeholder}
          value={title}
          onChangeText={setTitle}
        />

        <TouchableOpacity style={styles.secondaryBtn} onPress={pickAndUpload} disabled={uploading}>
          {uploading ? <ActivityIndicator color={ADMIN_THEME.violet} /> : <Text style={styles.secondaryBtnTxt}>Choose image & upload</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={addBanner}>
          <Text style={styles.primaryBtnTxt}>Add to customer home</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.listHead, isCompact && styles.listHeadCompact, isNarrow && styles.listHeadNarrow]}>
        Live slides ({banners.filter((b) => b.isActive).length} active)
      </Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={ADMIN_THEME.violet} />
      ) : (
        banners.map((b) => {
          const uri = resolveMediaUrl(b.imageUrl || b.image);
          return (
            <View key={b._id} style={[styles.row, isCompact && styles.rowCompact, isNarrow && styles.rowNarrow]}>
              <Image source={{ uri }} style={[styles.thumb, isCompact && styles.thumbCompact, isNarrow && styles.thumbNarrow]} resizeMode="cover" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {b.title}
                </Text>
                <View style={[styles.rowActions, isCompact && styles.rowActionsCompact, isNarrow && styles.rowActionsNarrow]}>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>On</Text>
                    <Switch
                      style={{ marginLeft: 8 }}
                      value={b.isActive}
                      onValueChange={() => toggleActive(b)}
                      trackColor={{ false: '#cbd5e1', true: '#c4b5fd' }}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeBanner(b)}>
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  pad: { paddingBottom: 20, flexGrow: 1 },
  padCompact: { paddingBottom: 16 },
  padNarrow: { paddingBottom: 14 },
  title: { fontSize: ADMIN_THEME.type.title, fontWeight: '800', color: ADMIN_THEME.ink },
  titleCompact: { fontSize: 19 },
  titleNarrow: { fontSize: 17 },
  note: { color: ADMIN_THEME.muted, fontSize: ADMIN_THEME.type.body, marginTop: 4, lineHeight: 18 },
  card: {
    marginTop: 8,
    backgroundColor: ADMIN_THEME.card,
    borderRadius: ADMIN_THEME.radius,
    padding: ADMIN_THEME.pad,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  cardCompact: { marginTop: 6, padding: 11 },
  cardNarrow: { marginTop: 6, padding: 10 },
  cardLabel: { fontWeight: '700', color: ADMIN_THEME.ink, marginBottom: 6 },
  aspectBox: {
    width: '100%',
    aspectRatio: 2.35,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aspectImg: { width: '100%', height: '100%' },
  placeholder: { color: ADMIN_THEME.muted, padding: 16, textAlign: 'center', fontSize: ADMIN_THEME.type.body },
  input: {
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: ADMIN_THEME.control.inputMinHeight,
    backgroundColor: ADMIN_THEME.surface,
    marginBottom: 6,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: ADMIN_THEME.violet,
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  secondaryBtnTxt: { fontWeight: '800', color: ADMIN_THEME.violet, fontSize: ADMIN_THEME.type.bodyStrong },
  primaryBtn: {
    backgroundColor: ADMIN_THEME.violet,
    borderRadius: ADMIN_THEME.control.buttonRadius,
    minHeight: ADMIN_THEME.control.buttonMinHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 2,
  },
  primaryBtnTxt: { fontWeight: '800', color: '#fff', fontSize: ADMIN_THEME.type.bodyStrong },
  listHead: { marginTop: 12, fontSize: ADMIN_THEME.type.section, fontWeight: '800', color: ADMIN_THEME.ink },
  listHeadCompact: { marginTop: 10 },
  listHeadNarrow: { marginTop: 8, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: ADMIN_THEME.card,
    borderRadius: ADMIN_THEME.radius,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: ADMIN_THEME.border,
  },
  rowCompact: {
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  rowNarrow: { paddingVertical: 7, paddingHorizontal: 8 },
  thumb: { width: 92, aspectRatio: 2.25, borderRadius: 10, backgroundColor: '#e2e8f0' },
  thumbCompact: { width: 82 },
  thumbNarrow: { width: 76 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: '700', color: ADMIN_THEME.ink, fontSize: 15 },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  rowActionsCompact: { marginTop: 6 },
  rowActionsNarrow: { marginTop: 5, gap: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { color: ADMIN_THEME.muted, fontWeight: '600', fontSize: ADMIN_THEME.type.body },
  remove: { color: '#dc2626', fontWeight: '700', fontSize: ADMIN_THEME.type.body },
});

export default AdminBannersTab;

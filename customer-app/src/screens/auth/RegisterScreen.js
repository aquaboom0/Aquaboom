import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, clearError } from '../../store/slices/authSlice';
import { COLORS, SPACE, RADII } from '../../config';

/** Mirrors backend: 10-digit Indian mobile, 6–9 first digit */
function validateIndiaMobile(raw) {
  const d = String(raw).replace(/\D/g, '');
  let n = d;
  if (n.length >= 11 && n.startsWith('91')) n = n.slice(-10);
  if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
  if (n.length === 10 && /^[6-9]\d{9}$/.test(n)) return true;
  return false;
}

const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.auth);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim() || !email.trim() || !password) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    if (!validateIndiaMobile(phone)) {
      Alert.alert(
        'Error',
        'Enter a valid 10-digit Indian mobile number (starts with 6–9). You can include +91.'
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    await dispatch(
      registerUser({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#ede9fe', '#f4f4f7', '#fafafa']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backChevron}>‹</Text>
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>

            <View style={styles.hero}>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>
                We’ll use your mobile to coordinate delivery. Your email secures your account.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Your full name"
                placeholderTextColor={COLORS.placeholder}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Mobile number</Text>
              <TextInput
                style={styles.textInput}
                placeholder="9876543210 or +91 98765 43210"
                placeholderTextColor={COLORS.placeholder}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.textInput}
                placeholder="you@gmail.com"
                placeholderTextColor={COLORS.placeholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Minimum 6 characters"
                placeholderTextColor={COLORS.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Re-enter password"
                placeholderTextColor={COLORS.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
                onPress={handleRegister}
                disabled={isLoading}
                activeOpacity={0.88}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.surface} />
                ) : (
                  <Text style={styles.primaryBtnText}>Register</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.footerTap} onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.footerMuted}>Already have an account? </Text>
              <Text style={styles.footerStrong}>Sign in</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safe: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xxl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: SPACE.md,
  },
  backChevron: {
    fontSize: 28,
    color: COLORS.primaryDark,
    marginRight: 2,
    marginTop: -2,
    fontWeight: '300',
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  hero: {
    marginBottom: SPACE.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: SPACE.sm,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textLight,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACE.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACE.xs,
    letterSpacing: 0.2,
  },
  textInput: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 14,
    marginBottom: SPACE.md,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACE.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.72,
  },
  primaryBtnText: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: '700',
  },
  footerTap: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: SPACE.xl,
  },
  footerMuted: {
    fontSize: 15,
    color: COLORS.textLight,
  },
  footerStrong: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
});

export default RegisterScreen;

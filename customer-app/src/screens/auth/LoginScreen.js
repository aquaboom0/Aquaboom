import React, { useState, useEffect } from 'react';
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
import { loginUnified, clearError } from '../../store/slices/authSlice';
import { COLORS, SPACE, RADII } from '../../config';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.auth);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleLogin = async () => {
    const trimmedLogin = email.trim();
    if (!trimmedLogin) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedLogin) && trimmedLogin.length < 3) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    await dispatch(
      loginUnified({
        email: trimmedLogin.toLowerCase(),
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
            <View style={styles.hero}>
              <LinearGradient
                colors={[COLORS.primaryDark, COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoRing}
              >
                <View style={styles.logoInner}>
                  <Text style={styles.logoGlyph}>💧</Text>
                </View>
              </LinearGradient>
              <Text style={styles.brand}>AquaBoom</Text>
              <Text style={styles.tagline}>Pure water, delivered like clockwork</Text>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.subtle}>Sign in with your account to order and track deliveries.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign in</Text>

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
                placeholder="Enter password"
                placeholderTextColor={COLORS.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.88}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.surface} />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.trust}>🔒 Your details are encrypted in transit</Text>
            </View>

            <TouchableOpacity
              style={styles.footerTap}
              onPress={() => navigation.navigate('Register')}
              hitSlop={{ top: 12, bottom: 12 }}
            >
              <Text style={styles.footerMuted}>New to AquaBoom? </Text>
              <Text style={styles.footerStrong}>Create an account</Text>
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
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xxl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: SPACE.xl,
  },
  logoRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 3,
    marginBottom: SPACE.md,
  },
  logoInner: {
    flex: 1,
    borderRadius: 41,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGlyph: {
    fontSize: 40,
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: SPACE.xs,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryDark,
    letterSpacing: 0.2,
  },
  welcome: {
    marginTop: SPACE.lg,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  subtle: {
    marginTop: SPACE.sm,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: SPACE.sm,
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
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACE.lg,
    letterSpacing: -0.3,
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
    letterSpacing: 0.2,
  },
  trust: {
    marginTop: SPACE.lg,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  footerTap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: SPACE.xl,
    paddingBottom: SPACE.md,
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

export default LoginScreen;

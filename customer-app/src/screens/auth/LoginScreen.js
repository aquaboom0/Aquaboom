import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { loginUnified, clearError } from '../../store/slices/authSlice';
import { COLORS, SPACE, RADII } from '../../config';
import { authAPI } from '../../services/api';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const modalFade = useState(new Animated.Value(0))[0];
  const modalScale = useState(new Animated.Value(0.96))[0];
  const loginButtonScale = useState(new Animated.Value(1))[0];
  const forgotButtonScale = useState(new Animated.Value(1))[0];
  const successTickScale = useState(new Animated.Value(0.7))[0];
  const successTickOpacity = useState(new Animated.Value(0))[0];
  const successGlowScale = useState(new Animated.Value(0.9))[0];
  const resetAutoCloseTimerRef = useRef(null);

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

  const openForgotPassword = () => {
    if (resetAutoCloseTimerRef.current) {
      clearTimeout(resetAutoCloseTimerRef.current);
      resetAutoCloseTimerRef.current = null;
    }
    setForgotEmail(email.trim().toLowerCase());
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotStep(1);
    setShowResetPassword(false);
    setShowForgotPasswordModal(true);
  };

  const closeForgotPassword = () => {
    if (isForgotLoading) return;
    if (resetAutoCloseTimerRef.current) {
      clearTimeout(resetAutoCloseTimerRef.current);
      resetAutoCloseTimerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(modalFade, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(modalScale, {
        toValue: 0.96,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setShowForgotPasswordModal(false);
    });
  };

  const handleRequestResetCode = async () => {
    const targetEmail = forgotEmail.trim().toLowerCase();
    if (!targetEmail) {
      Alert.alert('Error', 'Please enter your email.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    try {
      setIsForgotLoading(true);
      const res = await authAPI.requestPasswordResetCode(targetEmail);
      const message =
        res?.data?.message ||
        'If this email is registered, a reset code has been sent.';
      Alert.alert('Reset code sent', message);
      setForgotEmail(targetEmail);
      setForgotStep(2);
    } catch (err) {
      const code = err?.code;
      const message =
        code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))
          ? 'Request timed out. Check your connection and API URL, then try again.'
          : err?.response?.data?.message || err?.message || 'Failed to send reset code.';
      Alert.alert('Error', message);
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleVerifyResetCode = async () => {
    const code = resetCode.trim();
    if (!code) {
      Alert.alert('Error', 'Please enter the reset code sent to your email.');
      return;
    }
    try {
      setIsForgotLoading(true);
      const res = await authAPI.verifyPasswordResetCode(forgotEmail, code);
      Alert.alert('Verified', res?.data?.message || 'Code verified.');
      setForgotStep(3);
    } catch (err) {
      const message = err?.response?.data?.message || 'Invalid or expired code.';
      Alert.alert('Error', message);
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    try {
      setIsForgotLoading(true);
      const res = await authAPI.resetPasswordWithCode(forgotEmail, newPassword);
      const successMessage = res?.data?.message || 'Password reset successful.';
      setForgotStep(4);
      setPassword('');
      resetAutoCloseTimerRef.current = setTimeout(() => {
        Alert.alert('Success', successMessage);
        closeForgotPassword();
      }, 1300);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to reset password.';
      Alert.alert('Error', message);
    } finally {
      setIsForgotLoading(false);
    }
  };

  const animatePressIn = (value) => {
    Animated.spring(value, {
      toValue: 0.97,
      damping: 18,
      stiffness: 320,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  const animatePressOut = (value) => {
    Animated.spring(value, {
      toValue: 1,
      damping: 18,
      stiffness: 320,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (showForgotPasswordModal) {
      modalFade.setValue(0);
      modalScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(modalFade, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          damping: 16,
          stiffness: 170,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showForgotPasswordModal, modalFade, modalScale]);

  useEffect(() => {
    if (forgotStep === 4) {
      successTickScale.setValue(0.7);
      successTickOpacity.setValue(0);
      successGlowScale.setValue(0.9);
      Animated.parallel([
        Animated.spring(successTickScale, {
          toValue: 1,
          damping: 12,
          stiffness: 190,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(successTickOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(successGlowScale, {
              toValue: 1.08,
              duration: 700,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(successGlowScale, {
              toValue: 0.94,
              duration: 700,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          { iterations: 2 }
        ),
      ]).start();
    }
  }, [forgotStep, successGlowScale, successTickOpacity, successTickScale]);

  useEffect(
    () => () => {
      if (resetAutoCloseTimerRef.current) {
        clearTimeout(resetAutoCloseTimerRef.current);
      }
    },
    []
  );

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
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter password"
                  placeholderTextColor={COLORS.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeToggle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.forgotLinkWrap} onPress={openForgotPassword}>
                <Text style={styles.forgotLinkText}>Forgot password?</Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: loginButtonScale }] }}>
                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.95}
                  onPressIn={() => animatePressIn(loginButtonScale)}
                  onPressOut={() => animatePressOut(loginButtonScale)}
                >
                  <LinearGradient
                    colors={isLoading ? ['#8b5cf6', '#8b5cf6'] : ['#7c3aed', '#6d28d9', '#5b21b6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryBtnGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={COLORS.surface} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Continue</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

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

      <Modal
        visible={showForgotPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={closeForgotPassword}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.modalCard,
              {
                opacity: modalFade,
                transform: [{ scale: modalScale }],
              },
            ]}
          >
            <View style={styles.modalTopRow}>
              <View style={styles.modalBadge}>
                <Text style={styles.modalBadgeText}>🔐</Text>
              </View>
              <Text style={styles.modalStepText}>
                {forgotStep === 4 ? 'Completed' : `Step ${forgotStep} of 3`}
              </Text>
            </View>
            <Text style={styles.modalTitle}>Reset password</Text>
            {forgotStep !== 4 ? (
              <View style={styles.stepTrack}>
                <View style={[styles.stepDot, forgotStep >= 1 && styles.stepDotActive]} />
                <View style={[styles.stepLine, forgotStep >= 2 && styles.stepLineActive]} />
                <View style={[styles.stepDot, forgotStep >= 2 && styles.stepDotActive]} />
                <View style={[styles.stepLine, forgotStep >= 3 && styles.stepLineActive]} />
                <View style={[styles.stepDot, forgotStep >= 3 && styles.stepDotActive]} />
              </View>
            ) : null}
            {forgotStep === 1 ? (
              <>
                <Text style={styles.modalHint}>Enter your account email to receive a reset code.</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="you@gmail.com"
                  placeholderTextColor={COLORS.placeholder}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Animated.View style={{ transform: [{ scale: forgotButtonScale }] }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, isForgotLoading && styles.primaryBtnDisabled]}
                    onPress={handleRequestResetCode}
                    disabled={isForgotLoading}
                    activeOpacity={0.95}
                    onPressIn={() => animatePressIn(forgotButtonScale)}
                    onPressOut={() => animatePressOut(forgotButtonScale)}
                  >
                    <LinearGradient
                      colors={
                        isForgotLoading ? ['#8b5cf6', '#8b5cf6'] : ['#7c3aed', '#6d28d9', '#5b21b6']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryBtnGradient}
                    >
                      {isForgotLoading ? (
                        <ActivityIndicator color={COLORS.surface} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Send Code</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : null}

            {forgotStep === 2 ? (
              <>
                <Text style={styles.modalHint}>Enter the code sent to {forgotEmail}.</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="6-digit code"
                  placeholderTextColor={COLORS.placeholder}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Animated.View style={{ transform: [{ scale: forgotButtonScale }] }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, isForgotLoading && styles.primaryBtnDisabled]}
                    onPress={handleVerifyResetCode}
                    disabled={isForgotLoading}
                    activeOpacity={0.95}
                    onPressIn={() => animatePressIn(forgotButtonScale)}
                    onPressOut={() => animatePressOut(forgotButtonScale)}
                  >
                    <LinearGradient
                      colors={
                        isForgotLoading ? ['#8b5cf6', '#8b5cf6'] : ['#7c3aed', '#6d28d9', '#5b21b6']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryBtnGradient}
                    >
                      {isForgotLoading ? (
                        <ActivityIndicator color={COLORS.surface} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify Code</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
                <TouchableOpacity
                  style={styles.secondaryActionBtn}
                  disabled={isForgotLoading}
                  onPress={handleRequestResetCode}
                >
                  <Text style={styles.secondaryActionText}>Resend code</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {forgotStep === 3 ? (
              <>
                <Text style={styles.modalHint}>Set your new password.</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="New password"
                    placeholderTextColor={COLORS.placeholder}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showResetPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowResetPassword((prev) => !prev)}
                    style={styles.eyeToggle}
                  >
                    <Text style={styles.eyeToggleText}>{showResetPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Confirm new password"
                  placeholderTextColor={COLORS.placeholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showResetPassword}
                />
                <Animated.View style={{ transform: [{ scale: forgotButtonScale }] }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, isForgotLoading && styles.primaryBtnDisabled]}
                    onPress={handleResetPassword}
                    disabled={isForgotLoading}
                    activeOpacity={0.95}
                    onPressIn={() => animatePressIn(forgotButtonScale)}
                    onPressOut={() => animatePressOut(forgotButtonScale)}
                  >
                    <LinearGradient
                      colors={
                        isForgotLoading ? ['#8b5cf6', '#8b5cf6'] : ['#7c3aed', '#6d28d9', '#5b21b6']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryBtnGradient}
                    >
                      {isForgotLoading ? (
                        <ActivityIndicator color={COLORS.surface} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Update Password</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : null}

            {forgotStep === 4 ? (
              <View style={styles.successWrap}>
                <Animated.View
                  style={[
                    styles.successGlow,
                    { transform: [{ scale: successGlowScale }], opacity: successTickOpacity },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.successTickBubble,
                    {
                      opacity: successTickOpacity,
                      transform: [{ scale: successTickScale }],
                    },
                  ]}
                >
                  <Text style={styles.successTickText}>✓</Text>
                </Animated.View>
                <Text style={styles.successTitle}>Password updated</Text>
                <Text style={styles.successSubtitle}>
                  Your account is secure now. Redirecting you to sign in.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={closeForgotPassword}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACE.sm,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingHorizontal: SPACE.md,
    paddingVertical: 14,
  },
  eyeToggle: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  eyeToggleText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  forgotLinkWrap: {
    alignSelf: 'flex-end',
    marginBottom: SPACE.sm,
  },
  forgotLinkText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: RADII.md,
    marginTop: SPACE.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  primaryBtnDisabled: {
    opacity: 0.8,
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  modalBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#efe6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBadgeText: {
    fontSize: 16,
  },
  modalStepText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACE.sm,
  },
  stepTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#d1d5db',
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
  },
  stepLine: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 6,
    backgroundColor: '#e5e7eb',
  },
  stepLineActive: {
    backgroundColor: '#b794f4',
  },
  modalHint: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: SPACE.md,
  },
  secondaryActionBtn: {
    alignSelf: 'center',
    marginTop: SPACE.sm,
  },
  secondaryActionText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  modalCloseBtn: {
    marginTop: SPACE.md,
    alignSelf: 'center',
  },
  modalCloseText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  successWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.md,
  },
  successGlow: {
    position: 'absolute',
    top: 18,
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  successTickBubble: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  successTickText: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  successTitle: {
    marginTop: SPACE.md,
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
  },
  successSubtitle: {
    marginTop: SPACE.xs,
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: SPACE.md,
  },
});

export default LoginScreen;

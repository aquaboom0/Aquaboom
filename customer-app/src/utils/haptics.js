import * as Haptics from 'expo-haptics';

async function safeRun(promiseFactory) {
  try {
    await promiseFactory();
  } catch {
    // Haptics may be unavailable on emulators/some devices.
  }
}

export async function hapticSoftTap() {
  await safeRun(() =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  );
}

export async function hapticSuccess() {
  await safeRun(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

export async function hapticDeliveredSuccess() {
  await safeRun(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  });
}


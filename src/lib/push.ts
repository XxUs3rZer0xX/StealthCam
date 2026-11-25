// Client-side FCM registration for the Capacitor Android app. On the native
// app this asks for notification permission, registers with FCM, and hands the
// device token to our server so it can push motion alerts. In a plain browser
// (no Capacitor) every call is a harmless no-op.

let registered = false;

export async function registerPushNotifications(authToken: string): Promise<void> {
  if (registered || !authToken) return;

  // Loaded dynamically so the web build never hard-depends on the native plugin.
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    console.warn('Push permission not granted:', perm.receive);
    return;
  }

  registered = true;

  // Ensure the channel our server targets exists (Android 8+ requires it).
  try {
    await PushNotifications.createChannel({
      id: 'stealthcam_motion',
      name: 'Motion alerts',
      description: 'Alerts when the camera detects movement',
      importance: 5, // IMPORTANCE_HIGH — heads-up notification
      visibility: 1,
    });
  } catch {
    // Channels are Android-only; ignore where unsupported.
  }

  // Send the FCM token to our backend; refreshed tokens come through here too.
  PushNotifications.addListener('registration', async (tokenData) => {
    try {
      await fetch('/api/push/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: tokenData.value }),
      });
      console.log('Push token registered with server');
    } catch (err) {
      console.error('Failed to register push token:', err);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });

  await PushNotifications.register();
}

import { getTokens, removeTokens } from './pushTokens';
import { sendToTokens, isFcmConfigured } from './fcm';

// Bridges a motion event to a background push on the user's phone(s).
// Called from the socket server when the camera reports movement.

// Don't spam: at most one push per user per cooldown window. The browser
// detector already rate-limits, this is a server-side backstop.
const COOLDOWN_MS = 20_000;
const lastPushAt = new Map<string, number>();

/**
 * Fire-and-forget: send a "motion detected" push to a user's phones.
 * Safe to call when FCM isn't configured (it just no-ops).
 */
export async function sendMotionPush(userId: string, at: number): Promise<void> {
  if (!userId || !isFcmConfigured()) return;

  const now = Date.now();
  const last = lastPushAt.get(userId) || 0;
  if (now - last < COOLDOWN_MS) return;
  lastPushAt.set(userId, now);

  const tokens = await getTokens(userId);
  if (tokens.length === 0) return;

  const time = new Date(at || now).toLocaleTimeString();
  const { invalidTokens } = await sendToTokens(tokens, {
    title: 'StealthCam: motion detected',
    body: `Movement seen on your camera at ${time}.`,
    data: { type: 'motion', at: String(at || now) },
  });

  if (invalidTokens.length > 0) {
    await removeTokens(userId, invalidTokens);
  }
}

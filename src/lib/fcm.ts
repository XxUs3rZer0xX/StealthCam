import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import path from 'path';

// Minimal Firebase Cloud Messaging (HTTP v1) sender. We avoid the heavy
// firebase-admin SDK: a service account can mint its own OAuth access token by
// signing a JWT, which we then use to POST to the FCM send endpoint.
//
// Configure with EITHER:
//   FIREBASE_SERVICE_ACCOUNT       = the full service-account JSON (one line), or
//   a file at ./firebase-service-account.json in the project root.
// Both are gitignored — the key is a secret.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface FcmResult {
  sent: number;
  invalidTokens: string[]; // tokens FCM rejected as dead — prune these
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccount: ServiceAccount | null | undefined; // undefined = not yet loaded
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;

  let json: string | null = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    json = process.env.FIREBASE_SERVICE_ACCOUNT;
  } else {
    try {
      json = readFileSync(path.join(process.cwd(), 'firebase-service-account.json'), 'utf8');
    } catch {
      json = null;
    }
  }

  if (!json) {
    cachedAccount = null;
    return null;
  }

  try {
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.error('FCM: service account JSON is missing required fields');
      cachedAccount = null;
      return null;
    }
    // Env-provided keys often have literal "\n" instead of real newlines.
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    cachedAccount = parsed;
    return parsed;
  } catch (err) {
    console.error('FCM: could not parse service account JSON:', err);
    cachedAccount = null;
    return null;
  }
}

/** True when a Firebase service account is available to send pushes. */
export function isFcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const assertion = jwt.sign(
    { scope: SCOPE },
    account.private_key,
    {
      algorithm: 'RS256',
      issuer: account.client_email,
      subject: account.client_email,
      audience: TOKEN_URL,
      expiresIn: '1h',
    }
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM OAuth token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return data.access_token;
}

/**
 * Send one notification to a set of device tokens. Returns how many succeeded
 * and which tokens FCM considers dead (so the caller can remove them).
 */
export async function sendToTokens(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<FcmResult> {
  const account = loadServiceAccount();
  if (!account || tokens.length === 0) {
    return { sent: 0, invalidTokens: [] };
  }

  const accessToken = await getAccessToken(account);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

  let sent = 0;
  const invalidTokens: string[] = [];

  await Promise.all(
    tokens.map(async (token) => {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'stealthcam_motion',
              sound: 'default',
            },
          },
        },
      };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (res.ok) {
          sent += 1;
          return;
        }

        // 404 UNREGISTERED or 400 with an invalid-token error => token is dead.
        const text = await res.text();
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) {
          invalidTokens.push(token);
        }
        console.error(`FCM send failed (${res.status}): ${text}`);
      } catch (err) {
        console.error('FCM send error:', err);
      }
    })
  );

  return { sent, invalidTokens };
}

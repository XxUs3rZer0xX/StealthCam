import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { addToken, removeTokens } from '@/lib/pushTokens';

// Phone registers its FCM token here so the server can push motion alerts to it
// even when the app is closed. POST to register, DELETE to unregister.

export const runtime = 'nodejs';

interface TokenPayload {
  userId: string;
  deviceType: string;
}

function verify(request: NextRequest): TokenPayload | null {
  if (!process.env.JWT_SECRET) return null;
  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = headerToken || request.nextUrl.searchParams.get('token');
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = verify(request);
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let fcmToken: string | undefined;
  try {
    ({ token: fcmToken } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ error: 'Missing push token' }, { status: 400 });
  }

  await addToken(auth.userId, fcmToken);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = verify(request);
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let fcmToken: string | undefined;
  try {
    ({ token: fcmToken } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ error: 'Missing push token' }, { status: 400 });
  }

  await removeTokens(auth.userId, [fcmToken]);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';

// Recordings are written next to the project, e.g.
// recordings/2026-11-24_14-03-12-480.webm — one finalized clip per motion event.
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/;
const MAX_CLIP_BYTES = 200 * 1024 * 1024; // 200 MB safety cap per clip

interface TokenPayload {
  userId: string;
  deviceType: string;
}

/** Verify a JWT from the Authorization header or a ?token= query param. */
function verifyRequest(request: NextRequest): TokenPayload | null {
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

// POST — upload a single finalized clip. Camera (computer) clients only.
export async function POST(request: NextRequest) {
  try {
    if (!process.env.JWT_SECRET) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const decoded = verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (decoded.deviceType !== 'computer') {
      return NextResponse.json({ error: 'Only computer clients can record' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id') || '';
    if (!ID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
    }

    const clip = Buffer.from(await request.arrayBuffer());
    if (clip.length === 0) {
      return NextResponse.json({ error: 'Empty clip' }, { status: 400 });
    }
    if (clip.length > MAX_CLIP_BYTES) {
      return NextResponse.json({ error: 'Clip too large' }, { status: 413 });
    }

    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    const filePath = path.join(RECORDINGS_DIR, `${id}.webm`);

    try {
      // 'wx' refuses to overwrite an existing recording.
      await fs.writeFile(filePath, clip, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return NextResponse.json({ error: 'Recording already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, id, bytes: clip.length });
  } catch (error) {
    console.error('Recording write error:', error);
    return NextResponse.json({ error: 'Failed to save recording' }, { status: 500 });
  }
}

// GET — list available clips, newest first. Any authenticated device.
export async function GET(request: NextRequest) {
  try {
    const decoded = verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let files: string[] = [];
    try {
      files = await fs.readdir(RECORDINGS_DIR);
    } catch {
      return NextResponse.json({ recordings: [] });
    }

    const recordings = await Promise.all(
      files
        .filter(name => name.endsWith('.webm') && ID_PATTERN.test(name.replace(/\.webm$/, '')))
        .map(async (name) => {
          const id = name.replace(/\.webm$/, '');
          const stat = await fs.stat(path.join(RECORDINGS_DIR, name));
          return { id, bytes: stat.size, mtime: stat.mtimeMs };
        })
    );

    recordings.sort((a, b) => b.mtime - a.mtime);
    return NextResponse.json({ recordings });
  } catch (error) {
    console.error('Recording list error:', error);
    return NextResponse.json({ error: 'Failed to list recordings' }, { status: 500 });
  }
}

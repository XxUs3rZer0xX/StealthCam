import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';

// Serves a single recorded clip with HTTP Range support so the <video> element
// can seek (fast-forward / rewind) instead of only playing straight through.

export const runtime = 'nodejs';

const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/;

function authed(request: NextRequest): boolean {
  if (!process.env.JWT_SECRET) return false;
  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = headerToken || request.nextUrl.searchParams.get('token');
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
  }

  const filePath = path.join(RECORDINGS_DIR, `${id}.webm`);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  }

  const file = await fs.readFile(filePath);
  const range = request.headers.get('range');

  // No Range header: return the whole clip but advertise range support.
  if (!range) {
    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': 'video/webm',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Parse "bytes=start-end".
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    });
  }
  end = Math.min(end, size - 1);

  const slice = file.subarray(start, end + 1);
  return new NextResponse(new Uint8Array(slice), {
    status: 206,
    headers: {
      'Content-Type': 'video/webm',
      'Content-Length': String(slice.length),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}

// DELETE — remove a recorded clip. Any authenticated device (the phone can
// clear its own archive).
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
  }

  const filePath = path.join(RECORDINGS_DIR, `${id}.webm`);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }
    console.error('Recording delete error:', err);
    return NextResponse.json({ error: 'Failed to delete recording' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}

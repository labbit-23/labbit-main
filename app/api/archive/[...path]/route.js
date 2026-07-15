// File: /app/api/archive/[...path]/route.js
// Thin proxy to the shivam-archive FastAPI service (historical Shivam data).
// All archive logic lives in FastAPI; this layer adds labit session auth and
// forwards the user identity for audit logging.

import { NextResponse } from 'next/server';
import { getSessionUser, deny } from '@/lib/uac/authz';

const ARCHIVE_API_BASE_URL =
  process.env.ARCHIVE_API_BASE_URL || 'http://127.0.0.1:8010';

async function forward(request, { params }, method) {
  const user = await getSessionUser(request);
  if (!user) return deny('Sign in required', 401);

  const { path } = await params;
  const search = new URL(request.url).search;
  const target = `${ARCHIVE_API_BASE_URL}/api/archive/${path.join('/')}${search}`;

  const init = {
    method,
    headers: {
      Accept: 'application/json',
      'X-Archive-User': String(user.id ?? user.email ?? 'unknown'),
    },
  };
  if (method === 'POST') {
    init.headers['Content-Type'] = 'application/json';
    init.body = await request.text();
  }

  try {
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Archive proxy error:', err);
    return NextResponse.json(
      { error: 'Archive service unreachable' },
      { status: 502 },
    );
  }
}

export async function GET(request, ctx) {
  return forward(request, ctx, 'GET');
}

export async function POST(request, ctx) {
  return forward(request, ctx, 'POST');
}

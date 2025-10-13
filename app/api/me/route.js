// File: /app/api/me/route.js

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { ironOptions } from '@/lib/session';

export async function GET(request) {
  const response = NextResponse.next();
  
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    console.log(`[api/me] Incoming request cookies: ${cookieHeader}`);

    const session = await getIronSession(request, response, ironOptions);

    if (!session.user) {
      console.log('[api/me] Unauthorized access - no user in session.');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { user } = session;

    console.log(`[api/me] Authorized access - user ID: ${user.id}, userType: ${user.userType}, executiveType: ${user.executiveType || 'null'}`);

    return NextResponse.json(
      {
        id: user.id,
        userType: user.userType,
        phone: user.phone,
        executiveType: user.executiveType || null,
        name: user.name || null,
        labIds: user.labIds || [],  // Return labIds array from session user or empty array
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[api/me] Error reading session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

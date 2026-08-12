import { NextResponse } from 'next/server';
import { checkPermission, getSessionUser, deny } from '@/lib/uac/authz';

const LABIT_CORE_API_URL =
  process.env.LABIT_CORE_API_URL ||
  process.env.NEXT_PUBLIC_LABIT_CORE_API_URL ||
  'http://127.0.0.1:8000';

export async function GET(request, { params }) {
  const user = await getSessionUser(request);
  if (!user) return deny('Sign in required', 401);
  const permission = await checkPermission(user, 'archive.patient.view');
  if (!permission.ok) {
    return deny('Archive access forbidden', 403, {
      permission: 'archive.patient.view',
      roleKey: permission.roleKey,
    });
  }

  const { reqno, kind } = await params;
  if (kind !== 'pdf' && kind !== 'radiology-pdf') {
    return NextResponse.json({ detail: 'Unknown archive report kind' }, { status: 404 });
  }
  const search = new URL(request.url).search;
  const target = `${LABIT_CORE_API_URL}/api/archive-reports/${encodeURIComponent(reqno)}/${kind}${search}`;

  try {
    const upstream = await fetch(target, {
      cache: 'no-store',
      headers: {
        Accept: 'application/pdf',
        'X-User-Id': String(user.id),
      },
    });
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/pdf',
        'Content-Disposition':
          upstream.headers.get('Content-Disposition') ||
          `inline; filename="archive-${kind}-${reqno}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Archive report proxy error:', err);
    return NextResponse.json({ detail: 'Archive report renderer unreachable' }, { status: 502 });
  }
}

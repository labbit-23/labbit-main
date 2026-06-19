import { NextResponse } from 'next/server';

/**
 * GET /api/archive/trends/[mrno]
 *
 * Proxy to shivam-archive service for historical trend data.
 * Returns trend.v1 JSON compatible with existing trend report pipeline.
 *
 * Falls back gracefully to 404 if archive is unavailable or MRN not found.
 */
export async function GET(request, { params }) {
  const { mrno } = params;
  const archiveUrl = process.env.SHIVAM_ARCHIVE_BASE_URL;

  if (!archiveUrl) {
    return NextResponse.json(
      { error: 'Archive service not configured (SHIVAM_ARCHIVE_BASE_URL)' },
      { status: 503 }
    );
  }

  try {
    const url = `${archiveUrl}/trends/${encodeURIComponent(mrno)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Archive returned ${res.status}`, mrno },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[archive/trends] Error fetching trends for ${mrno}:`, error);
    return NextResponse.json(
      { error: 'Archive service unavailable', mrno },
      { status: 503 }
    );
  }
}

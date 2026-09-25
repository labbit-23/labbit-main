// File: app/api/internal/routing/eta/route.js
//
// Phlebo screen ETA: POST { origin: {lat,lng}, stops: [{id,lat,lng}] }
// -> { etas: { [id]: { minutes, km } } }. Free Ola calls only (see
// lib/olaEta.js). Never errors on a routing failure -- an empty map just
// means the cards show no ETA.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { fetchEtas } from "@/lib/olaEta";

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);
  const body = await request.json().catch(() => ({}));
  const etas = await fetchEtas(body?.origin, body?.stops);
  return NextResponse.json({ etas });
}

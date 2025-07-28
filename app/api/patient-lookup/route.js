import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Missing phone parameter" }, { status: 400 });
  }

  const baseURL = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_URL;
  const apiKey = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_KEY;
  if (!baseURL || !apiKey) {
    return NextResponse.json({ error: "API URL or key not configured" }, { status: 500 });
  }

  // Build URL-encoded data param as JSON array [{"phone":"<phone>"}]
  const dataParam = encodeURIComponent(JSON.stringify([{ phone: String(phone) }]));
  const url = `${baseURL}&data=${dataParam}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      // method is GET by default
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      return NextResponse.json({ error: text }, { status: apiRes.status });
    }

    const data = await apiRes.json();
    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "Proxy error: " + e.message }, { status: 500 });
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const at = url.searchParams.get('at');
  if (!at) {
    return new Response(JSON.stringify({ error: "Missing 'at' parameter with lat,lng" }), { status: 400 });
  }
  const apiKey = process.env.NEXTBILLION_API_KEY;
  const apiUrl = `https://api.nextbillion.io/revgeocode?at=${encodeURIComponent(at)}&key=${apiKey}`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: text }), { status: res.status });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

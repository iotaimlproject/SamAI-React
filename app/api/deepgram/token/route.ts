import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });

  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 30 }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes("Insufficient permissions") || res.status === 403) {
      return NextResponse.json({ key: apiKey, fallback: "raw-key" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

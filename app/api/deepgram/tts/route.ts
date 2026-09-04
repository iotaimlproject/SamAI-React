import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });

  const { text, model = "aura-asteria-en" } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const isFlux = String(model).startsWith("flux-");
  const baseUrl = isFlux ? "https://api.deepgram.com/v2/speak" : "https://api.deepgram.com/v1/speak";
  const query = isFlux ? `?model=${model}` : `?model=${model}`;

  const res = await fetch(`${baseUrl}${query}`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const blob = await res.blob();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

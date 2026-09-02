import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerConfig() {
  let base = process.env.MEDIA_WORKER_URL?.trim()?.replace(/\/+$/, "");

  if (base && !/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
}
  const secret = process.env.MEDIA_WORKER_SECRET?.trim();
  if (!base) throw new Error("MEDIA_WORKER_URL is not configured in Vercel.");
  return { base, secret };
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    const { base, secret } = workerConfig();

    const upstream = await fetch(`${base}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Worker-Secret": secret } : {})
      },
      body: JSON.stringify({ url }),
      cache: "no-store"
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text || "The media worker returned an invalid response." };
    }

    return NextResponse.json(payload, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Could not contact the YouTube media worker." },
      { status: 503 }
    );
  }
}

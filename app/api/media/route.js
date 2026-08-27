import { NextResponse } from "next/server";

export const runtime = "nodejs";

function allowedMediaUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host.endsWith(".apple.com") || host === "apple.com" || host.endsWith(".mzstatic.com") || host === "mzstatic.com";
}

function safeFilename(name) {
  return (name || "apple-music-preview")
    .replace(/[\\/:*?\"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("url");
    if (!raw || !allowedMediaUrl(raw)) return NextResponse.json({ error: "Media URL is not allowed." }, { status: 400 });

    const upstream = await fetch(raw, { cache: "no-store", redirect: "follow" });
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Could not fetch the preview from Apple." }, { status: 502 });

    const type = upstream.headers.get("content-type") || "video/mp4";
    const name = `${safeFilename(searchParams.get("name"))}.mp4`;

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Invalid preview URL." }, { status: 400 });
  }
}

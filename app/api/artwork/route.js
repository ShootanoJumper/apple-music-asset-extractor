import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

function allowedArtworkUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host.endsWith(".mzstatic.com") || host === "mzstatic.com" || host.endsWith(".apple.com") || host === "apple.com";
}

function safeFilename(name) {
  return (name || "apple-music-artwork")
    .replace(/[\\/:*?\"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("url");
    const format = searchParams.get("format") === "png" ? "png" : "jpg";
    if (!raw || !allowedArtworkUrl(raw)) return NextResponse.json({ error: "Artwork URL is not allowed." }, { status: 400 });

    const upstream = await fetch(raw, { cache: "force-cache" });
    if (!upstream.ok) return NextResponse.json({ error: "Could not fetch artwork from Apple." }, { status: 502 });
    const input = Buffer.from(await upstream.arrayBuffer());
    const output = format === "png" ? await sharp(input).png().toBuffer() : await sharp(input).jpeg({ quality: 95 }).toBuffer();
    const type = format === "png" ? "image/png" : "image/jpeg";
    const name = `${safeFilename(searchParams.get("name"))}.${format}`;

    return new Response(output, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch {
    return NextResponse.json({ error: "Invalid artwork URL." }, { status: 400 });
  }
}

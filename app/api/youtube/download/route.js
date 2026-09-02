import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_FORMAT_ID = /^[A-Za-z0-9._-]{1,80}$/;

function getConfig() {
  let base = process.env.MEDIA_WORKER_URL?.trim()?.replace(/\/+$/, "");

  if (base && !/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
}
  const secret = process.env.MEDIA_WORKER_SECRET?.trim();
  if (!base) throw new Error("MEDIA_WORKER_URL is not configured in Vercel.");
  if (!secret) throw new Error("MEDIA_WORKER_SECRET is not configured in Vercel.");
  return { base, secret };
}

function sign(secret, fields) {
  return crypto.createHmac("sha256", secret).update(fields.join("\n")).digest("hex");
}

export async function GET(request) {
  try {
    const incoming = new URL(request.url);
    const url = incoming.searchParams.get("url") || "";
    const mode = incoming.searchParams.get("mode") || "best";
    const formatId = incoming.searchParams.get("format_id") || "";
    const container = incoming.searchParams.get("container") || "auto";
    const confirmed = incoming.searchParams.get("confirm") === "1";

    if (!confirmed) {
      return NextResponse.json(
        { error: "Confirm that you own this video or have permission to download it." },
        { status: 400 }
      );
    }

    if (!["best", "mp4", "format"].includes(mode)) {
      return NextResponse.json({ error: "Invalid download mode." }, { status: 400 });
    }
    if (!["auto", "mp4", "mkv"].includes(container)) {
      return NextResponse.json({ error: "Invalid output container." }, { status: 400 });
    }
    if (mode === "format" && !SAFE_FORMAT_ID.test(formatId)) {
      return NextResponse.json({ error: "Invalid format ID." }, { status: 400 });
    }

    const { base, secret } = getConfig();
    const expires = Math.floor(Date.now() / 1000) + 5 * 60;
    const signature = sign(secret, [url, mode, formatId, container, String(expires)]);

    const target = new URL(`${base}/download`);
    target.searchParams.set("url", url);
    target.searchParams.set("mode", mode);
    target.searchParams.set("container", container);
    target.searchParams.set("confirm", "1");
    target.searchParams.set("expires", String(expires));
    target.searchParams.set("sig", signature);
    if (formatId) target.searchParams.set("format_id", formatId);

    return NextResponse.redirect(target, 307);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Could not create a download request." },
      { status: 503 }
    );
  }
}

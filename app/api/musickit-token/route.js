import { NextResponse } from "next/server";
import { getAppleMusicDeveloperToken } from "../../../lib/appleMusicToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  let origin;
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = undefined;
  }

  let token;
  try {
    token = getAppleMusicDeveloperToken({ origin });
  } catch {
    return NextResponse.json(
      {
        configured: false,
        error: "Apple Music credentials are configured, but the Media Services private key could not sign a developer token."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!token) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Apple Music subscriber playback is not configured. Add APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY in Vercel, or provide APPLE_MUSIC_DEVELOPER_TOKEN."
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { configured: true, developerToken: token },
    { headers: { "Cache-Control": "no-store" } }
  );
}

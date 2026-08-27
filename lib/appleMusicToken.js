import crypto from "node:crypto";

function base64url(input) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return value.toString("base64url");
}

function normalizePrivateKey(value) {
  return value?.replace(/\\n/g, "\n").trim();
}

export function getAppleMusicDeveloperToken({ origin } = {}) {
  const staticToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim();
  if (staticToken) return staticToken;

  const teamId = process.env.APPLE_MUSIC_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MUSIC_KEY_ID?.trim();
  const privateKey = normalizePrivateKey(process.env.APPLE_MUSIC_PRIVATE_KEY);

  if (!teamId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60
  };

  if (origin) payload.origin = [origin];

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });

  return `${signingInput}.${base64url(signature)}`;
}

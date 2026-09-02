import { getAppleMusicDeveloperToken } from "../../../lib/appleMusicToken";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseAppleMusicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Enter a valid Apple Music URL."); }
  if (u.hostname !== "music.apple.com") throw new Error("The URL must be from music.apple.com.");

  const parts = u.pathname.split("/").filter(Boolean);
  const storefront = /^[a-z]{2}$/i.test(parts[0] || "") ? parts[0].toLowerCase() : "us";
  const idFromQuery = u.searchParams.get("i");
  const numericParts = parts.filter((part) => /^\d+$/.test(part));
  const id = idFromQuery || numericParts.at(-1);
  if (!id || !/^\d+$/.test(id)) throw new Error("Could not find a numeric Apple Music item ID in that URL.");
  return { id, storefront };
}

function artUrl(template, size = 1400) {
  if (!template) return null;
  return template
    .replace("{w}", String(size))
    .replace("{h}", String(size))
    .replace("{f}", "jpg");
}

async function appleMusicLookup(id, storefront, token) {
  const res = await fetch(`https://api.music.apple.com/v1/catalog/${storefront}/music-videos/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.data?.[0];
  if (!item) return null;
  const a = item.attributes || {};
  const preview = a.previews?.[0] || {};
  return {
    id: item.id,
    storefront,
    source: "Apple Music API",
    title: a.name || "Unknown title",
    artist: a.artistName || "Unknown artist",
    durationMs: a.durationInMillis ?? null,
    contentRating: a.contentRating || null,
    has4K: a.has4K ?? null,
    hasHDR: a.hasHDR ?? null,
    isrc: a.isrc || null,
    releaseDate: a.releaseDate || null,
    genreNames: a.genreNames || [],
    appleMusicUrl: a.url || null,
    artwork: {
      displayUrl: artUrl(a.artwork?.url, 1200),
      originalUrl: artUrl(a.artwork?.url, 3000),
      bgColor: a.artwork?.bgColor || null
    },
    preview: {
      url: preview.url || null,
      hlsUrl: preview.hlsUrl || null
    }
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function storefrontFallbacks(storefront) {
  return [...new Set([storefront, "us", "ca", "gb", "au"].filter(Boolean))];
}

async function fetchItunesItem(id, storefront) {
  const country = storefront.toUpperCase();
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=${encodeURIComponent(country)}&entity=musicVideo`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const json = await res.json();
  return (json.results || []).find((r) => r.kind === "music-video") || null;
}

async function searchItunesPreview(item, storefronts) {
  const artist = item?.artistName || "";
  const title = item?.trackName || "";
  if (!artist || !title) return null;

  const wantedArtist = normalizeText(artist);
  const wantedTitle = normalizeText(title);
  const term = encodeURIComponent(`${artist} ${title}`);

  for (const candidateStorefront of storefronts) {
    try {
      const country = candidateStorefront.toUpperCase();
      const res = await fetch(
        `https://itunes.apple.com/search?term=${term}&country=${encodeURIComponent(country)}&entity=musicVideo&limit=25`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const candidates = (json.results || []).filter(
        (r) => r.kind === "music-video" && r.previewUrl
      );

      const exact = candidates.find(
        (r) =>
          normalizeText(r.artistName) === wantedArtist &&
          normalizeText(r.trackName) === wantedTitle
      );
      if (exact?.previewUrl) {
        return { url: exact.previewUrl, storefront: candidateStorefront };
      }

      const titleMatch = candidates.find(
        (r) => normalizeText(r.trackName) === wantedTitle
      );
      if (titleMatch?.previewUrl) {
        return { url: titleMatch.previewUrl, storefront: candidateStorefront };
      }
    } catch {
      // Try the next storefront.
    }
  }

  return null;
}

async function itunesLookup(id, storefront) {
  const storefronts = storefrontFallbacks(storefront);
  let item = null;
  let itemStorefront = storefront;
  let preview = null;

  for (const candidateStorefront of storefronts) {
    const candidate = await fetchItunesItem(id, candidateStorefront);
    if (!candidate) continue;

    if (!item) {
      item = candidate;
      itemStorefront = candidateStorefront;
    }

    if (candidate.previewUrl) {
      preview = { url: candidate.previewUrl, storefront: candidateStorefront };
      if (candidateStorefront === storefront) {
        item = candidate;
        itemStorefront = candidateStorefront;
      }
      break;
    }
  }

  if (!item) throw new Error("No music video was found for that Apple Music ID.");

  if (!preview) {
    preview = await searchItunesPreview(item, storefronts);
  }

  const resizeArtwork = (url, size) => {
    if (!url) return null;
    return url.replace(/\/\d+x\d+bb\.(jpg|jpeg|png)(\?.*)?$/i, `/${size}x${size}bb.jpg$2`);
  };

  const artwork = resizeArtwork(item.artworkUrl100, 1200);
  const original = resizeArtwork(item.artworkUrl100, 3000);

  return {
    id: String(item.trackId || id),
    storefront: itemStorefront || storefront,
    source: "iTunes Lookup API",
    title: item.trackName || "Unknown title",
    artist: item.artistName || "Unknown artist",
    durationMs: item.trackTimeMillis ?? null,
    contentRating: item.trackExplicitness || null,
    has4K: null,
    hasHDR: null,
    isrc: null,
    releaseDate: item.releaseDate || null,
    genreNames: item.primaryGenreName ? [item.primaryGenreName] : [],
    appleMusicUrl: item.trackViewUrl || null,
    artwork: { displayUrl: artwork, originalUrl: original, bgColor: null },
    preview: {
      url: preview?.url || item.previewUrl || null,
      hlsUrl: null,
      storefront: preview?.storefront || itemStorefront || storefront
    }
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, storefront } = parseAppleMusicUrl(body?.url || "");
    let token = null;
    try {
      token = getAppleMusicDeveloperToken();
    } catch {
      token = null;
    }

    if (token) {
      const rich = await appleMusicLookup(id, storefront, token);
      if (rich) return NextResponse.json(rich);
    }

    const fallback = await itunesLookup(id, storefront);
    return NextResponse.json(fallback);
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unable to resolve the URL." }, { status: 400 });
  }
}

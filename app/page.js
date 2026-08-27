"use client";

import { useMemo, useState } from "react";

function formatDuration(ms) {
  if (!ms && ms !== 0) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const safeName = useMemo(() => {
    if (!data) return "apple-music-video";
    return `${data.artist || "artist"} - ${data.title || "video"}`
      .replace(/[\\/:*?\"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }, [data]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setData(null);
    setLoading(true);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not resolve that Apple Music URL.");
      setData(json);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">APPLE MUSIC TOOLS</div>
        <h1>Asset Extractor</h1>
        <p className="lede">
          Paste an Apple Music music-video link to inspect metadata, download artwork,
          and save Apple-provided public preview media.
        </p>

        <form onSubmit={submit} className="searchCard">
          <label htmlFor="url">Apple Music URL</label>
          <div className="inputRow">
            <input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://music.apple.com/ca/music-video/..."
              autoComplete="off"
              required
            />
            <button disabled={loading}>{loading ? "Resolving…" : "Extract"}</button>
          </div>
          <div className="hint">Music-video links only. Full subscription streams are not decrypted or bypassed.</div>
        </form>

        {error && <div className="error">{error}</div>}
      </section>

      {data && (
        <section className="result">
          <div className="artWrap">
            {data.artwork?.displayUrl ? (
              <img src={data.artwork.displayUrl} alt={`${data.title} artwork`} />
            ) : (
              <div className="artPlaceholder">No artwork</div>
            )}
          </div>

          <div className="details">
            <div className="sourceBadge">{data.source}</div>
            <h2>{data.title}</h2>
            <div className="artist">{data.artist}</div>

            <div className="stats">
              <div><span>Duration</span><strong>{formatDuration(data.durationMs)}</strong></div>
              <div><span>Storefront</span><strong>{data.storefront?.toUpperCase() || "—"}</strong></div>
              <div><span>4K</span><strong>{data.has4K == null ? "—" : data.has4K ? "Yes" : "No"}</strong></div>
              <div><span>HDR</span><strong>{data.hasHDR == null ? "—" : data.hasHDR ? "Yes" : "No"}</strong></div>
              <div><span>Explicit</span><strong>{data.contentRating || "—"}</strong></div>
              <div><span>ID</span><strong className="mono">{data.id}</strong></div>
            </div>

            <div className="actions">
              {data.preview?.url && (
                <a className="primary" href={`/api/media?url=${encodeURIComponent(data.preview.url)}&name=${encodeURIComponent(safeName + " - preview")}`}>
                  Download Preview
                </a>
              )}
              {data.artwork?.originalUrl && (
                <a href={`/api/artwork?url=${encodeURIComponent(data.artwork.originalUrl)}&name=${encodeURIComponent(safeName)}&format=jpg`}>
                  Artwork JPG
                </a>
              )}
              {data.artwork?.originalUrl && (
                <a href={`/api/artwork?url=${encodeURIComponent(data.artwork.originalUrl)}&name=${encodeURIComponent(safeName)}&format=png`}>
                  Artwork PNG
                </a>
              )}
              <button className="secondary" onClick={() => downloadJson(data, `${safeName}.json`)}>
                Metadata JSON
              </button>
            </div>

            {data.preview?.hlsUrl && (
              <details>
                <summary>Preview stream details</summary>
                <div className="streamRow"><span>HLS</span><code>{data.preview.hlsUrl}</code></div>
              </details>
            )}

            <div className="notice">
              This tool only exposes metadata, artwork, and preview assets Apple makes available without DRM circumvention.
            </div>
          </div>
        </section>
      )}

      <footer>
        Unofficial utility. Not affiliated with Apple. Apple Music is a trademark of Apple Inc.
      </footer>
    </main>
  );
}

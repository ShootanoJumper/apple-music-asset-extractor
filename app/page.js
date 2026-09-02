"use client";

import { useMemo, useState } from "react";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com"
]);

function detectSource(raw) {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.hostname === "music.apple.com") return "apple";
    if (YOUTUBE_HOSTS.has(parsed.hostname)) return "youtube";
  } catch {}
  return null;
}

function formatDurationMs(ms) {
  if (!ms && ms !== 0) return "—";
  return formatDurationSeconds(Math.round(ms / 1000));
}

function formatDurationSeconds(total) {
  if (!Number.isFinite(Number(total))) return "—";
  const seconds = Math.max(0, Math.round(Number(total)));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function shortCodec(codec) {
  if (!codec) return "unknown";
  const value = codec.toLowerCase();
  if (value.includes("av01") || value.includes("av1")) return "AV1";
  if (value.includes("vp09") || value.includes("vp9")) return "VP9";
  if (value.includes("avc1") || value.includes("h264")) return "H.264";
  if (value.includes("hev1") || value.includes("hvc1") || value.includes("hevc")) return "HEVC";
  return codec.split(".")[0].toUpperCase();
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState(null);
  const [data, setData] = useState(null);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [downloadMode, setDownloadMode] = useState("best");
  const [selectedFormat, setSelectedFormat] = useState(null);

  const appleSafeName = useMemo(() => {
    if (!data || source !== "apple") return "apple-music-video";
    return `${data.artist || "artist"} - ${data.title || "video"}`
      .replace(/[\\/:*?\"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }, [data, source]);

  async function submit(e) {
    e.preventDefault();
    const detected = detectSource(url);
    setError("");
    setData(null);
    setSource(detected);
    setPermissionConfirmed(false);
    setDownloadMode("best");
    setSelectedFormat(null);

    if (!detected) {
      setError("Paste an Apple Music music-video URL or a YouTube URL.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = detected === "apple" ? "/api/resolve" : "/api/youtube/analyze";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.detail || "Could not analyze that URL.");
      setData(json);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function startYouTubeDownload(mode, formatId = "") {
    if (!permissionConfirmed) {
      setError("Confirm that you own this video or have permission to download it first.");
      return;
    }
    setError("");
    const params = new URLSearchParams({
      url,
      mode,
      container: mode === "mp4" ? "mp4" : "auto",
      confirm: "1"
    });
    if (formatId) params.set("format_id", formatId);
    window.location.href = `/api/youtube/download?${params.toString()}`;
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">MEDIA TOOLS</div>
        <h1>Media Extractor</h1>
        <p className="lede">
          Paste an Apple Music music-video link or a YouTube link. Apple Music exposes public preview/artwork assets;
          YouTube analysis shows available formats for videos you own or have permission to download.
        </p>

        <form onSubmit={submit} className="searchCard">
          <label htmlFor="url">Media URL</label>
          <div className="inputRow">
            <input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://music.apple.com/... or https://youtube.com/watch?v=..."
              autoComplete="off"
              required
            />
            <button disabled={loading}>{loading ? "Analyzing…" : "Analyze"}</button>
          </div>
          <div className="hint">
            Apple Music downloads are limited to public assets. YouTube downloads are for content you own or have permission to save.
          </div>
        </form>

        {error && <div className="error">{error}</div>}
      </section>

      {data && source === "apple" && (
        <section className="result">
          <div className="artWrap">
            {data.artwork?.displayUrl ? (
              <img src={data.artwork.displayUrl} alt={`${data.title} artwork`} />
            ) : (
              <div className="artPlaceholder">No artwork</div>
            )}
          </div>

          <div className="details">
            <div className="sourceBadge">Apple Music</div>
            <h2>{data.title}</h2>
            <div className="artist">{data.artist}</div>

            <div className="stats">
              <div><span>Duration</span><strong>{formatDurationMs(data.durationMs)}</strong></div>
              <div><span>Storefront</span><strong>{data.storefront?.toUpperCase() || "—"}</strong></div>
              <div><span>4K</span><strong>{data.has4K == null ? "—" : data.has4K ? "Yes" : "No"}</strong></div>
              <div><span>HDR</span><strong>{data.hasHDR == null ? "—" : data.hasHDR ? "Yes" : "No"}</strong></div>
              <div><span>Explicit</span><strong>{data.contentRating || "—"}</strong></div>
              <div><span>ID</span><strong className="mono">{data.id}</strong></div>
            </div>

            <div className="actions">
              {data.preview?.url ? (
                <a className="primary" href={`/api/media?url=${encodeURIComponent(data.preview.url)}&name=${encodeURIComponent(appleSafeName + " - preview")}`}>
                  Download Preview
                </a>
              ) : (
                <button className="secondary" disabled title="Apple did not return a public preview URL for this video.">
                  Preview unavailable
                </button>
              )}
              {data.artwork?.originalUrl && (
                <a href={`/api/artwork?url=${encodeURIComponent(data.artwork.originalUrl)}&name=${encodeURIComponent(appleSafeName)}&format=jpg`}>
                  Artwork JPG
                </a>
              )}
              {data.artwork?.originalUrl && (
                <a href={`/api/artwork?url=${encodeURIComponent(data.artwork.originalUrl)}&name=${encodeURIComponent(appleSafeName)}&format=png`}>
                  Artwork PNG
                </a>
              )}
              <button className="secondary" onClick={() => downloadJson(data, `${appleSafeName}.json`)}>
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
              Full Apple Music subscription videos remain inside Apple's protected playback system; this tool only downloads public assets.
            </div>
          </div>
        </section>
      )}

      {data && source === "youtube" && (
        <section className="youtubeSection">
          <div className="youtubeOverview">
            <div className="thumbnailWrap">
              {data.thumbnail ? <img src={data.thumbnail} alt="YouTube thumbnail" /> : <div className="artPlaceholder">No thumbnail</div>}
            </div>
            <div className="details">
              <div className="sourceBadge youtubeBadge">YouTube</div>
              <h2>{data.title}</h2>
              <div className="artist">{data.channel}</div>
              <div className="stats youtubeStats">
                <div><span>Duration</span><strong>{formatDurationSeconds(data.duration)}</strong></div>
                <div><span>Max quality</span><strong>{data.maxHeight ? `${data.maxHeight}p` : "—"}</strong></div>
                <div><span>Video formats</span><strong>{data.videoFormats?.length || 0}</strong></div>
                <div><span>Audio formats</span><strong>{data.audioFormats?.length || 0}</strong></div>
                <div><span>Age limit</span><strong>{data.ageLimit || 0}</strong></div>
                <div><span>ID</span><strong className="mono">{data.id}</strong></div>
              </div>
            </div>
          </div>

          <div className="downloadPanel">
            <div className="downloadPanelHeader">
              <div>
                <div className="eyebrow youtubeEyebrow">DOWNLOAD OPTIONS</div>
                <h3>Choose quality</h3>
                <p>High-resolution YouTube often uses separate video and audio streams. The worker merges them without re-encoding when possible.</p>
              </div>
            </div>

            <label className="permissionBox">
              <input
                type="checkbox"
                checked={permissionConfirmed}
                onChange={(e) => setPermissionConfirmed(e.target.checked)}
              />
              <span>I own this video or have permission to download it.</span>
            </label>

            <div className="presetGrid">
              <button
                className={downloadMode === "best" ? "preset active" : "preset"}
                onClick={() => { setDownloadMode("best"); setSelectedFormat(null); }}
              >
                <strong>Best Quality</strong>
                <span>Highest video + best audio</span>
              </button>
              <button
                className={downloadMode === "mp4" ? "preset active" : "preset"}
                onClick={() => { setDownloadMode("mp4"); setSelectedFormat(null); }}
              >
                <strong>H.264 Compatibility</strong>
                <span>H.264/AVC video + AAC audio in MP4</span>
              </button>
            </div>

            <div className="formatListHeader">
              <strong>Available video streams</strong>
              <span>Select an exact video stream; best audio is merged automatically.</span>
            </div>

            <div className="formatList">
              {(data.videoFormats || []).map((format) => {
                const selected = downloadMode === "format" && selectedFormat?.formatId === format.formatId;
                return (
                  <button
                    type="button"
                    key={format.formatId}
                    className={selected ? "formatRow selected" : "formatRow"}
                    onClick={() => { setDownloadMode("format"); setSelectedFormat(format); }}
                  >
                    <div className="qualityCell">
                      <strong>{format.height ? `${format.height}p` : format.formatNote || "Video"}</strong>
                      <span>{format.fps ? `${format.fps} FPS` : ""}</span>
                    </div>
                    <div><span className="cellLabel">Codec</span><strong>{shortCodec(format.vcodec || format.codec)}</strong></div>
                    <div><span className="cellLabel">Range</span><strong>{format.dynamicRange || "SDR"}</strong></div>
                    <div><span className="cellLabel">Container</span><strong>{format.ext?.toUpperCase() || "—"}</strong></div>
                    <div><span className="cellLabel">Size</span><strong>{formatBytes(format.filesize)}</strong></div>
                  </button>
                );
              })}
            </div>

            <div className="downloadFooter">
              <div className="selectionSummary">
                {downloadMode === "format" && selectedFormat
                  ? `${selectedFormat.height || "?"}p · ${shortCodec(selectedFormat.vcodec || selectedFormat.codec)} · ${selectedFormat.ext?.toUpperCase() || "AUTO"}`
                  : downloadMode === "mp4"
                    ? "H.264/AVC + AAC MP4"
                    : "Best available quality"}
              </div>
              <button
                className="downloadButton"
                disabled={!permissionConfirmed || (downloadMode === "format" && !selectedFormat)}
                onClick={() => startYouTubeDownload(downloadMode, selectedFormat?.formatId || "")}
              >
                Download
              </button>
            </div>

            <div className="notice">
              Availability and quality depend on what YouTube provides for that upload. This tool does not bypass DRM, paywalls, or account restrictions.
            </div>
          </div>
        </section>
      )}

      <footer>
        Unofficial utility. Not affiliated with Apple or YouTube.
      </footer>
    </main>
  );
}

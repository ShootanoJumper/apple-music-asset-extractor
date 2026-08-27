"use client";

import { useMemo, useRef, useState } from "react";

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

let musicKitLoaderPromise;

function loadMusicKit() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MusicKit is only available in the browser."));
  }

  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (musicKitLoaderPromise) return musicKitLoaderPromise;

  musicKitLoaderPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Apple Music playback took too long to initialize."));
    }, 15000);

    const ready = () => {
      window.clearTimeout(timeout);
      if (window.MusicKit) resolve(window.MusicKit);
      else reject(new Error("MusicKit loaded, but its browser API is unavailable."));
    };

    document.addEventListener("musickitloaded", ready, { once: true });

    const existing = document.querySelector('script[data-apple-musickit="v3"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    script.dataset.appleMusickit = "v3";
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not load MusicKit from Apple."));
    };
    document.head.appendChild(script);
  });

  return musicKitLoaderPromise;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [musicStatus, setMusicStatus] = useState("idle");
  const [musicMessage, setMusicMessage] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [playing, setPlaying] = useState(false);
  const musicRef = useRef(null);
  const videoRef = useRef(null);

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
    setPlaying(false);
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

  async function ensureMusicKit() {
    if (musicRef.current) return musicRef.current;

    setMusicStatus("loading");
    setMusicMessage("Connecting to Apple Music…");

    const tokenRes = await fetch("/api/musickit-token", { cache: "no-store" });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.developerToken) {
      throw new Error(
        tokenData.error || "This site does not have an Apple Music developer token configured."
      );
    }

    const MusicKit = await loadMusicKit();
    await MusicKit.configure({
      developerToken: tokenData.developerToken,
      app: {
        name: "Apple Music Asset Extractor",
        build: "0.2.0"
      }
    });

    const music = MusicKit.getInstance();
    music.previewOnly = false;
    musicRef.current = music;
    setAuthorized(Boolean(music.isAuthorized));
    setMusicStatus("ready");
    setMusicMessage(
      music.isAuthorized
        ? "Apple Music is connected."
        : "MusicKit is ready. Sign in to use your subscription."
    );
    return music;
  }

  async function signIn() {
    try {
      setMusicMessage("");
      const music = await ensureMusicKit();
      if (!music.isAuthorized) await music.authorize();
      const ok = Boolean(music.isAuthorized);
      setAuthorized(ok);
      setMusicStatus(ok ? "authorized" : "ready");
      setMusicMessage(
        ok
          ? "Signed in. Full playback will use your Apple Music subscription."
          : "Apple Music authorization was cancelled."
      );
    } catch (err) {
      setMusicStatus("error");
      setMusicMessage(err.message || "Could not authorize Apple Music.");
    }
  }

  async function signOut() {
    try {
      const music = musicRef.current;
      if (music) {
        await music.stop().catch(() => {});
        await music.unauthorize();
      }
      setAuthorized(false);
      setPlaying(false);
      setMusicStatus("ready");
      setMusicMessage("Signed out of Apple Music on this site.");
    } catch (err) {
      setMusicStatus("error");
      setMusicMessage(err.message || "Could not sign out of Apple Music.");
    }
  }

  async function playFullVideo() {
    if (!data?.id) return;

    try {
      setMusicStatus("loading");
      setMusicMessage("Preparing full subscriber playback…");
      const music = await ensureMusicKit();

      if (!music.isAuthorized) {
        await music.authorize();
      }
      if (!music.isAuthorized) throw new Error("Apple Music authorization is required for full playback.");

      setAuthorized(true);
      music.previewOnly = false;

      if (videoRef.current) {
        music.videoContainerElement = videoRef.current;
      }

      await music.setQueue({ musicVideo: String(data.id) });
      await music.play();

      setPlaying(true);
      setMusicStatus("authorized");
      setMusicMessage("Playing the full music video through MusicKit.");
    } catch (err) {
      setPlaying(false);
      setMusicStatus("error");
      setMusicMessage(
        err.message ||
          "Full playback failed. Confirm that your Apple Music subscription is active and that this video is available in your storefront."
      );
    }
  }

  async function stopPlayback() {
    try {
      if (musicRef.current) await musicRef.current.stop();
      setPlaying(false);
      setMusicMessage("Playback stopped.");
    } catch (err) {
      setMusicMessage(err.message || "Could not stop playback.");
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">APPLE MUSIC TOOLS</div>
        <h1>Asset Extractor</h1>
        <p className="lede">
          Paste an Apple Music music-video link to inspect metadata, download artwork,
          save Apple-provided public preview media, and play the full video with your subscription.
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
          <div className="hint">
            Full subscriber playback uses Apple Music directly in your browser. Downloads remain limited to Apple-provided public assets.
          </div>
        </form>

        {error && <div className="error">{error}</div>}
      </section>

      {data && (
        <>
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
                The extractor only downloads metadata, artwork, and preview assets Apple makes available without DRM circumvention.
              </div>
            </div>
          </section>

          <section className="subscriberSection">
            <div className="subscriberHeader">
              <div>
                <div className="eyebrow">APPLE MUSIC SUBSCRIBER</div>
                <h3>Full video playback</h3>
                <p>
                  Sign in through Apple, then stream this complete music video inside the site using your Apple Music subscription.
                </p>
              </div>

              <div className="subscriberActions">
                {!authorized ? (
                  <button onClick={signIn} disabled={musicStatus === "loading"}>
                    {musicStatus === "loading" ? "Connecting…" : "Sign in to Apple Music"}
                  </button>
                ) : (
                  <>
                    <span className="connectedBadge">Connected</span>
                    <button className="secondary" onClick={signOut}>Sign out</button>
                  </>
                )}
              </div>
            </div>

            {musicMessage && (
              <div className={`musicMessage ${musicStatus === "error" ? "musicError" : ""}`}>
                {musicMessage}
              </div>
            )}

            <div className="playerActions">
              <button className="playButton" onClick={playFullVideo} disabled={musicStatus === "loading"}>
                {playing ? "Playing Full Video" : "Play Full Video"}
              </button>
              {playing && <button className="secondary" onClick={stopPlayback}>Stop</button>}
            </div>

            <div className={`videoShell ${playing ? "active" : ""}`}>
              <video ref={videoRef} controls playsInline />
              {!playing && (
                <div className="videoPlaceholder">
                  <span>Full Apple Music video will appear here</span>
                </div>
              )}
            </div>

            <p className="subscriberFootnote">
              MusicKit handles subscriber authorization and playback. This player does not expose or decrypt the protected video stream.
            </p>
          </section>
        </>
      )}

      <footer>
        Unofficial utility. Not affiliated with Apple. Apple Music is a trademark of Apple Inc.
      </footer>
    </main>
  );
}

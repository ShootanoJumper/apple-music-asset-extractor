from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

app = FastAPI(title="Media Extractor Worker", version="0.1.0")

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
SAFE_FORMAT_ID = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
WORKER_SECRET = os.environ.get("MEDIA_WORKER_SECRET", "").strip()


class AnalyzeRequest(BaseModel):
    url: str


def clean_youtube_url(raw: str) -> str:
    try:
        parsed = urlparse(raw.strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Enter a valid YouTube URL.") from exc
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in YOUTUBE_HOSTS:
        raise HTTPException(status_code=400, detail="Only youtube.com and youtu.be URLs are supported.")
    return raw.strip()


def require_worker_secret(value: str | None) -> None:
    if not WORKER_SECRET:
        return
    if not value or not hmac.compare_digest(value, WORKER_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized worker request.")


def run_ytdlp(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, "-m", "yt_dlp", *args]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="YouTube operation timed out.") from exc

    if result.returncode != 0:
        message = (result.stderr or result.stdout or "yt-dlp failed").strip().splitlines()
        detail = message[-1] if message else "yt-dlp failed"
        raise HTTPException(status_code=422, detail=detail[:500])
    return result


def codec_name(value: str | None) -> str | None:
    if not value or value == "none":
        return None
    return value.split(".")[0]


def approx_size(fmt: dict) -> int | None:
    value = fmt.get("filesize") or fmt.get("filesize_approx")
    try:
        return int(value) if value else None
    except (TypeError, ValueError):
        return None


def summarize_video_format(fmt: dict) -> dict:
    return {
        "formatId": str(fmt.get("format_id", "")),
        "ext": fmt.get("ext"),
        "width": fmt.get("width"),
        "height": fmt.get("height"),
        "fps": fmt.get("fps"),
        "vcodec": fmt.get("vcodec"),
        "codec": codec_name(fmt.get("vcodec")),
        "acodec": fmt.get("acodec") if fmt.get("acodec") != "none" else None,
        "dynamicRange": fmt.get("dynamic_range") or "SDR",
        "filesize": approx_size(fmt),
        "tbr": fmt.get("tbr"),
        "formatNote": fmt.get("format_note"),
        "protocol": fmt.get("protocol"),
    }


def summarize_audio_format(fmt: dict) -> dict:
    return {
        "formatId": str(fmt.get("format_id", "")),
        "ext": fmt.get("ext"),
        "acodec": fmt.get("acodec"),
        "codec": codec_name(fmt.get("acodec")),
        "abr": fmt.get("abr"),
        "asr": fmt.get("asr"),
        "filesize": approx_size(fmt),
        "language": fmt.get("language"),
    }


def unique_video_formats(formats: list[dict]) -> list[dict]:
    items = []
    seen = set()
    for fmt in formats:
        if fmt.get("vcodec") in {None, "none"} or not fmt.get("height"):
            continue
        key = (
            fmt.get("height"),
            fmt.get("fps"),
            codec_name(fmt.get("vcodec")),
            fmt.get("dynamic_range") or "SDR",
            fmt.get("ext"),
        )
        if key in seen:
            continue
        seen.add(key)
        items.append(summarize_video_format(fmt))

    items.sort(
        key=lambda x: (
            x.get("height") or 0,
            x.get("fps") or 0,
            x.get("filesize") or 0,
        ),
        reverse=True,
    )
    return items[:40]


def audio_formats(formats: list[dict]) -> list[dict]:
    items = [
        summarize_audio_format(fmt)
        for fmt in formats
        if fmt.get("vcodec") == "none" and fmt.get("acodec") not in {None, "none"}
    ]
    items.sort(key=lambda x: (x.get("abr") or 0, x.get("filesize") or 0), reverse=True)
    return items[:12]


def verify_signature(
    url: str,
    mode: str,
    format_id: str,
    container: str,
    expires: int,
    signature: str,
) -> None:
    if not WORKER_SECRET:
        return
    now = int(time.time())
    if expires < now or expires > now + 10 * 60:
        raise HTTPException(status_code=401, detail="Download request expired.")
    payload = "\n".join([url, mode, format_id, container, str(expires)]).encode()
    expected = hmac.new(WORKER_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid download signature.")


def safe_filename(path: Path) -> str:
    name = path.name.replace("\r", " ").replace("\n", " ").strip()
    return name[:180] or f"youtube-video{path.suffix}"


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "ytDlp": True,
        "signedDownloads": bool(WORKER_SECRET),
    }


@app.post("/analyze")
def analyze(body: AnalyzeRequest, x_worker_secret: str | None = Header(default=None)) -> dict:
    require_worker_secret(x_worker_secret)
    url = clean_youtube_url(body.url)
    result = run_ytdlp(
        [
            "--dump-single-json",
            "--skip-download",
            "--no-playlist",
            "--no-warnings",
            url,
        ],
        timeout=60,
    )
    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Could not parse YouTube metadata.") from exc

    if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
        raise HTTPException(status_code=400, detail="Live and upcoming streams are not supported.")

    formats = info.get("formats") or []
    videos = unique_video_formats(formats)
    audios = audio_formats(formats)
    max_height = max((item.get("height") or 0 for item in videos), default=0)

    return {
        "source": "YouTube",
        "id": info.get("id"),
        "title": info.get("title") or "Unknown title",
        "channel": info.get("channel") or info.get("uploader") or "Unknown channel",
        "channelUrl": info.get("channel_url") or info.get("uploader_url"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "webpageUrl": info.get("webpage_url") or url,
        "description": info.get("description"),
        "uploadDate": info.get("upload_date"),
        "viewCount": info.get("view_count"),
        "ageLimit": info.get("age_limit"),
        "maxHeight": max_height or None,
        "videoFormats": videos,
        "audioFormats": audios,
    }


@app.get("/download")
def download(
    url: str = Query(...),
    mode: str = Query(default="best"),
    format_id: str = Query(default=""),
    container: str = Query(default="auto"),
    confirm: int = Query(default=0),
    expires: int = Query(default=0),
    sig: str = Query(default=""),
):
    if confirm != 1:
        raise HTTPException(status_code=400, detail="Permission confirmation is required.")

    url = clean_youtube_url(url)
    if mode not in {"best", "mp4", "format"}:
        raise HTTPException(status_code=400, detail="Invalid download mode.")
    if container not in {"auto", "mp4", "mkv"}:
        raise HTTPException(status_code=400, detail="Invalid output container.")
    if mode == "format" and not SAFE_FORMAT_ID.fullmatch(format_id):
        raise HTTPException(status_code=400, detail="Invalid format ID.")

    verify_signature(url, mode, format_id, container, expires, sig)

    if mode == "best":
        selector = "bv*+ba/b"
    elif mode == "mp4":
        selector = "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"
    else:
        selector = f"{format_id}+ba/{format_id}"

    merge_format = {
        "auto": "mkv/mp4",
        "mp4": "mp4/mkv",
        "mkv": "mkv",
    }[container]

    temp_dir = Path(tempfile.mkdtemp(prefix="media-extractor-"))
    output_template = str(temp_dir / "%(title).140B [%(id)s].%(ext)s")

    try:
        run_ytdlp(
            [
                "--no-playlist",
                "--no-warnings",
                "--restrict-filenames",
                "--format",
                selector,
                "--merge-output-format",
                merge_format,
                "--output",
                output_template,
                url,
            ],
            timeout=30 * 60,
        )

        candidates = [
            p
            for p in temp_dir.iterdir()
            if p.is_file() and not p.name.endswith((".part", ".ytdl", ".json"))
        ]
        if not candidates:
            raise HTTPException(status_code=500, detail="The download finished but no output file was produced.")

        output = max(candidates, key=lambda p: p.stat().st_size)
        media_type = mimetypes.guess_type(output.name)[0] or "application/octet-stream"
        return FileResponse(
            output,
            media_type=media_type,
            filename=safe_filename(output),
            background=BackgroundTask(shutil.rmtree, temp_dir, ignore_errors=True),
        )
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

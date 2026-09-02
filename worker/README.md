# YouTube media worker

This worker powers the YouTube side of the Media Extractor for videos the user owns or has permission to download.

## Endpoints

- `GET /health` — health check
- `POST /analyze` — returns metadata and available video/audio formats without exposing direct media URLs
- `GET /download` — downloads/merges the selected permitted video using yt-dlp + FFmpeg

## Railway deployment

Deploy the `worker/` directory as its own Railway service.

If the repository root is connected to Railway, set the service **Root Directory** to `/worker`. Railway will detect `worker/Dockerfile` once that directory is the service root.

Add this Railway variable:

```text
MEDIA_WORKER_SECRET=<same random secret used in Vercel>
```

Generate a public Railway domain for the service, then put that URL into Vercel as `MEDIA_WORKER_URL`.

The worker uses ephemeral storage while downloads are being assembled. Very large videos can exceed the storage available on small hosting plans.

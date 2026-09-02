# Media Extractor

A Next.js/Vercel frontend for Apple Music public assets plus a separate yt-dlp/FFmpeg media worker for YouTube videos the user owns or has permission to download.

## Apple Music

- Resolves `music.apple.com` music-video URLs
- Downloads Apple-provided public preview video when available
- Downloads artwork as JPG/PNG
- Exports metadata JSON
- Does not decrypt or bypass DRM-protected Apple Music subscription streams

Apple developer credentials are optional. Without them, the app uses Apple's public iTunes lookup/search services and storefront fallbacks.

## YouTube

- Detects YouTube URLs automatically
- Analyzes available resolutions, codecs, FPS, HDR/SDR, and approximate sizes
- Supports best-quality, MP4-compatible, or an explicitly selected video format
- Downloads the selected permitted video and merges the best audio track with FFmpeg
- Does not expose yt-dlp's direct media URLs to the browser
- Requires the user to confirm they own the video or have permission to download it

## Architecture

```text
Browser
  |
  v
Next.js on Vercel
  |-- Apple APIs (public metadata/assets)
  |
  `-- signed/authorized calls --> Railway worker
                               |-- yt-dlp
                               `-- FFmpeg
```

## Local frontend

```bash
npm install
npm run dev
```

## Deploy the YouTube worker to Railway

1. Push the `worker/` directory with the rest of this repository.
2. In Railway, create a new service from this GitHub repository.
3. Set the Railway service Root Directory to `/worker`.
4. Add a `MEDIA_WORKER_SECRET` variable.
5. Generate a public Railway domain.
6. In Vercel Project Settings -> Environment Variables, add:

```text
MEDIA_WORKER_URL=https://your-worker.up.railway.app
MEDIA_WORKER_SECRET=<the same secret from Railway>
```

7. Redeploy the Vercel project.

Generate a suitable secret in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

## Notes

High-resolution YouTube formats commonly have separate video and audio streams. The worker uses yt-dlp to select them and FFmpeg to merge/remux them. Large 4K files need enough temporary disk space on the worker host.

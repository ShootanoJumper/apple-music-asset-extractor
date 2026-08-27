# Apple Music Asset Extractor

A Vercel-ready Next.js utility for inspecting Apple Music music-video metadata and downloading Apple-provided public assets.

## What it does

- Accepts `music.apple.com` music-video URLs
- Extracts the Apple item ID and storefront
- Resolves music-video metadata
- Downloads Apple-provided public preview video
- Downloads artwork as JPG or converts it to PNG
- Exports metadata to JSON
- Optionally uses an Apple Music developer token for richer catalog metadata (4K/HDR flags, ISRC, HLS preview metadata)

## What it intentionally does not do

It does not decrypt, defeat, or bypass DRM on full Apple Music subscription streams.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Optional Apple Music API token

Copy `.env.example` to `.env.local` and set:

```bash
APPLE_MUSIC_DEVELOPER_TOKEN=your_token_here
```

Without a token, the app falls back to Apple's public iTunes Lookup API.

## Deploy to Vercel

Import the GitHub repository into Vercel. Next.js is auto-detected. If you want richer Apple Music API metadata, add `APPLE_MUSIC_DEVELOPER_TOKEN` in Vercel Project Settings → Environment Variables.

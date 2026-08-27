# Apple Music Asset Extractor

A Vercel-ready Next.js utility for inspecting Apple Music music-video metadata, downloading Apple-provided public assets, and playing full music videos through an authorized Apple Music subscription using MusicKit on the Web.

## What it does

- Accepts `music.apple.com` music-video URLs
- Extracts the Apple item ID and storefront
- Resolves music-video metadata
- Downloads Apple-provided public preview video
- Downloads artwork as JPG or converts it to PNG
- Exports metadata to JSON
- Uses MusicKit on the Web for full subscriber playback after Apple Music authorization
- Uses the Apple Music API for richer metadata such as 4K/HDR flags, ISRC, and HLS preview metadata when developer credentials are configured

## What it intentionally does not do

It does not decrypt, defeat, or bypass DRM on full Apple Music subscription streams. Full videos are streamed by Apple's MusicKit player inside the browser.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Apple Music / MusicKit setup

MusicKit subscriber playback requires Apple Music developer credentials. The recommended configuration lets the Vercel server generate a short-lived developer JWT on demand instead of storing a long-lived token.

1. Use an Apple Developer Program team that can create Media IDs and Media Services keys.
2. In Certificates, Identifiers & Profiles, create a Media ID with MusicKit enabled.
3. Create a Media Services private key and associate it with the Media ID.
4. In Vercel Project Settings → Environment Variables, add:

```bash
APPLE_MUSIC_TEAM_ID=YOUR_TEAM_ID
APPLE_MUSIC_KEY_ID=YOUR_KEY_ID
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

The app generates one-hour ES256 developer tokens server-side. Browser tokens are generated with an Apple `origin` claim tied to the deployed site's origin. The `.p8` private key stays on the server and is never returned to the browser.

Never commit the `.p8` private key to GitHub.

### Pre-generated token alternative

If you prefer, you can instead set:

```bash
APPLE_MUSIC_DEVELOPER_TOKEN=your_signed_jwt_here
```

That value takes precedence over automatic signing.

Without developer credentials, metadata and public preview extraction still fall back to Apple's public iTunes Lookup API, but subscriber sign-in/full playback is disabled.

## Subscriber authorization

The browser loads Apple's MusicKit v3 library. When the user clicks **Sign in to Apple Music**, MusicKit handles the Apple account authorization and Music User Token. After authorization, the site queues the selected catalog music video and plays it in the page through MusicKit.

## Deploy to Vercel

Link/import the GitHub repository in Vercel. Next.js is auto-detected. Add the Apple Music environment variables above for Production (and Preview if desired), then redeploy.

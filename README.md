# YouTube Downloader

**Personal project** - AI slop to quickly download YouTube videos on my own.

Fed up with ad-infested YouTube converters, so I threw together this yt-dlp wrapper to grab videos and audio without the BS.

## Features

- 🎥 Downloads videos (360p-1080p) with proper audio merging
- 🎵 Audio-only extraction to MP3
- 📋 Clipboard paste support
- ⌨️ Global shortcuts (Ctrl+V to paste)
- 🗑️ Auto-cleanup after 24 hours
- 🎯 No ads, no tracking, just downloads

## Quick Setup

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Docker](https://docker.com/) (for easy deployment)

### Clone & Run

```bash
# Clone the repo
git clone <your-repo-url>
cd yt-xdownloader

# Install frontend dependencies
bun install

# Install backend dependencies
cd backend
bun install
cd ..

# Start development servers
bun run dev          # Frontend (port 5173)
cd backend && bun run start  # Backend (port 3001)
```

### Docker Deployment (Recommended)

```bash
# Build and run with Docker Compose
docker-compose up --build

# Access at http://localhost:5173
```

## Usage

1. Paste YouTube URL
2. Pick resolution or audio-only
3. Download starts automatically
4. Files delete after 24h

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + SHADCN UI
- **Backend**: Bun + Hono + yt-dlp + FFmpeg
- **Deployment**: Docker + Nginx

## Legal Notice

Personal use only. Don't be a dick about copyright.

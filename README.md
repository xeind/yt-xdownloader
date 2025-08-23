# Home YouTube Video Extractor & Downloader

**Personal use YouTube downloader** - Fast, ad-free video and audio extraction for home use.

Tired of ad-infested online YouTube to MP4 converters? This is a self-hosted solution using **yt-dlp** and **FFmpeg** to quickly download YouTube videos in decent quality.

## Features
- 🎥 Download YouTube videos in various formats
- 🎵 Extract audio from videos  
- 🚀 Fast downloads with yt-dlp
- 🏠 Self-hosted - no ads, no tracking
- 🗑️ Auto-cleanup (deletes files after 24 hours)
- 📱 Modern React UI with progress tracking

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

1. Open the app in your browser
2. Paste a YouTube URL
3. Choose format (video/audio)
4. Click download
5. Files auto-delete after 24 hours

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + SHADCN UI
- **Backend**: Bun + Hono + yt-dlp + FFmpeg
- **Deployment**: Docker + Nginx

## Legal Notice

This tool is for **personal use only**. Respect YouTube's Terms of Service and copyright laws. Only download content you have permission to download.
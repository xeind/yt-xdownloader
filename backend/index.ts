import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { spawn } from 'child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const app = new Hono()

// Environment configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const CLEANUP_INTERVAL_HOURS = 1 // Check every hour
const FILE_MAX_AGE_HOURS = 24 // Delete files older than 24 hours

// CORS configuration for production
app.use(
  '/api/*',
  cors({
    origin:
      NODE_ENV === 'production'
        ? ['https://your-frontend-domain.vercel.app'] // Replace with your actual frontend URL
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
)

// Health check endpoint
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

// Manual cleanup endpoint
app.post('/api/cleanup', (c) => {
  cleanupOldFiles()
  return c.json({ message: 'Cleanup triggered successfully' })
})

// Get cleanup status endpoint
app.get('/api/cleanup/status', (c) => {
  const stats = {
    downloadsDir,
    cleanupInterval: `${CLEANUP_INTERVAL_HOURS} hours`,
    fileMaxAge: `${FILE_MAX_AGE_HOURS} hours`,
    nextCleanup: 'Every hour',
  }
  return c.json(stats)
})

// Store active downloads
const activeDownloads = new Map<
  string,
  {
    process?: any
    status: 'downloading' | 'completed' | 'error' | 'converting'
    progress: number
    fileName?: string
    error?: string
    eta?: string
  }
>()

// Ensure downloads directory exists
const downloadsDir = join(process.cwd(), 'downloads')
if (!existsSync(downloadsDir)) {
  mkdirSync(downloadsDir, { recursive: true })
}

// Cleanup function to delete old files
function cleanupOldFiles() {
  try {
    if (!existsSync(downloadsDir)) return

    const now = Date.now()
    const maxAge = FILE_MAX_AGE_HOURS * 60 * 60 * 1000 // Convert hours to milliseconds

    const items = readdirSync(downloadsDir)
    let deletedCount = 0

    for (const item of items) {
      const itemPath = join(downloadsDir, item)
      const stats = statSync(itemPath)

      // Check if file/folder is older than max age
      if (now - stats.mtime.getTime() > maxAge) {
        rmSync(itemPath, { recursive: true, force: true })
        deletedCount++
        console.log(`🗑️ Deleted old download: ${item}`)
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Cleanup completed: ${deletedCount} old downloads removed`)
    }
  } catch (error) {
    console.error('❌ Cleanup error:', error)
  }
}

// Run cleanup on startup
cleanupOldFiles()

// Schedule cleanup to run every hour
setInterval(cleanupOldFiles, CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000)
console.log(
  `🕐 Auto-cleanup scheduled: checking every ${CLEANUP_INTERVAL_HOURS}h, deleting files older than ${FILE_MAX_AGE_HOURS}h`
)

app.post('/api/video/info', async (c) => {
  const { url } = await c.req.json()
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', ['--dump-json', url])
    let output = ''

    ytdlp.stdout.on('data', (data) => {
      output += data.toString()
    })

    ytdlp.on('close', (code: number | null) => {
      if (code === 0) {
        try {
          const videoInfo = JSON.parse(output)
          console.log('Total formats found:', videoInfo.formats.length) // Debug log

          // Separate video and audio formats with better filtering
          const videoFormats = videoInfo.formats
            .filter((f: any) => {
              // Must have video codec and height, exclude storyboards and other non-video formats
              return (
                f.vcodec &&
                f.vcodec !== 'none' &&
                f.height &&
                f.height > 100 && // Exclude tiny thumbnails
                !f.format_note?.includes('storyboard') &&
                f.ext !== 'mhtml' &&
                f.protocol !== 'mhtml'
              )
            })
            .map((f: any) => ({
              format_id: f.format_id,
              resolution: `${f.height}p`,
              filesize: f.filesize || f.filesize_approx || 0,
              ext: f.ext || 'unknown',
              vcodec: f.vcodec,
              acodec: f.acodec,
              fps: f.fps,
              tbr: f.tbr,
              format_note: f.format_note,
            }))
            .sort(
              (a: any, b: any) =>
                parseInt(b.resolution) - parseInt(a.resolution)
            )
            .slice(0, 8) // Top 8 video formats

          console.log('Filtered video formats:', videoFormats.length) // Debug log
          console.log('First video format:', videoFormats[0]) // Debug log

          // If no video formats found with strict filtering, try looser filtering
          if (videoFormats.length === 0) {
            console.log('No video formats found, trying looser filtering...')
            const fallbackVideoFormats = videoInfo.formats
              .filter(
                (f: any) =>
                  f.vcodec && f.vcodec !== 'none' && f.width && f.height
              )
              .map((f: any) => ({
                format_id: f.format_id,
                resolution: f.height
                  ? `${f.height}p`
                  : `${f.width}x${f.height}`,
                filesize: f.filesize || f.filesize_approx || 0,
                ext: f.ext || 'unknown',
                vcodec: f.vcodec,
                acodec: f.acodec,
                fps: f.fps,
                tbr: f.tbr,
                format_note: f.format_note,
              }))
              .sort(
                (a: any, b: any) =>
                  parseInt(b.resolution) - parseInt(a.resolution)
              )
              .slice(0, 8)

            console.log(
              'Fallback video formats found:',
              fallbackVideoFormats.length
            )
            videoFormats.push(...fallbackVideoFormats)
          }

          const audioFormats = videoInfo.formats
            .filter((f: any) => {
              // Must have audio codec, no video codec, exclude storyboards
              return (
                f.acodec &&
                f.acodec !== 'none' &&
                (!f.vcodec || f.vcodec === 'none') &&
                !f.format_note?.includes('storyboard') &&
                f.ext !== 'mhtml'
              )
            })
            .map((f: any) => ({
              format_id: f.format_id,
              resolution: 'audio',
              filesize: f.filesize || f.filesize_approx || 0,
              ext: f.ext || 'unknown',
              vcodec: f.vcodec,
              acodec: f.acodec,
              abr: f.abr,
              format_note: f.format_note,
            }))
            .slice(0, 3) // Top 3 audio formats

          resolve(
            c.json({
              title: videoInfo.title,
              duration: videoInfo.duration,
              formats: [...videoFormats, ...audioFormats],
            })
          )
        } catch (error) {
          resolve(c.json({ error: 'Failed to parse video info' }, 500))
        }
      } else {
        resolve(c.json({ error: 'Invalid URL' }, 400))
      }
    })
  })
})

app.post('/api/video/download', async (c) => {
  const { url, format_id } = await c.req.json()
  const downloadId = randomUUID()

  // Create download directory
  const downloadDir = join(downloadsDir, downloadId)
  mkdirSync(downloadDir, { recursive: true })

  // Initialize download tracking
  activeDownloads.set(downloadId, {
    status: 'downloading',
    progress: 0,
  })

  // Build yt-dlp command - let yt-dlp handle format selection and merging
  const ytdlpArgs = [
    '--newline',
    '--progress-template',
    '%(progress)j',
    '-f',
    `${format_id}+bestaudio/best`, // Merge video with best audio
    '--merge-output-format',
    'mp4', // Force MP4 output
    '-o',
    join(downloadDir, '%(title)s.%(ext)s'),
    url,
  ]

  console.log('yt-dlp command:', ytdlpArgs.join(' ')) // Debug log

  const ytdlp = spawn('yt-dlp', ytdlpArgs)

  // Update download tracking with process
  const download = activeDownloads.get(downloadId)!
  download.process = ytdlp
  download.process = ytdlp

  // Parse progress output
  ytdlp.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (line.trim() && line.startsWith('{')) {
        try {
          const progress = JSON.parse(line)
          if (progress.status === 'downloading') {
            const percent =
              progress.downloaded_bytes && progress.total_bytes
                ? (progress.downloaded_bytes / progress.total_bytes) * 100
                : 0
            download.progress = Math.round(percent)
            download.eta = progress.eta
          } else if (progress.status === 'finished') {
            download.status = 'completed' // Changed from 'converting'
            download.fileName = progress.filename
          }
        } catch (e) {
          // Ignore invalid JSON lines
        }
      }
    }
  })

  // Log errors for debugging
  ytdlp.stderr.on('data', (data) => {
    console.error('yt-dlp stderr:', data.toString())
  })

  ytdlp.on('close', (code) => {
    console.log('yt-dlp process closed with code:', code)
    if (code === 0) {
      download.status = 'completed'
      download.progress = 100
    } else {
      download.status = 'error'
      download.error = 'Download failed'
    }
  })

  ytdlp.on('close', (code) => {
    if (code === 0) {
      download.status = 'completed'
      download.progress = 100
    } else {
      download.status = 'error'
      download.error = 'Download failed'
    }
  })

  return c.json({ downloadId, status: 'started' })
})

app.get('/api/video/progress/:downloadId', (c) => {
  const downloadId = c.req.param('downloadId')
  const download = activeDownloads.get(downloadId)

  if (!download) {
    return c.json({ error: 'Download not found' }, 404)
  }

  return c.json({
    status: download.status,
    progress: download.progress,
    eta: download.eta,
    fileName: download.fileName,
  })
})

app.get('/api/video/file/:downloadId', async (c) => {
  const downloadId = c.req.param('downloadId')
  const download = activeDownloads.get(downloadId)

  if (!download || download.status !== 'completed') {
    return c.json({ error: 'Download not ready' }, 404)
  }

  const downloadDir = join(downloadsDir, downloadId)
  const files = require('fs').readdirSync(downloadDir)
  const videoFile = files.find(
    (f: string) =>
      f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')
  )

  if (!videoFile) {
    return c.json({ error: 'File not found' }, 404)
  }

  const filePath = join(downloadDir, videoFile)
  const stream = createReadStream(filePath)

  return new Response(stream as any, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${videoFile}"`,
    },
  })
})

export default {
  port: PORT,
  fetch: app.fetch,
}

console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`)

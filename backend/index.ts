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

    ytdlp.stderr.on('data', (data) => {
      console.error('⚠️ yt-dlp stderr:', data.toString())
    })

    ytdlp.on('close', (code: number | null) => {
      console.log('🔄 yt-dlp process closed with code:', code)
      if (code === 0) {
        try {
          const videoInfo = JSON.parse(output)
          console.log('✅ Video info parsed successfully')
          console.log('📊 Total formats found:', videoInfo.formats.length)
          console.log('🎬 Video title:', videoInfo.title)

          // Define videoFormats array first
          let videoFormats: any[] = []

          // Major resolutions you care about - include more options
          const majorResolutions = [2160, 1440, 1080, 720, 480, 360, 240, 144]

          // Filter all video formats
          const allVideoFormats = videoInfo.formats
            .filter(
              (f: any) =>
                f.vcodec &&
                f.vcodec !== 'none' &&
                f.height &&
                majorResolutions.includes(f.height) &&
                !f.format_note?.includes('storyboard') &&
                f.ext !== 'mhtml'
            )
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
              hasAudio: f.acodec && f.acodec !== 'none',
            }))

          console.log('🎥 All video formats found:', allVideoFormats.length)

          // Strategy: Use pre-combined formats when available, offer multiple options per resolution
          const formatsByResolution = new Map<string, any[]>()

          // Group all formats by resolution
          for (const format of allVideoFormats) {
            const resolution = format.resolution
            if (!formatsByResolution.has(resolution)) {
              formatsByResolution.set(resolution, [])
            }
            formatsByResolution.get(resolution)!.push(format)
          }

          // For each resolution, pick the best format (prioritizing audio inclusion)
          for (const [resolution, formats] of formatsByResolution) {
            // Sort by: 1) has audio, 2) is H.264, 3) higher bitrate
            const sortedFormats = formats.sort((a: any, b: any) => {
              // Prioritize formats with audio
              if (a.hasAudio !== b.hasAudio) {
                return b.hasAudio ? 1 : -1
              }
              
              // Then prioritize H.264 (better compatibility)
              const aIsH264 = a.vcodec && a.vcodec.includes('avc')
              const bIsH264 = b.vcodec && b.vcodec.includes('avc')
              if (aIsH264 !== bIsH264) {
                return bIsH264 ? 1 : -1
              }
              
              // For video-only formats, prefer MP4 over WebM for merging reliability
              if (!a.hasAudio && !b.hasAudio) {
                if (a.ext === 'mp4' && b.ext !== 'mp4') return -1
                if (b.ext === 'mp4' && a.ext !== 'mp4') return 1
              }
              
              // Finally, prefer higher bitrate
              return (b.tbr || 0) - (a.tbr || 0)
            })
            
            // Add format info for debugging
            const selectedFormat = sortedFormats[0]
            console.log(`📊 ${resolution}: Selected format ${selectedFormat.format_id} (${selectedFormat.vcodec}, audio: ${selectedFormat.hasAudio}, ext: ${selectedFormat.ext})`)
            
            videoFormats.push(selectedFormat)
          }

          // Sort by resolution (highest first)
          videoFormats = videoFormats.sort(
            (a: any, b: any) => parseInt(b.resolution) - parseInt(a.resolution)
          )

          console.log('📹 Video formats to return:', videoFormats.length)
          console.log(
            '📹 Resolutions available:',
            videoFormats.map((f: any) => f.resolution).join(', ')
          )

          // Fallback if no video formats found
          if (videoFormats.length === 0) {
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
                hasAudio: f.acodec && f.acodec !== 'none',
              }))
              .slice(0, 8)

            videoFormats.push(...fallbackVideoFormats)
          }

          // Audio-only formats
          const audioFormats = videoInfo.formats
            .filter(
              (f: any) =>
                f.acodec &&
                f.acodec !== 'none' &&
                (!f.vcodec || f.vcodec === 'none') &&
                !f.format_note?.includes('storyboard') &&
                f.ext !== 'mhtml'
            )
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
            .slice(0, 3)

          // Respond with combined formats
          resolve(
            c.json({
              title: videoInfo.title,
              duration: videoInfo.duration,
              formats: [...videoFormats, ...audioFormats],
            })
          )
        } catch (error) {
          console.error('❌ Failed to parse video info:', error)
          console.error('🔍 Raw output length:', output.length)
          console.error('🔍 Raw output sample:', output.substring(0, 500))
          resolve(c.json({ error: 'Failed to parse video info' }, 500))
        }
      } else {
        resolve(c.json({ error: 'Invalid URL' }, 400))
      }
    })
  })
})

app.post('/api/video/download', async (c) => {
  const { url, format_id, audioOnly = false } = await c.req.json()
  const downloadId = randomUUID()

  // Create download directory
  const downloadDir = join(downloadsDir, downloadId)
  mkdirSync(downloadDir, { recursive: true })

  // Initialize download tracking
  activeDownloads.set(downloadId, {
    status: 'downloading',
    progress: 0,
  })

  const ytdlpArgs: string[] = [
    '--newline',
    '--progress-template',
    '%(progress)j',
    '-o',
    join(downloadDir, '%(title)s.%(ext)s'),
    '--embed-metadata',
    '--no-warnings',
    url,
  ]

  if (audioOnly) {
    // Audio-only download
    ytdlpArgs.splice(
      3,
      0,
      '-f',
      'bestaudio',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0'
    )
  } else {
    // Video download - check if we need to merge audio
    // For formats that already have audio, use them directly
    // For video-only formats, use reliable merging
    
    console.log(`📹 Video download - Format: ${format_id}`)
    
    // Enhanced format selection strategy for longer videos
    // Try multiple approaches to ensure audio inclusion
    const formatStrategies = [
      `${format_id}+bestaudio[ext=m4a]/best`,     // Prefer m4a audio for MP4 compatibility
      `${format_id}+bestaudio`,                   // Any best audio
      `bestvideo[height<=${format_id.includes('1080') ? '1080' : format_id.includes('720') ? '720' : format_id.includes('480') ? '480' : '360'}]+bestaudio`,  // Fallback to best video+audio of that resolution
      `best[height<=${format_id.includes('1080') ? '1080' : format_id.includes('720') ? '720' : format_id.includes('480') ? '480' : '360'}]`,              // Final fallback to pre-merged format
    ]
    
    const formatString = formatStrategies.join('/')
    
    ytdlpArgs.splice(
      3,
      0,
      '-f',
      formatString,
      '--merge-output-format',
      'mp4',
      '--postprocessor-args',
      'ffmpeg:-c:v libx264 -c:a aac -movflags faststart'  // Ensure compatible encoding
    )
  }

  console.log('yt-dlp command:', ytdlpArgs.join(' ')) // Debug log

  const ytdlp = spawn('yt-dlp', ytdlpArgs)
  const download = activeDownloads.get(downloadId)!
  download.process = ytdlp

  ytdlp.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (line.trim().startsWith('{')) {
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
            download.status = 'completed'
            download.fileName = progress.filename
          }
        } catch {
          // Ignore invalid JSON
        }
      }
    }
  })

  ytdlp.stderr.on('data', (data) => {
    console.error('yt-dlp stderr:', data.toString())
  })

  ytdlp.on('close', (code) => {
    if (code === 0) {
      download.status = 'completed'
      download.progress = 100
      try {
        const files = readdirSync(downloadDir)
        const downloadedFile = files.find((f) =>
          /\.(mp4|webm|mkv|m4a|opus|wav)$/i.test(f)
        )
        if (downloadedFile) {
          const filePath = join(downloadDir, downloadedFile)
          
          // If file is WebM, convert to MP4 for better compatibility
          if (downloadedFile.endsWith('.webm') && !audioOnly) {
            download.status = 'converting'
            console.log(`🔄 Converting WebM to MP4: ${downloadedFile}`)
            
            const mp4FileName = downloadedFile.replace('.webm', '.mp4')
            const mp4FilePath = join(downloadDir, mp4FileName)
            
            // Use FFmpeg to convert WebM to MP4 with compatible codecs
            const ffmpeg = spawn('ffmpeg', [
              '-i', filePath,
              '-c:v', 'libx264',     // Convert video to H.264
              '-c:a', 'aac',         // Convert audio to AAC
              '-movflags', '+faststart', // Optimize for streaming
              '-y',                  // Overwrite output file
              mp4FilePath
            ])
            
            ffmpeg.on('close', (ffmpegCode) => {
              if (ffmpegCode === 0) {
                // Delete original WebM file and use MP4
                try {
                  rmSync(filePath)
                  download.fileName = mp4FileName
                  download.status = 'completed'
                  console.log(`✅ WebM converted to MP4: ${mp4FileName}`)
                } catch (e) {
                  console.error('Error cleaning up WebM file:', e)
                  download.fileName = downloadedFile // Keep original if cleanup fails
                  download.status = 'completed'
                }
              } else {
                console.error('FFmpeg conversion failed, keeping original WebM')
                download.fileName = downloadedFile
                download.status = 'completed'
              }
            })
            
            ffmpeg.stderr.on('data', (data) => {
              console.log('FFmpeg:', data.toString())
            })
          } else {
            download.fileName = downloadedFile
          }
        }
      } catch (e) {
        console.error('Error finding downloaded file:', e)
      }
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
  const mediaFile = files.find(
    (f: string) =>
      f.endsWith('.mp4') ||
      f.endsWith('.webm') ||
      f.endsWith('.mkv') ||
      f.endsWith('.m4a') ||
      f.endsWith('.opus') ||
      f.endsWith('.wav') ||
      f.endsWith('.mp3') ||
      f.endsWith('.aac')
  )

  if (!mediaFile) {
    return c.json({ error: 'File not found' }, 404)
  }

  const filePath = join(downloadDir, mediaFile)
  const stream = createReadStream(filePath)

  // Determine content type based on file extension
  const getContentType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'mp4':
        return 'video/mp4'
      case 'webm':
        return 'video/webm'
      case 'mkv':
        return 'video/x-matroska'
      case 'm4a':
        return 'audio/mp4'
      case 'mp3':
        return 'audio/mpeg'
      case 'opus':
        return 'audio/opus'
      case 'wav':
        return 'audio/wav'
      case 'aac':
        return 'audio/aac'
      default:
        return 'application/octet-stream'
    }
  }

  // Sanitize filename for HTTP headers using RFC 6266 standard
  const sanitizeFilename = (filename: string) => {
    // Replace problematic characters for ASCII fallback
    return filename
      .replace(/[^\w\s.-]/g, '_') // Replace non-ASCII chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .trim()
  }

  const sanitizedFilename = sanitizeFilename(mediaFile)

  // Use RFC 6266 format for proper Unicode filename support
  const contentDisposition = `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(mediaFile)}`

  return new Response(stream as any, {
    headers: {
      'Content-Type': getContentType(mediaFile),
      'Content-Disposition': contentDisposition,
    },
  })
})

export default {
  port: PORT,
  fetch: app.fetch,
}

console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`)

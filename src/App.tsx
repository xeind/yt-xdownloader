import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Download, Video, Music, Clock, FileDown, AlertCircle, Loader2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface VideoFormat {
  format_id: string
  resolution: string
  filesize: number
  ext: string
  fps?: number
  tbr?: number
  abr?: number
  format_note?: string
}

interface VideoInfo {
  title: string
  duration: number
  formats: VideoFormat[]
}

interface DownloadProgress {
  status: string
  progress: number
  eta?: string
  fileName?: string
}

function App() {
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const getVideoInfo = async () => {
    if (!url) return

    setLoading(true)
    setError(null)
    clearProgress() // Clear previous progress

    try {
      const response = await fetch(`${API_BASE}/video/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      const data = await response.json()
      if (response.ok) {
        setVideoInfo(data)
      } else {
        setError(data.error || 'Failed to get video info')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const clearProgress = () => {
    setProgress(null)
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)

    // Auto-fetch when URL looks complete and is a YouTube URL
    if ((newUrl.includes('youtube.com/watch?v=') || newUrl.includes('youtu.be/')) && newUrl.length > 20) {
      setTimeout(() => {
        getVideoInfo()
      }, 1000) // Longer delay for complete URLs
    }
  }

  const startDownload = async (formatId: string) => {
    if (!url) return

    setLoading(true)
    setError(null)
    clearProgress()

    try {
      const response = await fetch(`${API_BASE}/video/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format_id: formatId })
      })

      const data = await response.json()
      if (response.ok) {
        pollProgress(data.downloadId)
      } else {
        setError(data.error || 'Failed to start download')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const pollProgress = async (id: string) => {
    // Clear any existing interval
    clearProgress()

    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/video/progress/${id}`)
        const data = await response.json()

        if (response.ok) {
          setProgress(data)

          if (data.status === 'completed') {
            // Ensure progress shows 100% when completed
            setProgress({ ...data, progress: 100 })
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }

            // Auto-download file after a short delay
            setTimeout(() => {
              window.location.href = `${API_BASE}/video/file/${id}`
              // Clear progress after download starts
              setTimeout(() => clearProgress(), 3000)
            }, 1000)
          } else if (data.status === 'error') {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            setError('Download failed')
          }
        }
      } catch (err) {
        console.error('Progress polling error:', err)
      }
    }, 1500) // Slightly faster polling
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return 'Unknown'
    const mb = bytes / 1024 / 1024
    if (mb < 1) return `${Math.round(bytes / 1024)}KB`
    return `${Math.round(mb)}MB`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2">
              <Video className="h-8 w-8 text-blue-500" />
              YouTube Downloader
            </CardTitle>
            <CardDescription>
              Download YouTube videos and audio in various formats
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Progress Card */}
        {progress && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" />
                Download Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Status: {progress.status}</span>
                  <span className="font-mono">{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="h-3" />
                {progress.eta && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    ETA: {progress.eta}
                  </div>
                )}
              </div>
              <Badge variant={progress.status === 'completed' ? 'default' : 'secondary'}>
                {progress.status === 'completed' ? 'Download Complete!' : progress.status}
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* URL Input Card */}
        <Card>
          <CardHeader>
            <CardTitle>Video URL</CardTitle>
            <CardDescription>
              Paste your YouTube URL below and we'll automatically fetch the video info
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">YouTube URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={handleUrlChange}
                placeholder="https://www.youtube.com/watch?v=..."
                className="text-base"
              />
            </div>
            <Button
              onClick={getVideoInfo}
              disabled={loading || !url}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Get Video Info
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Video Info Card */}
        {videoInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="line-clamp-2">{videoInfo.title}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duration: {formatDuration(videoInfo.duration)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Video Formats */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Video Formats</h3>
                </div>
                <div className="grid gap-3">
                  {videoInfo.formats
                    .filter(format => format.resolution !== 'audio')
                    .map((format, index) => (
                      <Card key={`${format.format_id}-${index}`} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">{format.resolution}</Badge>
                              <Badge variant="outline">{format.ext.toUpperCase()}</Badge>
                              {format.fps && (
                                <Badge variant="outline">{format.fps}fps</Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 space-x-2">
                              {format.filesize && format.filesize > 0 ? (
                                <span>{formatFileSize(format.filesize)}</span>
                              ) : format.tbr ? (
                                <span>{Math.round(format.tbr)}kbps</span>
                              ) : null}
                              {format.format_note && (
                                <span>• {format.format_note}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            onClick={() => startDownload(format.format_id)}
                            disabled={loading}
                            size="sm"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>

              {/* Audio Formats */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Audio Only</h3>
                </div>
                <div className="grid gap-3">
                  {videoInfo.formats
                    .filter(format => format.resolution === 'audio')
                    .map((format, index) => (
                      <Card key={`${format.format_id}-${index}`} className="p-4 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge>Audio Only</Badge>
                              <Badge variant="outline">{format.ext.toUpperCase()}</Badge>
                            </div>
                            <div className="text-sm text-gray-600 space-x-2">
                              {format.filesize && format.filesize > 0 ? (
                                <span>{formatFileSize(format.filesize)}</span>
                              ) : format.abr ? (
                                <span>{format.abr}kbps</span>
                              ) : null}
                              {format.format_note && (
                                <span>• {format.format_note}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            onClick={() => startDownload(format.format_id)}
                            disabled={loading}
                            variant="secondary"
                            size="sm"
                          >
                            <Music className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default App

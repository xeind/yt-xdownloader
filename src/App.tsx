import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Download, Video, Music, Clock, FileDown, AlertCircle, Loader2, Clipboard } from 'lucide-react'

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
  hasAudio?: boolean
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
  const urlInputRef = useRef<HTMLInputElement>(null)

  // Paste from clipboard and get video info
  const pasteAndGetInfo = async () => {
    try {
      const text = await navigator.clipboard.readText()
      console.log('Pasting from clipboard:', text) // Debug log
      if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
        setUrl(text)
        urlInputRef.current?.focus()
        // Auto-fetch video info
        setTimeout(() => {
          getVideoInfo()
        }, 100)
      } else {
        setError('No YouTube URL found in clipboard')
        setTimeout(() => setError(null), 3000) // Clear error after 3 seconds
      }
    } catch (err) {
      console.log('Clipboard paste error:', err)
      setError('Cannot access clipboard. Please paste manually.')
      setTimeout(() => setError(null), 3000)
    }
  }

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

  // Global keyboard shortcut to focus URL input on Cmd+V / Ctrl+V
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is already typing in an input, textarea, or contenteditable
      const activeElement = document.activeElement
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      )

      // Detect Cmd+V (Mac) or Ctrl+V (Windows/Linux)
      const isPasteShortcut = (e.metaKey || e.ctrlKey) && e.key === 'v'

      if (!isTyping && isPasteShortcut) {
        e.preventDefault()
        urlInputRef.current?.focus()

        // Access clipboard and paste the content
        navigator.clipboard.readText().then(text => {
          if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
            setUrl(text)
            // Auto-fetch video info after a short delay
            setTimeout(() => {
              getVideoInfo()
            }, 500)
          } else {
            setUrl(text) // Still paste non-YouTube URLs
          }
        }).catch(err => {
          console.log('Clipboard access denied:', err)
          // Fallback: just focus the input
        })
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Check clipboard periodically for YouTube URLs - but only after user interaction
  useEffect(() => {
    // Clipboard access requires user interaction due to browser security
    // The paste button will handle clipboard access when clicked
  }, [])

  const clearProgress = () => {
    setProgress(null)
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && url && !loading) {
      getVideoInfo()
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

  const startDownload = async (formatId: string, audioOnly: boolean = false) => {
    if (!url) return

    setLoading(true)
    setError(null)
    clearProgress()

    try {
      const response = await fetch(`${API_BASE}/video/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format_id: formatId, audioOnly })
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2 text-white">
              <Video className="h-8 w-8 text-blue-400" />
              YouTube Downloader
            </CardTitle>
            <CardDescription className="text-gray-300">
              Download YouTube videos and audio in various formats
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Progress Card */}
        {progress && (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <FileDown className="h-5 w-5" />
                Download Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-200">Status: {progress.status}</span>
                  <span className="font-mono text-gray-200">{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="h-3" />
                {progress.eta && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Clock className="h-4 w-4" />
                    ETA: {progress.eta}
                  </div>
                )}
              </div>
              <Badge variant={progress.status === 'completed' ? 'default' : 'secondary'}>
                {progress.status === 'completed'
                  ? 'Download Complete!'
                  : progress.status === 'converting'
                    ? 'Converting to MP4...'
                    : progress.status === 'downloading'
                      ? 'Downloading...'
                      : progress.status}
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* URL Input Card */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Video URL</CardTitle>
            <CardDescription className="text-gray-300">
              Paste your YouTube URL below and we'll automatically fetch the video info
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-gray-200">YouTube URL</Label>
              <Input
                ref={urlInputRef}
                id="url"
                type="url"
                value={url}
                onChange={handleUrlChange}
                onKeyDown={handleKeyDown}
                placeholder="https://www.youtube.com/watch?v=..."
                className="text-base bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={getVideoInfo}
                disabled={loading || !url}
                className="bg-blue-600 hover:bg-blue-700"
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
              <Button
                onClick={pasteAndGetInfo}
                disabled={loading}
                variant="outline"
                className="border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
                size="lg"
              >
                <Clipboard className="mr-2 h-4 w-4" />
                Paste from Clipboard
              </Button>
            </div>
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
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="line-clamp-2 text-white">{videoInfo.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 text-gray-300">
                <Clock className="h-4 w-4" />
                Duration: {formatDuration(videoInfo.duration)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Video Formats */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Video Formats</h3>
                </div>
                <div className="grid gap-3">
                  {videoInfo.formats
                    .filter(format => format.resolution !== 'audio')
                    .map((format, index) => (
                      <Card key={`${format.format_id}-${index}`} className="p-4 bg-gray-700 border-gray-600">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="bg-gray-600 text-gray-200">{format.resolution}</Badge>
                              <Badge variant="outline" className="border-gray-500 text-gray-300">{format.ext.toUpperCase()}</Badge>
                              {format.fps && (
                                <Badge variant="outline" className="border-gray-500 text-gray-300">{format.fps}fps</Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-400 space-x-2">
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
                            onClick={() => startDownload(format.format_id, false)}
                            disabled={loading}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>

              {/* Single Audio Only Button */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Music className="h-5 w-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-white">Audio Only</h3>
                </div>
                <Card className="p-4 bg-gray-700 border-gray-600">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-green-600 text-white">Audio Only</Badge>
                        <Badge variant="outline" className="border-gray-500 text-gray-300">MP3</Badge>
                      </div>
                      <div className="text-sm text-gray-400">
                        <span>Best available audio quality</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => startDownload('bestaudio', true)}
                      disabled={loading}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Music className="mr-2 h-4 w-4" />
                      Download Audio
                    </Button>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default App

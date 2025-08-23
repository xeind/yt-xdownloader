#!/bin/bash
# Auto-cleanup script for YouTube Downloader
# Deletes files older than 1 day from downloads directory

DOWNLOADS_DIR="/app/yt-xdownloader/downloads"
MAX_AGE="1" # days

echo "🧹 Starting cleanup of files older than ${MAX_AGE} day(s)..."

if [ -d "$DOWNLOADS_DIR" ]; then
    # Find and delete files/folders older than 1 day
    DELETED=$(find "$DOWNLOADS_DIR" -mindepth 1 -mtime +${MAX_AGE} -exec rm -rf {} \; -print | wc -l)
    echo "🗑️ Deleted ${DELETED} old downloads"
    echo "✅ Cleanup completed at $(date)"
else
    echo "❌ Downloads directory not found: $DOWNLOADS_DIR"
fi
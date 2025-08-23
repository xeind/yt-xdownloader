# Railway Deployment for Backend

railway_backend_setup:
  runtime: bun
  start_command: bun run start
  environment_variables:
    NODE_ENV: production
    PORT: $PORT

# Required system dependencies for yt-dlp and ffmpeg
nixpacks.toml:
  packages = ["yt-dlp", "ffmpeg"]
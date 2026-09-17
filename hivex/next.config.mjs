/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep trailing slashes on proxied API paths (FastAPI routes like /sessions/
  // would otherwise redirect to the backend's own origin and hit CORS).
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'images.clerk.dev' },
    ],
  },
  // Mirrors the Reporting OS convention of proxying the FastAPI core server.
  // Inert until NEXT_PUBLIC_FAST_API is set; the demo runs entirely on mock services.
  async rewrites() {
    const rules = []
    const api = process.env.NEXT_PUBLIC_FAST_API
    if (api) rules.push({ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` })
    // Same-origin proxy for the AI service, so the browser skips CORS. Pair with
    // NEXT_PUBLIC_AI_BACKEND_URL=/external-api. HTTP only — the chat WebSocket
    // connects directly via NEXT_PUBLIC_AI_WS_URL.
    const ai = process.env.AI_BACKEND_PROXY_URL?.trim().replace(/\/+$/, '')
    if (ai) rules.push({ source: '/external-api/:path*', destination: `${ai}/:path*` })
    return rules
  },
}

export default nextConfig

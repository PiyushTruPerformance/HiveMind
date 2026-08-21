/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'images.clerk.dev' },
    ],
  },
  // Mirrors the Reporting OS convention of proxying the FastAPI core server.
  // Inert until NEXT_PUBLIC_FAST_API is set; the demo runs entirely on mock services.
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_FAST_API
    if (!api) return []
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }]
  },
}

export default nextConfig

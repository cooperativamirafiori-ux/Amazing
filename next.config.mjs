/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    // Le immagini dei beni sono URL esterni (Drive, ecc.) — consenti qualsiasi host https
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig

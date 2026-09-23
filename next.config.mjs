/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'pdfkit'],
  // I font standard di pdfkit (Helvetica.cjs, ecc.) vengono caricati con un
  // require dinamico che il file tracing di Next non vede: senza questa riga
  // su Vercel mancano e la ricevuta PDF non si genera (errore del 21/09/2026).
  outputFileTracingIncludes: {
    '/**/*': [
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/@react-pdf/pdfkit/**/*.afm',
    ],
  },
  images: {
    // Le immagini dei beni sono URL esterni (Drive, ecc.) — consenti qualsiasi host https
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig

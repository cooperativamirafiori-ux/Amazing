import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Progetto Amazing · Cooperativa Sociale Mirafiori',
  description:
    'Prenota un bene con donazione liberale a sostegno del Progetto Amazing della Cooperativa Sociale Mirafiori.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}

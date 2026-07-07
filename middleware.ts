export { auth as middleware } from '@/lib/auth'

/**
 * Protegge SOLO l'area /admin. Tutto il resto (catalogo, checkout, API pubbliche
 * di prenotazione) resta accessibile senza login, come richiesto.
 */
export const config = {
  matcher: ['/admin/:path*'],
}

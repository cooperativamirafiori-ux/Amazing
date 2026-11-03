/**
 * Informativa privacy donatori in vigore (vale per /dona e per il checkout
 * Amazing). Quando esce una nuova versione:
 *  1. aggiorna il testo in app/dona/privacy/page.tsx (identico al PDF);
 *  2. sostituisci il PDF in public/ e aggiorna `pdf`;
 *  3. aggiorna `versione`: finisce nella colonna VersioneInformativa di ogni
 *     nuova prenotazione, così si sa quale testo ha visto ciascun donatore.
 */
export const INFORMATIVA = {
  versione: 'INF08 v1.1',
  url: '/dona/privacy',
  pdf: '/INF08_Informativa_DONATORI_VER_1.1.pdf',
} as const

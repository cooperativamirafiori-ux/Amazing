/**
 * Converte un importo in testo italiano nel formato "Cinquanta/00".
 * Port fedele della funzione importoInLettere() del backend Apps Script.
 */
export function importoInLettere(importo: number): string {
  const unita = [
    '', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove',
    'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici',
    'diciassette', 'diciotto', 'diciannove',
  ]
  const decine = [
    '', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta',
  ]

  function sotto100(n: number): string {
    if (n < 20) return unita[n]
    const d = Math.floor(n / 10)
    const u = n % 10
    return u === 1 || u === 8 ? decine[d].slice(0, -1) + unita[u] : decine[d] + unita[u]
  }

  let n = Math.floor(importo)
  let result = ''
  if (n >= 100) {
    const c = Math.floor(n / 100)
    result += c === 1 ? 'cento' : (c === 8 ? 'otto' : unita[c]) + 'cento'
    n = n % 100
  }
  if (n > 0) result += sotto100(n)

  const cents = Math.round((importo - Math.floor(importo)) * 100)
  result += '/' + String(cents > 0 ? cents : 0).padStart(2, '0')
  return result.charAt(0).toUpperCase() + result.slice(1)
}

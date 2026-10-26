import type { Metadata } from 'next'
import { getProgettiDona } from '@/lib/lists'
import { COOP } from '@/lib/config'
import { SERIE } from '@/lib/serie'
import DonaClient from './DonaClient'
import type { Bene } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Donazioni · ${COOP.nome}`,
  description: `Sostieni i progetti e i servizi della ${COOP.nome} con una donazione liberale.`,
}

/**
 * Pagina pubblica delle donazioni alla cooperativa (fuori dal Progetto Amazing).
 *
 * Stesso modulo, stessi metodi di pagamento e stessa lista Prenotazioni del
 * checkout Amazing, ma:
 *  - i "beni" mostrati sono quelli del canale MIR (progetti/servizi a cui
 *    destinare la donazione), gestiti dall'admin nella scheda Catalogo;
 *  - le ricevute sono della serie RIC-<anno>-MIR-… e si archiviano in
 *    …/Inviate/MIR.
 *
 * `?progetto=<spItemId>` preseleziona un progetto (link diretti da newsletter,
 * social, QR code).
 */
export default async function DonaPage({
  searchParams,
}: {
  searchParams: Promise<{ progetto?: string }>
}) {
  const { progetto } = await searchParams
  let progetti: Bene[] = []
  let errore = ''
  try {
    progetti = await getProgettiDona()
  } catch (e: any) {
    errore = e?.message ?? 'Errore nel caricamento della pagina'
  }

  return (
    <main className="min-h-screen">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto max-w-3xl px-6 pb-12 pt-10 text-center">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{SERIE.MIR.etichetta}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            Sostieni le attività della cooperativa con una donazione libera e scegli tu a quale
            progetto destinarla. Riceverai via email una ricevuta valida ai fini fiscali.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        {errore ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {errore}
          </div>
        ) : !progetti.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
            Al momento non è possibile ricevere donazioni da questa pagina. Riprova più tardi.
          </div>
        ) : (
          <DonaClient progetti={progetti} iniziale={progetto} />
        )}
      </section>

      <footer className="mt-8 bg-gradient-to-br from-brand-dark to-brand py-6 text-center text-white/85">
        <p className="text-sm font-semibold">
          {COOP.nome} · &ldquo;{COOP.motto}&rdquo;
        </p>
        <p className="mt-1 text-xs text-white/60">{COOP.sito}</p>
      </footer>
    </main>
  )
}

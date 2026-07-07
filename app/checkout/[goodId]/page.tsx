import Link from 'next/link'
import { getBeneBySpId } from '@/lib/lists'
import { COOP } from '@/lib/config'
import CheckoutForm from './CheckoutForm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ goodId: string }>
}) {
  const { goodId } = await params
  const bene = await getBeneBySpId(goodId)

  return (
    <main className="min-h-screen">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link href="/" className="text-sm text-white/80 hover:text-white">
            ← Torna al catalogo
          </Link>
          <h1 className="font-display mt-2 text-3xl font-bold">{COOP.progetto}</h1>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        {!bene || bene.available <= 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
            Questo bene non è più disponibile.{' '}
            <Link href="/" className="font-bold underline">
              Vedi il catalogo
            </Link>
          </div>
        ) : (
          <CheckoutForm bene={bene} />
        )}
      </section>
    </main>
  )
}

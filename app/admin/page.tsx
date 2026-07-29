import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { COOP } from '@/lib/config'
import AdminDashboard from './AdminDashboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  if (!session.user.isAdmin) redirect('/login')

  const email = session.user.email

  return (
    <main className="min-h-screen bg-brand-bg">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        {/*
          Su mobile i due blocchi si impilano (l'email è lunga e affiancata al
          titolo lo schiacciava o sforava); da sm in su tornano affiancati.
        */}
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{COOP.progetto}</p>
            <h1 className="font-display text-xl font-bold sm:text-2xl">Area amministrazione</h1>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 text-sm sm:flex-col sm:items-end sm:gap-2 sm:text-right">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-dark shadow-sm transition hover:bg-white/90"
            >
              <span aria-hidden>←</span> Torna al catalogo
            </Link>
            <div className="min-w-0">
              <p className="truncate text-white/85" title={email ?? undefined}>
                {email}
              </p>
              <form
                action={async () => {
                  'use server'
                  await signOut({ redirectTo: '/login' })
                }}
              >
                <button type="submit" className="mt-1 text-white/70 underline hover:text-white">
                  Esci
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <AdminDashboard />
      </div>
    </main>
  )
}

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

  return (
    <main className="min-h-screen bg-brand-bg">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{COOP.progetto}</p>
            <h1 className="font-display text-2xl font-bold">Area amministrazione</h1>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-dark shadow-sm transition hover:bg-white/90"
            >
              <span aria-hidden>←</span> Torna al catalogo
            </Link>
            <div>
              <p className="text-white/85">{session.user.email}</p>
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

      <div className="mx-auto max-w-6xl px-6 py-8">
        <AdminDashboard />
      </div>
    </main>
  )
}

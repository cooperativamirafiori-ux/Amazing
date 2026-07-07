import { signIn, auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { COOP } from '@/lib/config'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user?.isAdmin) redirect('/admin')

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-md rounded-2xl border border-brand/10 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand/70">{COOP.nome}</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-brand-darker">Area riservata</h1>
        <p className="mt-2 text-sm text-brand-darker/70">
          Accedi con il tuo account Microsoft della cooperativa.
        </p>

        {session?.user && !session.user.isAdmin && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            L'account <strong>{session.user.email}</strong> non è autorizzato all'area admin.
          </p>
        )}

        <form
          action={async () => {
            'use server'
            await signIn('microsoft-entra-id', { redirectTo: '/admin' })
          }}
        >
          <button
            type="submit"
            className="mt-6 w-full rounded-full bg-brand px-6 py-3 font-bold text-white transition hover:bg-brand-dark"
          >
            Accedi con Microsoft
          </button>
        </form>
      </div>
    </main>
  )
}

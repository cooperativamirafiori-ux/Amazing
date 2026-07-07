/** Guard per le API admin: verifica autenticazione + flag admin. */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

type GuardResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse }

export async function guardAdmin(): Promise<GuardResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  if (!session.user.isAdmin) {
    return { session: null, error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }
  return { session, error: null }
}

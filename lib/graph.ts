/**
 * Client Graph API con autenticazione app (client credentials).
 * Usato SOLO server-side (API routes, server actions) — NON esporre al client.
 *
 * Permessi app necessari (Azure → App registration → API permissions):
 *   Sites.ReadWrite.All (Application)  — liste + archiviazione ricevute su SharePoint
 *   Mail.Send (Application)
 *
 * Riusa il pattern dell'app di cooperativa (lib/graph.ts).
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

let _tokenCache: { token: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token
  }

  const tenantId = process.env.GRAPH_TENANT_ID!
  const clientId = process.env.GRAPH_CLIENT_ID!
  const clientSecret = process.env.GRAPH_CLIENT_SECRET!

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Graph token error: ${await res.text()}`)
  }

  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 }
  return _tokenCache.token
}

export async function graphGet<T>(
  path: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Graph GET ${path} failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

export async function graphPost<T>(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Graph POST ${path} failed (${res.status}): ${await res.text()}`)
  }
  if (res.status === 202 || res.status === 204) return {} as T
  const text = await res.text()
  return text ? JSON.parse(text) : ({} as T)
}

/**
 * PATCH con supporto opzionale a If-Match (concorrenza ottimistica via ETag).
 * Ritorna { status } così il chiamante può gestire il 412 (Precondition Failed).
 */
export async function graphPatchStatus(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
  if (res.status === 412) return { status: 412, body: null }
  if (!res.ok) {
    throw new Error(`Graph PATCH ${path} failed (${res.status}): ${await res.text()}`)
  }
  if (res.status === 204) return { status: 204, body: {} }
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : {} }
}

export async function graphPatch<T>(path: string, body: unknown): Promise<T> {
  const { body: out } = await graphPatchStatus(path, body)
  return out as T
}

/**
 * Upload di contenuti binari (PUT). Usato per caricare il PDF della ricevuta
 * nella libreria documenti SharePoint (`.../content`).
 *
 * Adatto a file fino a ~4 MB (limite dell'upload semplice di Graph): una
 * ricevuta A4 di testo pesa poche decine di KB, quindi è più che sufficiente.
 */
export async function graphPutBinary<T>(
  path: string,
  data: Buffer | Uint8Array,
  contentType = 'application/octet-stream'
): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: new Uint8Array(data),
  })
  if (!res.ok) {
    throw new Error(`Graph PUT ${path} failed (${res.status}): ${await res.text()}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : ({} as T)
}

export async function graphDelete(path: string): Promise<void> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Graph DELETE ${path} failed (${res.status}): ${await res.text()}`)
  }
}

import { revokeBearerSession } from '@/lib/apiAuth'

export async function POST(request: Request) {
  // Deliberately idempotent: signing out with an already-revoked or unknown
  // token still succeeds, so a client that lost the response can retry
  // without handling a spurious error on the way to clearing its Keychain.
  await revokeBearerSession(request)
  return Response.json({ ok: true })
}

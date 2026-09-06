import { createChallenge, attestConfig } from '@/lib/attest'

export async function POST() {
  if (!attestConfig()) {
    console.error('App Attest is not configured (AUTH_APPLE_BUNDLE_ID / APPLE_TEAM_ID)')
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Deliberately unauthenticated: attestation happens at first launch, which
  // may be before sign-in. The challenge is signed and short-lived, so handing
  // one out costs nothing — it is only useful to something that can produce a
  // matching Apple attestation.
  return Response.json({ challenge: createChallenge() })
}

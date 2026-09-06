import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAppleIdentityToken } from '@/lib/appleToken'
import { createBearerSession } from '@/lib/apiAuth'
import { requireAttestation, linkAttestedDevice } from '@/lib/attest'

const bodySchema = z.object({ identityToken: z.string().min(1) })

export async function POST(request: Request) {
  const bundleId = process.env.AUTH_APPLE_BUNDLE_ID
  if (!bundleId) {
    console.error('AUTH_APPLE_BUNDLE_ID is not set')
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Gated too, and deliberately: this is the account-creation path, so it is
  // exactly where farmed accounts would come from.
  const raw = await request.text()
  const gate = await requireAttestation(request, raw)
  if (gate.blocked) return gate.blocked

  let identityToken: string
  try {
    identityToken = bodySchema.parse(JSON.parse(raw)).identityToken
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  let identity
  try {
    identity = await verifyAppleIdentityToken(identityToken, bundleId)
  } catch {
    // Never echo the verification error: it distinguishes a forged signature
    // from a wrong audience from an expired token, which only helps an attacker.
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }

  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: 'apple', providerAccountId: identity.sub } },
    include: { user: true },
  })

  let user = existing?.user ?? null

  if (!user) {
    // Apple returns the email only on the FIRST authorization, so it can be
    // absent for a returning user — but a returning user was matched by `sub`
    // above. Reaching here with no verified email means we cannot safely
    // decide which account this is.
    if (!identity.email || !identity.emailVerified) {
      return Response.json({ error: 'Verified email required' }, { status: 403 })
    }

    // Same-email linking mirrors allowDangerousEmailAccountLinking in
    // src/auth.config.ts, and is what makes an iOS sign-in land on the account
    // the user already created on the web instead of a duplicate.
    user = await prisma.user.findUnique({ where: { email: identity.email } })

    if (!user) {
      user = await prisma.user.create({
        data: { email: identity.email, emailVerified: new Date() },
      })
    }

    await prisma.account.create({
      data: {
        userId: user.id,
        type: 'oidc',
        provider: 'apple',
        providerAccountId: identity.sub,
      },
    })
  }

  // Record which attested device this account was created or signed in from.
  // Nothing is refused on the strength of it yet; it is the signal a
  // per-device account cap would be built on, and it is only collectable here,
  // on the path that mints accounts.
  if (gate.keyId) await linkAttestedDevice(gate.keyId, user.id)

  const { sessionToken, expires } = await createBearerSession(user.id)

  return Response.json({
    token: sessionToken,
    expires: expires.toISOString(),
    user: { id: user.id, email: user.email, name: user.name },
  })
}

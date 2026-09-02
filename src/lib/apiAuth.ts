import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

// Native clients reuse the Auth.js Session table rather than carrying a
// second credential format. One revocation path, one expiry rule, and a
// signed-out phone is a deleted row — same as a signed-out browser.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// 64 hex chars (256 bits). Session tokens are bearer credentials with no
// second factor, so they get more entropy than the Telegram link token.
const TOKEN_BYTES = 32

export async function createBearerSession(userId: string) {
  const sessionToken = randomBytes(TOKEN_BYTES).toString('hex')
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({ data: { sessionToken, userId, expires } })

  return { sessionToken, expires }
}

/**
 * Resolves the user behind an `Authorization: Bearer <token>` header.
 *
 * Returns null rather than throwing so route handlers decide their own 401
 * shape — the bearer equivalent of the `auth()` call that opens every server
 * action.
 */
export async function authenticateBearer(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null

  const sessionToken = header.slice('Bearer '.length).trim()
  if (!sessionToken) return null

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })

  // Expiry is enforced here, not by a cleanup job: a stale row must not
  // authenticate anyone even if it is still in the table.
  if (!session || session.expires <= new Date()) return null

  return session.user
}

export async function revokeBearerSession(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return 0

  const sessionToken = header.slice('Bearer '.length).trim()
  if (!sessionToken) return 0

  const { count } = await prisma.session.deleteMany({ where: { sessionToken } })
  return count
}

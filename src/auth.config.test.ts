import { describe, it, expect } from 'vitest'
import { buildAuthConfig } from './auth.config'

type ProviderWithOptions = { id?: string; options?: { allowDangerousEmailAccountLinking?: boolean } }

describe('buildAuthConfig', () => {
  it('orders providers github, google, apple with linking on google and apple only', () => {
    const config = buildAuthConfig({ secureCookies: false })

    expect(config.providers).toHaveLength(3)

    // GitHub is the bare provider function — no user options, so no
    // allowDangerousEmailAccountLinking (unverified GitHub emails would
    // allow account takeover through the email-match linker).
    const [github, google, apple] = config.providers as ProviderWithOptions[]
    expect(github.options?.allowDangerousEmailAccountLinking).toBeUndefined()
    expect(google.id).toBe('google')
    expect(google.options?.allowDangerousEmailAccountLinking).toBe(true)
    expect(apple.id).toBe('apple')
    expect(apple.options?.allowDangerousEmailAccountLinking).toBe(true)
  })

  it('routes sign-in to the dedicated page', () => {
    const config = buildAuthConfig({ secureCookies: false })
    expect(config.pages?.signIn).toBe('/sign-in')
  })

  it('signIn callback requires a verified email from google', async () => {
    const { signIn } = buildAuthConfig({ secureCookies: false }).callbacks!

    await expect(
      signIn!({ account: { provider: 'google' }, profile: { email_verified: true } } as never)
    ).resolves.toBe(true)
    await expect(
      signIn!({ account: { provider: 'google' }, profile: { email_verified: false } } as never)
    ).resolves.toBe(false)
    await expect(
      signIn!({ account: { provider: 'google' }, profile: {} } as never)
    ).resolves.toBe(false)
  })

  it('signIn callback accepts apple email_verified as boolean or string', async () => {
    const { signIn } = buildAuthConfig({ secureCookies: false }).callbacks!

    await expect(
      signIn!({ account: { provider: 'apple' }, profile: { email_verified: 'true' } } as never)
    ).resolves.toBe(true)
    await expect(
      signIn!({ account: { provider: 'apple' }, profile: { email_verified: true } } as never)
    ).resolves.toBe(true)
    await expect(
      signIn!({ account: { provider: 'apple' }, profile: { email_verified: false } } as never)
    ).resolves.toBe(false)
  })

  it('signIn callback passes other providers through', async () => {
    const { signIn } = buildAuthConfig({ secureCookies: false }).callbacks!

    await expect(signIn!({ account: { provider: 'github' } } as never)).resolves.toBe(true)
  })

  it('secureCookies gates the cross-site cookie overrides', () => {
    const secure = buildAuthConfig({ secureCookies: true })
    for (const name of ['state', 'nonce', 'callbackUrl'] as const) {
      expect(secure.cookies?.[name]?.options?.sameSite).toBe('none')
      expect(secure.cookies?.[name]?.options?.secure).toBe(true)
    }
    // The CSRF double-submit cookie must keep its Lax default.
    expect(secure.cookies).not.toHaveProperty('csrfToken')

    const insecure = buildAuthConfig({ secureCookies: false })
    expect(insecure.cookies).toBeUndefined()
  })

  it('declares no authorized callback', () => {
    const config = buildAuthConfig({ secureCookies: false })
    expect(config.callbacks).not.toHaveProperty('authorized')
  })
})

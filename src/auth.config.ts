import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Apple from 'next-auth/providers/apple'
import type { NextAuthConfig } from 'next-auth'

// Apple's form_post callback is a cross-site POST; Safari drops
// SameSite=Lax auth cookies there, so production sets these three to
// None+Secure. The csrfToken cookie is deliberately left at its Lax
// default — it guards same-site POSTs and must not be loosened.
const crossSiteCookie = { options: { sameSite: 'none' as const, secure: true } }

export function buildAuthConfig({ secureCookies }: { secureCookies: boolean }): NextAuthConfig {
  return {
    providers: [
      // No allowDangerousEmailAccountLinking on GitHub: its API returns
      // unverified addresses, so email-match linking would let an attacker
      // attach a GitHub login to someone else's account.
      GitHub,
      Google({ allowDangerousEmailAccountLinking: true }),
      Apple({ allowDangerousEmailAccountLinking: true }),
    ],
    pages: { signIn: '/sign-in' },
    callbacks: {
      async signIn({ account, profile }) {
        // Email-match linking is only safe when the IdP verified the email.
        const verified = profile?.email_verified as boolean | string | undefined
        if (account?.provider === 'google') return verified === true
        if (account?.provider === 'apple') return verified === true || verified === 'true'
        return true
      },
    },
    ...(secureCookies
      ? {
          cookies: {
            state: crossSiteCookie,
            nonce: crossSiteCookie,
            callbackUrl: crossSiteCookie,
          },
        }
      : {}),
  }
}

import type { ReactNode } from 'react'

/**
 * Shared shell for the two pages App Store Connect requires a URL for.
 *
 * Deliberately plain and unauthenticated: a reviewer opens these in a browser
 * with no session, and a redirect to sign-in reads as a broken link.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-[600] tracking-tight text-[#18181b]">{title}</h1>
      <p className="mt-1 text-sm text-[#71717a]">Last updated {updated}</p>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#3f3f46]">{children}</div>
    </main>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-[600] text-[#18181b]">{heading}</h2>
      {children}
    </section>
  )
}

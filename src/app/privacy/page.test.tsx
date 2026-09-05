import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PrivacyPage, { metadata } from './page'
import SupportPage from '../support/page'
import { SUPPORT_EMAIL } from '@/lib/contact'

// App Store Connect requires a privacy policy URL and a support URL, and a
// reviewer opens both signed out. These pages must therefore render with no
// session and no data — which is exactly what these tests pin.

describe('the pages App Review needs a URL for', () => {
  it('renders the privacy policy without a session', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument()
  })

  it('renders support without a session', () => {
    render(<SupportPage />)

    expect(screen.getByRole('heading', { name: 'Support', level: 1 })).toBeInTheDocument()
  })

  it('names every processor that receives user data', () => {
    // Apple compares the policy against the App Privacy answers. A processor
    // added in code but not here is the mismatch that gets a build rejected.
    render(<PrivacyPage />)

    for (const processor of ['Anthropic', 'Vercel', 'Apple', 'Telegram']) {
      expect(screen.getAllByText(new RegExp(processor)).length).toBeGreaterThan(0)
    }
  })

  it('tells the user how to delete their account', () => {
    // Guideline 5.1.1(v) expects the deletion path to be findable, not just
    // implemented.
    render(<PrivacyPage />)

    expect(screen.getAllByText(/Settings → Delete account/).length).toBeGreaterThan(0)
  })

  it('carries the medical disclaimer', () => {
    // Guideline 1.4.1: a diet and training app that estimates intake has to
    // say plainly that it is not giving medical advice.
    render(<PrivacyPage />)

    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument()
  })

  it.each([
    ['privacy', <PrivacyPage key="p" />],
    ['support', <SupportPage key="s" />],
  ])('links %s to the one published support address', (_label, page) => {
    const { container } = render(page)

    const mailto = container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)
    expect(mailto).not.toBeNull()
  })

  it('gives the privacy page a title distinct from the app shell', () => {
    expect(metadata.title).toMatch(/Privacy/)
  })
})

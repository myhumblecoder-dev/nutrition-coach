import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TermsPage, { metadata } from './page'

describe('Terms of Service', () => {
  it('names Anthropic as the processor and rules out training', () => {
    // The disclosure that had to exist: what you type goes to a third party's
    // model. Naming the vendor binds us; naming a specific model would make
    // these terms wrong the day it changes.
    render(<TermsPage />)

    expect(screen.getByText(/Anthropic's Claude models/i)).toBeInTheDocument()
    expect(screen.getByText(/does not train its models/i)).toBeInTheDocument()
  })

  it('says plainly that it is not medical advice', () => {
    render(<TermsPage />)

    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument()
  })

  it('carries the subscription facts Apple requires to be disclosed', () => {
    render(<TermsPage />)

    expect(screen.getByText(/renews automatically/i)).toBeInTheDocument()
    expect(screen.getByText(/Refunds are handled by Apple/i)).toBeInTheDocument()
  })

  it('says what a lapsed subscriber keeps', () => {
    // Read-only, not locked out. Someone deciding whether to pay should not
    // also be wondering whether they have lost anything.
    render(<TermsPage />)

    expect(screen.getByText(/logged history stays visible/i)).toBeInTheDocument()
  })

  it('has a title, because it is a linked legal page', () => {
    expect(metadata.title).toMatch(/Terms of Service/)
  })
})

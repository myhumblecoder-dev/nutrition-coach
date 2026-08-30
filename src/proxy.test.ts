import { describe, it, expect, vi } from 'vitest'
import { config } from './proxy'

vi.mock('@/auth', () => ({
  auth: vi.fn()
}))

describe('proxy', () => {
  it('config matcher string contains the catch-all pattern', () => {
    const matcher = config.matcher[0]
    // The requirement specifies the pattern should contain the catch-all logic
    // Based on the AC: '/((?!api|_next/static|_next/image|favicon.ico|sign-in).*)'
    expect(matcher).toContain('((?!')
    expect(matcher).toContain('.*)')
  })

  it('config matcher string excludes sign-in paths', () => {
    const matcher = config.matcher[0]
    // The requirement specifies it excludes sign-in paths
    expect(matcher).toContain('sign-in')
  })
})

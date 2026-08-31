import { describe, it, expect, vi } from 'vitest'
import { config } from './proxy'

vi.mock('@/auth', () => ({
  auth: vi.fn()
}))

describe('proxy', () => {
  it('config matcher string contains the catch-all pattern', () => {
    const matcher = config.matcher[0]
    expect(matcher).toContain('/((?!')
    expect(matcher).toContain('.*)')
  })

  it('config matcher string does not contain sign-in', () => {
    const matcher = config.matcher[0]
    expect(matcher).not.toContain('sign-in')
  })
})
